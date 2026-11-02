import { describe, expect, it } from 'vitest'
import {
  canCloseMeetingOnBehalf,
  highestRank,
  isAdmin,
  mayAdminister,
  outranks,
  roleRank,
} from './e2-rank'

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

  it('mayAdminister lets a peer pass, so a sole director can appoint a second', () => {
    expect(mayAdminister(['director'], ['director'])).toBe(true)
    expect(mayAdminister(['director'], [], ['director'])).toBe(true)
    expect(mayAdminister(['head-of-sales'], ['head-of-sales'], ['head-of-sales'])).toBe(true)
  })

  it('mayAdminister refuses a higher target and a higher next role', () => {
    expect(mayAdminister(['head-of-sales'], ['director'])).toBe(false)
    expect(mayAdminister(['head-of-sales'], ['sale'], ['director'])).toBe(false)
    expect(mayAdminister(['head-of-sales'], [], ['director'])).toBe(false)
    expect(mayAdminister(['head-of-sales'], ['director'], ['sale'])).toBe(false)
  })

  it('mayAdminister reads the highest of several roles on every side', () => {
    expect(mayAdminister(['sale', 'head-of-sales'], ['bd', 'account-executive'])).toBe(true)
    expect(mayAdminister(['head-of-sales'], ['sale', 'director'])).toBe(false)
    expect(mayAdminister(['head-of-sales'], ['sale'], ['bd', 'director'])).toBe(false)
  })

  it('mayAdminister with no roles anywhere compares 0 with 0', () => {
    expect(mayAdminister([], [], [])).toBe(true)
    expect(mayAdminister([], ['sale'])).toBe(false)
  })

  it('isAdmin is the top rank alone, read from the highest of several roles', () => {
    expect(isAdmin(['director'])).toBe(true)
    expect(isAdmin(['sale', 'director'])).toBe(true)
    expect(isAdmin(['head-of-sales'])).toBe(false)
    expect(isAdmin(['head-of-sales', 'account-executive'])).toBe(false)
    expect(isAdmin([])).toBe(false)
  })

  it('closing a meeting needs a closer role AND a higher rank', () => {
    expect(canCloseMeetingOnBehalf(['bd'], ['sale'])).toBe(true)
    expect(canCloseMeetingOnBehalf(['director'], ['director'])).toBe(false)
    expect(canCloseMeetingOnBehalf(['sale'], [])).toBe(false)
    expect(canCloseMeetingOnBehalf(['account-executive'], ['bd'])).toBe(true)
  })
})
