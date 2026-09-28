/** THE SCAN QUEUES' SHARED VOCABULARY — names, payloads and the two tokens.
 *
 *  Platform owns the queues; the Sales branch owns what a job DOES. The
 *  branch provides `SCAN_JOB_HANDLER` and `worker.ts` calls it, so nothing in
 *  `platform/` names a branch table. Payloads carry ids only: a job row
 *  outlives the file and is readable by anyone with database access.
 *
 *  Both queues use pg-boss's `exclusive` policy keyed by `singletonKey`: at
 *  most one job per file (or per batch) is queued, retrying or active, so a
 *  double click on "start" or "commit" inserts nothing the second time. */

export const SCAN_READ_QUEUE = 'scan.read'
export const SCAN_COMMIT_QUEUE = 'scan.commit'

export type ScanReadJob = { fileId: string }
export type ScanCommitJob = { code: string }

/** Per worker machine. Each read is one model call that mostly waits on the
 *  network, so four overlap well; more would mainly race the model's
 *  per-minute quota and the app pool (`max: 10`) that each read also uses. */
export const SCAN_READ_CONCURRENCY = 4
/** One: a commit creates leads and matches the book, and two commits racing
 *  over the same accounts is the duplicate this whole door exists to avoid. */
export const SCAN_COMMIT_CONCURRENCY = 1
/** Attempts after the first. The reader already retries a 429/5xx once, so
 *  these cover a worker dying or the database dropping mid-job. */
export const SCAN_RETRY_LIMIT = 2

export const SCAN_ENQUEUE = Symbol('pv.queue.scan-enqueue')

export interface ScanEnqueue {
  enqueueRead(fileIds: string[]): Promise<void>
  enqueueCommit(code: string): Promise<void>
}

export const SCAN_JOB_HANDLER = Symbol('pv.queue.scan-job-handler')

/** `final`: pg-boss will not deliver this job again (`retryCount` has reached
 *  `SCAN_RETRY_LIMIT`). A throw with `final: false` gets another attempt;
 *  with `final: true` it is dropped silently — so on the final attempt the
 *  handler writes `FAILED` instead of leaving a row `READING` forever. */
export type ScanAttempt = { final: boolean }

export interface ScanJobHandler {
  readFile(fileId: string, attempt: ScanAttempt): Promise<void>
  commitBatch(code: string, attempt: ScanAttempt): Promise<void>
}
