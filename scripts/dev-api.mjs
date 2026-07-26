// Runs the Vercel function locally so the proxy can be exercised without deploying.
// Usage: node --env-file=.env.local scripts/dev-api.mjs   (then VITE_API_BASE=http://localhost:3001)
import { createServer } from 'node:http'

const { default: handler } = await import('../api/games.js')

const PORT = Number(process.env.API_PORT ?? 3001)

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname !== '/api/games') {
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
    return
  }

  // Mimic the shape Vercel hands to the function
  req.query = {}
  for (const [k, v] of url.searchParams) req.query[k] = v

  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
    return res
  }
  res.send = (body) => {
    res.end(body)
    return res
  }

  await handler(req, res)
}).listen(PORT, () => {
  console.log(`Games proxy on http://localhost:${PORT}/api/games?source=...`)
  console.log(`RAWG key: ${process.env.RAWG_API_KEY ? 'loaded' : 'missing (Steam fallback only)'}`)
})
