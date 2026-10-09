import { queryOptions } from '@tanstack/react-query'
import {
  DAS_VINA_FROZEN_AT,
  OPEN_DEALS,
  PIPELINE_STAGES,
  SOURCES,
  opsFromSource,
  sourceStats,
} from '@pv/engines/fixtures/das-vina'
import { api } from '@/app/api'
import type { ExitRow } from './performance'

/** The overview's figures that `performanceQuery` does not carry: conversion
 *  and cost per lead source, and days in stage. Scenario 2 (DAS Vina), frozen.
 *
 *  `load:` is present, so this is still a fixture read. Nothing here is a new
 *  number: every field is a count, sum or mean over rows the fixture already
 *  holds. Open value, exits and the funnel are NOT repeated here: they have
 *  one ledger, `performanceQuery`; `foldExits` only regroups its rows. */

/** Re-exported so the screen names the freeze without importing a fixture. */
export const CHARTS_FROZEN_AT = DAS_VINA_FROZEN_AT

/** Named source rows before the remainder row: eight rows do not fit a tile. */
const TOP_SOURCES = 3

export type SourceLine = {
  key: string
  label: string
  leads: number
  /** Leads of this source that have a row in the opportunity book. */
  opportunities: number
  /** Cash per opportunity, VND. Null while the source has no opportunity. */
  costPerOpportunity: number | null
}

export type StageLine = {
  /** Same keys as the live `StageKey`, so a live rung can be matched to it. */
  key: string
  label: string
  limitDays: number
  /** Mean days the open deals have stood here; null when the column is empty. */
  meanDays: number | null
}

export type HomeSnapshot = { sources: SourceLine[]; stages: StageLine[] }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function buildSources(): SourceLine[] {
  const all = SOURCES.map((s) => {
    const stats = sourceStats(s.code)
    return {
      key: s.code,
      label: s.label,
      leads: stats.leads,
      opportunities: opsFromSource(s.code),
      cost: stats.cost,
      costPerOpportunity: stats.costPerSql,
    }
  }).sort((a, b) => b.leads - a.leads || a.key.localeCompare(b.key))

  const line = ({ cost: _cost, ...row }: (typeof all)[number]): SourceLine => row
  const rest = all.slice(TOP_SOURCES)
  if (rest.length === 0) return all.map(line)

  /* The remainder row divides its own sums, the fixture's `costPerSql` rule
     applied to the group: no opportunity, no price. */
  const opportunities = sum(rest.map((r) => r.opportunities))
  return [
    ...all.slice(0, TOP_SOURCES).map(line),
    {
      key: 'other',
      label: `${rest.length} nguồn còn lại`,
      leads: sum(rest.map((r) => r.leads)),
      opportunities,
      costPerOpportunity:
        opportunities > 0 ? Math.round(sum(rest.map((r) => r.cost)) / opportunities) : null,
    },
  ]
}

function buildStages(): StageLine[] {
  return PIPELINE_STAGES.map((stage) => {
    const days = OPEN_DEALS.filter((d) => d.stage === stage.key).map((d) => d.daysInStage)
    return {
      key: stage.key,
      label: stage.label,
      limitDays: stage.limitDays,
      meanDays: days.length > 0 ? sum(days) / days.length : null,
    }
  })
}

/* Hidden on the owner's request, 09/10: its two tiles are off, so nothing calls this. */
export const homeSnapshotQuery = queryOptions({
  queryKey: ['sales', 'performance', 'snapshot'] as const,
  queryFn: () =>
    api.read('/sales/performance/snapshot', {
      need: { branch: 'Sales', permission: 'performance.view' },
      load: async (): Promise<HomeSnapshot> => ({
        sources: buildSources(),
        stages: buildStages(),
      }),
    }),
})

// ---------------------------------------------------------------------------
// EXIT REASONS — regrouped for a four-slice donut, never recounted
// ---------------------------------------------------------------------------

/** More slices than this and the smallest ones stop being readable arcs. */
const MAX_SLICES = 4

export type ExitSlice = { key: string; label: string; count: number; share: number }

/** The period's exit rows as donut slices. Up to four reasons pass through
 *  untouched; beyond that the top three stay and the rest become one slice,
 *  returned in `folded` so the screen can still name every reason. */
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
