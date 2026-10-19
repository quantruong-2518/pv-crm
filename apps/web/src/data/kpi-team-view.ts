import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiAllocationResponse,
  KpiTeamViewResponse,
  type KpiAllocationDraftBody,
  type KpiAllocationSubmitBody,
  type KpiCounterResolveBody,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** The team page's reads and writes (ADR 0101). All live, no `load:`.
 *
 *  A team lead holds `kpi.view` and not `kpi.set-target`, so the two writes
 *  reuse the allocation doors with `teamId` in the body but declare their own
 *  `need`; `data/kpi-allocation.ts` declares the head's.
 *
 *  A write's answer is the caller's scoped allocations, which may leave the
 *  team's package out. So nothing is set into the cache: the whole month is
 *  invalidated and the page reads the view again. */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

const monthKey = (period: string) => ['sales', 'kpi', period] as const
const base = (period: string) => `/sales/kpi/${period}`

/** Index 3 is `'team'`, not the roster's `'teams'`, so neither read's key matches the other's filters. */
export const kpiTeamViewQuery = (period: string, teamId: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'team', teamId] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiTeamViewResponse>(`${base(period)}/teams/${encodeURIComponent(teamId)}`, {
        need,
        schema: KpiTeamViewResponse,
        signal,
      }),
  })

/** Refetches everything under the month; a 409 means the package moved under the reader. */
/** The lead's own doors: the room ones need `kpi.set-target` (ADR 0004, one permission a door). */
const teamBase = (period: string, teamId: string) =>
  `${base(period)}/teams/${encodeURIComponent(teamId)}`

function useRefresh(period: string) {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: monthKey(period) })
  return { onSuccess: () => void refresh(), onError: () => void refresh() }
}

/** Replaces the team's draft for one role; an agreed or returned package opens version + 1. */
export function useDraftTeamAllocation(period: string, teamId: string) {
  return useMutation<KpiAllocationResponse, ApiError, KpiAllocationDraftBody>({
    mutationFn: (body) =>
      api.write<KpiAllocationResponse>(`${teamBase(period, teamId)}/allocations/draft`, {
        method: 'PUT',
        body,
        need,
        schema: KpiAllocationResponse,
      }),
    ...useRefresh(period),
  })
}

/** Sends the saved draft for approval; `ackDays` is how long members get to answer. */
export function useSubmitTeamAllocation(period: string, teamId: string) {
  return useMutation<KpiAllocationResponse, ApiError, KpiAllocationSubmitBody>({
    mutationFn: (body) =>
      api.write<KpiAllocationResponse>(`${teamBase(period, teamId)}/allocations/submit`, {
        body,
        need,
        schema: KpiAllocationResponse,
      }),
    ...useRefresh(period),
  })
}

/** The lead settles a member's counter: accept, keep, or offer another value. */
export function useResolveTeamCounter(period: string, teamId: string) {
  return useMutation<
    KpiAllocationResponse,
    ApiError,
    { counterId: string; body: KpiCounterResolveBody }
  >({
    mutationFn: ({ counterId, body }) =>
      api.write<KpiAllocationResponse>(
        `${base(period)}/teams/${encodeURIComponent(teamId)}/counters/${encodeURIComponent(counterId)}/resolve`,
        { body, need, schema: KpiAllocationResponse },
      ),
    ...useRefresh(period),
  })
}
