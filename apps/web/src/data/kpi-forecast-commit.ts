import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiForecastMeResponse,
  KpiUnitForecastResponse,
  type KpiForecastMeBody,
  type KpiUnitForecastBody,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { kpiCompanyDeskKey, kpiDeskKey } from './kpi-desk'

/** Weekly forecast commit (ADR 0158 §1): a holder's own pick and a unit's commit.
 *  The path and key say `commit`: the older weekly `forecast/me` read of
 *  `kpi-personal.ts` already owns that path and `[…, 'forecast', 'me']`.
 *
 *  A write answers with the refreshed read, which goes straight into the cache;
 *  the desk reads that print its flags are then refetched. */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

const meKey = (period: string) => ['sales', 'kpi', period, 'forecast-commit', 'me'] as const
const unitKey = (period: string, unitId: string) =>
  ['sales', 'kpi', period, 'forecast-commit', 'unit', unitId] as const

export const kpiForecastCommitMeQuery = (period: string) =>
  queryOptions({
    queryKey: meKey(period),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiForecastMeResponse>(`/sales/kpi/${period}/commit/me`, {
        need,
        schema: KpiForecastMeResponse,
        signal,
      }),
  })

export const kpiUnitForecastQuery = (period: string, unitId: string) =>
  queryOptions({
    queryKey: unitKey(period, unitId),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiUnitForecastResponse>(
        `/sales/kpi/${period}/units/${encodeURIComponent(unitId)}/commit`,
        { need, schema: KpiUnitForecastResponse, signal },
      ),
  })

/** Opportunity ids are opportunity codes; a later save replaces the week's pick. */
export function useSaveKpiForecastMe(period: string) {
  const client = useQueryClient()
  return useMutation<KpiForecastMeResponse, ApiError, KpiForecastMeBody>({
    mutationFn: (body) =>
      api.write<KpiForecastMeResponse>(`/sales/kpi/${period}/commit/me`, {
        method: 'PUT',
        body,
        need,
        schema: KpiForecastMeResponse,
      }),
    onSuccess: (fresh) => {
      client.setQueryData(meKey(period), fresh)
      void client.invalidateQueries({
        queryKey: ['sales', 'kpi', period, 'forecast-commit', 'unit'],
      })
      void client.invalidateQueries({ queryKey: kpiDeskKey(period) })
    },
  })
}

export function useCommitKpiUnitForecast(period: string, unitId: string) {
  const client = useQueryClient()
  return useMutation<KpiUnitForecastResponse, ApiError, KpiUnitForecastBody>({
    mutationFn: (body) =>
      api.write<KpiUnitForecastResponse>(
        `/sales/kpi/${period}/units/${encodeURIComponent(unitId)}/commit`,
        { method: 'PUT', body, need, schema: KpiUnitForecastResponse },
      ),
    onSuccess: (fresh) => {
      client.setQueryData(unitKey(period, unitId), fresh)
      void client.invalidateQueries({ queryKey: kpiDeskKey(period) })
      void client.invalidateQueries({ queryKey: kpiCompanyDeskKey(period) })
    },
  })
}
