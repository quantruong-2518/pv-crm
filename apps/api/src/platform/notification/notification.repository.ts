import {
  and,
  arrayContains,
  arrayOverlaps,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
} from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { PageQuery } from '@pv/contracts'
import type { Branch, RoleId } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import {
  notification,
  type NotificationRowDb,
  type NotificationValues,
} from './notification.schema'

export type NotificationWithActor = { row: NotificationRowDb; actorName: string | null }

/** The only SQL on `platform.notification`. Every read and every "mark read"
 *  takes the recipient id and filters on it — the routes carry no permission
 *  key, so that filter is the fence. Writes take the caller's `tx`. */
@Injectable()
export class NotificationRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Which of these ids are real actors, and whether each is locked. `KEY
   *  SHARE` is the lock the foreign keys take anyway: holding it from here
   *  means no delete can land between this answer and the insert it guards. */
  actors(tx: Db, ids: readonly string[]): Promise<{ id: string; disabledAt: Date | null }[]> {
    return tx
      .select({ id: actor.id, disabledAt: actor.disabledAt })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
      .for('key share')
  }

  /** A row that already exists is left alone, never an error: the same news
   *  about the same thing reaches one person once. */
  async insert(tx: Db, rows: NotificationValues[]): Promise<void> {
    await tx
      .insert(notification)
      .values(rows)
      .onConflictDoNothing({ target: [notification.recipientId, notification.eventKey] })
  }

  /** Unlocked actors in one of these roles; with a branch, only those licensed
   *  for it — the same two questions E2's `check` asks of a signed-in person. */
  async activeIn(tx: Db, roles: readonly RoleId[], branch?: Branch): Promise<string[]> {
    const rows = await tx
      .select({ id: actor.id })
      .from(actor)
      .where(
        and(
          arrayOverlaps(actor.roleIds, [...roles]),
          isNull(actor.disabledAt),
          /* A role audience hears about things nobody holds yet; someone who
             may only see their own could not open any of them. */
          eq(actor.ownOnly, false),
          branch ? arrayContains(actor.branches, [branch]) : undefined,
        ),
      )
    return rows.map((r) => r.id)
  }

  /** Newest first. One `announce` writes all its rows at the same
   *  `created_at`, so `id` breaks the tie and paging stays stable. */
  async page(
    recipientId: string,
    q: PageQuery,
  ): Promise<{ rows: NotificationWithActor[]; total: number }> {
    const mine = eq(notification.recipientId, recipientId)
    const rows = await this.db
      .select({ row: notification, actorName: actor.name })
      .from(notification)
      .leftJoin(actor, eq(actor.id, notification.actorId))
      .where(mine)
      .orderBy(desc(notification.createdAt), desc(notification.id))
      .limit(q.size)
      .offset((q.page - 1) * q.size)
    const [n] = await this.db.select({ n: count() }).from(notification).where(mine)
    return { rows, total: n?.n ?? 0 }
  }

  async unread(recipientId: string): Promise<number> {
    const [n] = await this.db
      .select({ n: count() })
      .from(notification)
      .where(and(eq(notification.recipientId, recipientId), isNull(notification.readAt)))
    return n?.n ?? 0
  }

  /** Rows flipped from unread to read; `ids` undefined means all of them. */
  async markRead(recipientId: string, ids?: readonly string[]): Promise<number> {
    const rows = await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.recipientId, recipientId),
          isNull(notification.readAt),
          ids ? inArray(notification.id, [...ids]) : undefined,
        ),
      )
      .returning({ id: notification.id })
    return rows.length
  }

  /** NULL `read_at` never compares true, so an unread row is never purged. */
  async purgeReadBefore(mark: Date): Promise<number> {
    const rows = await this.db
      .delete(notification)
      .where(lt(notification.readAt, mark))
      .returning({ id: notification.id })
    return rows.length
  }
}
