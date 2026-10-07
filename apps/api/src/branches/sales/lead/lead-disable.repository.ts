import { inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { contact } from '../contact/contact.schema'
import { contract } from '../contract/contract.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { lead, type LeadRowDb } from './lead.schema'

/** SQL of the disable door. The ONE reader of `sales.lead` that must not carry
 *  `leadLive`: it is the door that looks for leads already switched off.
 *
 *  The three code reads go to the other modules' tables directly: none of
 *  them exports "every code under these leads", and the answer is three
 *  one-column SELECTs on the door's own transaction. */
@Injectable()
export class LeadDisableRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Row-locked, so two presses cannot both find the lead live and both stamp
   *  it. Ordered by code: two overlapping batches lock in one order. */
  lock(tx: Db, codes: readonly string[]): Promise<Pick<LeadRowDb, 'code' | 'disabledAt'>[]> {
    return tx
      .select({ code: lead.code, disabledAt: lead.disabledAt })
      .from(lead)
      .where(inArray(lead.code, [...codes]))
      .orderBy(lead.code)
      .for('update')
  }

  /** `at` and `by` travel together — `lead_disabled_pair` refuses half a pair. */
  async stamp(
    tx: Db,
    codes: readonly string[],
    stamp: { at: Date; by: string } | null,
  ): Promise<void> {
    await tx
      .update(lead)
      .set({ disabledAt: stamp?.at ?? null, disabledBy: stamp?.by ?? null })
      .where(inArray(lead.code, [...codes]))
  }

  /** Everything that goes off with these leads: their people, deals, contracts. */
  async hangingOff(
    tx: Db,
    codes: readonly string[],
  ): Promise<{ contacts: string[]; deals: string[]; contracts: string[] }> {
    const list = [...codes]
    const contacts = await tx
      .select({ code: contact.code })
      .from(contact)
      .where(inArray(contact.leadCode, list))
    const deals = await tx
      .select({ code: opportunity.code })
      .from(opportunity)
      .where(inArray(opportunity.leadCode, list))
    const contracts = await tx
      .select({ code: contract.code })
      .from(contract)
      .where(inArray(contract.leadCode, list))
    return {
      contacts: contacts.map((r) => r.code),
      deals: deals.map((r) => r.code),
      contracts: contracts.map((r) => r.code),
    }
  }
}
