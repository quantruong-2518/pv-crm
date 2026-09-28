import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { NextStepResponse, type NextStepDoneBody, type NextStepSetBody } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** The lead's ONE next step — four doors under `/sales/leads/:code/next-step`.
 *
 *      GET · PUT · DELETE   the step (read `lead.view`, write `lead.edit`, both scoped)
 *      POST  …/done         write a `next-step-done` touch, then set `next` or clear
 *
 *  No `load:` — the doors are real. `need` copies the controller's `@Need` word
 *  for word so a drift shows by comparing two lines. Every door answers the
 *  step as it now stands, so writes set the answer into the cache instead of
 *  re-reading; only `done` writes a touch, so only it drops the timeline. */

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit', scoped: true }

const path = (code: string) => `/sales/leads/${encodeURIComponent(code)}/next-step`

export const nextStepQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'next-step', code] as const,
    queryFn: ({ signal }) =>
      api.read<NextStepResponse>(path(code), {
        need: READ_NEED,
        schema: NextStepResponse,
        signal,
      }),
  })

/** Copied from `data/touches.ts`, which exports the query and not its key. */
const touchesKey = (code: string) => ['sales', 'lead-touches', code] as const

/** A 409 means the step on screen is no longer the stored one (another tab
 *  finished or replaced it) — re-read it rather than let the form retry stale. */
function rereadOnConflict(client: QueryClient, code: string) {
  return (error: ApiError) => {
    if (error.kind === 'conflict') {
      void client.invalidateQueries({ queryKey: nextStepQuery(code).queryKey })
    }
  }
}

export function useSetNextStep(code: string) {
  const client = useQueryClient()

  return useMutation<NextStepResponse, ApiError, NextStepSetBody>({
    mutationFn: (body) =>
      api.write<NextStepResponse>(path(code), {
        method: 'PUT',
        body,
        need: WRITE_NEED,
        schema: NextStepResponse,
      }),
    onError: rereadOnConflict(client, code),
    onSuccess: (answer) => client.setQueryData(nextStepQuery(code).queryKey, answer),
  })
}

/** No `retry`: a replayed POST would write the `next-step-done` touch twice. */
export function useFinishNextStep(code: string) {
  const client = useQueryClient()

  return useMutation<NextStepResponse, ApiError, NextStepDoneBody>({
    mutationFn: (body) =>
      api.write<NextStepResponse>(`${path(code)}/done`, {
        method: 'POST',
        body,
        need: WRITE_NEED,
        schema: NextStepResponse,
      }),
    onError: rereadOnConflict(client, code),
    onSuccess: (answer) => {
      client.setQueryData(nextStepQuery(code).queryKey, answer)
      void client.invalidateQueries({ queryKey: touchesKey(code) })
    },
  })
}

export function useClearNextStep(code: string) {
  const client = useQueryClient()

  return useMutation<NextStepResponse, ApiError, void>({
    mutationFn: () =>
      api.write<NextStepResponse>(path(code), {
        method: 'DELETE',
        need: WRITE_NEED,
        schema: NextStepResponse,
      }),
    onError: rereadOnConflict(client, code),
    onSuccess: (answer) => client.setQueryData(nextStepQuery(code).queryKey, answer),
  })
}
