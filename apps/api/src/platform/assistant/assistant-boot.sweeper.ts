import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ENV, type Env } from '../config/env'
import { AssistantRepository } from './assistant.repository'

/** A deploy mid-turn leaves the turn's row `running`, and the session shows it
 *  running until another turn opens there. So the API process closes such rows as
 *  `crash` when it boots, and once more when a turn cut just before the boot has
 *  aged past the sweep's 90 s mark (`assistant.repository.ts`). The mark is above
 *  the 60 s turn cap, so a turn still live on an old machine during a rolling
 *  deploy is not closed under it. Not in the worker, which runs no turn. */

const SECOND_PASS_MS = 95_000

@Injectable()
export class AssistantBootSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Assistant')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: AssistantRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test' || process.env.PV_ROLE !== 'api') return
    void this.sweep()
    this.timer = setTimeout(() => void this.sweep(), SECOND_PASS_MS)
    this.timer.unref()
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Never rejects: a row left over is closed by the next turn in its session. */
  async sweep(): Promise<void> {
    try {
      const closed = await this.repo.sweepInterrupted()
      if (closed > 0) this.log.log(`Closed ${closed} interrupted assistant turn(s).`)
    } catch (error: unknown) {
      this.log.error(`Boot sweep failed: ${error instanceof Error ? error.name : 'unknown'}`)
    }
  }
}
