import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiAbsenceListResponse,
  KpiStandInCandidatesResponse,
  type KpiAbsenceCreate,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `/sales/kpi/absences…` — who is away and who stands in (ADR 0117). Live, no `load:`.
 *
 *  Every door is `kpi.view`; who may declare for whom is the server's call. A
 *  write moves waiting lists, team doors and the roster's `actingFor`, so it
 *  invalidates the whole KPI tree rather than guessing which month it touched. */

const NEED: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }
const KPI_KEY = ['sales', 'kpi'] as const
const PATH = '/sales/kpi/absences'

/** The caller's own, the ones they stand in for, and all of them for a target setter. */
export const kpiAbsencesQuery = queryOptions({
  queryKey: [...KPI_KEY, 'absences'] as const,
  ...cacheTier.aggregate,
  queryFn: ({ signal }) =>
    api.read<KpiAbsenceListResponse>(PATH, { need: NEED, schema: KpiAbsenceListResponse, signal }),
})

/** Who may stand in for `actorId`, or for the caller when it is absent. */
export const kpiStandInsQuery = (actorId: string | undefined, enabled: boolean) =>
  queryOptions({
    queryKey: [...KPI_KEY, 'absences', 'stand-ins', actorId ?? 'me'] as const,
    enabled,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiStandInCandidatesResponse>(
        `${PATH}/stand-ins${actorId ? `?actorId=${encodeURIComponent(actorId)}` : ''}`,
        { need: NEED, schema: KpiStandInCandidatesResponse, signal },
      ),
  })

type Write =
  | { kind: 'declare'; body: KpiAbsenceCreate }
  | { kind: 'end'; absenceId: string; toDay: string }
  | { kind: 'cancel'; absenceId: string }

/** One mutation for the three doors, so a screen holds one pending/error state. */
export function useKpiAbsenceWrite() {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, Write>({
    mutationFn: (w) => {
      if (w.kind === 'declare') return api.write(PATH, { body: w.body, need: NEED })
      const at = `${PATH}/${encodeURIComponent(w.absenceId)}`
      return w.kind === 'end'
        ? api.write(at, { method: 'PATCH', body: { toDay: w.toDay }, need: NEED })
        : api.write(`${at}/cancel`, { need: NEED })
    },
    onSettled: () => client.invalidateQueries({ queryKey: KPI_KEY }),
  })
}
