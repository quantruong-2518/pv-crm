import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiAssignmentMineResponse,
  KpiAssignmentPageResponse,
  KpiAssignmentSendResponse,
  KpiAssignmentTreeResponse,
  type KpiAssignmentDraftBody,
  type RoleId,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** `/sales/kpi/:period/assignments/:role…` — targets handed down the org tree
 *  (ADR 0120). Every read is live (no `load:`), every door is `kpi.view`: who
 *  sits on a unit's seat is the server's check, never the screen's.
 *
 *  Keys sit under `kpi.ts`'s month key. A write answers with the refreshed page
 *  (or the person's lines), which goes straight into the cache; the month's
 *  other keys are then invalidated, because a sent set is someone's target. */

const NEED: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

const monthKey = (period: string) => ['sales', 'kpi', period] as const
const roleKey = (period: string, role: RoleId) =>
  [...monthKey(period), 'assignments', role] as const
const base = (period: string, role: RoleId) =>
  `/sales/kpi/${period}/assignments/${encodeURIComponent(role)}`

/** `null` = the unit the caller heads; the server resolves it. */
const pageKey = (period: string, role: RoleId, unitId: string | null) =>
  [...roleKey(period, role), 'page', unitId ?? 'own'] as const
const mineKey = (period: string, role: RoleId) => [...roleKey(period, role), 'me'] as const

export const kpiAssignmentPageQuery = (period: string, role: RoleId, unitId: string | null) =>
  queryOptions({
    queryKey: pageKey(period, role, unitId),
    queryFn: ({ signal }) =>
      api.read<KpiAssignmentPageResponse>(
        `${base(period, role)}${unitId ? `?unitId=${encodeURIComponent(unitId)}` : ''}`,
        { need: NEED, schema: KpiAssignmentPageResponse, signal },
      ),
  })

/** The caller's own lines of one role they hold. */
export const kpiAssignmentMineQuery = (period: string, role: RoleId) =>
  queryOptions({
    queryKey: mineKey(period, role),
    queryFn: ({ signal }) =>
      api.read<KpiAssignmentMineResponse>(`${base(period, role)}/me`, {
        need: NEED,
        schema: KpiAssignmentMineResponse,
        signal,
      }),
  })

/** The whole month for one role; the server lets in `kpi.view-all` or the company seat. */
export const kpiAssignmentTreeQuery = (period: string, role: RoleId) =>
  queryOptions({
    queryKey: [...roleKey(period, role), 'tree'] as const,
    queryFn: ({ signal }) =>
      api.read<KpiAssignmentTreeResponse>(`${base(period, role)}/tree`, {
        need: NEED,
        schema: KpiAssignmentTreeResponse,
        signal,
      }),
  })

/** Puts the answer under `key`, then refetches every other key of the month. */
function useSettle(period: string, key: readonly unknown[]) {
  const client = useQueryClient()
  return (fresh: unknown) => {
    client.setQueryData(key, fresh)
    const same = JSON.stringify(key)
    void client.invalidateQueries({
      queryKey: monthKey(period),
      predicate: (query) => JSON.stringify(query.queryKey) !== same,
    })
  }
}

/** A 409 means the page moved under the reader: reread it. */
function useRefetchOnConflict(key: readonly unknown[]) {
  const client = useQueryClient()
  return (error: ApiError) => {
    if (error.kind === 'conflict') void client.invalidateQueries({ queryKey: key })
  }
}

/** Replaces the whole draft of `body.unitId`; `unitParam` names the cached page. */
export function useDraftKpiAssignment(period: string, role: RoleId, unitParam: string | null) {
  const key = pageKey(period, role, unitParam)
  return useMutation<KpiAssignmentPageResponse, ApiError, KpiAssignmentDraftBody>({
    mutationFn: (body) =>
      api.write<KpiAssignmentPageResponse>(`${base(period, role)}/draft`, {
        method: 'PUT',
        body,
        need: NEED,
        schema: KpiAssignmentPageResponse,
      }),
    onSuccess: useSettle(period, key),
    onError: useRefetchOnConflict(key),
  })
}

/** Sends the saved draft; `warnings` are the sums sent above `KPI_ASSIGNMENT_OVER_RATIO`. */
export function useSendKpiAssignment(period: string, role: RoleId, unitParam: string | null) {
  const key = pageKey(period, role, unitParam)
  return useMutation<KpiAssignmentSendResponse, ApiError, { unitId: string }>({
    mutationFn: (body) =>
      api.write<KpiAssignmentSendResponse>(`${base(period, role)}/send`, {
        body,
        need: NEED,
        schema: KpiAssignmentSendResponse,
      }),
    onSuccess: useSettle(period, key),
    onError: useRefetchOnConflict(key),
  })
}

/** Every unanswered line of the role at once. A 409 (past the 28th, nothing
 *  left) rereads the lines, whose own state then says it. */
export function useConfirmKpiAssignment(period: string, role: RoleId) {
  const key = mineKey(period, role)
  return useMutation<KpiAssignmentMineResponse, ApiError, void>({
    mutationFn: () =>
      api.write<KpiAssignmentMineResponse>(`${base(period, role)}/confirm`, {
        need: NEED,
        schema: KpiAssignmentMineResponse,
      }),
    onSuccess: useSettle(period, key),
    onError: useRefetchOnConflict(key),
  })
}
