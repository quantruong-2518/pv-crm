import { and, asc, count, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { toVndSql } from '../money'
import { leadDealsAllLost } from '../open-deal'
import { opportunity } from '../opportunity/opportunity.schema'
import { contract, contractInstallment } from './contract.schema'
import {
  contractTermination,
  type ContractTerminationRowDb,
  type ContractTerminationValues,
} from './contract-termination.schema'

const LIST = 'CONTRACT_TERMINATION_REASON'
const terminator = alias(actor, 'terminated_by')
const settler = alias(actor, 'penalty_settled_by')

/** One termination row with the names the wire needs. `reasonName` is NULL
 *  for the virtual `other` key (and a catalogue row deleted outright);
 *  `settledByName` is NULL while the penalty is absent or pending. */
export type TerminationRead = {
  row: ContractTerminationRowDb
  byName: string
  reasonName: string | null
  settledByName: string | null
}

/** The four penalty columns (ADR 0124), all NULL when there is no penalty. */
export type PenaltyValues = Pick<
  ContractTerminationValues,
  'penaltyDirection' | 'penaltyAmount' | 'penaltySettledOn' | 'penaltySettledById'
>

/** The termination rows of a page of contracts, one query. A plain function so
 *  `ContractRepository`, also provided by other modules, gains no dependency. */
export async function terminationsOf(
  db: Db,
  codes: readonly string[],
): Promise<Map<string, TerminationRead>> {
  if (codes.length === 0) return new Map()
  const rows = await db
    .select({
      row: contractTermination,
      byName: terminator.name,
      reasonName: configEntry.name,
      settledByName: settler.name,
    })
    .from(contractTermination)
    .innerJoin(terminator, eq(terminator.id, contractTermination.terminatedById))
    .leftJoin(settler, eq(settler.id, contractTermination.penaltySettledById))
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

  /** After the termination's insert: the lead is `converted` and nothing is
   *  left on it — no live contract, no open deal — so it parks (ADR 0109). */
  async leadParks(tx: Db, leadCode: string): Promise<boolean> {
    const [row] = await tx
      .select({ parks: sql<boolean>`${leadDealsAllLost(lead.code)}` })
      .from(lead)
      .where(and(eq(lead.code, leadCode), eq(lead.state, 'converted')))
    return row?.parks === true
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

  /** The termination's penalty columns, read under the contract's lock;
   *  `null` = the contract is not terminated. */
  async penaltyOf(tx: Db, code: string): Promise<PenaltyValues | null> {
    const [found] = await tx
      .select({
        penaltyDirection: contractTermination.penaltyDirection,
        penaltyAmount: contractTermination.penaltyAmount,
        penaltySettledOn: contractTermination.penaltySettledOn,
        penaltySettledById: contractTermination.penaltySettledById,
      })
      .from(contractTermination)
      .where(eq(contractTermination.contractCode, code))
    return found ?? null
  }

  /** Only the four penalty columns: the collected / refunded snapshot stays. */
  async setPenalty(tx: Db, code: string, values: PenaltyValues): Promise<void> {
    await tx
      .update(contractTermination)
      .set(values)
      .where(eq(contractTermination.contractCode, code))
  }
}

/** The summary's penalty band (ADR 0124): company numbers, unscoped, in VND by
 *  the rate table. Terminated contracts only, so NOT the book's `LIVE` filter. */
export async function penaltySummary(db: Db) {
  const vnd = toVndSql(contractTermination.penaltyAmount, contract.currency)
  const sum = (where: SQL) =>
    sql<number | string>`COALESCE(SUM(${vnd}) FILTER (WHERE ${where}), 0)::bigint`
  const customer = sql`${contractTermination.penaltyDirection} = 'customer-pays'`
  const company = sql`${contractTermination.penaltyDirection} = 'company-pays'`
  const settled = sql`${contractTermination.penaltySettledOn} IS NOT NULL`
  const [found] = await db
    .select({
      terminatedCount: count(),
      customerPays: sum(customer),
      customerPaysSettled: sum(sql`${customer} AND ${settled}`),
      companyPays: sum(company),
      companyPaysSettled: sum(sql`${company} AND ${settled}`),
    })
    .from(contractTermination)
    .innerJoin(contract, eq(contract.code, contractTermination.contractCode))
    .innerJoin(lead, eq(lead.code, contract.leadCode))
    .where(leadLive)
  return {
    terminatedCount: found?.terminatedCount ?? 0,
    penaltyCustomerPaysVnd: Number(found?.customerPays ?? 0),
    penaltyCustomerPaysSettledVnd: Number(found?.customerPaysSettled ?? 0),
    penaltyCompanyPaysVnd: Number(found?.companyPays ?? 0),
    penaltyCompanyPaysSettledVnd: Number(found?.companyPaysSettled ?? 0),
  }
}
