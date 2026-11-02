import { Inject, Injectable } from '@nestjs/common'
import type { AiReadQuery } from '@pv/contracts'
import type { Action, Actor } from '@pv/engines'
import { and, count, desc, eq, lt, sql } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { actor, audit } from '../db/platform.schema'

export type AuditEntry = {
  actorId: string
  action: Action | 'ai-read'
  code?: string
  note?: string
}

/** A literal, not a bound value: a parameter can miss the partial index on `at`. */
const IS_AI_READ = sql`${audit.action} = 'ai-read'`

/** Ghi vết — bền, không phải mảng trong RAM.
 *
 *  Ghi ở chỗ CHẶN THẬT, không ghi trong `access.check()`. `check()` chạy trong
 *  mọi vòng lặp lọc danh sách; log ở đó thì mỗi lần mở sổ đẻ vài trăm dòng và
 *  nhật ký thôi trả lời được câu nó sinh ra để trả lời ("vì sao hôm đó tôi
 *  không lấy được dữ liệu"). Lý do này được viết sẵn trong `e2-access.ts`. */
@Injectable()
export class AuditRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** `tx` so a rule that refuses a write also refuses its audit line: an
   *  entry saying a role changed, next to a role that did not, is worse than
   *  no entry — it is the log disagreeing with the table it exists to explain. */
  async write(entry: AuditEntry, tx: Db = this.db): Promise<void> {
    await tx.insert(audit).values(entry)
  }

  /** One multi-row INSERT, so a batch lands whole or not at all: the assistant
   *  sends nothing to the model when this fails (ADR 0133 D4). */
  async writeMany(entries: readonly AuditEntry[]): Promise<void> {
    if (entries.length > 0) await this.db.insert(audit).values([...entries])
  }

  /** Newest first; `id` breaks the tie, since one batch shares one `now()`. An
   *  own-only reader gets their own lines whatever the query names: a code alone
   *  would otherwise tell them who is reading a lead outside their scope. */
  async aiReads(who: Pick<Actor, 'id' | 'ownOnly'>, { actorId, code, page, size }: AiReadQuery) {
    const reader = who.ownOnly ? who.id : actorId
    const where = and(
      IS_AI_READ,
      reader ? eq(audit.actorId, reader) : undefined,
      code ? eq(audit.code, code) : undefined,
    )
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: audit.id,
          at: audit.at,
          actorId: audit.actorId,
          actorName: actor.name,
          code: audit.code,
          note: audit.note,
        })
        .from(audit)
        .leftJoin(actor, eq(actor.id, audit.actorId))
        .where(where)
        .orderBy(desc(audit.at), desc(audit.id))
        .limit(size)
        .offset((page - 1) * size),
      this.db.select({ n: count() }).from(audit).where(where),
    ])
    return { rows, total: totals[0]?.n ?? 0 }
  }

  /** The one DELETE in app code on a table that is otherwise append-only: the
   *  owner keeps `ai-read` lines 12 months because they show what each person
   *  looked up (question 142), and every other action stays forever. Postgres does
   *  the calendar arithmetic, so a leap day clamps rather than purging a day early. */
  async purgeAiReads(months: number): Promise<number> {
    const rows = await this.db
      .delete(audit)
      .where(and(IS_AI_READ, lt(audit.at, sql`now() - make_interval(months => ${months})`)))
      .returning({ id: audit.id })
    return rows.length
  }
}
