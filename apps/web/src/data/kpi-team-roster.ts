import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiTeamRosterResponse,
  KpiTeamWriteResponse,
  type KpiTeamBody,
  type KpiTeamRosterResponse as Roster,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** `/sales/kpi/teams` — who is in which KPI team, by month (ADR 0101).
 *
 *  The key sits under the month key of `kpi.ts`, so anything that refetches the
 *  month refetches the roster. A write lands on `editableFrom`, not on the month
 *  the screen shows: its answer goes straight into THAT month's cache, and the
 *  whole KPI tree is invalidated because holders of a role move between the
 *  room list and a team. */

const need = (permission: NonNullable<ApiNeed['permission']>): ApiNeed => ({
  branch: 'Sales',
  permission,
})

const PATH = '/sales/kpi/teams'

export const kpiTeamRosterKey = (period: string) => ['sales', 'kpi', period, 'teams'] as const

/** The roster in force for `period`. Without `kpi.view-all` it holds only the
 *  caller's own team and an empty `unassigned`. */
export const kpiTeamRosterQuery = (period: string) =>
  queryOptions({
    queryKey: kpiTeamRosterKey(period),
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<Roster>(`${PATH}?period=${encodeURIComponent(period)}`, {
        need: need('kpi.view'),
        schema: KpiTeamRosterResponse,
        signal,
      }),
  })

function useRosterWrite<I>(
  to: (input: I) => { path: string; method?: 'PUT' | 'DELETE'; body?: unknown },
) {
  const client = useQueryClient()
  return useMutation<Roster, ApiError, I>({
    mutationFn: (input) => {
      const { path, method, body } = to(input)
      return api.write<Roster>(path, {
        method,
        body,
        need: need('kpi.set-target'),
        schema: KpiTeamWriteResponse,
      })
    },
    onSuccess: (fresh) => {
      client.setQueryData(kpiTeamRosterKey(fresh.period), fresh)
      void client.invalidateQueries({ queryKey: ['sales', 'kpi'] })
    },
  })
}

export const useCreateKpiTeam = () => useRosterWrite<KpiTeamBody>((body) => ({ path: PATH, body }))

export const useUpdateKpiTeam = () =>
  useRosterWrite<{ teamId: string; body: KpiTeamBody }>(({ teamId, body }) => ({
    path: `${PATH}/${encodeURIComponent(teamId)}`,
    method: 'PUT',
    body,
  }))

export const useDeleteKpiTeam = () =>
  useRosterWrite<{ teamId: string }>(({ teamId }) => ({
    path: `${PATH}/${encodeURIComponent(teamId)}`,
    method: 'DELETE',
  }))
