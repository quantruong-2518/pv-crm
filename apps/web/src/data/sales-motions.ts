import { useCallback, useMemo } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  MOTION_LABEL,
  MOTION_SIDE,
  type ConfigProposalReceipt,
  type LeadMotion,
  type LeadSide,
  LeadMotionOptionResponse,
  type LeadMotionOption,
  type MotionAsks,
  type MotionPolicy,
  type MotionPolicyPatch,
  type MotionPolicyResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { useCan } from '@/app/auth'

/** What each of the six lead motions declares — the flow-setup section.
 *
 *      GET   /sales/config/motions          permission `config.view`
 *      PATCH /sales/config/motions/:motion  permission `config.propose` → 202
 *      GET   /sales/lead-motions            permission `lead.edit` — the typist's view
 *
 *  ------------------------------------------------------------------
 *  THE WRITE DOOR DOES NOT WRITE
 *  ------------------------------------------------------------------
 *  There is no `config.edit` in the matrix. The answer is a receipt for a
 *  request in the One inbox, so the screen must say the request was SENT and
 *  never that anything was saved — and it must not repaint the row as if the
 *  change had landed. The row changes when somebody approves it, which is a
 *  different event arriving through a different screen.
 *
 *  That is why `onSuccess` invalidates rather than writing the patch into the
 *  cache: a re-read returns the row exactly as the server still has it, which
 *  is the truth the screen should be showing.
 *
 *  ------------------------------------------------------------------
 *  THE UPPER-CASE SPELLING IS THE STORED ONE
 *  ------------------------------------------------------------------
 *  `LeadMotion` here is the contract's `INBOUND`…, not the lower-case list in
 *  `@pv/engines` that the rest of `apps/web` reads. The two are the "enum
 *  declared twice" debt recorded in
 *  `docs/decisions/0012-rename-vietnamese-identifiers-in-six-batches.md`, and its rule is that the
 *  conversion lives in exactly ONE place. This file does not convert: it shows
 *  what the server sent, with labels of its own. */
const VIEW_NEED: ApiNeed = { branch: 'Sales', permission: 'config.view' }
const PROPOSE_NEED: ApiNeed = { branch: 'Sales', permission: 'config.propose' }

const MOTIONS_KEY = ['sales', 'config', 'motions'] as const

export const salesMotionsQuery = () =>
  queryOptions({
    queryKey: MOTIONS_KEY,
    queryFn: ({ signal }) =>
      api.read<MotionPolicyResponse>('/sales/config/motions', { need: VIEW_NEED, signal }),
    select: (d: MotionPolicyResponse) => d.rows,
  })

export function useProposeMotion(motion: LeadMotion) {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, MotionPolicyPatch>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>(`/sales/config/motions/${motion}`, {
        method: 'PATCH',
        body,
        need: PROPOSE_NEED,
      }),
    onSuccess: () => {
      /* The row has NOT changed yet — this only re-reads it. The proposer's own
         inbox is the other half of what moved, so it is refreshed too. */
      void client.invalidateQueries({ queryKey: MOTIONS_KEY })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}

/** One motion as a picker offers it — label and order from the stored policy. */
export type MotionChoice = {
  motion: LeadMotion
  label: string
  side: LeadSide
  asks: MotionAsks
}

/** What a typist needs of each motion, readable with `lead.edit` alone — the
 *  create form and the import panel follow the LIVE `asks`, never a copy. */
const OPTIONS_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit' }

export const leadMotionsQuery = () =>
  queryOptions({
    queryKey: ['sales', 'lead-motions'] as const,
    queryFn: ({ signal }) =>
      api.read<LeadMotionOptionResponse>('/sales/lead-motions', {
        need: OPTIONS_NEED,
        schema: LeadMotionOptionResponse,
        signal,
      }),
    select: (d: LeadMotionOptionResponse) => d.rows,
  })

export const motionLabelOf = (policy: Pick<MotionPolicy, 'motion' | 'label'>): string =>
  policy.label ?? MOTION_LABEL[policy.motion]

/** `allowed` narrows to what the calling door accepts; inactive motions drop. */
export function motionChoices(
  allowed: readonly LeadMotion[],
  rows: readonly LeadMotionOption[],
): MotionChoice[] {
  return rows
    .filter((p) => p.active && allowed.includes(p.motion))
    .sort((a, b) => a.ord - b.ord)
    .map((p) => ({
      motion: p.motion,
      label: motionLabelOf(p),
      side: MOTION_SIDE[p.motion],
      asks: p.asks,
    }))
}

/** Motion → the label the create form prints, for every other screen that
 *  names a motion. Readers without `config.view` get the contract default. */
export function useMotionLabel(): (motion: LeadMotion) => string {
  const canView = useCan('config.view')
  const { data } = useQuery({ ...salesMotionsQuery(), enabled: canView })
  return useCallback(
    (motion: LeadMotion) => {
      const policy = data?.find((p) => p.motion === motion)
      return policy ? motionLabelOf(policy) : MOTION_LABEL[motion]
    },
    [data],
  )
}

/** Empty while the list is in flight — the form then offers no motion and
 *  draws nothing below it, rather than guessing what a motion asks. */
export function useMotionChoices(allowed: readonly LeadMotion[], enabled = true): MotionChoice[] {
  const { data } = useQuery({ ...leadMotionsQuery(), enabled })
  return useMemo(() => motionChoices(allowed, data ?? []), [allowed, data])
}

/** Motion → what the intake asks next, for the import panel, which offers
 *  motions of its own. `undefined` = not loaded yet, or the motion is off. */
export function useMotionAsks(): (motion: LeadMotion) => MotionAsks | undefined {
  const { data } = useQuery(leadMotionsQuery())
  return useCallback(
    (motion: LeadMotion) => data?.find((p) => p.motion === motion && p.active)?.asks,
    [data],
  )
}

/** Motions whose live `asks` is `REFERRER` — the ones a partner's kind must
 *  be filed under. `undefined` while loading. */
export function useReferrerMotions(): LeadMotion[] | undefined {
  const { data } = useQuery(leadMotionsQuery())
  return useMemo(() => data?.filter((p) => p.asks === 'REFERRER').map((p) => p.motion), [data])
}
