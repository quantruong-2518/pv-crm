/** THE COMM REPORT QUEUE'S SHARED VOCABULARY (ADR 0135) — name, payload and the
 *  two tokens, split as `ai-fill-jobs.ts` is: platform owns the queue, `comms`
 *  provides `COMM_AI_JOB_HANDLER`, `worker.ts` calls it. The payload is the job
 *  row's id only: note and report stay in `comms.ai_job`, not in a queue row.
 *
 *  `exclusive` policy keyed by `singletonKey: jobId`: a second enqueue of the same
 *  job while it is queued, retrying or active inserts nothing. */

export const COMM_AI_QUEUE = 'comm.ai-report'

export type CommAiJobPayload = { jobId: string }

/** Per worker machine. One: a recording of up to 50 MB sits in memory for the
 *  whole job, and the machine has 512 MB. */
export const COMM_AI_CONCURRENCY = 1
/** One delivery after the first, for a failure before the model call; past that
 *  the runner writes FAILED itself, because a redelivery bills the recording again. */
export const COMM_AI_RETRY_LIMIT = 1

export const COMM_AI_ENQUEUE = Symbol('pv.queue.comm-ai-enqueue')

export interface CommAiEnqueue {
  enqueue(jobId: string): Promise<void>
}

export const COMM_AI_JOB_HANDLER = Symbol('pv.queue.comm-ai-job-handler')

/** `final`: `retryCount` has reached `COMM_AI_RETRY_LIMIT`, so a throw now is
 *  dropped silently: the handler writes `FAILED` itself instead. */
export type CommAiAttempt = { final: boolean }

export interface CommAiJobHandler {
  run(jobId: string, attempt: CommAiAttempt): Promise<void>
}
