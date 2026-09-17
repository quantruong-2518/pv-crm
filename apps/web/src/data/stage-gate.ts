import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CriterionTickResponse,
  OpportunityGate,
  type ConfigProposalReceipt,
  type CriterionTick,
  type StageCriterionCreate,
  type StageCriterionListResponse,
  type StageCriterionPatch,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { WORKSTREAM_BOOK_KEY } from './workstreams'

/** Stage gate — the configuration doors for exit criteria, one deal's checklist
 *  and its tick door, and the one reader of a gate refusal. The rule itself is
 *  in `stage-gate.ts` of `@pv/contracts`.
 *
 *  Writes are proposals, like every other config row: a 202 receipt, nothing
 *  repainted, the list changes when the director approves. */

const PATH = '/sales/config/stage-criteria'
const VIEW_NEED: ApiNeed = { branch: 'Sales', permission: 'config.view' }
const PROPOSE_NEED: ApiNeed = { branch: 'Sales', permission: 'config.propose' }
const APPROVALS_KEY = ['platform', 'approvals', 'pending'] as const

export const stageCriteriaQuery = queryOptions({
  queryKey: ['sales', 'config', 'stage-criteria'] as const,
  queryFn: ({ signal }) => api.read<StageCriterionListResponse>(PATH, { need: VIEW_NEED, signal }),
})

/* Only the proposer's inbox moves on success; the criteria list is unchanged
   until approval, so re-reading it would fetch the same rows. */
export function useProposeCriterion() {
  const client = useQueryClient()
  return useMutation<ConfigProposalReceipt, ApiError, StageCriterionCreate>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>(PATH, { method: 'POST', body, need: PROPOSE_NEED }),
    onSuccess: () => void client.invalidateQueries({ queryKey: APPROVALS_KEY }),
  })
}

export function useProposeCriterionPatch(id: string) {
  const client = useQueryClient()
  return useMutation<ConfigProposalReceipt, ApiError, StageCriterionPatch>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>(`${PATH}/${id}`, {
        method: 'PATCH',
        body,
        need: PROPOSE_NEED,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: APPROVALS_KEY }),
  })
}

/** One deal's checklist. Keyed under the profile (`['sales','ops',code]`) so
 *  an invalidation of the deal reaches it without a second key constant. */
export function opportunityGateQuery(code: string) {
  return queryOptions({
    queryKey: ['sales', 'ops', code, 'criteria'] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityGate>(`/sales/opportunities/${encodeURIComponent(code)}/criteria`, {
        need: { branch: 'Sales', permission: 'opportunity.view', scoped: true },
        schema: OpportunityGate,
        signal,
      }),
  })
}

const TICK_NEED: ApiNeed = { branch: 'Sales', permission: 'opportunity.edit', scoped: true }

export type CriterionTickInput = { opportunityCode: string; criterionId: string; ticked: boolean }

/** Both screens that show ticks re-read: the deal's checklist and every run's
 *  lanes. Returning the invalidation keeps the mutation pending until they are
 *  back, so a ticked box never flickers to its old state in between. */
export function useTickCriterion() {
  const client = useQueryClient()
  return useMutation<CriterionTickResponse, ApiError, CriterionTickInput>({
    mutationFn: ({ opportunityCode, criterionId, ticked }) =>
      api.write<CriterionTickResponse>(
        `/sales/opportunities/${encodeURIComponent(opportunityCode)}/criteria/${encodeURIComponent(criterionId)}`,
        {
          method: 'PATCH',
          body: { ticked } satisfies CriterionTick,
          need: TICK_NEED,
          schema: CriterionTickResponse,
        },
      ),
    onSuccess: (_row, { opportunityCode }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: opportunityGateQuery(opportunityCode).queryKey }),
        client.invalidateQueries({ queryKey: WORKSTREAM_BOOK_KEY }),
      ]),
  })
}

/** The missing criterion labels when a stage move or a signature was refused
 *  by the gate, else `null`. Read off `errors.criteria` rather than the status:
 *  a 409 on the sign door also means "already signed", which lists nothing. */
export function gateRefusalOf(error: ApiError | null): string[] | null {
  const criteria = error?.kind === 'conflict' ? error.errors?.criteria : undefined
  return criteria !== undefined && criteria.length > 0 ? criteria : null
}
