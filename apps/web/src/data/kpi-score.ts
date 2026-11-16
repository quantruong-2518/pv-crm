import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiMyActionsResponse,
  KpiOneOnOneResponse,
  KpiScoreResponse,
  type KpiOneOnOneBody,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { kpiDeskKey } from './kpi-desk'

/** Month score, the monthly 1:1 and the caller's open 1:1 actions (ADR 0158 §3–4).
 *  Closed months only; the server answers `score: null` before that.
 *
 *  1:1 writes answer the refreshed 1:1, which goes into the cache; the desk
 *  (its 1:1 counts) and `me/actions` are then refetched. */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

const root = ['sales', 'kpi'] as const
const oneKey = (period: string, actorId: string) =>
  [...root, period, 'one-on-one', actorId] as const
const myActionsKey = [...root, 'me', 'actions'] as const
const base = (period: string, actorId: string) =>
  `/sales/kpi/${period}/one-on-ones/${encodeURIComponent(actorId)}`

export const kpiScoreQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: [...root, period, 'score', actorId] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiScoreResponse>(
        `/sales/kpi/${period}/people/${encodeURIComponent(actorId)}/score`,
        { need, schema: KpiScoreResponse, signal },
      ),
  })

export const kpiOneOnOneQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: oneKey(period, actorId),
    queryFn: ({ signal }) =>
      api.read<KpiOneOnOneResponse>(base(period, actorId), {
        need,
        schema: KpiOneOnOneResponse,
        signal,
      }),
  })

/** Open actions only, across months. */
export const kpiMyActionsQuery = queryOptions({
  queryKey: myActionsKey,
  ...cacheTier.aggregate,
  queryFn: ({ signal }) =>
    api.read<KpiMyActionsResponse>('/sales/kpi/me/actions', {
      need,
      schema: KpiMyActionsResponse,
      signal,
    }),
})

function useSettleOneOnOne(period: string, actorId: string) {
  const client = useQueryClient()
  return (fresh: KpiOneOnOneResponse) => {
    client.setQueryData(oneKey(period, actorId), fresh)
    void client.invalidateQueries({ queryKey: kpiDeskKey(period) })
    void client.invalidateQueries({ queryKey: myActionsKey })
  }
}

/** Replaces the note and the actions of one person's month. */
export function useWriteKpiOneOnOne(period: string, actorId: string) {
  return useMutation<KpiOneOnOneResponse, ApiError, KpiOneOnOneBody>({
    mutationFn: (body) =>
      api.write<KpiOneOnOneResponse>(base(period, actorId), {
        method: 'PUT',
        body,
        need,
        schema: KpiOneOnOneResponse,
      }),
    onSuccess: useSettleOneOnOne(period, actorId),
  })
}

/** The person confirms they read it; no body. */
export function useAcknowledgeKpiOneOnOne(period: string, actorId: string) {
  return useMutation<KpiOneOnOneResponse, ApiError, void>({
    mutationFn: () =>
      api.write<KpiOneOnOneResponse>(`${base(period, actorId)}/acknowledge`, {
        need,
        schema: KpiOneOnOneResponse,
      }),
    onSuccess: useSettleOneOnOne(period, actorId),
  })
}

/** Marks one action done. The action may sit in any person's 1:1, so every
 *  cached 1:1 is refetched rather than guessing which one. */
export function useDoneKpiOneOnOneAction() {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, string>({
    mutationFn: (actionId) =>
      api.write<unknown>(`/sales/kpi/one-on-one-actions/${encodeURIComponent(actionId)}/done`, {
        need,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: myActionsKey })
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'sales' && q.queryKey[3] === 'one-on-one',
      })
    },
  })
}
