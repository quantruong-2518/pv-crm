import { Inject, Injectable } from '@nestjs/common'
import type { PgBoss } from 'pg-boss'
import { EMAIL_QUEUE, EMAIL_QUEUE_DEAD, type EmailJob } from '../mail/mail.contract'
import { BOSS } from './boss.provider'

/** THE ONLY FILE THAT PUTS A JOB ON A QUEUE.
 *
 *  Small enough to look like the delegating wrapper `engines.module.ts` warns
 *  against, and it is not one: what it holds is the queue NAME and the send
 *  options, neither of which a caller should be choosing. Spreading
 *  `boss.send('email.transactional', …)` across branches is how one caller
 *  ends up on a queue name with a typo, discovered a week later in the
 *  backlog.
 *
 *  It is exported by BOTH module shapes. The HTTP process needs exactly this
 *  and nothing else from the queue — see `QueueModule`. */
@Injectable()
export class MailQueue {
  constructor(@Inject(BOSS) private readonly boss: PgBoss) {}

  /** Ask for a delivery to be sent.
   *
   *  Enqueuing twice is not a bug to be prevented here. `eventKey` is UNIQUE
   *  in the ledger and `claim()` hands the row to exactly one runner, so a
   *  second job for the same delivery finds nothing to do and exits quietly.
   *  That is the anti-duplicate layer; the queue does not need a second one,
   *  and a queue-level singleton would also block the redelivery that makes a
   *  crashed worker recoverable.
   *
   *  `singletonKey` is still set, because `findJobs({ key })` is how the
   *  runbook goes from "this lead got no mail" to the job row. */
  async enqueue(job: EmailJob, opts: { singletonSeconds?: number } = {}): Promise<void> {
    await this.boss.send(EMAIL_QUEUE, job, { singletonKey: job.eventKey, ...opts })
  }

  /** Park a delivery where a person will see it. Called by the consumer once
   *  the ledger row has been marked `dead` — the row is the record, this is
   *  the thing that shows up in the queue console. */
  async park(job: EmailJob): Promise<void> {
    await this.boss.send(EMAIL_QUEUE_DEAD, job, { singletonKey: job.eventKey })
  }
}
