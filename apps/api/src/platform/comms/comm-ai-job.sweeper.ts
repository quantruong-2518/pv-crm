import { Injectable, Logger } from '@nestjs/common'
import { COMM_AI_JOB_SHOWN_MS, CommAiJobRepository } from './comm-ai-job.repository'

/** Fails comm report jobs a dead worker or a lost queue message left active, and
 *  deletes finished ones after a day, so the note and the report, which are
 *  customer content, are held no longer (ADR 0135). Rides the worker's tick like
 *  `LeadAiJobSweeper`, with its one age rule: a RUNNING job ages from its current
 *  delivery's start, a QUEUED one from its press. */

/** Past the queue's 1800 s expiry of one delivery, with room to spare. */
export const COMM_AI_JOB_STALE_MS = 45 * 60_000
/** Well under `COMM_AI_JOB_STALE_MS`, so a stuck job waits under an hour. */
const SWEEP_EVERY_MS = 5 * 60_000

const EXPIRED = 'Quá lâu chưa xong nên chưa có báo cáo.'

@Injectable()
export class CommAiJobSweeper {
  private readonly log = new Logger('CommAiJob')
  private notBefore = 0

  constructor(private readonly jobs: CommAiJobRepository) {}

  /** Called on every worker tick; `null` = this tick was not a pass. The clock
   *  moves first, so a failing database is asked again one interval later. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    const expired = await this.jobs.expire(new Date(now - COMM_AI_JOB_STALE_MS), EXPIRED)
    const purged = await this.jobs.purge(new Date(now - COMM_AI_JOB_SHOWN_MS))
    if (expired + purged > 0) this.log.log(`expired ${expired}, deleted ${purged} job(s)`)
    return expired + purged
  }
}
