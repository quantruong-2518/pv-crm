import { z } from 'zod'
import { ContractCode, Day, Moment, ObjectCode } from '../primitives'
import { PageQuery } from '../pagination'

/** The stop log and the re-contact tab of the stopped-customers page (ADR 0125).
 *
 *  `GET /sales/stop-log` — one row per stop decision: manual lead parks (hold
 *  ended to waiting included), deal stops, contract terminations. The automatic
 *  parks that repeat a deal or contract stop are not rows. A kind is listed only
 *  to a caller holding its view permission; `ownOnly` callers see their own acts.
 *  `GET /sales/leads/recare-counts` — size of each re-contact group.
 *
 *  `reasonKey` is a string, not an enum: reasons are admin-edited catalogues. */

export const STOP_LOG_KINDS = ['lead', 'deal', 'contract'] as const
export const StopLogKind = z.enum(STOP_LOG_KINDS)

/** Where the subject stands now: a parked lead still waits or was taken back. */
export const StopLogNow = z.enum(['waiting', 'reclaimed', 'ended'])

export const STOP_LOG_NOW_LABEL: Record<z.infer<typeof StopLogNow>, string> = {
  waiting: 'Chờ liên hệ lại',
  reclaimed: 'Đã nhận lại',
  ended: 'Đã kết thúc',
}

/** `from` / `to` are Vietnam days, inclusive; the server defaults to this month. */
export const StopLogQuery = PageQuery.extend({
  kind: z.enum(['all', ...STOP_LOG_KINDS]).default('all'),
  from: Day.optional(),
  to: Day.optional(),
})

/** `stage` is already a label (lead state, deal stage, or the collected share); null
 *  for a park written before the stage was recorded. */
export const StopLogRow = z.object({
  at: Moment,
  kind: StopLogKind,
  code: z.union([ObjectCode, ContractCode]),
  name: z.string(),
  stage: z.string().nullable(),
  actorName: z.string().nullable(),
  reasonKey: z.string().min(1),
  reasonLabel: z.string(),
  note: z.string().nullable(),
  now: StopLogNow,
})

/** One bucket of an aggregate; the lists arrive sorted by `count`, descending. */
export const StopLogFacetItem = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
})

export const StopLogResponse = z.object({
  rows: z.array(StopLogRow),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  size: z.number().int().min(1),
  byReason: z.array(StopLogFacetItem),
  byStage: z.array(StopLogFacetItem),
  byActor: z.array(StopLogFacetItem),
})

export const RecareCountsResponse = z.object({
  replied: z.number().int().nonnegative(),
  due: z.number().int().nonnegative(),
  later: z.number().int().nonnegative(),
  none: z.number().int().nonnegative(),
})

export type StopLogKind = z.infer<typeof StopLogKind>
export type StopLogNow = z.infer<typeof StopLogNow>
export type StopLogQuery = z.infer<typeof StopLogQuery>
export type StopLogRow = z.infer<typeof StopLogRow>
export type StopLogFacetItem = z.infer<typeof StopLogFacetItem>
export type StopLogResponse = z.infer<typeof StopLogResponse>
export type RecareCountsResponse = z.infer<typeof RecareCountsResponse>
