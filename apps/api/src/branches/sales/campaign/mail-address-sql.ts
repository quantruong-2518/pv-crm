import { sql, type AnyColumn, type SQL } from 'drizzle-orm'

/** Everything JS `String.trim()` strips that can sit at the edge of a stored
 *  address: space, tab, line breaks, form feed, vertical tab, NBSP, BOM. */
const EDGE = ' \t\n\r\f\v ﻿'

/** A stored mail address with its edges cleaned the way JS `trim()` would.
 *
 *  SQL `trim()` strips spaces only, so an address saved with a trailing tab or
 *  line break (a paste, an old import) read back "untrimmed": the preflight
 *  answer then failed its own email check and the whole audience errored, and
 *  the suppression join compared `x@y.vn<tab>` with `x@y.vn` and missed. Both
 *  send paths read addresses through this so the block list, the verdicts and
 *  the recipient that is filed all see one normal form. */
export const edgeTrimmed = (column: AnyColumn): SQL<string> =>
  sql<string>`btrim(${column}, ${EDGE})`
