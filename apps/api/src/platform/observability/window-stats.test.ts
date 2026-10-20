// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { countFanout, takeFanout } from './fanout'
import { LatencyWindow, OTHER_ROUTE, percentile } from './window-stats'

describe('percentile', () => {
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1)

  it('uses nearest rank', () => {
    expect(percentile(hundred, 50)).toBe(50)
    expect(percentile(hundred, 95)).toBe(95)
    expect(percentile(hundred, 99)).toBe(99)
  })

  it('handles one sample and none', () => {
    expect(percentile([7], 99)).toBe(7)
    expect(percentile([], 99)).toBe(0)
  })
})

describe('LatencyWindow', () => {
  it('summarises a route under the sample cap exactly', () => {
    const w = new LatencyWindow()
    for (let ms = 1; ms <= 100; ms++) w.record('GET /a', ms)
    expect(w.flush()).toEqual([
      { route: 'GET /a', count: 100, p50: 50, p95: 95, p99: 99, max: 100 },
    ])
  })

  it('returns nothing, and starts over, after a flush', () => {
    const w = new LatencyWindow()
    w.record('GET /a', 5)
    w.flush()
    expect(w.flush()).toEqual([])
  })

  it('keeps count and max exact past the sample cap, with a fixed RNG', () => {
    const w = new LatencyWindow(() => 0.999)
    for (let i = 0; i < 5_000; i++) w.record('GET /a', 10)
    w.record('GET /a', 9_999)
    const [row] = w.flush()
    expect(row).toMatchObject({ count: 5_001, max: 9_999, p50: 10 })
  })

  it('lets late samples into the kept set, so a late slowdown still shows in p99', () => {
    let k = 0
    const w = new LatencyWindow(() => ((k++ % 512) + 0.5) / 2_000)
    for (let i = 0; i < 512; i++) w.record('GET /a', 10)
    for (let i = 0; i < 600; i++) w.record('GET /a', 400)
    expect(w.flush()[0]).toMatchObject({ count: 1_112, p99: 400 })
  })

  it('never lets a missing pattern or a flood of routes grow the map', () => {
    const w = new LatencyWindow()
    w.record(undefined, 3)
    for (let i = 0; i < 400; i++) w.record(`GET /r${i}`, 1)
    const rows = w.flush()
    expect(rows.length).toBe(200)
    expect(rows.find((r) => r.route === OTHER_ROUTE)?.count).toBe(1 + 400 - 199)
  })

  it('lists the slowest p95 first', () => {
    const w = new LatencyWindow()
    w.record('GET /fast', 5)
    w.record('GET /slow', 900)
    expect(w.flush().map((r) => r.route)).toEqual(['GET /slow', 'GET /fast'])
  })
})

describe('fan-out counters', () => {
  it('counts events and deliveries, then resets', () => {
    takeFanout()
    countFanout(3)
    countFanout(0)
    expect(takeFanout()).toEqual({ events: 2, deliveries: 3 })
    expect(takeFanout()).toEqual({ events: 0, deliveries: 0 })
  })
})
