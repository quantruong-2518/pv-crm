import { queryOptions } from '@tanstack/react-query'
import {
  DAS_VINA_FROZEN_AT,
  DAS_VINA_PERIOD,
  EXIT_REASONS,
  LEADS,
  leadMilestones,
} from '@pv/engines/fixtures/das-vina'
import { SalesPerformanceResponse } from '@pv/contracts'
import { api } from '@/app/api'

/** The overview's own reads. `salesPerformanceQuery` is live: the period
 *  tiles, with no `load:`.
 *
 *  `frozenExitsQuery` is scenario 2 (DAS Vina), frozen: why leads left the
 *  flow, which the live read does not carry. It has `load:`, so it is still a
 *  fixture read. Nothing there is a new number: every field is a count or a
 *  share over lead rows the fixture already holds. `foldExits` only regroups
 *  those rows for the donut. */

/** `GET /sales/performance/:period`. Always stale: its figures move with
 *  writes to three books, and no write invalidates this key. */
export const salesPerformanceQuery = (period: string) =>
  queryOptions({
    queryKey: ['sales', 'performance', 'live', period] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<SalesPerformanceResponse>(`/sales/performance/${period}`, {
        need: { branch: 'Sales', permission: 'performance.view' },
        schema: SalesPerformanceResponse,
        signal,
      }),
  })

/** Re-exported so the screen names the freeze without importing a fixture. */
export const CHARTS_FROZEN_AT = DAS_VINA_FROZEN_AT

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------
// EXIT REASONS — the frozen scenario's own quarter, never the picker's period
// ---------------------------------------------------------------------------

export type ExitRow = { label: string; count: number; share: number }

export type FrozenExits = {
  /** The scenario quarter the rows cover, as the tile's head prints it. */
  periodLabel: string
  exits: ExitRow[]
  total: number
}

/** Leads dropped in the quarter that holds the freeze, from the scenario's
 *  first day to the freeze. A quarter, not the frozen month: that month has
 *  too few rows to read. Days compare as strings: every scenario moment is
 *  at +07:00, so its first ten characters are the Vietnam day. */
function buildExits(): FrozenExits {
  const frozenDay = DAS_VINA_FROZEN_AT.slice(0, 10)
  const year = frozenDay.slice(0, 4)
  const quarter = Math.ceil(Number(frozenDay.slice(5, 7)) / 3)
  const quarterStart = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`
  const dataStart = DAS_VINA_PERIOD.from.slice(0, 10)
  const from = quarterStart < dataStart ? dataStart : quarterStart

  const dropped = LEADS.filter((lead) => {
    const day = leadMilestones(lead).dropped?.slice(0, 10)
    return day !== undefined && day >= from && day <= frozenDay
  })
  const total = dropped.length

  const exits = EXIT_REASONS.map((reason) => {
    const count = dropped.filter((lead) => lead.exitReason === reason.label).length
    return { label: reason.label, count, share: total > 0 ? count / total : 0 }
  })
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)

  return { periodLabel: `Quý ${quarter} · ${year}`, exits, total }
}

export const frozenExitsQuery = queryOptions({
  queryKey: ['sales', 'performance', 'exits'] as const,
  queryFn: () =>
    api.read('/sales/performance/exits', {
      need: { branch: 'Sales', permission: 'performance.view' },
      load: async (): Promise<FrozenExits> => buildExits(),
    }),
})

/** More slices than this and the smallest ones stop being readable arcs. */
const MAX_SLICES = 4

export type ExitSlice = { key: string; label: string; count: number; share: number }

/** The exit rows as donut slices. Up to four reasons pass through untouched;
 *  beyond that the top three stay and the rest become one slice, returned in
 *  `folded` so the screen can still name every reason. */
export function foldExits(
  exits: readonly ExitRow[],
  total: number,
): { slices: ExitSlice[]; folded: ExitRow[] } {
  const slice = (e: ExitRow): ExitSlice => ({ ...e, key: e.label })
  if (exits.length <= MAX_SLICES) return { slices: exits.map(slice), folded: [] }

  const folded = exits.slice(MAX_SLICES - 1)
  const count = sum(folded.map((e) => e.count))
  return {
    slices: [
      ...exits.slice(0, MAX_SLICES - 1).map(slice),
      {
        key: 'rest',
        label: `${folded.length} lý do còn lại`,
        count,
        share: total > 0 ? count / total : 0,
      },
    ],
    folded,
  }
}
