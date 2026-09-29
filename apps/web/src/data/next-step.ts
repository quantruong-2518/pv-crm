import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { NextStepResponse, type NextStepDoneBody, type NextStepSetBody } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** The ONE next step of a lead or an opportunity — four doors under
 *  `/sales/{leads|opportunities}/:code/next-step` (ADR 0069 §10).
 *
 *      GET · PUT · DELETE   the step (read `*.view`, write `*.edit`, both scoped)
 *      POST  …/done         write a `next-step-done` touch, then set `next` or clear
 *
 *  No `load:` — the doors are real. `need` copies each controller's `@Need` word
 *  for word so a drift shows by comparing two lines. Every door answers the
 *  step as it now stands, so writes set the answer into the cache instead of
 *  re-reading; only `done` writes a touch, so only it drops the timeline.
 *  The cache key holds the code alone: `LD-` and `OP-` never collide. */

export type NextStepSubject = 'lead' | 'opportunity'

const DOOR: Record<
  NextStepSubject,
  { base: string; read: ApiNeed; write: ApiNeed; touches: readonly string[] }
> = {
  lead: {
    base: '/sales/leads',
    read: { branch: 'Sales', permission: 'lead.view', scoped: true },
    write: { branch: 'Sales', permission: 'lead.edit', scoped: true },
    touches: ['sales', 'lead-touches'],
  },
  opportunity: {
    base: '/sales/opportunities',
    read: { branch: 'Sales', permission: 'opportunity.view', scoped: true },
    write: { branch: 'Sales', permission: 'opportunity.edit', scoped: true },
    touches: ['sales', 'ops-touches'],
  },
}

const path = (subject: NextStepSubject, code: string) =>
  `${DOOR[subject].base}/${encodeURIComponent(code)}/next-step`

export const nextStepKey = (code: string) => ['sales', 'next-step', code] as const

export const nextStepQuery = (subject: NextStepSubject, code: string) =>
  queryOptions({
    queryKey: nextStepKey(code),
    queryFn: ({ signal }) =>
      api.read<NextStepResponse>(path(subject, code), {
        need: DOOR[subject].read,
        schema: NextStepResponse,
        signal,
      }),
  })

/** A 409 means the step on screen is no longer the stored one (another tab
 *  finished or replaced it, or the deal stopped or signed) — re-read it rather
 *  than let the form retry stale. */
function rereadOnConflict(client: QueryClient, code: string) {
  return (error: ApiError) => {
    if (error.kind === 'conflict') {
      void client.invalidateQueries({ queryKey: nextStepKey(code) })
    }
  }
}

export function useSetNextStep(subject: NextStepSubject, code: string) {
  const client = useQueryClient()

  return useMutation<NextStepResponse, ApiError, NextStepSetBody>({
    mutationFn: (body) =>
      api.write<NextStepResponse>(path(subject, code), {
        method: 'PUT',
        body,
        need: DOOR[subject].write,
        schema: NextStepResponse,
      }),
    onError: rereadOnConflict(client, code),
    onSuccess: (answer) => client.setQueryData(nextStepKey(code), answer),
  })
}

/** No `retry`: a replayed POST would write the `next-step-done` touch twice. */
export function useFinishNextStep(subject: NextStepSubject, code: string) {
  const client = useQueryClient()

  return useMutation<NextStepResponse, ApiError, NextStepDoneBody>({
    mutationFn: (body) =>
      api.write<NextStepResponse>(`${path(subject, code)}/done`, {
        method: 'POST',
        body,
        need: DOOR[subject].write,
        schema: NextStepResponse,
      }),
    onError: rereadOnConflict(client, code),
    onSuccess: (answer) => {
      client.setQueryData(nextStepKey(code), answer)
      void client.invalidateQueries({ queryKey: [...DOOR[subject].touches, code] })
    },
  })
}

export function useClearNextStep(subject: NextStepSubject, code: string) {
  const client = useQueryClient()

  return useMutation<NextStepResponse, ApiError, void>({
    mutationFn: () =>
      api.write<NextStepResponse>(path(subject, code), {
        method: 'DELETE',
        need: DOOR[subject].write,
        schema: NextStepResponse,
      }),
    onError: rereadOnConflict(client, code),
    onSuccess: (answer) => client.setQueryData(nextStepKey(code), answer),
  })
}
