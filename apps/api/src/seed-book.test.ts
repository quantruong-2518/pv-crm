import { describe, expect, it } from 'vitest'
import { WAVES, letterFate } from './seed-book'

/** THE LOCK ON THE DEMO MAIL NUMBERS.
 *
 *  Root CLAUDE.md allows exactly one kind of test to be written unasked, and
 *  demands it: a new figure in seeded demo data comes with a test beside it.
 *  `letterFate` is what every campaign counter is summed from, so a silent edit
 *  to its arithmetic would move numbers on four screens with nothing to catch
 *  it — no compiler checks that a demo still reads the way it was designed. */

function tally(size: number, waveNo: number) {
  const fates = Array.from({ length: size }, (_, i) => letterFate(i, waveNo))
  const n = (p: (f: (typeof fates)[number]) => boolean) => fates.filter(p).length
  return {
    sent: n((f) => f.state !== 'suppressed'),
    delivered: n((f) => f.state === 'delivered'),
    bounced: n((f) => f.state === 'bounced'),
    suppressed: n((f) => f.state === 'suppressed'),
    opened: n((f) => f.opened),
    clicked: n((f) => f.clicked),
    unsubscribed: n((f) => f.unsubscribed),
  }
}

describe('letterFate', () => {
  it('locks what a seeded campaign of six actually shows — the size on disk', () => {
    expect(tally(6, 1)).toEqual({
      sent: 6,
      delivered: 5,
      bounced: 1,
      suppressed: 0,
      opened: 2,
      clicked: 1,
      unsubscribed: 0,
    })
    expect(tally(6, 2)).toEqual({
      sent: 5,
      delivered: 5,
      bounced: 0,
      suppressed: 1,
      opened: 2,
      clicked: 0,
      unsubscribed: 1,
    })
  })

  it('locks the totals a 16-recipient campaign shows on its first wave', () => {
    expect(tally(16, 1)).toEqual({
      sent: 16,
      delivered: 14,
      bounced: 2,
      suppressed: 0,
      opened: 7,
      clicked: 2,
      unsubscribed: 0,
    })
  })

  it('locks the second wave, where the first wave has cost the list two names', () => {
    expect(tally(16, 2)).toEqual({
      sent: 14,
      delivered: 14,
      bounced: 0,
      suppressed: 2,
      opened: 6,
      clicked: 1,
      unsubscribed: 2,
    })
  })

  it('never suppresses on wave one — nobody has unsubscribed yet', () => {
    const first = Array.from({ length: 200 }, (_, i) => letterFate(i, 1))
    expect(first.some((f) => f.state === 'suppressed')).toBe(false)
  })

  it('only counts a click or an unsubscribe on a letter that was opened', () => {
    for (let wave = 1; wave <= 3; wave += 1) {
      for (let i = 0; i < 200; i += 1) {
        const f = letterFate(i, wave)
        if (f.clicked || f.unsubscribed) expect(f.opened).toBe(true)
        if (f.opened) expect(f.state).toBe('delivered')
      }
    }
  })
})

describe('WAVES', () => {
  it('numbers each campaign’s waves from 1 with no gap and no repeat', () => {
    const bySource = new Map<string, number[]>()
    for (const w of WAVES) bySource.set(w.source, [...(bySource.get(w.source) ?? []), w.no])
    for (const [source, numbers] of bySource) {
      expect(
        numbers.sort((a, b) => a - b),
        source,
      ).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1))
    }
  })

  it('keeps every wave in the past, newest last within a campaign', () => {
    for (const w of WAVES) expect(w.daysAgo).toBeGreaterThan(0)
    const bySource = new Map<string, WaveSeedLike[]>()
    for (const w of WAVES) bySource.set(w.source, [...(bySource.get(w.source) ?? []), w])
    for (const [source, list] of bySource) {
      const ordered = [...list].sort((a, b) => a.no - b.no)
      for (let i = 1; i < ordered.length; i += 1) {
        expect(ordered[i]!.daysAgo, source).toBeLessThan(ordered[i - 1]!.daysAgo)
      }
    }
  })
})

type WaveSeedLike = { source: string; no: number; daysAgo: number }
