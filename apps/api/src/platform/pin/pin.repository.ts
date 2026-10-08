import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { PinSubject } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import { userPin } from './pin.schema'

/** The only SQL on `platform.user_pin`. Every statement takes the actor id
 *  and filters on it — pins are private, so there is no read without one. */
@Injectable()
export class PinRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Newest pin first; one request's pins share `created_at`, so `code` breaks the tie. */
  async list(actorId: string, subject: PinSubject): Promise<string[]> {
    const rows = await this.db
      .select({ code: userPin.code })
      .from(userPin)
      .where(and(eq(userPin.actorId, actorId), eq(userPin.subjectType, subject)))
      .orderBy(desc(userPin.createdAt), desc(userPin.code))
    return rows.map((r) => r.code)
  }

  /** Serialises one actor's pin writes, so two tabs cannot both pass the cap.
   *  `NO KEY UPDATE` rather than `UPDATE`: it does not block the key-share
   *  locks other tables' foreign keys take on the same actor row. */
  async lockActor(tx: Db, actorId: string): Promise<void> {
    await tx.select({ id: actor.id }).from(actor).where(eq(actor.id, actorId)).for('no key update')
  }

  /** The codes newly pinned; one already pinned conflicts and is left out. */
  async add(tx: Db, actorId: string, subject: PinSubject, codes: string[]): Promise<string[]> {
    const rows = await tx
      .insert(userPin)
      .values(codes.map((code) => ({ actorId, subjectType: subject, code })))
      .onConflictDoNothing()
      .returning({ code: userPin.code })
    return rows.map((r) => r.code)
  }

  async count(tx: Db, actorId: string, subject: PinSubject): Promise<number> {
    const [r] = await tx
      .select({ n: count() })
      .from(userPin)
      .where(and(eq(userPin.actorId, actorId), eq(userPin.subjectType, subject)))
    return r?.n ?? 0
  }

  /** The codes actually unpinned; one that was not pinned is left out. */
  async remove(actorId: string, subject: PinSubject, codes: string[]): Promise<string[]> {
    const rows = await this.db
      .delete(userPin)
      .where(
        and(
          eq(userPin.actorId, actorId),
          eq(userPin.subjectType, subject),
          inArray(userPin.code, codes),
        ),
      )
      .returning({ code: userPin.code })
    return rows.map((r) => r.code)
  }
}
