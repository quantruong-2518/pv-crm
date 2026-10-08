import { useState, type ReactNode } from 'react'
import {
  OpportunitySortKey,
  type OpportunityBookQuery,
  type OpportunityBookRow,
  type OpportunityFacetsResponse,
  type OpportunityStatus,
  type WorkstreamHolder,
} from '@pv/contracts'
import type { TableColumn } from '@pv/ui'
import type { MasRecipient } from '@/data/mas-mail-draft'

/** Module 3 · the deal book's logic without JSX: the address as the filter's
 *  source of truth, the tab order and the bulk-mail
 *  tally. The screen is `opportunities.tsx`. */

/** Rows drawn per page; overrides the contract's default without writing it
 *  to the address, so a shared link carries no number nobody chose. */
export const PAGE_SIZE = 10

/** The "no filter on this axis" value of a native select, `undefined` on the wire. */
export const ANY = 'all'

/** The eight columns after the select box, filters in their headers
 *  (`opportunities-filters.tsx`). Only the server's sort keys
 *  (`OpportunitySortKey`) get an arrow; a header that sorts nothing is a lie. */
export const bookColumns = (
  filters: Record<'account' | 'stage' | 'bd' | 'sale', ReactNode>,
): TableColumn[] => [
  { header: 'Cơ hội', width: 'minmax(224px,2fr)', sortKey: 'name', filter: filters.account },
  { header: filters.stage, width: 'minmax(112px,1fr)' },
  /* Fixed tracks: full digits up to tens of billions, and the lead book's person width. */
  { header: 'Giá trị (₫)', width: '144px', align: 'right', sortKey: 'amount' },
  { header: 'Dự kiến chốt', width: '128px', align: 'center', sortKey: 'expectedClose' },
  { header: filters.bd, width: '140px', align: 'center' },
  { header: filters.sale, width: '140px', align: 'center' },
  { header: 'Tương tác gần nhất', width: 'minmax(144px,1fr)' },
  { header: 'Việc cần làm tiếp', width: '1.6fr' },
]

/** Narrower than this the eight tracks crush, so the card scrolls sideways.
 *  Sized so the floored headers above stay on one line and the last column
 *  still has room for "title · due". */
export const TABLE_MIN_WIDTH = 'min-w-[1360px]'

/** The deal column stays put while the book scrolls sideways to the row acts.
 *  Its cell reaches over the gap after it, and paints the panel's own `--card`
 *  plus the row's tint, since glass-b would let the passing cells show. `clip`
 *  replaces DataTable's `hidden`, which made the table its own scroller. */
export const STICKY_LEAD = [
  'overflow-x-clip',
  '[&>[role=row]>:nth-child(2)]:sticky [&>[role=row]>:nth-child(2)]:left-0',
  '[&>[role=row]>:nth-child(2)]:z-[1]',
  '[&>[role=row]>:nth-child(2)]:-mr-3',
  '[&>[role=row]>:nth-child(2)]:pr-3',
  '[&>[role=row]>:nth-child(2)]:bg-card',
  /* The cell's tint must fade in step with the row's own (`.motion-std`). */
  '[&>[role=row]>:nth-child(2)]:transition-colors',
  '[&>[role=row]>:nth-child(2)]:duration-[var(--motion-duration)]',
  '[&>[role=row]>:nth-child(2)]:ease-[var(--motion-ease)]',
  /* No hover lift here: the neighbours' opaque lead cells would cut its shadow. */
  '[&>[role=row]:not([aria-current=true]):hover]:shadow-none',
  '[&>[role=row]>[role=cell]:nth-child(2)]:flex',
  '[&>[role=row]>[role=cell]:nth-child(2)]:flex-col',
  '[&>[role=row]>[role=cell]:nth-child(2)]:justify-center',
  '[&>[role=row]>[role=cell]:nth-child(2)]:self-stretch',
  '[&>[role=row]:first-child>:nth-child(2)]:bg-[color-mix(in_srgb,var(--surface-ink)_5%,var(--card))]',
  '[&>[role=row][aria-current=true]>:nth-child(2)]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]',
  '[&>[role=row][tabindex]:hover>:nth-child(2)]:bg-[color-mix(in_srgb,var(--surface-ink)_8%,var(--card))]',
  '[&>[role=row][tabindex]:focus-visible>:nth-child(2)]:bg-[color-mix(in_srgb,var(--surface-ink)_8%,var(--card))]',
].join(' ')

/** A deal's life in reading order — the enum puts `lost` before `won`. */
const TAB_ORDER: readonly OpportunityStatus[] = ['open', 'won', 'lost']
const TAB_LABEL: Record<OpportunityStatus, string> = {
  open: 'Đang theo đuổi',
  won: 'Đã ký hợp đồng',
  lost: 'Đã dừng',
}

/** Tabs with counts; "all" is the sum of `byState` under the same filters. */
export function stateTabs(byState: OpportunityFacetsResponse['byState'] | undefined) {
  const all = byState ? Object.values(byState).reduce((sum, n) => sum + n, 0) : undefined
  return [
    { value: ANY, label: 'Tất cả', count: all },
    ...TAB_ORDER.map((state) => ({
      value: state as string,
      label: TAB_LABEL[state],
      count: byState?.[state],
    })),
  ]
}

/** The values of a comma-list filter, `[]` while the filter is off. */
export const csvOf = (csv?: string) => (csv ? csv.split(',') : [])

/** A person filter's choices, sorted by name so entries do not jump around. */
export const peopleOptions = (people: readonly WorkstreamHolder[]) =>
  people
    .map((p) => ({ value: p.id, label: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'))

/** What an empty page says. The pinned tab with nothing pinned gets its own
 *  sentence, and no "clear filters": there is no filter to blame. */
export function emptyOf(opts: {
  pinnedView: boolean
  dirty: boolean
  onClear: () => void
  onSeeLeads: () => void
}) {
  if (opts.pinnedView) {
    return {
      message: 'Chưa ghim cơ hội nào. Ghim từ cột cuối của sổ.',
      action: { label: 'Xem tất cả cơ hội', onClick: opts.onClear },
    }
  }
  return opts.dirty
    ? {
        message: 'Không có cơ hội nào phù hợp với bộ lọc hiện tại.',
        action: { label: 'Bỏ hết bộ lọc', onClick: opts.onClear },
      }
    : {
        message: 'Chưa có cơ hội nào. Hãy mở cơ hội từ một lead tiềm năng.',
        action: { label: 'Xem sổ lead', onClick: opts.onSeeLeads },
      }
}

/** The axes `useBookQuery` counts as filters — the keys its `clear` resets. */
export const FILTER_KEYS = [
  'state',
  'stage',
  'accepted',
  'overdue',
  'sale',
  'bd',
  'account',
  'pinned',
] as const satisfies readonly (keyof OpportunityBookQuery)[]

/** A header press: the same column flips direction, a new one starts ascending.
 *  A key the server does not sort by is dropped here rather than sent as a 400. */
export function sortPatch(
  query: OpportunityBookQuery,
  key: string,
): Partial<OpportunityBookQuery> | null {
  const parsed = OpportunitySortKey.safeParse(key)
  if (!parsed.success) return null
  return query.sort === parsed.data
    ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
    : { sort: parsed.data, dir: 'asc' }
}

const NO_RECIPIENTS: ReadonlyMap<string, MasRecipient> = new Map()

/** Recipients of every page shown so far — selected codes outlive paging. */
export function useMailable(rows: OpportunityBookRow[] | undefined) {
  const [mailable, setMailable] = useState(NO_RECIPIENTS)
  const [seen, setSeen] = useState<OpportunityBookRow[] | undefined>(undefined)
  if (seen !== rows) {
    setSeen(rows)
    setMailable((prev) => withRecipients(prev, rows ?? []))
  }
  return mailable
}

/** Adds a page's rows that have a primary contact. A row without one has no
 *  one to address; `mailTally` counts it as skipped instead of hiding it. */
function withRecipients(
  known: ReadonlyMap<string, MasRecipient>,
  rows: readonly OpportunityBookRow[],
): ReadonlyMap<string, MasRecipient> {
  const next = new Map(known)
  for (const op of rows) {
    if (!op.primaryContact) continue
    next.set(op.code, {
      code: op.code,
      leadCode: op.leadCode,
      company: op.account,
      contactName: op.primaryContact.name,
      email: op.primaryContact.email ?? '',
      destinationLabel: op.name,
    })
  }
  return next
}

/** How many picked deals will get the mail, and how many are skipped. */
export function mailTally(
  selected: ReadonlySet<string>,
  recipients: ReadonlyMap<string, MasRecipient>,
): string {
  const sending = [...selected].filter((code) => Boolean(recipients.get(code)?.email)).length
  const skipped = selected.size - sending
  const head = `Sẽ gửi ${sending} email`
  return skipped === 0 ? head : `${head} · bỏ qua ${skipped} cơ hội chưa có địa chỉ email`
}
