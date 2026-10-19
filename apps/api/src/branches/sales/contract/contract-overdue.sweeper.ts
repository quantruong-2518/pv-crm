import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { CONTRACT_INSTALLMENT_OVERDUE } from '@pv/engines'
import { ENV, type Env } from '@api/platform/config/env'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { ContractRepository } from './contract.repository'
import { ContractScheduleRepository } from './contract-schedule.repository'

const SWEEP_EVERY_MS = 60 * 60_000

/** Rings a contract's owner once per installment that went past due unpaid,
 *  through the bell's one door (ADR 0085, ADR 0096). The occurrence is the
 *  installment number and its due day, so the event key is
 *  `<kind>/<contract>/<no>/<day>` and the ledger's UNIQUE keeps it to one line
 *  per owner per due date.
 *
 *  Self-timed: hourly and once at boot, off under `NODE_ENV=test`. It may
 *  overlap with the worker process — the second writer's row is dropped by
 *  that UNIQUE. No `actorId`: the system speaks. */
@Injectable()
export class ContractOverdueSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('sales.contract')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: ContractRepository,
    private readonly schedule: ContractScheduleRepository,
    private readonly hub: NotificationHub,
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

  /** Never rejects: a failed sweep leaves the installments for the next tick. */
  private async sweep(): Promise<void> {
    try {
      /* `announce` writes inside its caller's transaction: one for the sweep. */
      const announced = await this.schedule.run(async (tx) => {
        const overdue = await this.repo.overdueUntold(tx)
        for (const item of overdue) {
          await this.hub.announce(tx, {
            event: {
              name: CONTRACT_INSTALLMENT_OVERDUE,
              ref: { code: item.contractCode },
              occurrence: item.occurrence,
              audiences: { owner: [item.ownerId] },
            },
            subject: { kind: 'contract', code: item.contractCode, label: item.label },
            detail: {
              installmentNo: item.no,
              amountVnd: item.amount,
              due: item.due.toISOString(),
            },
          })
        }
        return overdue.length
      })
      /* Announced, not written: the hub drops a failed or duplicate line silently. */
      if (announced > 0) this.log.log(`Announced ${announced} overdue installments to the bell.`)
    } catch (error: unknown) {
      this.log.error(
        `Overdue sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
