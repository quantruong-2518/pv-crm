import { describe, expect, it } from 'vitest'
import { canCloseMeetingOnBehalf, highestRank, outranks, roleRank } from './e2-rank'

/** Locks the seniority ladder: the on-behalf rule is strict, so peers are false. */
describe('e2-rank', () => {
  it('pins every rank', () => {
    expect(
      (
        [
          'marketing',
          'presales',
          'sale',
          'bd',
          'account-executive',
          'head-of-sales',
          'director',
        ] as const
      ).map(roleRank),
    ).toEqual([1, 1, 1, 2, 3, 4, 5])
  })

  it('takes the highest rank, and 0 for an empty list', () => {
    expect(highestRank(['sale', 'account-executive'])).toBe(3)
    expect(highestRank([])).toBe(0)
  })

  it('outranks is strict: peers are false, empty owner is outranked', () => {
    expect(outranks(['bd'], ['bd'])).toBe(false)
    expect(outranks(['sale'], ['marketing'])).toBe(false)
    expect(outranks(['director'], ['head-of-sales'])).toBe(true)
    expect(outranks(['sale'], [])).toBe(true)
    expect(outranks([], [])).toBe(false)
  })

  it('closing a meeting needs a closer role AND a higher rank', () => {
    expect(canCloseMeetingOnBehalf(['bd'], ['sale'])).toBe(true)
    expect(canCloseMeetingOnBehalf(['director'], ['director'])).toBe(false)
    expect(canCloseMeetingOnBehalf(['sale'], [])).toBe(false)
    expect(canCloseMeetingOnBehalf(['account-executive'], ['bd'])).toBe(true)
  })
})
