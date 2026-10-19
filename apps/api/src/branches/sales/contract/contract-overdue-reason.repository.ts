import { and, desc, eq, lt, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Injectable } from '@nestjs/common'
import type { OverdueReasonRow } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { contractInstallment, installmentOverdueReason as reason } from './contract.schema'

const writer = alias(actor, 'reason_writer')
const decider = alias(actor, 'reason_decider')

const COLUMNS = {
  row: reason,
  writerName: writer.name,
  deciderName: decider.name,
}

type Joined = { row: typeof reason.$inferSelect; writerName: string; deciderName: string | null }

/** The reason row in the contract's wire shape. */
function toRow({ row, writerName, deciderName }: Joined): OverdueReasonRow {
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

  /** Waiting reasons that still explain their installment's present due, whose
   *  installment falls due before `before`; oldest due first. */
  async waitingBefore(tx: Db, before: Date): Promise<OverdueReasonRow[]> {
    const rows = await this.joined(tx)
      .innerJoin(
        contractInstallment,
        and(
          eq(contractInstallment.contractCode, reason.contractCode),
          eq(contractInstallment.no, reason.installmentNo),
          eq(contractInstallment.due, reason.due),
        ),
      )
      .where(and(eq(reason.state, 'waiting'), lt(contractInstallment.due, before)))
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

  /** A waiting reason whose due moved: it explains nothing now and would hold
   *  the one-waiting index against the new one. Never decided, so no fact is lost. */
  async dropStaleWaiting(tx: Db, code: string, no: number, due: Date): Promise<number[]> {
    const dropped = await tx
      .delete(reason)
      .where(
        and(
          eq(reason.contractCode, code),
          eq(reason.installmentNo, no),
          eq(reason.state, 'waiting'),
          ne(reason.due, due),
        ),
      )
      .returning({ id: reason.id })
    return dropped.map((r) => r.id)
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
