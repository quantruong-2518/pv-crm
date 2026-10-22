import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { InstallmentDraft, RecordChannel, ConditionSide } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { fromDraft } from './contract.mapper'
import { contractParticipant } from './contract-participant.schema'
import {
  contract,
  contractCondition,
  contractInstallment,
  contractRecord,
  type ContractConditionRowDb,
  type ContractInstallmentRowDb,
  type ContractRowDb,
} from './contract.schema'

const ofInstallment = (code: string, no: number) =>
  and(eq(contractInstallment.contractCode, code), eq(contractInstallment.no, no))

/** Write SQL of a signed contract's schedule (ADR 0090), apart from
 *  `ContractRepository` to keep that file under its ceiling. Decides nothing:
 *  every rule is the service's, and each method here runs inside the
 *  transaction that holds `lock`. */
@Injectable()
export class ContractScheduleRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The pool, for reads that need no transaction (READ COMMITTED gives a
   *  transaction's statements no shared snapshot anyway). */
  get readonlyHandle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Row lock: two writers on one schedule queue here instead of interleaving. */
  async lock(tx: Db, code: string): Promise<ContractRowDb | null> {
    const [row] = await tx.select().from(contract).where(eq(contract.code, code)).for('update')
    return row ?? null
  }

  installments(tx: Db, code: string): Promise<ContractInstallmentRowDb[]> {
    return tx
      .select()
      .from(contractInstallment)
      .where(eq(contractInstallment.contractCode, code))
      .orderBy(asc(contractInstallment.no))
  }

  /** In place by `no`, never delete-then-insert: a deleted instalment takes its
   *  document labels with it (`document_step` cascades). A line whose `no` is in
   *  `unpaid` is that row edited, any other is new; the unpaid rows no line
   *  names are the only ones deleted. */
  async replaceUnpaid(
    tx: Db,
    code: string,
    unpaid: readonly number[],
    lines: readonly (InstallmentDraft & { no: number })[],
  ): Promise<void> {
    for (const line of lines) {
      const values = fromDraft(code, line, line.no)
      if (unpaid.includes(line.no)) {
        const { label, share, amount, due } = values
        await tx
          .update(contractInstallment)
          .set({ label, share, amount, due })
          .where(and(ofInstallment(code, line.no), isNull(contractInstallment.paidAt)))
      } else {
        await tx.insert(contractInstallment).values(values)
      }
    }
    const dropped = unpaid.filter((no) => !lines.some((line) => line.no === no))
    if (dropped.length > 0) {
      await tx
        .delete(contractInstallment)
        .where(
          and(
            eq(contractInstallment.contractCode, code),
            inArray(contractInstallment.no, dropped),
            isNull(contractInstallment.paidAt),
          ),
        )
    }
  }

  /** `false` = the row was already collected (or gone) by the time we got here. */
  async markPaid(
    tx: Db,
    code: string,
    no: number,
    paid: { at: Date; by: string; recordedAt: Date },
  ): Promise<boolean> {
    const rows = await tx
      .update(contractInstallment)
      .set({ paidAt: paid.at, paidById: paid.by, paidRecordedAt: paid.recordedAt })
      .where(and(ofInstallment(code, no), isNull(contractInstallment.paidAt)))
      .returning({ no: contractInstallment.no })
    return rows.length > 0
  }

  /** All three columns in ONE statement — `contract_installment_paid_recorder`
   *  refuses any intermediate state. Only the recorder's own row matches. */
  async undoPaid(tx: Db, code: string, no: number, by: string): Promise<boolean> {
    const rows = await tx
      .update(contractInstallment)
      .set({ paidAt: null, paidById: null, paidRecordedAt: null })
      .where(
        and(
          ofInstallment(code, no),
          isNotNull(contractInstallment.paidAt),
          eq(contractInstallment.paidById, by),
        ),
      )
      .returning({ no: contractInstallment.no })
    return rows.length > 0
  }

  async addRecord(
    tx: Db,
    code: string,
    no: number,
    v: { at: Date; channel: RecordChannel; what: string; detail: string },
  ): Promise<void> {
    await tx
      .insert(contractRecord)
      .values({ contractCode: code, installmentNo: no, state: 'done', ...v })
  }

  async addCondition(
    tx: Db,
    code: string,
    no: number,
    v: { side: ConditionSide; what: string; due: Date; who: string },
  ): Promise<void> {
    await tx.insert(contractCondition).values({ contractCode: code, installmentNo: no, ...v })
  }

  async conditionOf(
    tx: Db,
    code: string,
    no: number,
    id: string,
  ): Promise<ContractConditionRowDb | null> {
    const [row] = await tx
      .select()
      .from(contractCondition)
      .where(
        and(
          eq(contractCondition.id, id),
          eq(contractCondition.contractCode, code),
          eq(contractCondition.installmentNo, no),
        ),
      )
    return row ?? null
  }

  async markConditionDone(tx: Db, id: string, at: Date): Promise<void> {
    await tx
      .update(contractCondition)
      .set({ doneAt: at })
      .where(and(eq(contractCondition.id, id), isNull(contractCondition.doneAt)))
  }

  async setCollector(tx: Db, code: string, collectorId: string): Promise<void> {
    await tx.update(contract).set({ collectorId }).where(eq(contract.code, code))
  }

  /** The actor is `ownOnly` (`bellAudience` reads the same flag). */
  async isOwnOnly(tx: Db, id: string): Promise<boolean> {
    const [row] = await tx.select({ ownOnly: actor.ownOnly }).from(actor).where(eq(actor.id, id))
    return row?.ownOnly ?? false
  }

  /** Who hears about a schedule change:the commission owner, the payment PIC
   *  (`collectorId`, the caller dedupes), and the signing day's participants who can open the contract. An `ownOnly` participant
   *  sees only contracts they own (`ContractRepository.scopeOf`), so the join
   *  drops them; the filter sits in the ON clause so no participant still
   *  returns the owner. */
  async bellAudience(
    tx: Db,
    code: string,
  ): Promise<{
    ownerId: string | null
    collectorId: string
    label: string
    participants: string[]
  } | null> {
    const [row] = await tx
      .select({
        ownerId: contract.ownerId,
        collectorId: contract.collectorId,
        label: objectRef.label,
        participants: sql<
          string[]
        >`coalesce(array_agg(DISTINCT ${actor.id}) FILTER (WHERE ${actor.id} IS NOT NULL), '{}')`,
      })
      .from(contract)
      .innerJoin(objectRef, eq(objectRef.code, contract.code))
      .leftJoin(contractParticipant, eq(contractParticipant.contractCode, contract.code))
      .leftJoin(
        actor,
        and(
          eq(actor.id, contractParticipant.actorId),
          eq(actor.ownOnly, false),
          isNull(actor.disabledAt),
        ),
      )
      .where(eq(contract.code, code))
      .groupBy(contract.ownerId, contract.collectorId, objectRef.label)
    return row ?? null
  }
}
