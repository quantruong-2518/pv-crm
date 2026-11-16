import { queryOptions } from '@tanstack/react-query'
import { KpiSignedByDayResponse } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `/sales/kpi/:period/people/:actorId/signed-by-day` — the running signed total of
 *  the month, with the forecast line from the weekly pick (ADR 0160 §9). */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

/** Prefix of every person's read for a month: a saved weekly pick refetches them all. */
export const kpiSignedByDayKey = (period: string) =>
  ['sales', 'kpi', period, 'signed-by-day'] as const

export const kpiSignedByDayQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: [...kpiSignedByDayKey(period), actorId] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiSignedByDayResponse>(
        `/sales/kpi/${period}/people/${encodeURIComponent(actorId)}/signed-by-day`,
        { need, schema: KpiSignedByDayResponse, signal },
      ),
  })
