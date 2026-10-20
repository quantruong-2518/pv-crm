/** Read-only load smoke: loops GET requests over the heaviest read routes and
 *  prints per-route count, errors, p50/p95/p99/max and overall req/s.
 *
 *  Meant for a Neon branch or staging holding production-shaped data, NEVER
 *  production. There is deliberately no default for --base so a bare run cannot
 *  hit the live API; GET only, nothing is ever written.
 *
 *  node tools/scripts/load-smoke.mjs --base <url> --cookie <pv_session value>
 *       --duration 60 --concurrency 10 [--routes routes.json]
 *  routes.json is an array of paths, e.g. ["/sales/leads?page=1&size=50"]. */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values: a } = parseArgs({
  options: {
    base: { type: 'string' },
    cookie: { type: 'string' },
    duration: { type: 'string', default: '60' },
    concurrency: { type: 'string', default: '10' },
    routes: { type: 'string' },
  },
})

if (!a.base || !/^https?:\/\/[^/]+/.test(a.base) || !a.cookie) {
  console.error(
    'Usage: --base <http(s)://host> --cookie <session cookie> [--duration s] [--concurrency n] [--routes file]',
  )
  process.exit(2)
}

const month = new Date().toISOString().slice(0, 7)
const routes = a.routes
  ? JSON.parse(readFileSync(a.routes, 'utf8'))
  : [
      '/sales/leads?page=1&size=50',
      '/sales/leads?page=1&size=50&q=cong%20ty',
      '/sales/opportunities?page=1&size=50',
      '/sales/contracts?page=1&size=50',
      '/sales/search?q=cong%20ty',
      `/sales/kpi/${month}/forecast/me`,
      '/notifications',
      '/notifications/unread-count',
    ]

const cookie = a.cookie.includes('=') ? a.cookie : `pv_session=${a.cookie}`
const stats = new Map(routes.map((r) => [r, { ms: [], errors: 0 }]))
const endAt = Date.now() + Number(a.duration) * 1000
const base = a.base.replace(/\/$/, '')

async function worker(offset) {
  for (let i = offset; Date.now() < endAt; i++) {
    const route = routes[i % routes.length]
    const s = stats.get(route)
    const t0 = performance.now()
    try {
      const res = await fetch(base + route, { headers: { cookie } })
      await res.arrayBuffer()
      if (!res.ok) s.errors++
    } catch {
      s.errors++
    }
    s.ms.push(performance.now() - t0)
  }
}

const started = performance.now()
await Promise.all(Array.from({ length: Number(a.concurrency) }, (_, i) => worker(i)))
const seconds = (performance.now() - started) / 1000

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
let total = 0
for (const [route, s] of stats) {
  const sorted = s.ms.toSorted((x, y) => x - y)
  total += sorted.length
  const f = (n) => n.toFixed(0).padStart(5)
  console.log(
    `${String(sorted.length).padStart(6)} req ${String(s.errors).padStart(4)} err` +
      `  p50${f(pct(sorted, 50))} p95${f(pct(sorted, 95))} p99${f(pct(sorted, 99))} max${f(sorted.at(-1) ?? 0)} ms  ${route}`,
  )
}
console.log(
  `total ${total} requests in ${seconds.toFixed(1)}s = ${(total / seconds).toFixed(1)} req/s`,
)
