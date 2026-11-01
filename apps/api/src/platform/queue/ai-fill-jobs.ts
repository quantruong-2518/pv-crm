/** THE AI-FILL QUEUE'S SHARED VOCABULARY — name, payload and the two tokens.
 *
 *  Same split as `scan-jobs.ts`: platform owns the queue, the Sales branch
 *  provides `AI_FILL_JOB_HANDLER` and `worker.ts` calls it, so nothing in
 *  `platform/` names a branch table. The payload is the job row's id only —
 *  lead data stays in the branch's own table, not in a queue row.
 *
 *  `exclusive` policy keyed by `singletonKey: jobId`: a second enqueue of the
 *  same job while it is queued, retrying or active inserts nothing. */

export const AI_FILL_QUEUE = 'lead.ai-fill'

export type AiFillJob = { jobId: string }

/** Per worker machine. A fill is two sequential model calls that mostly wait
 *  on the network; two keeps the vendor quota and the app pool to spare for
 *  the scan readers that share both. */
export const AI_FILL_CONCURRENCY = 2
/** Deliveries after the first, with backoff — three in all. The gateway does
 *  not retry a vendor outage on the same model, so these carry a 429/5xx as
 *  well as a worker dying mid-job. */
export const AI_FILL_RETRY_LIMIT = 2

export const AI_FILL_ENQUEUE = Symbol('pv.queue.ai-fill-enqueue')

export interface AiFillEnqueue {
  enqueue(jobId: string): Promise<void>
}

export const AI_FILL_JOB_HANDLER = Symbol('pv.queue.ai-fill-job-handler')

/** `final`: `retryCount` has reached `AI_FILL_RETRY_LIMIT`, so a throw now is
 *  dropped silently — the handler writes `FAILED` itself instead of leaving the
 *  job row `RUNNING` for the sweeper. */
export type AiFillAttempt = { final: boolean }

export interface AiFillJobHandler {
  run(jobId: string, attempt: AiFillAttempt): Promise<void>
}
