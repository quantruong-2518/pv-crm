import type { WorkstreamBookQuery, WorkstreamStandKind } from '@pv/contracts'
import type { FunnelStep } from '@/data/performance'
import { DEFAULT_CHOICE, MONTHS, QUARTERS, type Period, type PeriodChoice } from '@/data/period'
import { DEFAULT_WORKSTREAM_BOOK_QUERY, workstreamBookQueryToParams } from '@/data/workstreams'

/** Calculation behind the overview screen (`home.tsx`): which period is
 *  picked, how a figure compares with the period before, and which question
 *  the short list asks the workstream book. No render, no fetch. */

// ---------------------------------------------------------------------------
// PERIOD — month or quarter, one remembered key per grain
// ---------------------------------------------------------------------------

export type HomeGrain = 'month' | 'quarter'

/** Both keys are kept so switching grain and back returns to the same period. */
export type PeriodPick = { grain: HomeGrain; month: string; quarter: string }

export const DEFAULT_PICK: PeriodPick = {
  grain: 'quarter',
  month: MONTHS[MONTHS.length - 1]?.key ?? '',
  quarter: DEFAULT_CHOICE.key,
}

const listOf = (grain: HomeGrain): Period[] => (grain === 'quarter' ? QUARTERS : MONTHS)

export const choiceOf = (pick: PeriodPick): PeriodChoice => ({
  grain: pick.grain,
  key: pick[pick.grain],
})

/** The neighbouring period, or null at either end of the scenario window. */
export function stepPick(pick: PeriodPick, by: -1 | 1): PeriodPick | null {
  const list = listOf(pick.grain)
  const next = list[list.findIndex((p) => p.key === pick[pick.grain]) + by]
  return next === undefined ? null : { ...pick, [pick.grain]: next.key }
}

// ---------------------------------------------------------------------------
// DELTA — against the previous period of the same grain
// ---------------------------------------------------------------------------

export type Delta = { direction: 'up' | 'down' | 'flat'; text: string }

/** Whole numbers stay whole, fractions keep one digit, VN decimal comma (law 6). */
export const num = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

/** Null when either side is missing: "up from nothing" is not a figure.
 *  `points` takes two ratios and prints the gap in percentage points, because
 *  a "%" after a difference of two rates reads as a relative change. */
export function deltaOf(
  now: number | null,
  before: number | null | undefined,
  unit: 'count' | 'points',
): Delta | null {
  if (now === null || before === null || before === undefined) return null
  const diff = now - before
  if (diff === 0) return { direction: 'flat', text: 'Không đổi' }
  const size = unit === 'points' ? `${num(Math.abs(diff) * 100)} điểm` : num(Math.abs(diff))
  return { direction: diff > 0 ? 'up' : 'down', text: `${diff > 0 ? '+' : '−'}${size}` }
}

/** Lead-to-contract rate of a funnel: its last step over its first. One
 *  reader for the current and the previous period, so the delta compares two
 *  figures built the same way. */
export const funnelRate = (steps: readonly FunnelStep[] | undefined): number | null =>
  steps?.[steps.length - 1]?.ofTop ?? null

// ---------------------------------------------------------------------------
// THE SHORT LIST — one filter at a time, set by a tile
// ---------------------------------------------------------------------------

/** A stage filter is a LIVE rung: `kind`, `key` and `label` are copied from
 *  the workstream scorecard, never from a frozen fixture row. */
export type ListFilter =
  { by: 'overdue' } | { by: 'stage'; kind: WorkstreamStandKind; key: string; label: string }

/** Rows the overview shows before sending the reader to the book. */
export const LIST_ROWS = 3

/** The book's own priority ladder over open runs, narrowed by the tile filter
 *  with the same params the book's score strip sends. */
export function listQueryOf(filter: ListFilter | null): WorkstreamBookQuery {
  return {
    ...DEFAULT_WORKSTREAM_BOOK_QUERY,
    status: 'open',
    sort: 'priority',
    size: LIST_ROWS,
    ...(filter?.by === 'overdue' ? { overdue: true } : {}),
    ...(filter?.by === 'stage' ? { standKind: filter.kind, standKey: filter.key } : {}),
  }
}

/** The book opened on the same filter, at the book's own page size. */
export function bookHrefOf(filter: ListFilter | null): string {
  const params = workstreamBookQueryToParams({
    ...listQueryOf(filter),
    size: DEFAULT_WORKSTREAM_BOOK_QUERY.size,
  })
  return params === '' ? '/sales/workstreams' : `/sales/workstreams?${params}`
}
