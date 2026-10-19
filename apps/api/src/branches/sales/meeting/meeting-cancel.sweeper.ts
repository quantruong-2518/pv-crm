import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ENV, type Env } from '@api/platform/config/env'
import { MeetingCancel } from './meeting-cancel'
import { MeetingModule } from './meeting.module'

const SWEEP_EVERY_MS = 60 * 60_000

/** Retries the Google removal a cancel could not finish after its commit
 *  (booker's link down, Google refusing), for seven days (`cancelledWithEvent`).
 *
 *  Self-timed exactly like `CommLateSweeper`: hourly and once at boot, off
 *  under `NODE_ENV=test`, and safe to overlap with another process — a second
 *  DELETE of a gone event is a 404, which counts as removed. */
@Injectable()
export class MeetingCancelSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('meeting.cancel')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly cancel: MeetingCancel,
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

  /** Never rejects: what is left stays for the next tick. */
  private async sweep(): Promise<void> {
    try {
      const tried = await this.cancel.retryForget()
      if (tried > 0) this.log.log(`Retried calendar removal for ${tried} cancelled meetings.`)
    } catch (error: unknown) {
      this.log.error(
        `Cancel sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

/** Its own module, mounted by `SalesModule` (so by the API and the worker):
 *  the one-off scripts load `MeetingModule` alone, and a dry run must never
 *  call Google or write. */
@Module({ imports: [MeetingModule], providers: [MeetingCancelSweeper] })
export class MeetingCancelSweepModule {}
