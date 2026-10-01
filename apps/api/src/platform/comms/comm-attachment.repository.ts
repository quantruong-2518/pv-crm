import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { attachment, type AttachmentRowDb } from '@api/platform/storage/attachment.schema'

export type CommAttachmentRead = { row: AttachmentRowDb; createdByName: string }

/** SQL of a comm record's files (`platform.attachment`, `owner_kind = 'comm'`).
 *
 *  A declared file keeps `owner_code` NULL until its `uploaded` call, so a PUT
 *  that never happened cannot move the record out of `empty`; the storage key
 *  (`comm/<debrief>/<file>`, server-made) is what binds it to its record until
 *  then. Decides nothing, checks no permission. */
@Injectable()
export class CommAttachmentRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  async insert(values: typeof attachment.$inferInsert): Promise<void> {
    await this.db.insert(attachment).values(values)
  }

  /** Idempotent: a repeated `uploaded` finds the row already attached. */
  async attach(tx: Db, storageKey: string, debriefId: string): Promise<AttachmentRowDb | null> {
    const [row] = await tx
      .update(attachment)
      .set({ ownerCode: debriefId })
      .where(
        and(
          eq(attachment.storageKey, storageKey),
          eq(attachment.ownerKind, 'comm'),
          or(isNull(attachment.ownerCode), eq(attachment.ownerCode, debriefId)),
        ),
      )
      .returning()
    return row ?? null
  }

  async remove(tx: Db, storageKey: string): Promise<string | null> {
    const [row] = await tx
      .delete(attachment)
      .where(and(eq(attachment.storageKey, storageKey), eq(attachment.ownerKind, 'comm')))
      .returning({ key: attachment.storageKey })
    return row?.key ?? null
  }

  /** One record's uploaded files, in the order they were declared. */
  async listOf(debriefId: string): Promise<CommAttachmentRead[]> {
    return this.db
      .select({ row: attachment, createdByName: actor.name })
      .from(attachment)
      .innerJoin(actor, eq(actor.id, attachment.createdBy))
      .where(and(eq(attachment.ownerKind, 'comm'), eq(attachment.ownerCode, debriefId)))
      .orderBy(asc(attachment.createdAt), asc(attachment.id))
  }
}
