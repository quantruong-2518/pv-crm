import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ENV, type Env } from '../config/env'
import { NotificationRepository } from './notification.repository'

/** How long a READ line stays in the bell. The owner's default (ADR 0085): long
 *  enough to find "that thing I was told last quarter", short enough that the
 *  table holds what people still look at. Unread lines are never purged. */
const KEEP_READ_DAYS = 90

const SWEEP_EVERY_MS = 60 * 60_000

/** Deletes read bell lines past `KEEP_READ_DAYS`.
 *
 *  Self-timed: hourly and once at boot, off under
 *  `NODE_ENV=test`. Unlike it, only the worker process runs it: one pass an
 *  hour is enough, the worker group always runs, and every API machine would
 *  otherwise repeat the same statement for nothing.
 *  `PV_ROLE` is the entrypoint's own mark (see `create-db.ts#detectRole`), not
 *  a setting, so there is nothing to configure wrong. */
@Injectable()
export class NotificationSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('notification')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: NotificationRepository,
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

  /** Never rejects: a failed sweep leaves the rows for the next tick. */
  private async sweep(): Promise<void> {
    try {
      const mark = new Date(Date.now() - KEEP_READ_DAYS * 24 * 60 * 60_000)
      const removed = await this.repo.purgeReadBefore(mark)
      if (removed > 0) this.log.log(`Purged ${removed} read notifications.`)
    } catch (error: unknown) {
      this.log.error(`Purge failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
