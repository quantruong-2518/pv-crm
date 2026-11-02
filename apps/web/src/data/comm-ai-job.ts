import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  COMM_AI_JOB_ACTIVE,
  CommAiJob,
  CommAiJobCurrent,
  CommAiJobList,
  type CommAiJobBody,
  type CommAiJobState,
  type CommAiPart,
} from '@pv/contracts'
import { api, type ApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { whileLive } from '@/app/query-client'
import { COMM_RECORDS_KEY } from '@/data/comm-record-detail'
import { COMM_VIEW_NEED } from '@/data/comms'
import { openAiTray } from '@/data/lead-ai-job'

/** The report of a comm with a recording, as a background job (ADR 0135): the
 *  caller's jobs for the tray, the form's read of its latest job, the press and
 *  dismissal. Contract and doors: `packages/contracts/src/comms/ai-report.ts`.
 *
 *  Both reads poll on `whileLive`, not `untilPushed`: the `ai-job` push re-reads
 *  the tray's list but not the form's job, and a press on another device has no
 *  poll running here until that push arrives. */

const POLL_MS = 3000
const ACTIVE: ReadonlySet<CommAiJobState> = new Set(COMM_AI_JOB_ACTIVE)

export const isCommJobActive = (job: { state: CommAiJobState }) => ACTIVE.has(job.state)

/** The form and the tray say the same thing about a job that gave no reason. */
export const COMM_AI_JOB_FAILED = 'Chưa tạo được tóm tắt và biên bản. Thử lại sau ít phút.'

export const COMM_AI_JOBS_KEY = [...COMM_RECORDS_KEY, 'ai-jobs'] as const

const commAiJobsQuery = queryOptions({
  queryKey: COMM_AI_JOBS_KEY,
  queryFn: ({ signal }) =>
    api.read('/comms/ai-jobs', { need: COMM_VIEW_NEED, schema: CommAiJobList, signal }),
  refetchInterval: whileLive((query: { state: { data?: CommAiJobList } }) =>
    query.state.data?.some(isCommJobActive) ? POLL_MS : false,
  ),
})

/** No refetch on focus: reading a finished job writes an audit line, and the form
 *  takes its report once. */
const commAiJobQuery = (id: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'ai-job', id] as const,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs/${encodeURIComponent(id)}/ai-report/job`, {
        need: COMM_VIEW_NEED,
        schema: CommAiJobCurrent,
        signal,
      }),
    refetchInterval: whileLive((query: { state: { data?: CommAiJobCurrent } }) => {
      const job = query.state.data?.job
      return job && isCommJobActive(job) ? POLL_MS : false
    }),
  })

const NO_JOBS: CommAiJobList = []

export function useCommAiJobs(): CommAiJobList {
  const canView = useCan('comm.view')
  return useQuery({ ...commAiJobsQuery, enabled: canView }).data ?? NO_JOBS
}

/** The form's side of the job. Follows `permitted`, not the route: a limit reached
 *  or a route switched off after the press must not take a report already paid for.
 *  `job` is null when off: a query switched off still hands back its cache, and a
 *  running job there would lock the buttons with no poll left to free them. */
export function useCommAiJob(id: string, permitted: boolean) {
  const client = useQueryClient()
  const read = commAiJobQuery(id)
  const current = useQuery({ ...read, enabled: permitted })

  const press = useMutation<CommAiJob, ApiError, { part: CommAiPart; note: string }>({
    mutationFn: (sent) =>
      api.write(`/comms/debriefs/${encodeURIComponent(id)}/ai-report/job`, {
        body: { ...sent, recordingNotice: true } satisfies CommAiJobBody,
        need: COMM_VIEW_NEED,
        schema: CommAiJob,
      }),
    /* The seed is what starts the poll: the read still says the last job, or none. */
    onSuccess: (job, { note }) => {
      client.setQueryData<CommAiJobCurrent>(read.queryKey, {
        job: { ...job, note, report: null },
      })
      client.setQueryData<CommAiJobList>(COMM_AI_JOBS_KEY, (cur = []) => [
        job,
        ...cur.filter((row) => row.id !== job.id),
      ])
      openAiTray()
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: read.queryKey })
      void client.invalidateQueries({ queryKey: COMM_AI_JOBS_KEY })
    },
  })

  return { job: permitted ? (current.data?.job ?? null) : null, press }
}

export function useDismissFinishedCommAiJobs() {
  const client = useQueryClient()
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.write('/comms/ai-jobs', { method: 'DELETE', need: COMM_VIEW_NEED }),
    onSuccess: () =>
      client.setQueryData<CommAiJobList>(COMM_AI_JOBS_KEY, (cur = []) =>
        cur.filter(isCommJobActive),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: COMM_AI_JOBS_KEY }),
  })
}
