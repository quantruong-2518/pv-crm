import { Injectable, Logger } from '@nestjs/common'
import { LEAD_AI_JOB_SHOWN_MS } from './lead-ai-job.mapper'
import { LeadAiJobRepository } from './lead-ai-job.repository'

/** Fails AI-fill jobs a dead worker or a lost queue message left active, and
 *  deletes finished ones past the tray's day (ADR 0131 §4, §7). Rides the
 *  worker's tick like `LeadScanSweeper`; conditional statements, so a second
 *  worker's pass is harmless, and a delivery still running past the mark finds
 *  its DONE write refused and rolls back.
 *
 *  One age rule: a RUNNING job ages from its current delivery's start (the
 *  claim stamps `started_at` each time), a QUEUED one from its press. A queue
 *  backlog that long means the worker is down, and the slot must free up. */

/** Past the queue's 600 s expiry of one delivery, with room to spare. */
const STALE_MS = 25 * 60_000
/** Well under `STALE_MS`, so a stuck job waits at most about half an hour. */
const SWEEP_EVERY_MS = 5 * 60_000

const EXPIRED = 'Quá lâu chưa xong nên chưa điền gì.'

@Injectable()
export class LeadAiJobSweeper {
  private readonly log = new Logger('LeadAiFill')
  private notBefore = 0

  constructor(private readonly jobs: LeadAiJobRepository) {}

  /** Called on every worker tick; `null` = this tick was not a pass. The clock
   *  moves first, so a failing database is asked again one interval later. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    const expired = await this.jobs.expire(new Date(now - STALE_MS), EXPIRED)
    const purged = await this.jobs.purge(new Date(now - LEAD_AI_JOB_SHOWN_MS))
    if (expired + purged > 0) this.log.log(`ai-fill: expired ${expired}, deleted ${purged} job(s)`)
    return expired + purged
  }
}
