import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  NextStepResponse,
  StepOptionsResponse,
  type NextStepDoneBody,
  type NextStepSetBody,
  type StepTemplateOption,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { WORKSTREAM_BOOK_KEY } from '@/data/workstreams'

/** The ONE next step of a lead or an opportunity — four doors under
 *  `/sales/{leads|opportunities}/:code/next-step` (ADR 0069 §10).
 *
 *      GET · PUT · DELETE   the step (read `*.view`, write `*.edit`, both scoped)
 *      POST  …/done         write a `next-step-done` touch, then set `next` or clear
 *      GET   …/options      the templates and free-entry flag of the state it stands in
 *
 *  No `load:` — the doors are real. `need` copies each controller's `@Need` word
 *  for word so a drift shows by comparing two lines. Every door answers the
 *  step as it now stands, so writes set the answer into the cache instead of
 *  re-reading; only `done` writes a touch, so only it drops the timeline.
 *  The cache key holds the code alone: `LD-` and `OP-` never collide. */

export type NextStepSubject = 'lead' | 'opportunity'

/** What the next-step card needs to know about the record a step hangs on.
 *  Each caller builds its own, so the card never learns a lead's or a deal's shape. */
export type StepSubject = {
  kind: NextStepSubject
  code: string
  /** The default doer. Sent as "absent" so the server resolves it at write time. */
  holder: { id: string; name: string } | null
  /** May the form name somebody other than the holder? */
  canAssign: boolean
  /** Caption under a fixed doer, and the sentence when there is nobody. */
  holderHint: string
  noHolder: string
}

const DOOR: Record<
  NextStepSubject,
  {
    base: string
    read: ApiNeed
    write: ApiNeed
    touches: readonly string[]
    profile: readonly string[]
  }
> = {
  lead: {
    base: '/sales/leads',
    read: { branch: 'Sales', permission: 'lead.view', scoped: true },
    write: { branch: 'Sales', permission: 'lead.edit', scoped: true },
    touches: ['sales', 'lead-touches'],
    profile: ['sales', 'lead-profile'],
  },
  opportunity: {
    base: '/sales/opportunities',
    read: { branch: 'Sales', permission: 'opportunity.view', scoped: true },
    write: { branch: 'Sales', permission: 'opportunity.edit', scoped: true },
    touches: ['sales', 'ops-touches'],
    profile: ['sales', 'ops'],
  },
}

/** A deal's step is also drawn by the journey tree (`JourneyDeal.nextAction`). */
function stepSaved(client: QueryClient, subject: NextStepSubject, code: string) {
  return (answer: NextStepResponse) => {
    client.setQueryData(nextStepKey(code), answer)
    if (subject === 'opportunity') void client.invalidateQueries({ queryKey: WORKSTREAM_BOOK_KEY })
  }
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

const STEP_OPTIONS = 'step-options'

/** Keyed UNDER the object's profile key: every state mover already invalidates
 *  that prefix, so the picker follows a state change with no line of its own. */
export const stepOptionsQuery = (subject: NextStepSubject, code: string) =>
  queryOptions({
    queryKey: [...DOOR[subject].profile, code, STEP_OPTIONS] as const,
    queryFn: ({ signal }) =>
      api.read<StepOptionsResponse>(`${path(subject, code)}/options`, {
        need: DOOR[subject].read,
        schema: StepOptionsResponse,
        signal,
      }),
  })

/** For a form whose subject may take no step at all: `null` reads nothing. */
export function useStepOptions(subject: NextStepSubject | null, code: string) {
  return useQuery({ ...stepOptionsQuery(subject ?? 'lead', code), enabled: subject !== null })
}

export function stepOptionsMoved(client: QueryClient) {
  void client.invalidateQueries({ predicate: (q) => q.queryKey.at(-1) === STEP_OPTIONS })
}

/** The fields the frame judges (ADR 0080 §2): a pick of another state, or a
 *  template renamed or re-pointed to another kind since the options were read. */
const FRAME_FIELDS = ['templateId', 'text', 'kindId']

/** A step refused on one of them — bare, or nested as `next.` / `step.` — may
 *  mean the frame moved under the form: re-read what is on offer, since the
 *  cache never goes stale by itself and the same chip would be resent forever. */
export function rereadOptionsOnRefusal(client: QueryClient) {
  return (error: ApiError) => {
    const fields = error.kind === 'invalid-data' ? Object.keys(error.errors ?? {}) : []
    if (fields.some((field) => FRAME_FIELDS.some((name) => field.endsWith(name)))) {
      stepOptionsMoved(client)
    }
  }
}

/** Today + N as a local calendar day. Built from parts: parsing a bare
 *  `YYYY-MM-DD` reads it as UTC and lands on the day before, west of Greenwich. */
function dayAfter(days: number): string {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** What picking a template does to the date: its default fills an empty box or
 *  replaces one an earlier pick filled, never a day a person chose. */
export function dueOnPick(
  template: StepTemplateOption,
  due: string,
  dueAuto: boolean,
): { due: string; dueAuto: boolean } {
  if (due !== '' && !dueAuto) return { due, dueAuto: false }
  return template.dueDays === undefined
    ? { due: '', dueAuto: false }
    : { due: dayAfter(template.dueDays), dueAuto: true }
}

/** A 409 means the step on screen is no longer the stored one (another tab
 *  finished or replaced it, or the deal stopped or signed) — re-read it rather
 *  than let the form retry stale. */
function rereadOnRefusal(client: QueryClient, code: string) {
  const options = rereadOptionsOnRefusal(client)
  return (error: ApiError) => {
    options(error)
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
    onError: rereadOnRefusal(client, code),
    onSuccess: stepSaved(client, subject, code),
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
    onError: rereadOnRefusal(client, code),
    onSuccess: (answer) => {
      stepSaved(client, subject, code)(answer)
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
    onError: rereadOnRefusal(client, code),
    onSuccess: stepSaved(client, subject, code),
  })
}
