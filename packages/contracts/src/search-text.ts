import { z } from 'zod'

/** Free-text search, one rule for every box (owner decision 20/10): accents
 *  and case never matter, a typo still finds the record, and nothing searches
 *  under `SEARCH_MIN_CHARS` — a trigram index cannot help below three letters.
 *
 *  The server runs the same rule in SQL (`apps/api/src/platform/db/fuzzy.ts`,
 *  `sales.fold` + pg_trgm `<%`); `fuzzyScore` is its browser twin for lists the
 *  page already holds, so both ends rank a row the same way. */
export const SEARCH_MIN_CHARS = 3
export const SEARCH_MAX_CHARS = 120

/** Between two failures on seeded data: 0.4 let "ban dan" bring back
 *  "Dang Minh Tri"; pg_trgm's default 0.6 drops most typos. */
export const WORD_SIMILARITY_FLOOR = 0.5

/** A typo match scores under the substring tier (1) even at full similarity, so
 *  "direct hit" is always `score >= 1` on both ends. */
export const TYPO_SCORE_CAP = 0.99

/** A `q` too short to search reads as no filter, not a 400: a book that kept its
 *  last valid address would stay filtered by "abc" after backspacing to "ab".
 *  NFC because the SQL fold only knows precomposed letters. */
export const searchText = z
  .string()
  .trim()
  .max(SEARCH_MAX_CHARS)
  .transform((q) => q.normalize('NFC'))
  .transform((q) => (q.length >= SEARCH_MIN_CHARS ? q : undefined))
  .optional()

/** Twin of `sales.fold` for precomposed Vietnamese: marks off, d-stroke to d, lowercase. */
export function foldSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
}

/** pg_trgm's trigrams in order: each alphanumeric word padded "  w ". */
function trigramsOf(folded: string): string[] {
  const out: string[] = []
  for (const word of folded.split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3))
  }
  return out
}

/** pg_trgm `word_similarity`: the best match of the query's trigram set
 *  against any continuous run of the text's trigrams. */
function wordSimilarity(needle: string, folded: string): number {
  const q = new Set(trigramsOf(needle))
  const t = trigramsOf(folded)
  if (q.size === 0 || t.length === 0) return 0
  let best = 0
  for (let i = 0; i < t.length; i++) {
    const run = new Set<string>()
    let shared = 0
    for (let j = i; j < t.length; j++) {
      const g = t[j]!
      if (run.has(g)) continue
      run.add(g)
      if (q.has(g)) shared++
      best = Math.max(best, shared / (q.size + run.size - shared))
    }
  }
  return best
}

/** Rank of `text` for query `q`, 0 for no match — same tiers as the SQL rank:
 *  3 equal, 2 prefix, 1 substring, else word similarity at or over the floor. */
export function fuzzyScore(q: string, text: string | null | undefined): number {
  if (!text) return 0
  const n = foldSearch(q.trim())
  const f = foldSearch(text)
  if (n.length < SEARCH_MIN_CHARS) return 0
  if (f === n) return 3
  if (f.startsWith(n)) return 2
  if (f.includes(n)) return 1
  const s = wordSimilarity(n, f)
  return s >= WORD_SIMILARITY_FLOOR ? Math.min(s, TYPO_SCORE_CAP) : 0
}

/** Best score of a row across its searchable fields. */
export function fuzzyBest(q: string, fields: ReadonlyArray<string | null | undefined>): number {
  return fields.reduce<number>((best, f) => Math.max(best, fuzzyScore(q, f)), 0)
}
