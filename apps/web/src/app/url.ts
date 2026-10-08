import { LeadBookQuery } from '@pv/contracts'

/** Wire translation for the lead book's query, plus the one seam between the
 *  contract's 1-based `page` and the 0-based index `TableFooter` counts in.
 *  Reading and writing the ADDRESS is `useBookQuery`'s job (`app/book-query.ts`).
 *
 *  Keys are the contract's own, read from `LeadBookQuery.shape` so this file
 *  cannot drift from the schema. */

/** Every field name `LeadBookQuery` accepts, read once from the schema itself. */
const LEAD_BOOK_QUERY_KEYS = Object.keys(LeadBookQuery.shape) as (keyof LeadBookQuery)[]

/** The query with no address params at all. `.parse`, not `.safeParse`: an
 *  empty object failing means the contract gained a required field with no
 *  default, which should fail loudly at import time. */
export const DEFAULT_LEAD_BOOK_QUERY: LeadBookQuery = LeadBookQuery.parse({})

/** LeadBookQuery → request params for the server, dropping every value still
 *  at its default (the server re-applies them). */
export function leadBookQueryToParams(query: LeadBookQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of LEAD_BOOK_QUERY_KEYS) {
    const value = query[key]
    if (value === undefined) continue
    if (value === DEFAULT_LEAD_BOOK_QUERY[key]) continue
    params.set(key, String(value))
  }
  return params
}

/** Contract's 1-based `page` → the 0-based index `TableFooter` expects. The one
 *  place this conversion happens. */
export function pageIndexFromQueryPage(page: number): number {
  return Math.max(0, page - 1)
}

/** The inverse of `pageIndexFromQueryPage`: a 0-based UI page index → the
 *  contract's 1-based `page`. */
export function queryPageFromPageIndex(index: number): number {
  return Math.max(0, index) + 1
}
