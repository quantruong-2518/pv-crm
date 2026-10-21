import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { opportunity } from '../opportunity/opportunity.schema'
import { contract, contractInstallment } from './contract.schema'
import {
  contractTermination,
  type ContractTerminationRowDb,
  type ContractTerminationValues,
} from './contract-termination.schema'

const LIST = 'CONTRACT_TERMINATION_REASON'
const terminator = alias(actor, 'terminated_by')

/** One termination row with the two names the wire needs. `reasonName` is NULL
 *  for the virtual `other` key (and a catalogue row deleted outright). */
export type TerminationRead = {
  row: ContractTerminationRowDb
  byName: string
  reasonName: string | null
}

/** The termination rows of a page of contracts, one query. A plain function so
 *  `ContractRepository`, also provided by other modules, gains no dependency. */
export async function terminationsOf(
  db: Db,
  codes: readonly string[],
): Promise<Map<string, TerminationRead>> {
  if (codes.length === 0) return new Map()
  const rows = await db
    .select({ row: contractTermination, byName: terminator.name, reasonName: configEntry.name })
    .from(contractTermination)
    .innerJoin(terminator, eq(terminator.id, contractTermination.terminatedById))
    .leftJoin(
      configEntry,
      and(eq(configEntry.id, contractTermination.reasonKey), eq(configEntry.list, LIST)),
    )
    .where(inArray(contractTermination.contractCode, [...codes]))
  return new Map(rows.map((r) => [r.row.contractCode, r]))
}

/** SQL of the terminate door (ADR 0107). Decides nothing; every method but the
 *  pre-read runs inside the transaction that holds the lead and contract locks. */
@Injectable()
export class ContractTerminationRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The contract's lead, read before the transaction so the lead can be locked
   *  first. `null` = no such contract, or its lead is switched off. */
  async leadOf(code: string): Promise<string | null> {
    const [found] = await this.db
      .select({ leadCode: contract.leadCode })
      .from(contract)
      .innerJoin(lead, eq(lead.code, contract.leadCode))
      .where(and(eq(contract.code, code), leadLive))
    return found?.leadCode ?? null
  }

  /** `lockLeads`'s strength and fence, so this door queues behind a deal stop. */
  async lockLead(tx: Db, leadCode: string): Promise<boolean> {
    const rows = await tx
      .select({ code: lead.code })
      .from(lead)
      .where(and(eq(lead.code, leadCode), leadLive))
      .for('no key update')
    return rows.length > 0
  }

  /** The contract's deal, `FOR UPDATE` like `OpportunityRepository.lockDeal`:
   *  every deal door takes that lock first, so it queues behind this door. */
  async lockDeal(tx: Db, code: string): Promise<void> {
    await tx
      .select({ code: opportunity.code })
      .from(opportunity)
      .where(
        eq(
          opportunity.code,
          sql`(SELECT k.opportunity_code FROM sales.contract k WHERE k.code = ${code})`,
        ),
      )
      .for('update')
  }

  async isTerminated(tx: Db, code: string): Promise<boolean> {
    const [found] = await tx
      .select({ code: contractTermination.contractCode })
      .from(contractTermination)
      .where(eq(contractTermination.contractCode, code))
    return found !== undefined
  }

  /** Paid installments summed, read under the contract's lock. */
  async collected(tx: Db, code: string): Promise<number> {
    const [found] = await tx
      .select({
        sum: sql<number | string>`COALESCE(SUM(${contractInstallment.amount}), 0)::bigint`,
      })
      .from(contractInstallment)
      .where(and(eq(contractInstallment.contractCode, code), isNotNull(contractInstallment.paidAt)))
    return Number(found?.sum ?? 0)
  }

  async reasonLive(tx: Db, id: string): Promise<boolean> {
    const [found] = await tx
      .select({ id: configEntry.id })
      .from(configEntry)
      .where(and(eq(configEntry.list, LIST), eq(configEntry.id, id), eq(configEntry.active, true)))
      .limit(1)
    return found !== undefined
  }

  /** The live catalogue in desk order, for the terminate drawer. */
  reasons(): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: configEntry.id, name: configEntry.name })
      .from(configEntry)
      .where(and(eq(configEntry.list, LIST), eq(configEntry.active, true)))
      .orderBy(asc(configEntry.ord), asc(configEntry.id))
  }

  async insert(tx: Db, values: ContractTerminationValues): Promise<void> {
    await tx.insert(contractTermination).values(values)
  }
}
