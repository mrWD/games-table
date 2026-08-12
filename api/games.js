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
  const fields =
    'fields name,cover.image_id,first_release_date,genres.name,platforms.name,' +
    'total_rating,aggregated_rating,summary;'
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50)
  const term = String(query.search ?? '').slice(0, 100).replace(/["\\]/g, '')
  if (term) return `search "${term}"; ${fields} limit ${limit};`
  if (query.upcoming === '1') {
    const now = Math.floor(Date.now() / 1000)
    return `${fields} where first_release_date > ${now} & cover != null; sort first_release_date asc; limit ${limit};`
  }
  return `${fields} where total_rating_count > 20 & cover != null; sort total_rating desc; limit ${limit};`
}

function cacheFor(source, path) {
  // Catalogue entries are effectively static; searches change more often.
  if (source === 'rawg' && (/^games\/[\w.-]+$/.test(path) || path === 'genres'))
    return 'public, s-maxage=86400, stale-while-revalidate=604800'
  if (source === 'steam' && path === 'appdetails')
    return 'public, s-maxage=86400, stale-while-revalidate=604800'
  return 'public, s-maxage=3600, stale-while-revalidate=86400'
}

/**
 * Browsers enforce Origin, so this keeps casual quota borrowing out. Non-browser
 * callers can spoof it — the edge cache and upstream limits are the real backstop.
 */
function originAllowed(origin, req) {
  if (!origin) return true
  let host
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true

  const self = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
  const extra = String(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set([self, ...extra]).has(host)
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
  const allowed = originAllowed(origin, req)
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }

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
  if (origin && !allowed) {
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
      const body = await upstream.text()
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
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (upstream.ok) res.setHeader('Cache-Control', cacheFor(source, path))
    res.send(body)
  } catch {
    res.status(502).json({ error: `${source} unreachable` })
  }
}
