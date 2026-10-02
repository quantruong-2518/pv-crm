import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  OPPORTUNITY_STATE_LABEL,
  OWNER_NONE,
  OpportunitySortKey,
  type OpportunityBookQuery,
  type OpportunityBookRow,
  type OpportunityFacetsResponse,
  type OpportunityStatus,
  type WorkstreamHolder,
} from '@pv/contracts'
import type { TableColumn } from '@pv/ui'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import {
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  opportunityBookQueryToParams,
  parseOpportunityBookQuery,
} from '@/data/opportunities'
import type { MasRecipient } from '@/data/mas-mail-draft'

/** Module 3 · the deal book's logic without JSX: the address as the filter's
 *  source of truth, the tab order, the three quick filters and the bulk-mail
 *  tally. The screen is `opportunities.tsx`. */

/** Rows drawn per page; overrides the contract's default without writing it
 *  to the address, so a shared link carries no number nobody chose. */
export const PAGE_SIZE = 10

/** The "no filter on this axis" value of a native select, `undefined` on the wire. */
export const ANY = 'all'

const SEARCH_DELAY_MS = 300

/** The ten columns after the select box. Only the server's sort keys
 *  (`OpportunitySortKey`) get an arrow; a header that sorts nothing is a lie. */
export const BOOK_COLUMNS: TableColumn[] = [
  { header: 'Email', width: '176px' },
  { header: 'Cơ hội', width: 'minmax(224px,2fr)', sortKey: 'name' },
  { header: 'Giai đoạn', width: '1.3fr' },
  { header: 'Dự báo', width: '0.9fr' },
  { header: 'Giá trị', width: '0.8fr', align: 'right', sortKey: 'amount' },
  { header: 'Ngày chốt', width: '0.7fr', sortKey: 'expectedClose' },
  { header: 'BD Lead', width: '0.6fr' },
  { header: 'Sale', width: '0.6fr' },
  { header: 'Hoạt động cuối', width: '0.9fr' },
  { header: 'Việc tiếp theo', width: '1.8fr' },
]

/** Narrower than this the ten tracks crush, so the card scrolls sideways. */
export const TABLE_MIN_WIDTH = 'min-w-[1400px]'

/** The Email and deal columns stay put while the book scrolls sideways to the row acts.
 *  Email's fixed track is what lets the deal column know its `left` (176 + the 12px gap);
 *  each cell reaches over the gap after it, and paints the panel's own `--card`
 *  plus the row's tint, since glass-b would let the passing cells show. `clip`
 *  replaces DataTable's `hidden`, which made the table its own scroller. */
export const STICKY_LEAD = [
  'overflow-x-clip',
  '[&>[role=row]>:nth-child(2)]:sticky [&>[role=row]>:nth-child(2)]:left-0',
  '[&>[role=row]>:nth-child(3)]:sticky [&>[role=row]>:nth-child(3)]:left-[188px]',
  '[&>[role=row]>:nth-child(n+2):nth-child(-n+3)]:z-[1]',
  '[&>[role=row]>:nth-child(n+2):nth-child(-n+3)]:-mr-3',
  '[&>[role=row]>:nth-child(n+2):nth-child(-n+3)]:pr-3',
  '[&>[role=row]>:nth-child(n+2):nth-child(-n+3)]:bg-card',
  '[&>[role=row]>[role=cell]:nth-child(n+2):nth-child(-n+3)]:flex',
  '[&>[role=row]>[role=cell]:nth-child(n+2):nth-child(-n+3)]:flex-col',
  '[&>[role=row]>[role=cell]:nth-child(n+2):nth-child(-n+3)]:justify-center',
  '[&>[role=row]>[role=cell]:nth-child(n+2):nth-child(-n+3)]:self-stretch',
  '[&>[role=row]:first-child>:nth-child(n+2):nth-child(-n+3)]:bg-[color-mix(in_srgb,var(--surface-ink)_5%,var(--card))]',
  '[&>[role=row][aria-current=true]>:nth-child(n+2):nth-child(-n+3)]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]',
  '[&>[role=row][tabindex]:hover>:nth-child(n+2):nth-child(-n+3)]:bg-[color-mix(in_srgb,var(--surface-ink)_8%,var(--card))]',
  '[&>[role=row][tabindex]:focus-visible>:nth-child(n+2):nth-child(-n+3)]:bg-[color-mix(in_srgb,var(--surface-ink)_8%,var(--card))]',
].join(' ')

/** A deal's life in reading order — the enum puts `lost` before `won`. */
const TAB_ORDER: readonly OpportunityStatus[] = ['open', 'won', 'lost']

/** Tabs with counts; "all" is the sum of `byState` under the same filters. */
export function stateTabs(byState: OpportunityFacetsResponse['byState'] | undefined) {
  const all = byState ? Object.values(byState).reduce((sum, n) => sum + n, 0) : undefined
  return [
    { value: ANY, label: 'Tất cả', count: all },
    ...TAB_ORDER.map((state) => ({
      value: state as string,
      label: OPPORTUNITY_STATE_LABEL[state],
      count: byState?.[state],
    })),
  ]
}

export type QuickKey = keyof OpportunityFacetsResponse['quick']

/** Each quick filter as book axes — the same three the server counts in
 *  `facets.quick`, so a chip's number is what its click returns. */
export const QUICK_AXES: Record<QuickKey, Partial<OpportunityBookQuery>> = {
  awaitingAccept: { stage: 'new' },
  noSeller: { accepted: true, sale: OWNER_NONE },
  overdue: { overdue: true },
}

const QUICK_KEYS = Object.keys(QUICK_AXES) as QuickKey[]
const cleared = (axes: Partial<OpportunityBookQuery>) =>
  Object.fromEntries(Object.keys(axes).map((key) => [key, undefined]))

/** The chip in force, if any. One at a time: "awaiting accept" and "no seller"
 *  exclude each other, and a sum of two would not be any chip's count. */
export const activeQuick = (query: OpportunityBookQuery): QuickKey | null =>
  QUICK_KEYS.find((key) =>
    Object.entries(QUICK_AXES[key]).every(
      ([axis, value]) => query[axis as keyof OpportunityBookQuery] === value,
    ),
  ) ?? null

/** The query the chip counts are read under: everything but the chip itself. */
export function withoutQuick(query: OpportunityBookQuery): OpportunityBookQuery {
  const active = activeQuick(query)
  return active ? { ...query, ...cleared(QUICK_AXES[active]) } : query
}

/** The patch a chip press makes. All three chips are open deals only, so a
 *  closed-state tab falls back to "all" rather than answering zero. */
export function quickPatch(
  query: OpportunityBookQuery,
  key: QuickKey,
): Partial<OpportunityBookQuery> {
  const active = activeQuick(query)
  if (active === key) return cleared(QUICK_AXES[key])
  return {
    ...(active ? cleared(QUICK_AXES[active]) : {}),
    ...QUICK_AXES[key],
    state: query.state === 'open' ? 'open' : undefined,
  }
}

/** A person filter's choices, sorted by name so entries do not jump around. */
export const peopleOptions = (people: readonly WorkstreamHolder[]) =>
  people
    .map((p) => ({ value: p.id, label: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'))

/** Every filter axis but search, all `undefined` — the "clear all" patch. */
export const CLEARED_FILTERS = {
  state: undefined,
  stage: undefined,
  accepted: undefined,
  overdue: undefined,
  sale: undefined,
  bd: undefined,
  account: undefined,
} satisfies Partial<OpportunityBookQuery>

/** Reads the typed `text`, not `query.q`: the reset shows from the first key. */
export const isDirty = (query: OpportunityBookQuery, text: string) =>
  text.trim() !== '' ||
  Object.keys(CLEARED_FILTERS).some(
    (axis) => query[axis as keyof OpportunityBookQuery] !== undefined,
  )

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
  const head = `${sending} đơn sẽ nhận email`
  return skipped === 0 ? head : `${head} · ${skipped} đơn chưa có email`
}

/** The address is the filter's source of truth: Back returns to the book just
 *  left, and a shared link opens the book the sender saw. Search text lives in
 *  state and trickles to the address with `replace`, so Back is not undo. */
export function useBookAddress() {
  const [params, setParams] = useSearchParams()
  const urlQuery = useMemo(() => parseOpportunityBookQuery(params), [params])
  const query = useMemo<OpportunityBookQuery>(() => ({ ...urlQuery, size: PAGE_SIZE }), [urlQuery])
  const [text, setText] = useState(urlQuery.q ?? '')

  /* The address changed from outside (Back, F5, a link): the box follows. */
  useEffect(() => setText(urlQuery.q ?? ''), [urlQuery.q])

  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(
      () =>
        setParams(
          opportunityBookQueryToParams({
            ...urlQuery,
            q: wanted,
            page: DEFAULT_OPPORTUNITY_BOOK_QUERY.page,
          }),
          { replace: true },
        ),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams])

  /* A filter change always returns to page 1: page 3 of a narrower book is empty. */
  const patch = (next: Partial<OpportunityBookQuery>) =>
    setParams(
      opportunityBookQueryToParams({
        ...urlQuery,
        ...next,
        page: DEFAULT_OPPORTUNITY_BOOK_QUERY.page,
      }),
    )

  const goPage = (index: number) =>
    setParams(opportunityBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  return { urlQuery, query, text, setText, patch, goPage, setParams }
}

/** A page past the end (a stale `?page=3` link) is fixed in the ADDRESS, not
 *  only clamped for the footer — else the server keeps answering an empty
 *  page. Waits for data: before it, `total` is 0 and would bounce everyone. */
export function usePageClamp(
  { urlQuery, query, setParams }: ReturnType<typeof useBookAddress>,
  total: number | undefined,
) {
  const pageCount = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE))
  useEffect(() => {
    if (total === undefined) return
    if (pageIndexFromQueryPage(query.page) <= pageCount - 1) return
    setParams(
      opportunityBookQueryToParams({ ...urlQuery, page: DEFAULT_OPPORTUNITY_BOOK_QUERY.page }),
      { replace: true },
    )
  }, [total, query.page, pageCount, urlQuery, setParams])
  return { pageCount, pageIndex: Math.min(pageIndexFromQueryPage(query.page), pageCount - 1) }
}
