import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiAllocationResponse,
  KpiCounterListResponse,
  type KpiAllocationDecideBody,
  type KpiAllocationDraftBody,
  type KpiAllocationSubmitBody,
  type KpiCounterResolveBody,
  type RoleId,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** `/sales/kpi/:period/allocations|counters…` — a role target split per person
 *  (ADR 0098). Every read is live (no `load:`).
 *
 *  Keys sit under `kpi.ts`'s month key, so a target agreed there refetches
 *  these too. Every write answers with a refreshed read: it goes straight into
 *  the cache and the month's other keys are invalidated, because an agreed
 *  line becomes a person's scorecard target. */

const need = (permission: NonNullable<ApiNeed['permission']>): ApiNeed => ({
  branch: 'Sales',
  permission,
})

const monthKey = (period: string) => ['sales', 'kpi', period] as const
const base = (period: string) => `/sales/kpi/${period}`
const rolePath = (period: string, role: RoleId) =>
  `${base(period)}/allocations/${encodeURIComponent(role)}`

/** Every live package; `kpi.view-all` reads every line, others only their own
 *  (and, while the next version is a draft, the last agreed one as `superseded`).
 *  The one copy of this read: the holder's screens use it too. */
export const kpiAllocationsQuery = (period: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'allocations'] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiAllocationResponse>(`${base(period)}/allocations`, {
        need: need('kpi.view'),
        schema: KpiAllocationResponse,
        signal,
      }),
  })

/** Every counter of the month, open and settled, with what accepting would do. */
export const kpiCountersQuery = (period: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'counters'] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiCounterListResponse>(`${base(period)}/counters`, {
        need: need('kpi.view-all'),
        schema: KpiCounterListResponse,
        signal,
      }),
  })

type Part = 'allocations' | 'counters'

/** Puts the write's answer in the cache, then refetches the rest of the month. */
function useSettle(period: string, part: Part) {
  const client = useQueryClient()
  return (fresh: KpiAllocationResponse | KpiCounterListResponse) => {
    client.setQueryData([...monthKey(period), part], fresh)
    void client.invalidateQueries({
      queryKey: monthKey(period),
      predicate: (query) => query.queryKey[3] !== part,
    })
  }
}

/** A 409 may mean the package moved under the reader; reread both books. A
 *  409 that only refuses a sum costs one refetch, which is cheaper than
 *  telling the two apart here. */
function useRefetchOnConflict(period: string) {
  const client = useQueryClient()
  return (error: ApiError) => {
    if (error.kind !== 'conflict') return
    void client.invalidateQueries({ queryKey: [...monthKey(period), 'allocations'] })
    void client.invalidateQueries({ queryKey: [...monthKey(period), 'counters'] })
  }
}

function useAllocationWrite<B>(
  period: string,
  permission: 'kpi.view' | 'kpi.set-target',
  to: (body: B) => { path: string; method?: 'PUT'; body: unknown },
) {
  return useMutation<KpiAllocationResponse, ApiError, B>({
    mutationFn: (input) => {
      const { path, method, body } = to(input)
      return api.write<KpiAllocationResponse>(path, {
        method,
        body,
        need: need(permission),
        schema: KpiAllocationResponse,
      })
    },
    onSuccess: useSettle(period, 'allocations'),
    onError: useRefetchOnConflict(period),
  })
}

/** Replaces the role's draft; a returned or agreed package opens version + 1. */
export const useDraftKpiAllocation = (period: string) =>
  useAllocationWrite<KpiAllocationDraftBody>(period, 'kpi.set-target', (body) => ({
    path: `${base(period)}/allocations/draft`,
    method: 'PUT',
    body,
  }))

/** Sends the saved draft; refused with a sentence while an additive sum is off.
 *  `ackDays` is how long holders get to answer once the package is agreed. */
export const useSubmitKpiAllocation = (period: string) =>
  useAllocationWrite<KpiAllocationSubmitBody>(period, 'kpi.set-target', (body) => ({
    path: `${base(period)}/allocations/submit`,
    body,
  }))

/** Agree or return a sent package; the server refuses its sender. */
export const useDecideKpiAllocation = (period: string, role: RoleId) =>
  useAllocationWrite<KpiAllocationDecideBody>(period, 'kpi.set-target', (body) => ({
    path: `${rolePath(period, role)}/decide`,
    body,
  }))

/** A manager settles one counter: accept, keep, or offer another value. The
 *  answer is the package book, so the counters list is the part refetched. */
export function useResolveKpiCounter(period: string) {
  return useMutation<
    KpiAllocationResponse,
    ApiError,
    { counterId: string; body: KpiCounterResolveBody }
  >({
    mutationFn: ({ counterId, body }) =>
      api.write<KpiAllocationResponse>(
        `${base(period)}/counters/${encodeURIComponent(counterId)}/resolve`,
        { body, need: need('kpi.set-target'), schema: KpiAllocationResponse },
      ),
    onSuccess: useSettle(period, 'allocations'),
    onError: useRefetchOnConflict(period),
  })
}
