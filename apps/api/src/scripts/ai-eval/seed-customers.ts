import { eq } from 'drizzle-orm'
import { contractInstallment } from '@api/branches/sales/contract/contract.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { customerTemperature } from '@api/branches/sales/after-sale/customer-temperature.schema'
import { quotation } from '@api/branches/sales/quotation/quotation.schema'
import { workstream } from '@api/branches/sales/workstream/workstream.schema'
import { debrief, identity, message, thread } from '@api/platform/comms/comms.schema'
import type { Db } from '@api/platform/db/db.module'
import {
  canariesOf,
  CONTRACT_AMOUNT,
  CONTRACT_CURRENCY,
  QUOTE_LATEST_AMOUNT,
  type ChainSpec,
} from './seed-data'
import type { Chain } from './seed'

/** Bought customers and the quotation rounds of a deal, written straight into the tables
 *  the doors read. Dates sit years back, so a care day is past whenever the eval runs
 *  and a reading is never fresher than the cycle it sets. The reading's debrief is a
 *  bare close-out: it counts as no contact, so the clock stays on the payment day. */

const PAID_AT = new Date('2025-01-10T08:00:00.000Z')
const OPENED_AT = new Date('2024-11-01T08:00:00.000Z')
const READ_AT = new Date('2025-02-01T08:00:00.000Z')
const SENT_AT = new Date('2026-09-01T08:00:00.000Z')
const REPLIED_AT = new Date('2026-09-05T08:00:00.000Z')

export class CustomerSeeder {
  private next = 1

  constructor(private readonly db: Db) {}

  /** The reading carries the close-out that took it, as the product writes it. */
  private async reading(
    code: string,
    leadCode: string,
    owner: string,
    value: 'hot' | 'warm' | 'cold',
  ): Promise<void> {
    const [who] = await this.db
      .insert(identity)
      .values({
        channel: 'phone',
        address: `care-${owner}-${code}`,
        side: 'member',
        actorId: owner,
      })
      .returning({ id: identity.id })
    const [t] = await this.db
      .insert(thread)
      .values({ channel: 'phone', startedAt: READ_AT, lastAt: READ_AT })
      .returning({ id: thread.id })
    if (!who || !t) throw new Error('seed: no identity or thread returned')
    const [m] = await this.db
      .insert(message)
      .values({
        threadId: t.id,
        at: READ_AT,
        direction: 'out',
        fromIdentityId: who.id,
        captureSource: 'manual',
      })
      .returning({ id: message.id })
    if (!m) throw new Error('seed: no message returned')
    const [d] = await this.db
      .insert(debrief)
      .values({
        threadId: t.id,
        messageId: m.id,
        ownerId: owner,
        createdAt: READ_AT,
        closedAt: READ_AT,
        subjectCode: leadCode,
        unreached: true,
      })
      .returning({ id: debrief.id })
    if (!d) throw new Error('seed: no debrief returned')
    await this.db.insert(customerTemperature).values({
      workstreamCode: code,
      leadCode,
      temperature: value,
      debriefId: d.id,
      recordedBy: owner,
      recordedAt: READ_AT,
    })
  }

  /** A won run whose every installment is collected: `growth`, as the book reads it.
   *  One transaction, because the stand check runs at commit and wants the lead linked. */
  private async customer(spec: ChainSpec, chain: Chain, owner: string): Promise<void> {
    const code = `WS-${9000 + this.next}`
    this.next += 1
    await this.db
      .update(contractInstallment)
      .set({ paidAt: PAID_AT })
      .where(eq(contractInstallment.contractCode, chain.contract ?? ''))
    await this.db.transaction(async (tx) => {
      await tx.insert(workstream).values({
        code,
        openedAt: OPENED_AT,
        closedAt: PAID_AT,
        closeReason: 'WON',
        standKind: 'LD',
        standKey: 'converted',
        standCode: chain.lead,
      })
      await tx.update(lead).set({ workstreamCode: code }).where(eq(lead.code, chain.lead))
    })
    const value = spec.care?.temperature
    if (value) await this.reading(code, chain.lead, owner, value)
  }

  /** `open`: a refused first round and a pending second one. `signed`: the same, closed
   *  by the contract, so every round of it carries the contract code. */
  private async rounds(spec: ChainSpec, chain: Chain): Promise<void> {
    const c = canariesOf(chain.n)
    const signed = spec.quotes === 'signed'
    const paper = signed ? chain.contract : null
    const who = { opportunityCode: chain.opportunity, negotiationNo: 1, source: 'mail' as const }
    await this.db.insert(quotation).values([
      {
        ...who,
        roundNo: 1,
        amount: CONTRACT_AMOUNT,
        currency: CONTRACT_CURRENCY,
        sentAt: SENT_AT,
        outcome: 'not-closed',
        closedAt: REPLIED_AT,
        reasonId: 'other',
        reasonNote: signed
          ? `Khách xin giảm giá ${c.touchNote}`
          : `Gọi ${c.typedPhone} xin giảm giá`,
        contractCode: paper,
      },
      {
        ...who,
        roundNo: 2,
        amount: signed ? CONTRACT_AMOUNT : QUOTE_LATEST_AMOUNT,
        currency: CONTRACT_CURRENCY,
        sentAt: REPLIED_AT,
        outcome: signed ? 'won' : 'pending',
        closedAt: signed ? REPLIED_AT : null,
        contractCode: paper,
      },
    ])
  }

  async seed(spec: ChainSpec, chain: Chain): Promise<void> {
    if (spec.care) await this.customer(spec, chain, spec.contract?.owner ?? 'rival')
    if (spec.quotes) await this.rounds(spec, chain)
  }
}
