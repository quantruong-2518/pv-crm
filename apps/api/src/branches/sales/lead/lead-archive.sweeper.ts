import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ENV, type Env } from '@api/platform/config/env'
import { SYSTEM_ACTOR, TouchService } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LeadStateWriter } from './lead-state'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadWriteRepository } from './lead-write.repository'

/** Hourly — the limit is six months, so an hour late is no one's problem. */
const SWEEP_EVERY_MS = 60 * 60_000

/** `nurturing` → `archived` after `NURTURE_MAX` — the one purely time-based
 *  move of ADR 0058. Shaped like `SessionSweeper`: self-timed from boot, once
 *  at boot, off under `NODE_ENV=test`. It also runs in the worker (which
 *  imports `AppModule`); that overlap is harmless because the UPDATE is
 *  conditional, so the second sweep finds nothing and writes no touch.
 *
 *  One transaction per sweep: the state, its `archived` touch, the mirror row
 *  and each run's LOST end land together or not at all. */
@Injectable()
export class LeadArchiveSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('sales.lead')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly states: LeadStateWriter,
    private readonly touch: TouchService,
    private readonly runs: WorkstreamRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS)
    this.timer.unref()
    void this.sweep()
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Never rejects — a failed sweep leaves the rows for the next tick. Public
   *  so a script or test can run one pass on demand. */
  async sweep(): Promise<number> {
    try {
      const archived = await this.repo.run(async (tx) => {
        const moved = await this.states.archiveStale(tx)
        await this.touch.record(
          tx,
          moved.map((m) => ({
            subjectCode: m.code,
            subjectKind: 'lead' as const,
            kind: 'archived' as const,
            by: SYSTEM_ACTOR,
            note: LEAD_NOTE.archived,
          })),
        )
        await this.runs.syncClosed(
          tx,
          moved.flatMap((m) => m.workstreamCode ?? []),
        )
        return moved.length
      })
      if (archived > 0)
        this.log.log(`Archived ${archived} lead(s) left in nurturing past the limit.`)
      return archived
    } catch (error: unknown) {
      this.log.error(
        `Lead archive sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return 0
    }
  }
}
