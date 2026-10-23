import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  OrgTreeResponse,
  type OrgMemberBody,
  type OrgUnitCreateBody,
  type OrgUnitUpdateBody,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `/platform/org` — the org tree, Company → Department → Team, by month
 *  (ADR 0118). Live, no `load:`.
 *
 *  Every write lands on `editableFrom` and answers with the tree there, so the
 *  answer goes straight into that month's cache instead of a refetch. Other
 *  months are invalidated (a rename applies to every version), and so is the
 *  KPI tree: the KPI team roster of a tree month is read from this tree. */

const READ: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }
const WRITE: ApiNeed = { branch: 'Sales', permission: 'kpi.set-target' }
const PATH = '/platform/org'
const ORG_KEY = ['platform', 'org'] as const

export const orgTreeKey = (period: string) => [...ORG_KEY, period] as const

/** The tree in force for `period`. Without `kpi.view-all` it holds only the
 *  caller's own path, the units above their own bare. */
export const orgTreeQuery = (period: string) =>
  queryOptions({
    queryKey: orgTreeKey(period),
    ...cacheTier.reference,
    queryFn: ({ signal }) =>
      api.read<OrgTreeResponse>(`${PATH}?period=${encodeURIComponent(period)}`, {
        need: READ,
        schema: OrgTreeResponse,
        signal,
      }),
  })

export type OrgWrite =
  | { kind: 'create'; body: OrgUnitCreateBody }
  | { kind: 'update'; unitId: string; body: OrgUnitUpdateBody }
  | { kind: 'remove'; unitId: string }
  | { kind: 'place'; actorId: string; body: OrgMemberBody }
  | { kind: 'unplace'; actorId: string }

function requestOf(w: OrgWrite): {
  path: string
  method?: 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
} {
  switch (w.kind) {
    case 'create':
      return { path: `${PATH}/units`, body: w.body }
    case 'update':
      return {
        path: `${PATH}/units/${encodeURIComponent(w.unitId)}`,
        method: 'PATCH',
        body: w.body,
      }
    case 'remove':
      return { path: `${PATH}/units/${encodeURIComponent(w.unitId)}`, method: 'DELETE' }
    case 'place':
      return {
        path: `${PATH}/members/${encodeURIComponent(w.actorId)}`,
        method: 'PUT',
        body: w.body,
      }
    case 'unplace':
      return { path: `${PATH}/members/${encodeURIComponent(w.actorId)}`, method: 'DELETE' }
  }
}

/** One mutation for the five write doors, so a dialog holds one pending/error state. */
export function useOrgWrite() {
  const client = useQueryClient()
  return useMutation<OrgTreeResponse, ApiError, OrgWrite>({
    mutationFn: (w) => {
      const { path, method, body } = requestOf(w)
      return api.write<OrgTreeResponse>(path, {
        method,
        body,
        need: WRITE,
        schema: OrgTreeResponse,
      })
    },
    onSuccess: (fresh) => {
      const key = orgTreeKey(fresh.period)
      client.setQueryData(key, fresh)
      void client.invalidateQueries({
        queryKey: ORG_KEY,
        predicate: (q) => q.queryKey[2] !== fresh.period,
      })
      void client.invalidateQueries({ queryKey: ['sales', 'kpi'] })
    },
  })
}
