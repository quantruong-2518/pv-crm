import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { attachment, type AttachmentRowDb } from '@api/platform/storage/attachment.schema'
import { lead } from '../lead/lead.schema'
import { scanFile } from '../lead/lead-scan.schema'

/** SQL of a run's documents (`platform.attachment`, `owner_kind = 'workstream'`).
 *  A declared file keeps `owner_code` NULL until its `uploaded` call, so the
 *  scan sweeper reaps a PUT that never happened. Decides nothing. */
@Injectable()
export class WorkstreamDocumentRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  async insert(values: typeof attachment.$inferInsert): Promise<void> {
    await this.db.insert(attachment).values(values)
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
      .select({ row: attachment, createdByName: actor.name, batchCode: scanFile.batchCode })
      .from(attachment)
      .innerJoin(actor, eq(actor.id, attachment.createdBy))
      .leftJoin(scanFile, eq(scanFile.attachmentId, attachment.id))
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
