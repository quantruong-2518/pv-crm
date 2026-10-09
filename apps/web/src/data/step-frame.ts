import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LEAD_STATE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  StepFrameResponse,
  StepLeadState,
  StageKey,
  type ConfigProposalReceipt,
  type StateAddress,
  type StateRulePatch,
  type StepTemplate,
  type StepTemplateCreate,
  type StepTemplateOrderPatch,
  type StepTemplatePatch,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** The journey frame — per-state next-step templates and the free-entry flag
 *  (ADR 0080), as the configuration screen reads and proposes them.
 *
 *      GET   /sales/config/step-frame                  `config.view`
 *      POST  /sales/config/step-frame/templates        `config.propose` → 202
 *      PATCH /sales/config/step-frame/templates/order  `config.propose` → 202
 *      PATCH /sales/config/step-frame/templates/:id    `config.propose` → 202
 *      PATCH /sales/config/step-frame/rules            `config.propose` → 202
 *
 *  No `load:` — the doors are real. No write door writes: each answers a
 *  receipt for a request in the approval inbox, so `onSuccess` re-reads the
 *  frame as the server still holds it and never paints the proposal in. The
 *  picker's own read lives in `data/next-step.ts`, on the sellers' permission. */

const VIEW_NEED: ApiNeed = { branch: 'Sales', permission: 'config.view' }
const PROPOSE_NEED: ApiNeed = { branch: 'Sales', permission: 'config.propose' }

const BASE = '/sales/config/step-frame'
const FRAME_KEY = ['sales', 'config', 'step-frame'] as const

export const stepFrameQuery = queryOptions({
  queryKey: FRAME_KEY,
  queryFn: ({ signal }) =>
    api.read<StepFrameResponse>(BASE, { need: VIEW_NEED, schema: StepFrameResponse, signal }),
})

/** Every state of one phase, in the order the contract declares them. */
export const FRAME_STATES: Record<StateAddress['kind'], StateAddress[]> = {
  lead: StepLeadState.options.map((state) => ({ kind: 'lead', state })),
  opportunity: StageKey.options.map((state) => ({ kind: 'opportunity', state })),
}

/** The product's own word for a state — the label maps, never a coined one. */
export const stateLabelOf = (address: StateAddress): string =>
  address.kind === 'lead' ? LEAD_STATE_LABEL[address.state] : OPPORTUNITY_STAGE_LABEL[address.state]

export const sameAddress = (a: StateAddress, b: StateAddress) =>
  a.kind === b.kind && a.state === b.state

/** One state's templates in `ord`, switched-off rows included: the order door
 *  wants the full list, and off is the only delete. */
export function templatesAt(frame: StepFrameResponse, address: StateAddress): StepTemplate[] {
  return frame.templates
    .filter((t) => sameAddress(t.address, address))
    .sort((a, b) => a.ord - b.ord)
}

export type FrameProposal =
  | { door: 'create'; body: StepTemplateCreate }
  | { door: 'patch'; id: string; body: StepTemplatePatch }
  | { door: 'order'; body: StepTemplateOrderPatch }
  | { door: 'rule'; body: StateRulePatch }

function doorOf(proposal: FrameProposal): { path: string; method: 'POST' | 'PATCH' } {
  switch (proposal.door) {
    case 'create':
      return { path: `${BASE}/templates`, method: 'POST' }
    case 'patch':
      return { path: `${BASE}/templates/${encodeURIComponent(proposal.id)}`, method: 'PATCH' }
    case 'order':
      return { path: `${BASE}/templates/order`, method: 'PATCH' }
    case 'rule':
      return { path: `${BASE}/rules`, method: 'PATCH' }
  }
}

/** One hook for the four doors: they share the permission, the receipt and
 *  what moves afterwards — the frame re-read, and the proposer's inbox. */
export function useProposeFrame() {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, FrameProposal>({
    mutationFn: (proposal) => {
      const { path, method } = doorOf(proposal)
      return api.write<ConfigProposalReceipt>(path, {
        method,
        body: proposal.body,
        need: PROPOSE_NEED,
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: FRAME_KEY })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}
