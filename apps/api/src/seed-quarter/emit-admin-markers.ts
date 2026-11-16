import { SETTING_REGISTRY, type SettingKey } from '@pv/contracts'
import { CONTRACT_INSTALLMENT_OVERDUE, CUSTOMER_RECARE_DUE } from '@pv/engines'
import { sql } from 'drizzle-orm'
import { AfterSaleRepository } from '@api/branches/sales/after-sale/after-sale.repository'
import { recareCyclesOf } from '@api/branches/sales/config/recare-cycles'
import { ContractRepository } from '@api/branches/sales/contract/contract.repository'
import type { Db } from '@api/platform/db/db.module'
import type { SettingService } from '@api/platform/setting/setting.service'
import { addDays, dayOf, vnAt } from './clock'
import { ring, rowsOf, within, type Cand } from './emit-admin-ring'
import type { Ctx } from './types'

/** The bells the worker would ring on its first tick, written now so it rings
 *  nothing. The people and the keys come from the repositories' own SELECTs,
 *  the event from the sweepers' payloads; a second ask at the end must find
 *  nobody, or the seed stops. Both selectors read the database clock, so the
 *  seeding day must be the real day. */

const overdue = new ContractRepository(null as never)
const recare = new AfterSaleRepository(null as never)

/** `SettingService.value` over `tx`: an override, else the registry default. */
function settingsOver(tx: Db): SettingService {
  return {
    value: async (key: SettingKey) => {
      const found = await rowsOf<{ value: number }>(
        tx,
        sql`SELECT value FROM platform.setting WHERE key = ${key}`,
      )
      const def = SETTING_REGISTRY[key]
      return { key, unit: def.unit, value: found[0]?.value ?? def.defaultValue }
    },
  } as unknown as SettingService
}

/** First sweep after VN midnight of the day after the due day. */
const morningAfter = (day: string): Date => vnAt(addDays(day, 1), 8, 30)

export async function markerBells(tx: Db, ctx: Ctx): Promise<Cand[]> {
  const cycles = await recareCyclesOf(settingsOver(tx))
  const [late, due] = await Promise.all([overdue.overdueUntold(tx), recare.dueUntold(tx, cycles)])
  const overdueBells = late.flatMap((item) =>
    ring({
      at: morningAfter(dayOf(item.due)),
      subject: { kind: 'contract', code: item.contractCode, label: item.label },
      event: {
        name: CONTRACT_INSTALLMENT_OVERDUE,
        ref: { code: item.contractCode },
        occurrence: item.occurrence,
        audiences: { owner: [item.recipientId] },
      },
      detail: {
        installmentNo: item.no,
        amount: item.amount,
        ...(item.currency ? { currency: item.currency } : {}),
        due: item.due.toISOString(),
      },
    }),
  )
  const recareBells = due.flatMap((run) =>
    ring({
      at: vnAt(addDays(run.baseDay, run.cycleDays * run.cycle), 9),
      subject: {
        kind: 'contract',
        code: run.contractCode,
        label: `${run.contractCode} · ${run.customer}`,
      },
      event: {
        name: CUSTOMER_RECARE_DUE,
        ref: { code: run.code },
        occurrence: `${run.baseDay}:${run.cycleDays}:${run.cycle}`,
        audiences: { carers: [run.carerId] },
      },
      detail: { workstreamCode: run.code, since: run.baseDay, cycleDays: run.cycleDays },
    }),
  )
  return [...overdueBells, ...recareBells].map((c) => ({
    ...c,
    createdAt: within(c.createdAt, ctx.now),
  }))
}

/** Asks both selectors again after the write; anything left is a bell the
 *  worker would ring on its first tick. */
export async function assertQuiet(tx: Db): Promise<void> {
  const cycles = await recareCyclesOf(settingsOver(tx))
  const [late, due] = await Promise.all([overdue.overdueUntold(tx), recare.dueUntold(tx, cycles)])
  if (late.length > 0 || due.length > 0)
    throw new Error(
      `admin: the worker would still ring ${late.length} overdue and ${due.length} re-care bell(s)`,
    )
}
