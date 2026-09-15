import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { objectRef, type ObjectRow } from '@api/platform/db/platform.schema'
import {
  link,
  message,
  messageParty,
  thread,
  type LinkRowDb,
  type LinkValues,
  type MessagePartyValues,
  type MessageRowDb,
  type MessageValues,
  type ThreadRowDb,
  type ThreadValues,
} from './comms.schema'

/** A thread header plus the number `comms.thread` refuses to store.
 *
 *  Kept as a pair rather than folded into the row so nothing downstream can
 *  mistake the count for a column and start writing to it. */
export type ThreadTally = { row: ThreadRowDb; messageCount: number }

/** SQL of the conversation book. Decides nothing, checks no permission.
 *
 *  Every method takes `tx` with the pool as its default, the shape
 *  `AuditRepository.write` already uses. The write door needs four statements
 *  and a re-read to agree with each other, so it passes its own handle down;
 *  the read doors have one question each and take the default. A read run on
 *  the pool from inside a transaction would be a read OUTSIDE it wearing the
 *  right clothes, which is the trap the default exists to make visible at the
 *  call site rather than hide. */
@Injectable()
export class ThreadRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Threads hung on one object, newest conversation first, WITH their turn
   *  counts — one statement, not one per thread.
   *
   *  The `LEFT JOIN` is what makes the count honest for a thread that has no
   *  messages yet: an inner join would drop the row entirely and the list
   *  would answer "no conversation" where the truth is "a conversation with
   *  nothing in it". `GROUP BY thread.id` carries every other thread column
   *  along with it — Postgres allows that because `id` is the primary key, so
   *  no column has to be repeated in the clause and none can drift out of it
   *  when one is added to the table.
   *
   *  `id` breaks the tie on `last_at`, the same reason `IdentityRepository`
   *  gives: two threads whose last turn landed in the same statement share a
   *  timestamp to the microsecond, and an unstable order between two requests
   *  is a row that moves for no reason anybody can see. */
  async byObject(code: string, tx: Db = this.db): Promise<ThreadTally[]> {
    const rows = await tx
      .select({ row: thread, messageCount: sql<number>`count(${message.id})::int` })
      .from(thread)
      .innerJoin(link, eq(link.threadId, thread.id))
      .leftJoin(message, eq(message.threadId, thread.id))
      .where(eq(link.objectCode, code))
      .groupBy(thread.id)
      .orderBy(desc(thread.lastAt), asc(thread.id))

    return rows
  }

  async threadById(id: string, tx: Db = this.db): Promise<ThreadTally | null> {
    const [row] = await tx
      .select({ row: thread, messageCount: sql<number>`count(${message.id})::int` })
      .from(thread)
      .leftJoin(message, eq(message.threadId, thread.id))
      .where(eq(thread.id, id))
      .groupBy(thread.id)
      .limit(1)

    return row ?? null
  }

  /** The turns of one thread, newest first — the order `message_thread_idx`
   *  was built in, so the read needs no sort pass. */
  async messagesOf(threadId: string, tx: Db = this.db): Promise<MessageRowDb[]> {
    return tx
      .select()
      .from(message)
      .where(eq(message.threadId, threadId))
      .orderBy(desc(message.at), asc(message.id))
  }

  /** Parties of MANY turns in one statement — a thirty-turn thread is thirty
   *  round trips otherwise, and Neon bills per round trip. */
  async partiesOf(messageIds: readonly string[], tx: Db = this.db) {
    if (messageIds.length === 0) return []
    return tx
      .select()
      .from(messageParty)
      .where(inArray(messageParty.messageId, [...messageIds]))
      .orderBy(asc(messageParty.role), asc(messageParty.identityId))
  }

  /** Which objects a thread hangs on — the only scope axis this module has. */
  async linkCodesOf(threadId: string, tx: Db = this.db): Promise<string[]> {
    const rows = await tx
      .select({ code: link.objectCode })
      .from(link)
      .where(eq(link.threadId, threadId))
    return rows.map((r) => r.code)
  }

  async objectByCode(code: string, tx: Db = this.db): Promise<ObjectRow | null> {
    const [row] = await tx.select().from(objectRef).where(eq(objectRef.code, code)).limit(1)
    return row ?? null
  }

  async objectsByCodes(codes: readonly string[], tx: Db = this.db): Promise<ObjectRow[]> {
    if (codes.length === 0) return []
    return tx
      .select()
      .from(objectRef)
      .where(inArray(objectRef.code, [...codes]))
  }

  async insertThread(tx: Db, values: ThreadValues): Promise<ThreadRowDb> {
    const [row] = await tx.insert(thread).values(values).returning()
    if (!row) throw new Error('comms.thread: INSERT returned no row')
    return row
  }

  async insertMessage(tx: Db, values: MessageValues): Promise<MessageRowDb> {
    const [row] = await tx.insert(message).values(values).returning()
    if (!row) throw new Error('comms.message: INSERT returned no row')
    return row
  }

  async insertParties(tx: Db, rows: readonly MessagePartyValues[]): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(messageParty).values([...rows])
  }

  /** Stretch the thread's span to cover a turn that just landed in it.
   *
   *  `GREATEST`/`LEAST` rather than a plain assignment, and both ends rather
   *  than only `last_at`. `last_at` is a copy of `MAX(message.at)` and
   *  `started_at` of `MIN(message.at)` — those are the definitions the schema
   *  states — so a turn logged out of order (a call remembered a day late)
   *  must not drag the last turn backwards, and a turn logged BEFORE the
   *  thread's first one has to move the first one or `thread_span_forward`
   *  refuses the write with a message about a constraint the caller cannot
   *  see.
   *
   *  Computed in SQL rather than read-compare-write in TypeScript so two
   *  people logging two calls on one thread at the same moment cannot each
   *  read the old value and write over each other's stretch. */
  async widenSpan(tx: Db, threadId: string, at: Date): Promise<void> {
    await tx
      .update(thread)
      .set({
        startedAt: sql`LEAST(${thread.startedAt}, ${at}::timestamptz)`,
        lastAt: sql`GREATEST(${thread.lastAt}, ${at}::timestamptz)`,
      })
      .where(eq(thread.id, threadId))
  }

  async insertLink(tx: Db, values: LinkValues): Promise<LinkRowDb> {
    const [row] = await tx.insert(link).values(values).returning()
    if (!row) throw new Error('comms.link: INSERT returned no row')
    return row
  }
}
