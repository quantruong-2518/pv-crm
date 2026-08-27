import { LeadBookQuery } from '@pv/contracts'

/** URL state for the lead book — the file promised (but not yet written) by
 *  the docblock on `LeadBookQuery` in `packages/contracts/src/sales/lead.ts`
 *  and by the handover note at `docs/ban-giao-lead.md`.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS HAS TO EXIST BEFORE THE BOOK CUTS TO THE SERVER
 *  ------------------------------------------------------------------
 *  `leads.tsx` today keeps every filter in local `useState` and slices the
 *  book on the client. Once `GET /sales/leads` does the filtering, sorting
 *  and paging, a filter that only lives in React state stops filtering the
 *  book — it filters whatever page the server happened to send. The fix is
 *  to make the URL the source of truth for `LeadBookQuery`: shareable links,
 *  a working back button, and F5 that does not wipe the filter row.
 *
 *  Pure translation only, both directions:
 *    `parseLeadBookQuery`   URLSearchParams → LeadBookQuery (validated)
 *    `leadBookQueryToParams` LeadBookQuery → URLSearchParams (defaults dropped)
 *
 *  No React here on purpose — the screen wraps these in its own hook later
 *  (`useSearchParams` from react-router already returns a URLSearchParams-
 *  compatible object, so these functions plug straight into it).
 *
 *  ------------------------------------------------------------------
 *  PARAMETER NAMES ARE THE CONTRACT'S NAMES, UNCHANGED
 *  ------------------------------------------------------------------
 *  Every key `LeadBookQuery.safeParse` accepts is read from and written to a
 *  URL param of THE SAME NAME (`stage`, `tier`, `category`, `status`,
 *  `source`, `owner`, `account`, `q`, `sort`, `dir`, `page`, `size`). Deriving
 *  the key list from `LeadBookQuery.shape` at runtime — instead of copying
 *  the field names into a second hand-written list — is what keeps this file
 *  from silently drifting out of sync the next time the contract grows a
 *  filter.
 *
 *  `owner` deserves a specific note: `OWNER_NONE` (`'chua-ai-nhan'`, see
 *  `lead.ts`) is a normal, valid VALUE of the owner axis — "nobody has taken
 *  it" — not the absence of a filter. It needs no special case below: it is
 *  just a non-empty string that is not the field's default (`undefined`), so
 *  it survives parsing and never gets stripped as "default" when writing.
 *
 *  ------------------------------------------------------------------
 *  A BROKEN URL FALLS BACK TO DEFAULTS, IT NEVER THROWS
 *  ------------------------------------------------------------------
 *  Someone can always hand-edit the address bar (`?status=nope`,
 *  `?page=abc`). `parseLeadBookQuery` runs `LeadBookQuery.safeParse` — never
 *  `.parse` — and on failure returns the same default query the screen would
 *  show with no URL at all. That fallback is for the WHOLE query, not
 *  per-field: `LeadBookQuery` is what defines which combinations are valid,
 *  and picking apart a failed parse to keep the "still good" fields would
 *  mean re-implementing that judgment call by hand instead of letting zod
 *  make it. A hand-edited URL landing on the default view beats a blank
 *  screen or a thrown error every time.
 *
 *  ------------------------------------------------------------------
 *  `page`: TWO WORLDS COUNT DIFFERENTLY, AND BOTH ARE STAYING
 *  ------------------------------------------------------------------
 *  `LeadBookQuery.page` (`PageQuery.page`, `packages/contracts/src/pagination.ts`)
 *  is 1-based: `min(1)`, first page is `1`. That is also what this file reads
 *  from and writes to the URL — the contract's own count, untouched, because
 *  the URL's `page` is the same number that ends up on the wire.
 *
 *  The shared `Pager` atom (`apps/web/src/components/table-bits.tsx`, used by
 *  both the lead book and the Ops book) and today's `leads.tsx` local `page`
 *  state are 0-based instead — first page is `0`, and the widget's own
 *  "previous" button is disabled on `page === 0`. `Pager` is not this
 *  migration's to change, so the mismatch does not go away; it just needs
 *  exactly one seam instead of a `+1`/`-1` copied into every future call
 *  site. `pageIndexFromQueryPage` / `queryPageFromPageIndex` below are that
 *  one seam. */

/** Every field name `LeadBookQuery` accepts, read once from the schema
 *  itself so this list cannot drift from the contract it mirrors. */
const LEAD_BOOK_QUERY_KEYS = Object.keys(LeadBookQuery.shape) as (keyof LeadBookQuery)[]

/** The query the screen shows with no URL params at all. Computed with
 *  `.parse` (not `.safeParse`) on purpose: an empty object failing here would
 *  mean `LeadBookQuery` gained a required field with no default, which is a
 *  contract regression that should fail loudly at import time, not hide
 *  behind a silent fallback.
 *
 *  Exported because the screen needs the same defaults this file writes
 *  against: "clear all filters" has to put every axis back to the value that
 *  gets DROPPED from the URL, and spelling those values out a second time in
 *  `leads.tsx` is how a cleared filter starts leaving `?status=running`
 *  behind. */
export const DEFAULT_LEAD_BOOK_QUERY: LeadBookQuery = LeadBookQuery.parse({})

/** Pick out only the params `LeadBookQuery` knows about, as plain strings —
 *  `URLSearchParams` values are always strings, which is exactly what
 *  `z.coerce.number()` on `page`/`size` expects to coerce from. */
function rawParamsOf(params: URLSearchParams): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const key of LEAD_BOOK_QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) raw[key] = value
  }
  return raw
}

/** URLSearchParams → LeadBookQuery, validated by the contract's own schema.
 *  Never throws: an invalid or malformed URL falls back to
 *  `DEFAULT_LEAD_BOOK_QUERY` in full — see the docblock above for why the
 *  fallback is whole-query rather than field-by-field. */
export function parseLeadBookQuery(params: URLSearchParams): LeadBookQuery {
  const result = LeadBookQuery.safeParse(rawParamsOf(params))
  return result.success ? result.data : DEFAULT_LEAD_BOOK_QUERY
}

/** LeadBookQuery → URLSearchParams, with every value that still matches the
 *  default dropped — a user who has not touched a filter must not see it
 *  appear on the address bar. */
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

/** Contract's 1-based `page` → the 0-based index `Pager` and today's
 *  `leads.tsx` state expect. The one place this conversion happens — see
 *  "`page`: two worlds count differently" above. */
export function pageIndexFromQueryPage(page: number): number {
  return Math.max(0, page - 1)
}

/** The inverse of `pageIndexFromQueryPage`: a 0-based UI page index → the
 *  contract's 1-based `page`. */
export function queryPageFromPageIndex(index: number): number {
  return Math.max(0, index) + 1
}
