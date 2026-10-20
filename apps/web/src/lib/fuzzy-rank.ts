import { fuzzyBest } from '@pv/contracts'
import { searchableText } from './search-box'

/** Rows of a list the page already holds, narrowed and ranked by the one search
 *  rule (`@pv/contracts` search-text). Under `SEARCH_MIN_CHARS` typed characters
 *  the list comes back whole, so backspacing never leaves a stale narrowing.
 *  Array.sort is stable: equal scores keep the order the page gave them. */
export function fuzzyRank<T>(
  rows: readonly T[],
  q: string,
  fieldsOf: (row: T) => ReadonlyArray<string | null | undefined>,
): T[] {
  if (searchableText(q) === undefined) return [...rows]
  const hits = rows
    .map((row) => ({ row, score: fuzzyBest(q, fieldsOf(row)) }))
    .filter((hit) => hit.score > 0)
  /* Typos are a fallback, as on the server: any direct (≥1) hit hides look-alikes. */
  const direct = hits.filter((hit) => hit.score >= 1)
  return (direct.length > 0 ? direct : hits).sort((a, b) => b.score - a.score).map((hit) => hit.row)
}
