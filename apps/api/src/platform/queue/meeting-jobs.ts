/** THE `meeting.end` QUEUE'S VOCABULARY — name, payload, two tokens.
 *
 *  Same split as `scan-jobs.ts`: platform owns the queue, the Sales branch
 *  provides `MEETING_END_HANDLER` and `worker.ts` calls it. A job is scheduled
 *  with `startAfter = endsAt`, so it becomes visible when the meeting is over.
 *
 *  `exclusive` policy keyed by `${meetingId}:${endsAt}`: enqueueing the same
 *  schedule twice inserts nothing, while a reschedule has a new `endsAt` and so
 *  a new key. The old job is not cancelled — the handler compares `endsAt`
 *  with the meeting's current end and drops it when they differ. */

export const MEETING_END_QUEUE = 'meeting.end'

/** `endsAt` is ISO-8601, `at + duration` as it was when the job was scheduled. */
export type MeetingEndJob = { meetingId: string; endsAt: string }

/** One: the handler is a single comm insert, so a second lane buys nothing and
 *  would only take another slot from the app pool (`max: 10`). */
export const MEETING_END_CONCURRENCY = 1
/** Same as `SCAN_RETRY_LIMIT`, same reason: attempts after the first cover a
 *  worker dying or the database dropping mid-job, nothing else is transient. */
export const MEETING_END_RETRY_LIMIT = 2

export const MEETING_END_ENQUEUE = Symbol('pv.queue.meeting-end-enqueue')

export interface MeetingEndEnqueue {
  schedule(job: MeetingEndJob): Promise<void>
}

export const MEETING_END_HANDLER = Symbol('pv.queue.meeting-end-handler')

export interface MeetingEndHandler {
  handle(job: MeetingEndJob): Promise<void>
}
