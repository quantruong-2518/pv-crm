import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { NOTIFICATION_DETAIL_OBJECT } from '@pv/contracts'
import { COMM_RECORD_LATE } from '@pv/engines'
import { ENV, type Env } from '../config/env'
import { NotificationHub } from '../notification/notification.hub'
import { DebriefRepository } from './debrief.repository'

const SWEEP_EVERY_MS = 60 * 60_000

/** Rings the owner of a comm record left open past the confirm window
 *  (`COMM_CONFIRM_WITHIN_HOURS`), through the bell's one door (ADR 0085). Only
 *  while it has been late for less than one more window (`late` in the
 *  repository): one line per record, and no backlog rung on a deploy.
 *
 *  Self-timed like `NotificationSweeper`: hourly and once at boot, off under
 *  `NODE_ENV=test`, and only in the worker (`PV_ROLE`), so each API machine
 *  does not repeat the same scan. The event key is the record id, so the
 *  ledger's UNIQUE would drop a second writer's row anyway. No `actorId`: the
 *  system speaks. */
@Injectable()
export class CommLateSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('comms')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: DebriefRepository,
    private readonly hub: NotificationHub,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test' || process.env.PV_ROLE !== 'worker') return
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS)
    this.timer.unref()
    void this.sweep()
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Never rejects: a failed sweep leaves the records for the next tick. */
  private async sweep(): Promise<void> {
    try {
      /* `announce` writes inside its caller's transaction: one for the sweep. */
      const announced = await this.repo.run(async (tx) => {
        const late = await this.repo.late(tx)
        const ids = late.map((record) => record.id)
        const told = await this.hub.told(tx, 'comm-record-late', 'comm-record', ids)
        const due = late.filter((record) => !told.has(record.id))
        for (const record of due) {
          await this.hub.announce(tx, {
            event: {
              name: COMM_RECORD_LATE,
              ref: { code: record.id },
              audiences: { owner: [record.ownerId] },
            },
            subject: { kind: 'comm-record', code: record.id, label: record.subjectLabel },
            detail: { [NOTIFICATION_DETAIL_OBJECT]: record.subjectCode },
          })
        }
        return due.length
      })
      /* Announced, not written: the hub drops a failed or duplicate line silently. */
      if (announced > 0) this.log.log(`Announced ${announced} late comm records to the bell.`)
    } catch (error: unknown) {
      this.log.error(`Late sweep failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
