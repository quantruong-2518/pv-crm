import { OWNER_NONE } from '@pv/contracts'

/** Column geometry and filter plumbing shared by the paged books (contracts,
 *  opportunities, leads, campaigns, workstreams). Plain data, no components, so
 *  the cells and filters that use it can live in component-only files.
 *
 *  Every width is a fixed px or `minmax(<px>, <fr>)`: a book's minimum width is
 *  then a sum, not a guess, and the last column can no longer clip because the
 *  hand-written `min-w-[…]` fell behind its tracks. */

/** Rows per table page. A fixed count lets `BookPage` reserve one height for
 *  loading, empty, short and full pages, so the card does not jump. */
export const BOOK_PAGE_SIZE = 10

/** Track presets by data kind. The minimums are sized so an eight-column book
 *  fits a 1440px window without scrolling sideways (the shell's padding and a
 *  scrollbar leave ~1377px); the `fr` parts share whatever is wider than that.
 *  `money` fits "10.500.000.000" whole, since MoneyCell never truncates. */
export const COL = {
  select: '48px',
  pin: '48px',
  code: '112px',
  name: 'minmax(200px,2.2fr)',
  text: 'minmax(144px,1.4fr)',
  status: 'minmax(128px,1fr)',
  person: 'minmax(160px,1.2fr)',
  date: '112px',
  moment: '120px',
  money: '152px',
  number: '96px',
} as const

/** The unit an amount filter is typed in and its chip says: people say five
 *  hundred million, not nine zeros. */
export const AMOUNT_UNIT = 'triệu ₫'
export const AMOUNT_SCALE = 1e6

/** DataTable `flush`: `gap-3` between tracks, `px-5` on each row. */
const TRACK_GAP_PX = 12
const ROW_PADDING_PX = 40

/** The px a track cannot shrink below; a bare `fr` or `minmax(0,…)` is 0. */
function trackMinPx(track: string): number {
  const t = track.trim()
  const min = t.startsWith('minmax(') ? (t.slice(7).split(',')[0] ?? '') : t
  const px = /^(\d+(?:\.\d+)?)px$/.exec(min.trim())
  return px ? Number(px[1]) : 0
}

/** Narrower than this the tracks overlap, so the card scrolls sideways instead. */
export function bookMinWidth(widths: readonly string[]): number {
  const tracks = widths.reduce((sum, w) => sum + trackMinPx(w), 0)
  return tracks + Math.max(0, widths.length - 1) * TRACK_GAP_PX + ROW_PADDING_PX
}

/** A comma list in the address, as the picks a `ColumnFilterList` holds. */
export const csvOf = (v?: string): string[] => (v ? v.split(',') : [])

/** Back to the address; nothing picked drops the key instead of writing "". */
export const toCsv = (values: readonly string[]): string | undefined =>
  values.length > 0 ? values.join(',') : undefined

export type FilterOption<V extends string = string> = { value: V; label: string; count?: number }

/** Options for a closed value set — a status, a stage — named by its label map. */
export function labelOptions<K extends string>(
  keys: readonly K[],
  labels: Record<K, string>,
  counts?: Partial<Record<K, number>>,
): FilterOption<K>[] {
  return keys.map((k) => ({ value: k, label: labels[k], count: counts?.[k] }))
}

/** Options for a person column. `none` labels the "nobody yet" pick, offered
 *  first so it never sinks among the names. */
export function peopleOptions(
  people: readonly { id: string; name: string }[],
  none?: string,
  counts?: Record<string, number>,
): FilterOption[] {
  const nobody = none === undefined ? [] : [{ value: OWNER_NONE, label: none }]
  return [...nobody, ...people.map((p) => ({ value: p.id, label: p.name }))].map((o) => ({
    ...o,
    count: counts?.[o.value],
  }))
}
