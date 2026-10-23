import { Inject, Injectable, Logger } from '@nestjs/common'
import { CUSTOMER_RECARE_DUE } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { SettingService } from '@api/platform/setting/setting.service'
import { recareCyclesOf } from '../config/recare-cycles'
import { AfterSaleRepository } from './after-sale.repository'

const SWEEP_EVERY_MS = 60 * 60_000

/** The re-care bell (ADR 0121 §4): every unlocked carer, once per elapsed
 *  cycle, each linked to their own latest live contract so the link opens.
 *  The occurrence is `<base day>:<cycle days>:<n>`, so a new contact (new
 *  base day) or a new temperature (new cycle) starts a fresh count, and the
 *  ledger's UNIQUE keeps each to one line per person.
 *
 *  Rides the worker's existing tick (`worker.ts`), hourly, the
 *  `ContractOverdueSweeper` way. The clock moves BEFORE the pass so a failing
 *  database is asked again one interval later. No `actorId`: the system speaks. */
@Injectable()
export class AfterSaleReminderSweeper {
  private readonly log = new Logger('sales.after-sale')
  private notBefore = 0
  private running = false

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: AfterSaleRepository,
    private readonly settings: SettingService,
    private readonly hub: NotificationHub,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    this.running = true
    try {
      return await this.pass()
    } finally {
      this.running = false
    }
  }

  private async pass(): Promise<number> {
    const cycles = await recareCyclesOf(this.settings)
    const rung = await this.db.transaction(async (tx) => {
      const due = await this.repo.dueUntold(tx, cycles)
      for (const run of due) {
        /* One event per carer, each linked to a contract that carer closed. */
        await this.hub.announce(tx, {
          event: {
            name: CUSTOMER_RECARE_DUE,
            ref: { code: run.code },
            occurrence: `${run.baseDay}:${run.cycleDays}:${run.cycle}`,
            audiences: { carers: [run.carerId] },
          },
          subject: {
            kind: 'contract',
            code: run.contractCode,
            label: `${run.contractCode} · ${run.customer}`,
          },
          detail: { workstreamCode: run.code, since: run.baseDay, cycleDays: run.cycleDays },
        })
      }
      return due.length
    })
    if (rung > 0) this.log.log(`Re-care reminders announced to ${rung} carer(s).`)
    return rung
  }
}
