import { and, desc, eq, gte, isNull, lt, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Injectable } from '@nestjs/common'
import type { OverdueReasonRow } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import {
  contract,
  contractInstallment,
  installmentOverdueReason as reason,
} from './contract.schema'

const writer = alias(actor, 'reason_writer')
const decider = alias(actor, 'reason_decider')

const COLUMNS = {
  row: reason,
  writerName: writer.name,
  deciderName: decider.name,
  presentDue: contractInstallment.due,
}

type Joined = {
  row: typeof reason.$inferSelect
  writerName: string
  deciderName: string | null
  presentDue: Date
}

/** The reason row in the contract's wire shape. */
function toRow({ row, writerName, deciderName, presentDue }: Joined): OverdueReasonRow {
  return {
    id: row.id,
    contractCode: row.contractCode,
    installmentNo: row.installmentNo,
    due: row.due.toISOString(),
    reason: row.reason,
    writtenBy: { id: row.writtenById, name: writerName },
    writtenAt: row.writtenAt.toISOString(),
    state: row.state,
    decidedBy: row.decidedById && deciderName ? { id: row.decidedById, name: deciderName } : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    stale: row.due.getTime() !== presentDue.getTime(),
  }
}

/** SQL of the overdue-reason doors (ADR 0100). Decides nothing: every rule is
 *  the service's. Kept apart from `ContractRepository` for its line ceiling. */
@Injectable()
export class ContractOverdueReasonRepository {
  private joined(tx: Db) {
    return tx
      .select(COLUMNS)
      .from(reason)
      .innerJoin(
        contractInstallment,
        and(
          eq(contractInstallment.contractCode, reason.contractCode),
          eq(contractInstallment.no, reason.installmentNo),
        ),
      )
      .innerJoin(writer, eq(writer.id, reason.writtenById))
      .leftJoin(decider, eq(decider.id, reason.decidedById))
  }

  /** Newest first; the id breaks a tie between two writes in one instant. */
  async ofInstallment(tx: Db, code: string, no: number): Promise<OverdueReasonRow[]> {
    const rows = await this.joined(tx)
      .where(and(eq(reason.contractCode, code), eq(reason.installmentNo, no)))
      .orderBy(desc(reason.writtenAt), desc(reason.id))
    return rows.map(toRow)
  }

  async byId(tx: Db, id: number): Promise<OverdueReasonRow | null> {
    const [found] = await this.joined(tx).where(eq(reason.id, id))
    return found ? toRow(found) : null
  }

  /** Row lock, so two deciders of one reason queue instead of interleaving. */
  async lockById(tx: Db, id: number): Promise<typeof reason.$inferSelect | null> {
    const [found] = await tx.select().from(reason).where(eq(reason.id, id)).for('update')
    return found ?? null
  }

  /** The contract's owner, read without a lock (`null` = no such contract). */
  async ownerOf(tx: Db, code: string): Promise<{ ownerId: string | null } | null> {
    const [found] = await tx
      .select({ ownerId: contract.ownerId })
      .from(contract)
      .where(eq(contract.code, code))
    return found ?? null
  }

  /** The KPI's overdue rule as of the month's last Vietnam day D, for a waiting
   *  reason on its installment's present due: due before D's first instant,
   *  unpaid by D's end (`dayEnd` = D+1 start), on a live lead. Oldest due first. */
  async waitingAsOf(tx: Db, lastDayStart: Date, dayEnd: Date): Promise<OverdueReasonRow[]> {
    const rows = await this.joined(tx)
      .innerJoin(contract, eq(contract.code, reason.contractCode))
      .innerJoin(lead, eq(lead.code, contract.leadCode))
      .where(
        and(
          eq(reason.state, 'waiting'),
          eq(contractInstallment.due, reason.due),
          lt(contractInstallment.due, lastDayStart),
          or(isNull(contractInstallment.paidAt), gte(contractInstallment.paidAt, dayEnd)),
          leadLive,
        ),
      )
      .orderBy(reason.due, reason.id)
    return rows.map(toRow)
  }

  /** `<code> · <company>`, the label every contract bell line carries. */
  async labelOf(tx: Db, code: string): Promise<string | null> {
    const [found] = await tx
      .select({ label: objectRef.label })
      .from(objectRef)
      .where(eq(objectRef.code, code))
    return found?.label ?? null
  }

  async insert(tx: Db, values: typeof reason.$inferInsert): Promise<number> {
    const [made] = await tx.insert(reason).values(values).returning({ id: reason.id })
    return made?.id ?? 0
  }

  async decide(
    tx: Db,
    id: number,
    set: Pick<typeof reason.$inferInsert, 'state' | 'decidedById' | 'decisionNote'>,
  ): Promise<void> {
    await tx
      .update(reason)
      .set({ ...set, decidedAt: new Date() })
      .where(eq(reason.id, id))
  }
}
