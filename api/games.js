// Proxy for the two game catalogues. It exists for two concrete reasons: the RAWG
// key must not reach the browser, and Steam's endpoints send no CORS headers at all,
// so the browser cannot call them directly no matter what.
//
// The upstream path arrives as ?path=... rather than as URL segments — a catch-all
// route on Vercel only ever matched a single segment (learned the hard way in
// FilmTable), so nested paths 404'd before reaching any code.

const RAWG = 'https://api.rawg.io/api/'
const STEAM_STORE = 'https://store.steampowered.com/api/'
const IGDB = 'https://api.igdb.com/v4/'
const TWITCH_TOKEN = 'https://id.twitch.tv/oauth2/token'

/** GET-only allowlists; nothing else upstream is reachable through us. */
const ALLOWED = {
  rawg: (path) =>
    path === 'games' || path === 'genres' || /^games\/[\w.-]+$/.test(path),
  // `featuredcategories` is what keeps Explore from being an empty screen when RAWG
  // is unreachable: it is the only keyless list of games with cover art we have.
  steam: (path) =>
    path === 'storesearch' || path === 'appdetails' || path === 'featuredcategories',
  // IGDB is the second catalogue with both console games and cover art — the gap
  // neither Steam nor any keyless source can fill. Only the games endpoint is opened.
  igdb: (path) => path === 'games',
}

/**
 * IGDB authenticates through Twitch: a client-credentials token, good for about 60
 * days, that has to be fetched before the first query. It is cached in module scope,
 * which on Vercel means per warm instance — a cold start pays one extra round trip,
 * and nothing is stored anywhere it could leak.
 *
 * Refreshed a minute early so a token cannot expire between the check and the call.
 */
let igdbToken = null

async function igdbAccessToken(clientId, clientSecret) {
  if (igdbToken && igdbToken.expiresAt > Date.now() + 60_000) return igdbToken.value
  const url = new URL(TWITCH_TOKEN)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)
  url.searchParams.set('grant_type', 'client_credentials')
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`twitch token ${res.status}`)
  const data = await res.json()
  igdbToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  }
  return igdbToken.value
}

/**
 * IGDB speaks its own query language over POST with a plain-text body, unlike the two
 * GET APIs beside it. The client still calls us with an ordinary GET; the query is
 * assembled here so the shape of IGDB's protocol never reaches the browser.
 *
 * `search` and the discover orderings are the only two forms allowed. Anything the
 * client sends is quoted into a string literal, so it cannot inject clauses.
 */
function igdbBody(query) {
  // `themes.name` is asked for only so adultOnly() can read it; see there.
  const fields =
    'fields name,cover.image_id,first_release_date,genres.name,platforms.name,' +
    'total_rating,aggregated_rating,summary,themes.name;'
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50)
  const term = String(query.search ?? '').slice(0, 100).replace(/["\\]/g, '')
  if (term) return `search "${term}"; ${fields} limit ${limit};`
  if (query.upcoming === '1') {
    const now = Math.floor(Date.now() / 1000)
    return `${fields} where first_release_date > ${now} & cover != null; sort first_release_date asc; limit ${limit};`
  }
  return `${fields} where total_rating_count > 20 & cover != null; sort total_rating desc; limit ${limit};`
}

/*
 * Adult-only titles, kept out of every list this proxy returns.
 *
 * The app is rated 4+, and all three catalogues answer an ordinary search with
 * explicit games and their cover art — measured: "hentai" returned 20 of 20 such
 * titles from IGDB, 10 of 10 from Steam, and 1,630 from RAWG. Filtering here rather
 * than in the client covers every build already installed the moment this deploys.
 *
 * The signals are the ones each catalogue actually carries, and they are narrower
 * than they could be on purpose. RAWG tags The Witcher 3 with `nudity` and `mature`
 * and GTA VI with `nudity`, so neither tag alone can decide — a tracker that cannot
 * find The Witcher is broken. What separated them in the measured results: the
 * explicit titles carry `sexual-content` or `nudity` and no ESRB rating at all, while
 * the mainstream ones are rated. IGDB has an "Erotic" theme. Steam's search results
 * carry nothing but a name, so for Steam the name is all there is.
 */
const ADULT_NAME = /\b(hentai|porn\w*|nsfw|xxx|erotic\w*|eroge|lewd|sex)\b|18\+/i
const ADULT_TAGS = new Set(['nsfw', 'hentai', 'khentai', 'erotic', 'eroge', 'porn', 'pornographic'])
const EXPLICIT_TAGS = new Set(['sexual-content', 'seksualnyi-kontent', 'nudity', 'nagota'])

function adultOnly(source, game) {
  if (ADULT_NAME.test(String(game?.name ?? ''))) return true
  if (source === 'rawg') {
    const tags = (game.tags ?? []).map((t) => t.slug)
    if (tags.some((t) => ADULT_TAGS.has(t))) return true
    const esrb = game.esrb_rating?.slug
    if (esrb === 'adults-only') return true
    return !esrb && tags.some((t) => EXPLICIT_TAGS.has(t))
  }
  if (source === 'igdb') return (game.themes ?? []).some((t) => /erotic/i.test(String(t?.name)))
  return false
}

/**
 * The upstream body, made fit to hand to a browser.
 *
 * RAWG writes its paging links with our key in them (`next`, `previous`), so passing
 * its body through verbatim published the key to anyone who asked. The client never
 * pages, so the links go; and as a last guard the key is scrubbed from whatever is
 * left, in case RAWG ever echoes it somewhere new.
 */
function clean(source, path, body, key) {
  let out = body
  try {
    const data = JSON.parse(body)
    if (source === 'rawg' && data && typeof data === 'object') {
      delete data.next
      delete data.previous
      if (path === 'games' && Array.isArray(data.results)) {
        data.results = data.results.filter((g) => !adultOnly('rawg', g))
      }
    }
    if (source === 'igdb' && Array.isArray(data)) {
      out = JSON.stringify(data.filter((g) => !adultOnly('igdb', g)))
    } else if (source === 'steam' && path === 'storesearch' && Array.isArray(data?.items)) {
      data.items = data.items.filter((g) => !adultOnly('steam', g))
      data.total = data.items.length
      out = JSON.stringify(data)
    } else {
      out = JSON.stringify(data)
    }
  } catch {
    // Not JSON (an upstream error page): passed on as it came, minus the key.
  }
  // The length guard keeps a misconfigured short value from eating ordinary text.
  return key && key.length >= 16 ? out.split(key).join('') : out
}

function cacheFor(source, path) {
  // Catalogue entries are effectively static; searches change more often.
  if (source === 'rawg' && (/^games\/[\w.-]+$/.test(path) || path === 'genres'))
    return 'public, s-maxage=86400, stale-while-revalidate=604800'
  if (source === 'steam' && path === 'appdetails')
    return 'public, s-maxage=86400, stale-while-revalidate=604800'
  return 'public, s-maxage=3600, stale-while-revalidate=86400'
}

/*
 * Who may call this proxy, and what that does and does not stop.
 *
 * Every rule below reads headers a *browser* sets and a page cannot forge: Origin and
 * Sec-Fetch-Site. So they keep other websites from spending our RAWG and IGDB quota
 * through their visitors' browsers, and they turn away a bare `curl`. They do not
 * stop a script that sends `Origin: capacitor://localhost` itself — that request is
 * indistinguishable from the real app, and the app has no secret it could hold to
 * tell them apart (anything in the bundle is public). The rate limit further down
 * caps one address on one warm instance; the edge cache and the upstreams' own limits
 * remain the real backstop, and a leaked key is answered by rotating it.
 */

/** The web build on Vercel. There is no other web mirror of this app. */
const PRODUCTION_HOSTS = ['games-table-bay.vercel.app']

/**
 * The store builds. The iOS WebView serves the bundle from `capacitor://localhost`,
 * Android's from `https://localhost` (`androidScheme: 'https'` in capacitor.config.ts).
 * Matched as whole origins, so `https://localhost:8443` is not one of them.
 */
const APP_ORIGINS = ['capacitor://localhost', 'https://localhost']

/** Dev servers pick arbitrary ports. Only outside production — see originAllowed. */
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/

function isProduction() {
  return process.env.VERCEL_ENV === 'production'
}

function selfHost(req) {
  return String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
}

function originAllowed(origin, req) {
  if (APP_ORIGINS.includes(origin)) return true
  let url
  try {
    url = new URL(origin)
  } catch {
    return false // includes the literal "null" a sandboxed frame sends
  }
  // A local dev server, on whatever port Vite chose. Never in production: there it
  // would let any page someone serves from their own machine through.
  if (!isProduction() && LOOPBACK.test(url.hostname)) return true
  if (url.protocol !== 'https:') return false

  const extra = String(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // Our own host covers preview deployments, whose addresses change per push.
  return new Set([selfHost(req), ...PRODUCTION_HOSTS, ...extra]).has(url.host)
}

/**
 * A request with no Origin. Browsers leave it off a same-origin GET, which is exactly
 * what the web app sends — measured in Chrome against production, including the
 * requests its service worker re-issues: no Origin, `Sec-Fetch-Site: same-origin`,
 * and a Referer on our own host. A cross-site `<img>` or `<script>` pointed at us also
 * arrives without Origin, but says `cross-site`, and a bare curl says nothing at all;
 * both are refused.
 *
 * Browsers that predate Fetch Metadata (Safari before 16.4) send no Sec-Fetch-Site,
 * so for them the Referer decides.
 */
function sameOriginRequest(req) {
  const site = req.headers['sec-fetch-site']
  if (site) return site === 'same-origin'
  try {
    return new URL(String(req.headers.referer ?? '')).host === selfHost(req)
  } catch {
    return false
  }
}

/*
 * Per-address rate limit, held in this instance's memory.
 *
 * What it is: a fixed one-minute window per client address, per warm function
 * instance. It stops one client from hammering the catalogues through us in a tight
 * loop. What it is not: a global limit. Vercel runs several instances side by side and
 * recycles them, each with its own empty counter, so a determined caller gets more
 * than this, and one spread over many addresses is not slowed at all. Responses served
 * from the edge cache never reach this code and are not counted — they cost the
 * upstreams nothing. A global limit would need shared state (Vercel's Firewall
 * rate-limit rules, or a store keyed by IP address), which is a decision for the
 * owner, not a default.
 *
 * The ceiling is generous on purpose: Explore opens with a burst of genre lookups for
 * "For you", and people on one mobile carrier can share an address.
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
const hits = new Map()

/**
 * Vercel overwrites X-Forwarded-For with the address it saw, so a client cannot pick
 * its own. IPv6 is keyed by its /64: one phone can hold a whole block of addresses.
 */
function clientKey(req) {
  const ip =
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    String(req.headers['x-real-ip'] ?? '') ||
    req.socket?.remoteAddress ||
    'unknown'
  if (!ip.includes(':')) return ip
  const [head, tail = ''] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = [...left, ...Array(Math.max(8 - left.length - right.length, 0)).fill('0'), ...right]
  return groups.slice(0, 4).join(':') + '::/64'
}

/** Seconds until the caller may try again, or 0 when the request may proceed. */
function retryAfter(req, now = Date.now()) {
  // Expired windows are swept only when the map grows, so a quiet instance does no work.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now - v.start >= WINDOW_MS) hits.delete(k)
  }
  const key = clientKey(req)
  let entry = hits.get(key)
  if (!entry || now - entry.start >= WINDOW_MS) {
    entry = { start: now, count: 0 }
    hits.set(key, entry)
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW ? Math.ceil((entry.start + WINDOW_MS - now) / 1000) : 0
}

function buildUpstream(source, path, query, key) {
  if (source === 'rawg') {
    const url = new URL(RAWG + path)
    for (const [k, v] of Object.entries(query)) {
      if (k !== 'path' && k !== 'source') url.searchParams.set(k, String(v))
    }
    url.searchParams.set('key', key)
    return url
  }
  const url = new URL(STEAM_STORE + path)
  for (const [k, v] of Object.entries(query)) {
    if (k !== 'path' && k !== 'source') url.searchParams.set(k, String(v))
  }
  return url
}

export default async function handler(req, res) {
  const origin = req.headers.origin
  const allowed = origin ? originAllowed(origin, req) : sameOriginRequest(req)
  // Every answer depends on who asked, so a cached one must not cross origins.
  res.setHeader('Vary', 'Origin')
  if (origin && allowed) res.setHeader('Access-Control-Allow-Origin', origin)

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' })
    return
  }
  if (!allowed) {
    res.status(403).json({ error: 'origin not allowed' })
    return
  }

  const source = String(req.query.source ?? 'rawg')
  const path = String(req.query.path ?? '').replace(/^\/+/, '')
  if (!ALLOWED[source] || !ALLOWED[source](path)) {
    res.status(403).json({ error: 'path not allowed' })
    return
  }

  const key = process.env.RAWG_API_KEY
  if (source === 'rawg' && !key) {
    // The client reads 503 as "no RAWG here" and falls back to Steam.
    res.status(503).json({ error: 'RAWG key not configured' })
    return
  }

  // Counted here, after every refusal, so only requests that would reach an upstream
  // use it up.
  const wait = retryAfter(req)
  if (wait) {
    res.setHeader('Retry-After', String(wait))
    res.setHeader('Cache-Control', 'no-store')
    res.status(429).json({ error: 'too many requests' })
    return
  }

  if (source === 'igdb') {
    const clientId = process.env.IGDB_CLIENT_ID
    const clientSecret = process.env.IGDB_CLIENT_SECRET
    // Same contract as RAWG: 503 means "this catalogue is not configured here", and
    // the client moves on to the next source rather than treating it as an outage.
    if (!clientId || !clientSecret) {
      res.status(503).json({ error: 'IGDB credentials not configured' })
      return
    }
    try {
      const token = await igdbAccessToken(clientId, clientSecret)
      const upstream = await fetch(IGDB + path, {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
          'User-Agent': 'GamesTable/1.0 (+https://github.com/mrWD/games-table)',
        },
        body: igdbBody(req.query),
      })
      // IGDB is sent a token, never the secret, so there is no key here to scrub.
      const body = clean(source, path, await upstream.text())
      res.status(upstream.status)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (upstream.ok) res.setHeader('Cache-Control', cacheFor(source, path))
      res.send(body)
    } catch {
      // A failed token exchange must not poison the next request with a stale token.
      igdbToken = null
      res.status(502).json({ error: 'igdb unreachable' })
    }
    return
  }

  try {
    const upstream = await fetch(buildUpstream(source, path, req.query, key), {
      headers: { 'User-Agent': 'GamesTable/1.0 (+https://github.com/mrWD/games-table)' },
    })
    const body = clean(source, path, await upstream.text(), key)
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (upstream.ok) res.setHeader('Cache-Control', cacheFor(source, path))
    res.send(body)
  } catch {
    res.status(502).json({ error: `${source} unreachable` })
  }
}
