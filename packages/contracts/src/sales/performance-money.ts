import { z } from 'zod'
import { ContractCode, Day, MoneyVnd, ObjectCode } from '../primitives'
import { SalesDayRange, SalesPerformanceParams, SalesPeriodKey } from './performance'

/** `GET /sales/performance/:period/money` — money moved in the period, per bucket.
 *  `GET /sales/performance/:period/money/entries` — the rows behind one figure.
 *
 *  A read of its own rather than more fields on `SalesPerformanceResponse`: it
 *  walks installments and terminations, not deals, and only the revenue hero
 *  reads it. Buckets carry the SAME keys in the SAME order as that response's,
 *  so the web joins the two by `key`. Money moves on the day it moved — paid
 *  day, due day, termination day — never on the signing day. */

const count = z.number().int().nonnegative()
/** Signed: a refund is subtracted on its termination day, so a slice can go below zero. */
const SignedVnd = z.number().int()

export const SalesMoneyParams = SalesPerformanceParams

/** A penalty counts on its contract's termination day. `fromEarlier` is the
 *  part whose contract was signed before `span.first`. */
export const SalesPenaltyFigure = z.object({
  amountVnd: MoneyVnd,
  count,
  pending: count,
  fromEarlier: count,
})

export const SalesMoneyFigures = z.object({
  collectedVnd: SignedVnd,
  /** collected − company-paid penalties + customer-paid penalties: the owner's actual revenue. */
  actualVnd: SignedVnd,
  /** Installments due before today VN, still unpaid, on a contract not terminated. */
  dueUnpaidVnd: MoneyVnd,
  /** Installments due today or later in the slice, still unpaid, on a contract not terminated: planned cash. */
  upcomingVnd: MoneyVnd,
  /** In: the customer pays the company. Out: the company pays the customer. */
  penaltyIn: SalesPenaltyFigure,
  penaltyOut: SalesPenaltyFigure,
})

export const SalesMoneyBucket = SalesMoneyFigures.extend({ key: z.string() })

export const SalesMoneyResponse = z.object({
  period: SalesPeriodKey,
  asOf: Day,
  span: SalesDayRange,
  buckets: z.array(SalesMoneyBucket).min(3).max(12),
  totals: SalesMoneyFigures,
})

export const SalesMoneyFigureKind = z.enum([
  'collected',
  'due-unpaid',
  'upcoming',
  'open-deal',
  'penalty-in',
  'penalty-out',
])

export const SalesMoneyEntriesQuery = z.object({
  bucket: z.string().min(1),
  kind: SalesMoneyFigureKind,
})

/** `collected` breaks down into paid installments and refunds, hence two kinds. */
export const SalesMoneyEntryKind = z.enum([
  'installment-paid',
  'refund',
  'due-unpaid',
  'upcoming',
  'open-deal',
  'penalty-in',
  'penalty-out',
])

export const SalesMoneyEntry = z.object({
  /** Null on an open deal, which has no contract yet; it carries its own code and title. */
  contractCode: ContractCode.nullable(),
  opportunityCode: ObjectCode.nullable(),
  title: z.string().nullable(),
  kind: SalesMoneyEntryKind,
  /** Null on a penalty or a refund, which belong to no installment. */
  installmentNo: z.number().int().positive().nullable(),
  installmentCount: z.number().int().positive().nullable(),
  label: z.string().nullable(),
  /** Paid, due, termination or expected-close day — whichever placed it in the bucket. */
  day: Day,
  /** Negative for a refund only. */
  amountVnd: SignedVnd,
  /** Not yet settled; only a penalty can be. */
  pending: z.boolean(),
  signedOn: Day.nullable(),
  fromEarlier: z.boolean(),
})

export const SalesMoneyEntriesResponse = z.object({
  entries: z.array(SalesMoneyEntry),
  totalVnd: SignedVnd,
})

export type SalesMoneyParams = z.infer<typeof SalesMoneyParams>
export type SalesPenaltyFigure = z.infer<typeof SalesPenaltyFigure>
export type SalesMoneyFigures = z.infer<typeof SalesMoneyFigures>
export type SalesMoneyBucket = z.infer<typeof SalesMoneyBucket>
export type SalesMoneyResponse = z.infer<typeof SalesMoneyResponse>
export type SalesMoneyFigureKind = z.infer<typeof SalesMoneyFigureKind>
export type SalesMoneyEntriesQuery = z.infer<typeof SalesMoneyEntriesQuery>
export type SalesMoneyEntryKind = z.infer<typeof SalesMoneyEntryKind>
export type SalesMoneyEntry = z.infer<typeof SalesMoneyEntry>
export type SalesMoneyEntriesResponse = z.infer<typeof SalesMoneyEntriesResponse>
