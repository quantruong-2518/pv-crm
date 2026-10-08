import { Inject, Injectable } from '@nestjs/common'
import { desc, eq, sql, notInArray } from 'drizzle-orm'
import type { SearchKind, SearchMatchField, SearchRecentWrite } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { resolveBranch, searchBranch, type Scope } from './search.branches'
import { searchRecent, type SearchRecentRowDb } from './search.schema'

/** Between two failures seen on seeded data: 0.4 let "ban dan" bring back the
 *  contact "Dang Minh Tri" (0.43); pg_trgm's default 0.6 drops most typos. A
 *  slip in a multi-word query scores about 0.67 and passes. */
const WORD_SIMILARITY_FLOOR = '0.5'

export type SearchRow = {
  kind: SearchKind
  code: string
  title: string
  subtitle: string | null
  field: SearchMatchField
  text: string
  score: number
}

/** SQL of the global search and of the recent list. Decides nothing: it is
 *  handed the kinds already judged permitted and the plain scope of the caller. */
@Injectable()
export class SearchRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One round trip: a UNION ALL over the permitted kinds, `limit + 1` rows each
   *  so the service can tell `more`. The threshold is set `LOCAL` to the
   *  transaction, so it never leaks to the pooled connection's next user. */
  async search(who: Scope, kinds: SearchKind[], q: string, limit: number): Promise<SearchRow[]> {
    const union = sql.join(
      kinds.map((k) => searchBranch(k, who, q, limit + 1)),
      sql` UNION ALL `,
    )
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY_FLOOR}, true)`,
      )
      return this.rowsOf(
        await tx.execute(
          sql`SELECT * FROM (${union}) u ORDER BY u.kind, u.score DESC, u.title, u.code`,
        ),
      )
    })
  }

  /** The visible subset of known `(kind, code)` picks; absent = not visible. */
  async resolve(who: Scope, picks: Map<SearchKind, string[]>): Promise<SearchRow[]> {
    if (picks.size === 0) return []
    const union = sql.join(
      [...picks].map(([k, codes]) => resolveBranch(k, who, codes)),
      sql` UNION ALL `,
    )
    return this.rowsOf(await this.db.execute(union))
  }

  /** Upserts on the unique index the row falls under, then keeps the newest `keep`. */
  async record(actorId: string, w: SearchRecentWrite, keep: number): Promise<void> {
    const picked = w.picked
    const values = {
      actorId,
      q: w.q,
      kinds: w.kinds ?? null,
      pickedKind: picked?.kind ?? null,
      pickedCode: picked?.code ?? null,
      resultCount: w.resultCount,
    }
    const refresh = { ...values, at: sql`now()` }
    await this.db.transaction(async (tx) => {
      await tx
        .insert(searchRecent)
        .values(values)
        .onConflictDoUpdate(
          picked
            ? {
                target: [searchRecent.actorId, searchRecent.pickedKind, searchRecent.pickedCode],
                targetWhere: sql`"picked_code" IS NOT NULL`,
                set: refresh,
              }
            : {
                target: [searchRecent.actorId, searchRecent.q],
                targetWhere: sql`"picked_code" IS NULL`,
                set: refresh,
              },
        )
      const newest = tx
        .select({ id: searchRecent.id })
        .from(searchRecent)
        .where(eq(searchRecent.actorId, actorId))
        .orderBy(desc(searchRecent.at), searchRecent.id)
        .limit(keep)
      await tx
        .delete(searchRecent)
        .where(sql`${searchRecent.actorId} = ${actorId} AND ${notInArray(searchRecent.id, newest)}`)
    })
  }

  recent(actorId: string, keep: number): Promise<SearchRecentRowDb[]> {
    return this.db
      .select()
      .from(searchRecent)
      .where(eq(searchRecent.actorId, actorId))
      .orderBy(desc(searchRecent.at), searchRecent.id)
      .limit(keep)
  }

  async clear(actorId: string): Promise<void> {
    await this.db.delete(searchRecent).where(eq(searchRecent.actorId, actorId))
  }

  /** `execute` is `QueryResult` on node-postgres and `Results` on PGlite; both
   *  carry `.rows` (same cast as `LeadRepository.nextCode`). */
  private rowsOf(result: unknown): SearchRow[] {
    return (result as { rows: SearchRow[] }).rows
  }
}
