import type { Key } from './cast'
import { MARKETING_1 } from './book-marketing-1'
import { MARKETING_2 } from './book-marketing-2'
import { MARKETING_3 } from './book-marketing-3'

/** The KPI test book: thirty-nine leads from August to 3 November 2026.
 *
 *  Each line is a story a role's card can be checked against; the October
 *  figures are tuned so verdicts differ inside a role (one above, one exactly
 *  at, one below or empty — `targets.ts` holds the numbers they are read
 *  against). Stamps are Vietnam wall-clock, never later than 3 November, so a
 *  run on any later day books the same months. Pure data; `plant.ts` turns it
 *  into rows. */

/** One instalment: share of the paper, due day, and the day it was paid. */
export type Term = { share: number; due: string; paid?: string; excused?: true }
/** A logged exchange with its debrief, closed unless `state` says otherwise. */
export type Talk = { at: string; by?: Key; state?: 'open' | 'unreached' }
export type Demo = { at: string; with: Key; held?: false; cancelled?: true }

export type DealSpec = {
  opened: string
  by: Key
  /** The SALE lane, given at the accept; absent while nobody accepted it. */
  sale?: Key
  accepted?: { at: string; by: 'grace' | 'head2' }
  engaged?: string
  quoted?: { at: string; amount: number }
  amount?: number
  currency?: 'USD'
  /** `hours` = how long the director took on the sign request. */
  signed?: { at: string; hours: number; terms: Term[] }
  lost?: { at: string; reason: string }
  refused?: { at: string; hours: number }
  waiting?: string
  demos?: Demo[]
  talks?: Talk[]
}

export type LeadSpec = {
  no: number
  company: string
  contact: string
  mkt: Key
  born: string
  origin: string
  /** Handed to BD, and BD's first real exchange when there was one. */
  bd?: { at: string; to: Key; answered?: string }
  deals?: DealSpec[]
  parked?: { at: string; reason: string }
  disabled?: string
}

export const BOOK: LeadSpec[] = [...MARKETING_1, ...MARKETING_2, ...MARKETING_3].sort(
  (a, b) => a.no - b.no,
)
