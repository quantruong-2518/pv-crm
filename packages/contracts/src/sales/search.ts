import { z } from 'zod'
import { Moment } from '../primitives'

/** Global search (header box): `GET /sales/search`, plus the per-user recent
 *  list at `GET|POST /sales/search/recent`.
 *
 *  `code` on a hit is the code of the record to OPEN, not of the record that
 *  matched: a `contact` hit carries its parent lead's code, so one click always
 *  lands on a real profile. `matched` says why the row appeared, so the row can
 *  read "Contact: Nguyen Van A" instead of looking like a stray result.
 *
 *  Recent items are re-resolved server-side from `kind + code`; a record the
 *  user can no longer see simply drops out of the list. */

export const SEARCH_KINDS = [
  'lead',
  'account',
  'contact',
  'opportunity',
  'campaign',
  'contract',
] as const
export const SearchKind = z.enum(SEARCH_KINDS)
export type SearchKind = z.infer<typeof SearchKind>

/** `kinds` is a comma-separated string, like `states` on the lead book: a query
 *  string has no arrays, and each part is checked here so a typo is a 400.
 *  `q` is composed to NFC: the SQL fold only knows precomposed letters. */
export const SearchQuery = z.object({
  q: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .transform((q) => q.normalize('NFC')),
  kinds: z
    .string()
    .max(200)
    .refine((v) => v.split(',').every((k) => SearchKind.safeParse(k).success))
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
})
export type SearchQuery = z.infer<typeof SearchQuery>

export const SearchMatchField = z.enum(['title', 'code', 'contact', 'email', 'phone', 'taxCode'])
export type SearchMatchField = z.infer<typeof SearchMatchField>

export const SearchHit = z.object({
  kind: SearchKind,
  code: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  matched: z.object({ field: SearchMatchField, text: z.string() }),
  score: z.number(),
})
export type SearchHit = z.infer<typeof SearchHit>

/** `more` is true when the group had hits beyond `limit`, so the UI can offer
 *  "see all" without a second count query. */
export const SearchResult = z.object({
  groups: z.array(z.object({ kind: SearchKind, hits: z.array(SearchHit), more: z.boolean() })),
})
export type SearchResult = z.infer<typeof SearchResult>

/** `q` may be empty here: a pick can be logged with no text typed, and a
 *  zero-result search is logged on close to be audited later. */
export const SearchRecentWrite = z.object({
  q: z.string().trim().max(120),
  kinds: z.array(SearchKind).max(SEARCH_KINDS.length).optional(),
  picked: z.object({ kind: SearchKind, code: z.string().min(1).max(64) }).optional(),
  resultCount: z.number().int().nonnegative().max(1000),
})
export type SearchRecentWrite = z.infer<typeof SearchRecentWrite>

export const SearchRecentItem = z.discriminatedUnion('type', [
  z.object({ type: z.literal('query'), q: z.string().min(1), at: Moment }),
  z.object({ type: z.literal('record'), hit: SearchHit, at: Moment }),
])
export type SearchRecentItem = z.infer<typeof SearchRecentItem>

export const SearchRecentResult = z.object({ items: z.array(SearchRecentItem) })
export type SearchRecentResult = z.infer<typeof SearchRecentResult>
