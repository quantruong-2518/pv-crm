/** Latency aggregation for one reporting window. No Nest, no timers, so it can
 *  be tested with a fake clock and a fake RNG.
 *
 *  Memory is bounded twice: `SAMPLE_CAP` samples per route (reservoir
 *  sampling, so the kept samples stay an unbiased picture of the whole window)
 *  and `ROUTE_CAP` distinct keys. `count` and `max` stay exact past the cap;
 *  only the percentiles come from the sample. */

const SAMPLE_CAP = 512
const ROUTE_CAP = 200
/** Where routes beyond `ROUTE_CAP` and requests with no route pattern (404s,
 *  scanners) land, so a raw URL can never become a key. */
export const OTHER_ROUTE = '(other)'

export type RouteSummary = {
  route: string
  count: number
  p50: number
  p95: number
  p99: number
  max: number
}

type Bucket = { count: number; max: number; seen: number[] }

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number
}

export class LatencyWindow {
  private routes = new Map<string, Bucket>()

  constructor(private readonly random: () => number = Math.random) {}

  record(route: string | undefined, ms: number): void {
    let key = route ?? OTHER_ROUTE
    if (!this.routes.has(key) && this.routes.size >= ROUTE_CAP) key = OTHER_ROUTE
    const bucket = this.routes.get(key) ?? { count: 0, max: 0, seen: [] }
    this.routes.set(key, bucket)
    bucket.count += 1
    bucket.max = Math.max(bucket.max, ms)
    if (bucket.seen.length < SAMPLE_CAP) return void bucket.seen.push(ms)
    /* Algorithm R: the n-th sample replaces a kept one with probability CAP/n. */
    const slot = Math.floor(this.random() * bucket.count)
    if (slot < SAMPLE_CAP) bucket.seen[slot] = ms
  }

  /** Summaries for routes that had traffic, slowest p95 first; empties the window. */
  flush(): RouteSummary[] {
    const out = [...this.routes].map(([route, b]) => {
      const sorted = [...b.seen].sort((x, y) => x - y)
      return {
        route,
        count: b.count,
        p50: Math.round(percentile(sorted, 50)),
        p95: Math.round(percentile(sorted, 95)),
        p99: Math.round(percentile(sorted, 99)),
        max: Math.round(b.max),
      }
    })
    this.routes = new Map()
    return out.sort((a, b) => b.p95 - a.p95)
  }
}
