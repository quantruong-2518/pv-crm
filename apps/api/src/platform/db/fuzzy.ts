import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { TYPO_SCORE_CAP, WORD_SIMILARITY_FLOOR } from '@pv/contracts'
import type { Db } from './create-db'
import { contains } from './like'

/** Fuzzy search in SQL, one rule for every book (owner decision 20/10):
 *  accent- and case-blind substring OR trigram word-similarity, on every
 *  column a box searches — codes, phones and emails included.
 *
 *  Typos are a fallback: while the text hits a book directly (substring), only
 *  direct hits show, else a full code like LD-0217 would bring back every
 *  LD-0xxx. `withFuzzyFloor` decides that once per book from a probe and sets
 *  the floor — run every query that applies the predicate inside it.
 *
 *  `sales.fold` lives in the sales schema since migration 0088 and carries the
 *  GIN trigram indexes; platform books borrow it until it moves to a neutral
 *  schema. `<%` with the needle on the left is the form those indexes answer. */

export const folded = (e: SQLWrapper): SQL => sql`sales.fold(${e})`

/** The query, folded by the same function the indexes are built on. */
export const needle = (q: string): SQL => sql`sales.fold(${q}::text)`

/** The direct half of `fuzzyHit`: folded substring. */
export const directHit = (e: SQLWrapper, q: string): SQL =>
  sql`${folded(e)} LIKE sales.fold(${contains(q)}::text)`

/** One column matches: folded substring, or — in the typo pass only — close
 *  enough to forgive a typo. Outside `withFuzzyFloor` the typo arm is off. */
export const fuzzyHit = (e: SQLWrapper, q: string): SQL =>
  sql`(${directHit(e, q)}
    OR (current_setting('pv.search_typos', true) = 'on' AND ${needle(q)} <% ${folded(e)}))`

const anyOf = (cols: SQLWrapper[], hit: (e: SQLWrapper) => SQL): SQL =>
  sql`(${sql.join(cols.map(hit), sql` OR `)})`

/** Any of the columns matches. */
export const fuzzyAny = (cols: SQLWrapper[], q: string): SQL => anyOf(cols, (c) => fuzzyHit(c, q))

/** Does `q` hit `cols` directly in the rows of `from` that `fence` keeps? The
 *  fence is the universe the viewer's book can ever show (scope, `leadLive`,
 *  recipient): a hit they cannot see must not switch their typos off. The UI's
 *  filters stay out, so the book, its tabs, facets and board take one pass and
 *  never disagree on a count. Required: `undefined` only for an unscoped book. */
export const directProbe = (
  from: SQL,
  fence: SQL | undefined,
  cols: SQLWrapper[],
  q: string,
): SQL =>
  sql`EXISTS (SELECT 1 FROM ${from} WHERE ${anyOf(cols, (c) => directHit(c, q))} AND ${fence ?? sql`true`})`

/** Rank tiers, same as `fuzzyScore` on the web: 3 equal, 2 prefix,
 *  1 substring, else word similarity (kept under 1). Sort by it DESC before
 *  the book's own order, or a typo'd code could bury the exact one. */
export const fuzzyRank = (cols: SQLWrapper[], q: string): SQL => {
  const n = needle(q)
  const like = sql`sales.fold(${contains(q)}::text)`
  const each = cols.map(
    (c) => sql`CASE WHEN ${folded(c)} = ${n} THEN 3 WHEN starts_with(${folded(c)}, ${n}) THEN 2
      WHEN ${folded(c)} LIKE ${like} THEN 1
      ELSE least(coalesce(word_similarity(${n}, ${folded(c)}), 0), ${sql.raw(String(TYPO_SCORE_CAP))}) END`,
  )
  return sql`(greatest(${sql.join(each, sql`, `)}))::float8`
}

/** Runs `fn` with the floor set and typos on only when `probe` finds no direct
 *  hit. Settings are LOCAL to the transaction, so they never leak to the pooled
 *  connection's next user. */
export function withFuzzyFloor<T>(db: Db, probe: SQL, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(WORD_SIMILARITY_FLOOR)}, true),
        set_config('pv.search_typos', CASE WHEN ${probe} THEN 'off' ELSE 'on' END, true)`,
    )
    return fn(tx)
  })
}

/** `fn` on the pool without `q` — an unfiltered book keeps its parallel reads —
 *  or under the floor with it. */
export function underFloor<T>(
  db: Db,
  q: string | undefined,
  probe: (q: string) => SQL,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  return q ? withFuzzyFloor(db, probe(q), fn) : fn(db)
}

type Reads<T extends readonly unknown[]> = { [K in keyof T]: (db: Db) => PromiseLike<T[K]> }

/** Independent reads that may apply the predicate: in parallel on the pool
 *  without `q`, one after another inside `withFuzzyFloor` with it. */
export async function readsUnderFloor<T extends readonly unknown[]>(
  db: Db,
  q: string | undefined,
  probe: (q: string) => SQL,
  reads: Reads<T>,
): Promise<T> {
  if (!q) return (await Promise.all(reads.map((r) => r(db)))) as unknown as T
  return withFuzzyFloor(db, probe(q), async (tx) => {
    const out: unknown[] = []
    for (const r of reads) out.push(await r(tx))
    return out as unknown as T
  })
}
