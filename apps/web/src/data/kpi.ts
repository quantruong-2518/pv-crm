import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiCompanyResponse,
  KpiMeResponse,
  KpiPeopleResponse,
  KpiTargetsResponse,
  type KpiAgreeBody,
  type KpiProposeBody,
  type RoleId,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** `/sales/kpi/:period/…` — scorecards per role and the agreed monthly targets.
 *  Every read is live (no `load:`), and `period` is a month key only.
 *
 *  Always stale: a reading is computed on read from other books, and no write
 *  to those books invalidates these keys. The three writes answer with the
 *  refreshed read, so it goes straight into the cache; the month's other keys
 *  are then invalidated, because an agreed target moves every verdict. */

const need = (permission: NonNullable<ApiNeed['permission']>): ApiNeed => ({
  branch: 'Sales',
  permission,
})

const monthKey = (period: string) => ['sales', 'kpi', period] as const

/** One scorecard per role the reader holds. */
export const kpiMeQuery = (period: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'me'] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiMeResponse>(`/sales/kpi/${period}/me`, {
        need: need('kpi.view'),
        schema: KpiMeResponse,
        signal,
      }),
  })

/** The room's figures: the `director` scorecard, with nothing to acknowledge. */
export const kpiCompanyQuery = (period: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'company'] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiCompanyResponse>(`/sales/kpi/${period}/company`, {
        need: need('performance.view'),
        schema: KpiCompanyResponse,
        signal,
      }),
  })

/** Every enabled Sales actor with their scorecards. */
export const kpiPeopleQuery = (period: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'people'] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiPeopleResponse>(`/sales/kpi/${period}/people`, {
        need: need('kpi.view-all'),
        schema: KpiPeopleResponse,
        signal,
      }),
  })

/** Every role × catalog metric, with what is agreed and what is pending. */
export const kpiTargetsQuery = (period: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'targets'] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiTargetsResponse>(`/sales/kpi/${period}/targets`, {
        need: need('kpi.view'),
        schema: KpiTargetsResponse,
        signal,
      }),
  })

/** Puts the write's answer in the cache, then refetches the rest of the month. */
function useSettle(period: string, part: 'me' | 'targets') {
  const client = useQueryClient()
  return (fresh: KpiMeResponse | KpiTargetsResponse) => {
    const key = [...monthKey(period), part]
    client.setQueryData(key, fresh)
    void client.invalidateQueries({
      queryKey: monthKey(period),
      predicate: (query) => query.queryKey[3] !== part,
    })
  }
}

/** A 409 means the table on screen is no longer the table on the server: a
 *  proposal was replaced, or agreed, between the read and the press. */
function useRefetchOnConflict(period: string) {
  const client = useQueryClient()
  return (error: ApiError) => {
    if (error.kind !== 'conflict') return
    void client.invalidateQueries({ queryKey: [...monthKey(period), 'targets'] })
  }
}

const targetsPath = (period: string, role: RoleId) =>
  `/sales/kpi/${period}/targets/${encodeURIComponent(role)}`

/** Propose targets for one role; replaces that role's still-pending proposal. */
export function useProposeKpiTargets(period: string, role: RoleId) {
  return useMutation<KpiTargetsResponse, ApiError, KpiProposeBody>({
    mutationFn: (body) =>
      api.write<KpiTargetsResponse>(targetsPath(period, role), {
        method: 'PUT',
        body,
        need: need('kpi.set-target'),
        schema: KpiTargetsResponse,
      }),
    onSuccess: useSettle(period, 'targets'),
    onError: useRefetchOnConflict(period),
  })
}

/** Agree one role's pending targets. The body names the rows the reader saw,
 *  so a value replaced after the read is never locked. The server refuses the
 *  proposer. */
export function useAgreeKpiTargets(period: string, role: RoleId) {
  return useMutation<KpiTargetsResponse, ApiError, KpiAgreeBody>({
    mutationFn: (body) =>
      api.write<KpiTargetsResponse>(`${targetsPath(period, role)}/agree`, {
        body,
        need: need('kpi.set-target'),
        schema: KpiTargetsResponse,
      }),
    onSuccess: useSettle(period, 'targets'),
    onError: useRefetchOnConflict(period),
  })
}

/** "I have received my targets" for one role the caller holds. */
export function useAcknowledgeKpi(period: string, role: RoleId) {
  return useMutation<KpiMeResponse, ApiError, void>({
    mutationFn: () =>
      api.write<KpiMeResponse>(
        `/sales/kpi/${period}/acknowledgements/${encodeURIComponent(role)}`,
        { need: need('kpi.view'), schema: KpiMeResponse },
      ),
    onSuccess: useSettle(period, 'me'),
  })
}
