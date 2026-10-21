import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { WorkstreamDocumentStep } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { attachment, type AttachmentRowDb } from '@api/platform/storage/attachment.schema'
import { contract, contractInstallment } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { scanFile } from '../lead/lead-scan.schema'
import { dealStoodBy } from '../open-deal'
import { opportunity } from '../opportunity/opportunity.schema'
import { quotation } from '../quotation/quotation.schema'
import { documentStep } from './workstream-document.schema'

/** SQL of a run's documents (`platform.attachment`, `owner_kind = 'workstream'`).
 *  A declared file keeps `owner_code` NULL until its `uploaded` call, so the
 *  scan sweeper reaps a PUT that never happened. Decides nothing. */
@Injectable()
export class WorkstreamDocumentRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The label rides the same transaction as the file, so a declared file is
   *  never left half-tagged. */
  async insert(
    values: typeof attachment.$inferInsert & { id: string },
    step?: WorkstreamDocumentStep,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(attachment).values(values)
      if (step)
        await tx.insert(documentStep).values({ attachmentId: values.id, ...stepColumns(step) })
    })
  }

  /** Does the step's target belong to THIS run: the quotation's deal, the
   *  contract, the instalment of that contract. */
  async stepInRun(code: string, step: WorkstreamDocumentStep): Promise<boolean> {
    if (step.kind === 'quotation') {
      const [row] = await this.db
        .select({ id: quotation.id })
        .from(quotation)
        .innerJoin(opportunity, eq(opportunity.code, quotation.opportunityCode))
        .where(and(eq(quotation.id, step.quotationId), eq(opportunity.workstreamCode, code)))
      return !!row
    }
    const [row] = await this.db
      .select({ code: contract.code })
      .from(contract)
      .where(and(eq(contract.code, step.contractCode), eq(contract.workstreamCode, code)))
    if (!row || step.kind === 'contract') return !!row
    const [installment] = await this.db
      .select({ no: contractInstallment.no })
      .from(contractInstallment)
      .where(
        and(
          eq(contractInstallment.contractCode, step.contractCode),
          eq(contractInstallment.no, step.installmentNo),
        ),
      )
    return !!installment
  }

  /** The contracts of the run the actor closed (`owner_id`, ADR 0110 §1). */
  async closedInRun(who: Actor, code: string): Promise<string[]> {
    const rows = await this.db
      .select({ code: contract.code })
      .from(contract)
      .where(and(eq(contract.workstreamCode, code), eq(contract.ownerId, who.id)))
    return rows.map((r) => r.code)
  }

  /** The closer of one contract; `undefined` when no such contract. */
  async closerOf(contractCode: string): Promise<string | null | undefined> {
    const [row] = await this.db
      .select({ ownerId: contract.ownerId })
      .from(contract)
      .where(eq(contract.code, contractCode))
      .limit(1)
    return row?.ownerId
  }

  /** The actor stands (`dealStoodBy`) on some deal of the run — a lane or the
   *  accepter — which opens its documents without holding the lead. */
  async standsOnDeal(who: Actor, code: string): Promise<boolean> {
    const [row] = await this.db
      .select({ code: opportunity.code })
      .from(opportunity)
      .where(and(eq(opportunity.workstreamCode, code), dealStoodBy(opportunity.code, who.id)))
      .limit(1)
    return !!row
  }

  /** Idempotent: a repeated `uploaded` finds the row already attached. */
  async attach(tx: Db, storageKey: string, code: string): Promise<AttachmentRowDb | null> {
    const [row] = await tx
      .update(attachment)
      .set({ ownerCode: code })
      .where(
        and(
          eq(attachment.storageKey, storageKey),
          eq(attachment.ownerKind, 'workstream'),
          or(isNull(attachment.ownerCode), eq(attachment.ownerCode, code)),
        ),
      )
      .returning()
    return row ?? null
  }

  /** Declared size of a not-yet-removed upload of this run. */
  async bytesOf(storageKey: string, code: string): Promise<number | null> {
    const [row] = await this.db
      .select({ bytes: attachment.bytes })
      .from(attachment)
      .where(
        and(
          eq(attachment.storageKey, storageKey),
          eq(attachment.ownerKind, 'workstream'),
          or(isNull(attachment.ownerCode), eq(attachment.ownerCode, code)),
        ),
      )
    return row?.bytes ?? null
  }

  /** Only the uploader's own file goes. */
  async remove(
    tx: Db,
    storageKey: string,
    code: string,
    actorId: string,
  ): Promise<AttachmentRowDb | null> {
    const [row] = await tx
      .delete(attachment)
      .where(
        and(
          eq(attachment.storageKey, storageKey),
          eq(attachment.ownerKind, 'workstream'),
          eq(attachment.ownerCode, code),
          eq(attachment.createdBy, actorId),
        ),
      )
      .returning()
    return row ?? null
  }

  /** Uploads on the run, and this actor's declared-but-unconfirmed ones. */
  async load(code: string, actorId: string): Promise<{ kept: number; pending: number }> {
    const [kept] = await this.db
      .select({ n: count() })
      .from(attachment)
      .where(and(eq(attachment.ownerKind, 'workstream'), eq(attachment.ownerCode, code)))
    const [pending] = await this.db
      .select({ n: count() })
      .from(attachment)
      .where(
        and(
          eq(attachment.ownerKind, 'workstream'),
          isNull(attachment.ownerCode),
          eq(attachment.createdBy, actorId),
        ),
      )
    return { kept: kept?.n ?? 0, pending: pending?.n ?? 0 }
  }

  /** Newest first: the uploads on the run, plus the scan sources of its leads
   *  when `withScans` (they hold a card photo's PII, a lead read of their own). */
  async listOf(code: string, withScans: boolean) {
    const leads = this.db
      .select({ code: lead.code })
      .from(lead)
      .where(eq(lead.workstreamCode, code))
    return this.db
      .select({
        row: attachment,
        createdByName: actor.name,
        batchCode: scanFile.batchCode,
        step: documentStep,
      })
      .from(attachment)
      .innerJoin(actor, eq(actor.id, attachment.createdBy))
      .leftJoin(scanFile, eq(scanFile.attachmentId, attachment.id))
      .leftJoin(documentStep, eq(documentStep.attachmentId, attachment.id))
      .where(
        or(
          and(eq(attachment.ownerKind, 'workstream'), eq(attachment.ownerCode, code)),
          withScans
            ? and(eq(attachment.ownerKind, 'lead'), inArray(attachment.ownerCode, leads))
            : undefined,
        ),
      )
      .orderBy(desc(attachment.createdAt), desc(attachment.id))
  }
}

/** The body's step -> the columns `document_step_one_target` expects. */
function stepColumns(step: WorkstreamDocumentStep) {
  switch (step.kind) {
    case 'quotation':
      return { stepKind: step.kind, quotationId: step.quotationId }
    case 'contract':
      return { stepKind: step.kind, contractCode: step.contractCode }
    case 'installment':
      return {
        stepKind: step.kind,
        contractCode: step.contractCode,
        installmentNo: step.installmentNo,
      }
  }
}
