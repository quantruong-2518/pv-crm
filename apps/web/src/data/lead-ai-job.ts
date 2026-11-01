import { useLayoutEffect, useRef } from 'react'
import { create } from 'zustand'
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { LEAD_AI_JOB_ACTIVE, LeadAiJob, LeadAiJobList, type LeadAiJobState } from '@pv/contracts'
import { api, userMessage, type ApiError, type ApiNeed } from '@/app/api'
import { useCan } from '@/app/auth'
import { untilPushed } from '@/app/query-client'
import { leadContactsQuery } from '@/data/contacts'
import { leadProfileQuery } from '@/data/lead-profile'

/** Module 2 · AI fill as a background job (ADR 0131) — the press, the caller's
 *  own job list, server-side Undo and dismissal. Contract and endpoint list:
 *  `packages/contracts/src/sales/lead-ai-job.ts`.
 *
 *  The list is re-read on the `ai-job` push signal; it polls only while a job
 *  is moving and the stream is down, the `lead-scan.ts` rule. */

/** Word for word with the `@Need` on every endpoint of the door. */
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit', scoped: true }

export const AI_JOBS_KEY = ['sales', 'ai-jobs'] as const

const POLL_MS = 2000
const ACTIVE: ReadonlySet<LeadAiJobState> = new Set(LEAD_AI_JOB_ACTIVE)

export const isActive = (job: LeadAiJob) => ACTIVE.has(job.state)

/** The one queued or running job of a lead: the server allows only one. */
export const activeJobOf = (jobs: readonly LeadAiJob[], code: string) =>
  jobs.find((job) => job.leadCode === code && isActive(job))

export const aiJobsQuery = queryOptions({
  queryKey: AI_JOBS_KEY,
  queryFn: ({ signal }) =>
    api.read('/sales/ai-jobs', { need: WRITE_NEED, schema: LeadAiJobList, signal }),
  refetchInterval: untilPushed((query: { state: { data?: LeadAiJobList } }) =>
    query.state.data?.some(isActive) ? POLL_MS : false,
  ),
})

const NO_JOBS: LeadAiJobList = []

/** Off for a reader who cannot edit leads: they never own a job. */
export function useAiJobs(): LeadAiJobList {
  const canEdit = useCan('lead.edit')
  return useQuery({ ...aiJobsQuery, enabled: canEdit }).data ?? NO_JOBS
}

/** Open or collapsed, shared by the tray and every button that opens it. */
export const useAiTray = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

export const openAiTray = () => useAiTray.getState().setOpen(true)

const putJob = (client: QueryClient, job: LeadAiJob) =>
  client.setQueryData<LeadAiJobList>(AI_JOBS_KEY, (cur = []) =>
    cur.some((row) => row.id === job.id)
      ? cur.map((row) => (row.id === job.id ? job : row))
      : [job, ...cur],
  )

/** Seeds the list with the 202 job so a fast job is seen moving before it lands. */
export function usePressAiFill() {
  const client = useQueryClient()
  return useMutation<LeadAiJob, ApiError, string>({
    mutationFn: (code) =>
      api.write(`/sales/leads/${encodeURIComponent(code)}/ai-fill`, {
        need: WRITE_NEED,
        schema: LeadAiJob,
      }),
    onSuccess: (job) => {
      putJob(client, job)
      openAiTray()
    },
    onSettled: () => client.invalidateQueries({ queryKey: AI_JOBS_KEY }),
  })
}

export function useUndoAiJob() {
  const client = useQueryClient()
  return useMutation<LeadAiJob, ApiError, string>({
    mutationFn: (id) =>
      api.write(`/sales/ai-jobs/${encodeURIComponent(id)}/undo`, {
        need: WRITE_NEED,
        schema: LeadAiJob,
      }),
    onSuccess: (job) => putJob(client, job),
    onSettled: () => client.invalidateQueries({ queryKey: AI_JOBS_KEY }),
  })
}

export function useDismissFinishedAiJobs() {
  const client = useQueryClient()
  return useMutation<void, ApiError, void>({
    mutationFn: () =>
      api.write('/sales/ai-jobs/dismiss-finished', { method: 'POST', need: WRITE_NEED }),
    onSuccess: () =>
      client.setQueryData<LeadAiJobList>(AI_JOBS_KEY, (cur = []) => cur.filter(isActive)),
    onSettled: () => client.invalidateQueries({ queryKey: AI_JOBS_KEY }),
  })
}

/** Everything a finished fill or its undo has rewritten for one lead. Copied
 *  book and touch prefixes, the same debt `lead-patch.ts` records. The profile
 *  is re-read even when no screen shows it: the draft seeds its boxes from the
 *  cache when the lead is opened next. `cancelRefetch: false` keeps the lead
 *  page's own read of the same profile alive. */
export function refreshLeadReads(client: QueryClient, code: string) {
  const keep = { cancelRefetch: false }
  const profile = leadProfileQuery(code).queryKey
  void client.invalidateQueries({ queryKey: profile, refetchType: 'all' }, keep)
  for (const queryKey of [
    ['sales', 'lead-book'],
    ['sales', 'lead-touches'],
    leadContactsQuery(code).queryKey,
  ])
    void client.invalidateQueries({ queryKey }, keep)
}

export type AiJobTurn = 'done' | 'undone'

/** Fires on a job SEEN moving that is now DONE, or one now undone. A job
 *  first seen finished never fires, so a page opened later replays nothing.
 *  Layout effect: a skeleton must not lift for one painted frame first. */
export function useAiJobTurns(
  jobs: LeadAiJobList,
  onTurn: (job: LeadAiJob, turn: AiJobTurn) => void,
) {
  const seen = useRef(new Map<string, LeadAiJob>())
  useLayoutEffect(() => {
    for (const job of jobs) {
      const prev = seen.current.get(job.id)
      seen.current.set(job.id, job)
      if (!prev) continue
      if (isActive(prev) && job.state === 'DONE') onTurn(job, 'done')
      else if (!prev.undoneAt && job.undoneAt) onTurn(job, 'undone')
    }
  }, [jobs, onTurn])
}

/** A refused press made no job, so the tray has nothing to say: this line does. */
export const refusalLine = (error: ApiError) =>
  error.kind === 'conflict' || error.kind === 'forbidden' || error.kind === 'rate-limited'
    ? (error.serverTitle ?? userMessage(error))
    : undefined
