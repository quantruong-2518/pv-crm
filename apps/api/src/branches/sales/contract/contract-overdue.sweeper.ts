import { Injectable, Logger } from '@nestjs/common'
import { CONTRACT_INSTALLMENT_OVERDUE } from '@pv/engines'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { ContractRepository } from './contract.repository'
import { ContractScheduleRepository } from './contract-schedule.repository'

const SWEEP_EVERY_MS = 60 * 60_000

/** Rings a contract's owner and payment PIC once per installment that went past due unpaid,
 *  through the bell's one door (ADR 0085, ADR 0096). The occurrence is the
 *  installment number and its due day, so the event key is
 *  `<kind>/<contract>/<no>/<day>` and the ledger's UNIQUE keeps it to one line
 *  per person per due date.
 *
 *  Rides the worker's existing tick (`worker.ts`), no clock of its own (ADR
 *  0082 §2), throttled to one pass an hour the `HoldReminderSweeper` way. Only
 *  the worker calls it; a second worker's row is dropped by that UNIQUE.
 *  No `actorId`: the system speaks. */
@Injectable()
export class ContractOverdueSweeper {
  private readonly log = new Logger('sales.contract')
  private notBefore = 0
  private running = false

  constructor(
    private readonly repo: ContractRepository,
    private readonly schedule: ContractScheduleRepository,
    private readonly hub: NotificationHub,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. The clock
   *  moves BEFORE the pass so a failing database is asked again one interval later;
   *  a failed pass leaves the installments for the next one. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    this.running = true
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
              audiences: { owner: [item.recipientId] },
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
      return announced
    } finally {
      this.running = false
    }
  }
}
