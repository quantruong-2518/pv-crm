import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  ColumnFilter,
  ColumnFilterList,
  Icon,
  Plus,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  type TableColumn,
  type TableRowModel,
  type TableSort,
} from '@pv/ui'
import type { PartnerRow as Partner } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { listField, oneOf, useClientBookFilter, type BookFilters } from '@/app/client-book-filter'
import { isApiError, userMessage } from '@/app/api'
import { useOriginNames } from '@/data/lead-origins'
import { fuzzyRank } from '@/lib/fuzzy-rank'
import { searchableText } from '@/lib/search-box'
import { partnersQuery } from '@/data/partners'
import { BookCount, BookPage } from '@/components/book-page'
import { FilterSection, SortSelect, ViewSwitch } from '@/components/book-cards'
import { noop, useBookView } from '@/components/book-view'
import { CopyRef, PartnerCardGrid } from '@/components/partner-cards'
import { FilterMenu } from '@/components/table-bits'
import { AddPartnerModal, EditPartnerModal } from './partners-parts'
import { message, useI18n } from '@/app/i18n'

/** Partner book — who sends us leads, picked by `REFERRER`-asking
 *  motions on the create form and the import panel.
 *
 *  Same shape and same gate as `lead-origins.tsx`: the route asks
 *  `lead-origin.manage`, so every reader may act on every row. A partner's
 *  origin decides the origin its referred leads inherit, which is why the
 *  write sits with the people who own the origin catalog.
 *
 *  NO CONTEXTRAIL (law 10), for the reason `lead-origins.tsx` gives: a partner
 *  is a catalog entry, not an E1 object, and sits on no story chain. */

const NO_PARTNERS: Partner[] = []
const WHOLE_BOOK = { includeInactive: true }

/** `active` is the default tab, as the old "show hidden" box was off. */
const PARTNER_TABS = ['active', 'hidden', 'all'] as const

/** Address keys of this book. Module-level so the hook's memo key is stable. */
const PARTNER_FILTERS = {
  view: oneOf(PARTNER_TABS, 'active'),
  origin: listField(),
}

type PartnerFilters = BookFilters<typeof PARTNER_FILTERS>

/** Pure: search covers code and name; `view: undefined` skips the tab, for its counts. */
function filterPartnerBook(
  rows: Partner[],
  f: Omit<PartnerFilters, 'view'> & { view?: PartnerFilters['view'] },
): Partner[] {
  const searched = fuzzyRank(rows, f.q, (p) => [p.code, p.ref, p.name])
  return searched.filter((p) => {
    if (f.view === 'active' && !p.active) return false
    if (f.view === 'hidden' && p.active) return false
    return f.origin.length === 0 || f.origin.includes(p.originId)
  })
}

/** Name sorts in Vietnamese order; the rest by count. Other keys never arrive. */
const PARTNER_SORTS: Record<string, (a: Partner, b: Partner) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'vi'),
  leads: (a, b) => a.leads - b.leads,
  opportunities: (a, b) => a.opportunities - b.opportunities,
  contracts: (a, b) => a.contracts - b.contracts,
}

/** The rows to draw, sorted, plus each tab's count. Counts follow the search and
 *  origin filter but not the tab, so a tab never promises rows the table lacks. */
function partnerView(all: Partner[], filters: PartnerFilters, sort: TableSort) {
  const compare = PARTNER_SORTS[sort.key]
  const found = filterPartnerBook(all, filters)
  const asc = compare ? [...found].sort(compare) : []
  const beforeView = filterPartnerBook(all, { ...filters, view: undefined })
  const active = beforeView.filter((p) => p.active).length
  /* While searching, best match first like the server books; the column sort resumes after. */
  const searching = searchableText(filters.q) !== undefined
  return {
    rows: searching ? found : sort.dir === 'asc' ? asc : asc.reverse(),
    counts: { active, hidden: beforeView.length - active, all: beforeView.length },
  }
}

/** Grid has no column headers, so the sorts the table offers become one pick. */
const partnerSortOptions = (t: (copy: ReturnType<typeof message>) => string) => [
  { value: 'name:asc', label: t(message('Tên A → Z', 'Name A → Z', '이름 A → Z')) },
  { value: 'name:desc', label: t(message('Tên Z → A', 'Name Z → A', '이름 Z → A')) },
  { value: 'leads:desc', label: t(message('Nhiều lead nhất', 'Most leads', '리드 많은순')) },
  {
    value: 'opportunities:desc',
    label: t(message('Nhiều cơ hội nhất', 'Most opportunities', '기회 많은순')),
  },
  {
    value: 'contracts:desc',
    label: t(message('Nhiều hợp đồng nhất', 'Most contracts', '계약 많은순')),
  },
]

/** Cells of one book row, in column order: who, ref, kind, three counts, state. */
function partnerCells(
  p: Partner,
  originName: string,
  t: (copy: ReturnType<typeof message>) => string,
): ReactNode[] {
  return [
    <span key="n" className="truncate text-[12.5px] font-semibold">
      {p.name}
    </span>,
    <span key="r" className="flex items-center gap-1">
      <Badge tone="draft" className="font-mono">
        {p.ref}
      </Badge>
      <CopyRef value={p.ref} />
    </span>,
    <span key="o" className="truncate text-[12.5px]">
      {originName}
    </span>,
    ...[p.leads, p.opportunities, p.contracts].map((n, k) => (
      <span key={`n${k}`} className="text-[12.5px] tabular-nums">
        {n}
      </span>
    )),
    p.active ? (
      <Badge key="s" tone="success">
        {t(message('Đang dùng', 'Active', '사용 중'))}
      </Badge>
    ) : (
      <Badge key="s" tone="draft">
        {t(message('Đã ẩn', 'Hidden', '숨김'))}
      </Badge>
    ),
  ]
}

const partnerColumns = (
  originFilter: ReactNode,
  t: (copy: ReturnType<typeof message>) => string,
): TableColumn[] => [
  { header: t(message('Đối tác', 'Partner', '파트너')), width: 'minmax(0,2fr)', sortKey: 'name' },
  { header: t(message('Mã ref', 'Referral code', '추천 코드')), width: '168px', align: 'center' },
  { header: originFilter, width: 'minmax(0,1.2fr)', align: 'center' },
  { header: 'Lead', width: '88px', sortKey: 'leads', align: 'center' },
  {
    header: t(message('Cơ hội', 'Opportunities', '기회')),
    width: '88px',
    sortKey: 'opportunities',
    align: 'center',
  },
  {
    header: t(message('Hợp đồng', 'Contracts', '계약')),
    width: '104px',
    sortKey: 'contracts',
    align: 'center',
  },
  { header: t(message('Trạng thái', 'Status', '상태')), width: '128px', align: 'center' },
]

const nextSort = (cur: TableSort, key: string): TableSort =>
  cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }

const TEXT = {
  searchByPartnerNameOr: message(
    'Tìm theo tên hoặc mã đối tác…',
    'Search by partner name or code…',
    '파트너 이름 또는 코드 검색…',
  ),
  noPartnersMatchTheseFilters: message(
    'Không có đối tác nào khớp bộ lọc.',
    'No partners match these filters.',
    '필터와 일치하는 파트너가 없습니다.',
  ),
}

type Say = (copy: ReturnType<typeof message>) => string

const partnerTabLabel = (value: (typeof PARTNER_TABS)[number], t: Say) =>
  value === 'active'
    ? t(message('Đang dùng', 'Active', '사용 중'))
    : value === 'hidden'
      ? t(message('Đã ẩn', 'Hidden', '숨김'))
      : t(message('Tất cả', 'All', '전체'))

/** The banner for a failed read: what failed, then why or "try again". */
function partnerFailure(error: unknown, onRetry: () => void, t: Say) {
  return {
    message: `${t(message('Không tải được danh sách đối tác.', 'Could not load partners.', '파트너 목록을 불러오지 못했습니다.'))} ${
      isApiError(error)
        ? userMessage(error)
        : t(message('Thử lại.', 'Please try again.', '다시 시도해 주세요.'))
    }`,
    onRetry,
  }
}

/** The empty state: filters hiding every row, or a book with no partner yet. */
function partnerEmpty(args: { dirty: boolean; clear: () => void; openAdd: () => void; t: Say }) {
  const { dirty, clear, openAdd, t } = args
  if (dirty) {
    return {
      message: t(TEXT.noPartnersMatchTheseFilters),
      action: {
        label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
        onClick: clear,
      },
    }
  }
  return {
    message: t(message('Chưa có đối tác nào.', 'No partners yet.', '파트너가 없습니다.')),
    action: {
      label: t(message('Thêm đối tác', 'Add partner', '파트너 추가')),
      onClick: openAdd,
    },
  }
}

export function PartnersPage() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const originNames = useOriginNames()
  const [view, setView] = useBookView('pv.partners.view')

  const book = useClientBookFilter(PARTNER_FILTERS)
  const { filters, patch } = book
  const [sort, setSort] = useState<TableSort>({ key: 'name', dir: 'asc' })
  const [adding, setAdding] = useState(false)
  /* Bumped on every opening, so the add modal remounts with a blank form. */
  const [addSeq, setAddSeq] = useState(0)
  const openAdd = () => {
    setAddSeq((n) => n + 1)
    setAdding(true)
  }
  const [editingCode, setEditingCode] = useState<string | null>(null)

  const { data, isPending, error, refetch } = useQuery(partnersQuery(WHOLE_BOOK))
  const all = data?.rows ?? NO_PARTNERS
  /* Read back from the live list, so the modal follows each write's re-read. */
  const editing = all.find((p) => p.code === editingCode) ?? null

  const originOptions = useMemo(
    () =>
      [...new Set(all.map((p) => p.originId))]
        .map((id) => ({ value: id, label: originNames.get(id) ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [all, originNames],
  )

  const { rows, counts } = useMemo(() => partnerView(all, filters, sort), [all, filters, sort])
  const toggleSort = (key: string) => setSort((cur) => nextSort(cur, key))

  /* One body, laid in the column popover for the table and in the grid's filter menu. */
  const originBody = (close: () => void) => (
    <ColumnFilterList
      options={originOptions}
      selected={filters.origin}
      close={close}
      onApply={(origin) => patch({ origin })}
    />
  )
  const originFilter = (
    <ColumnFilter
      label={t(message('Nguồn lead', 'Lead source', '리드 출처'))}
      active={filters.origin.length > 0}
    >
      {originBody}
    </ColumnFilter>
  )
  const originNameOf = (id: string) => originNames.get(id) ?? id

  const tableRows: TableRowModel[] = rows.map((p) => ({
    id: p.code,
    onOpen: () => setEditingCode(p.code),
    cells: partnerCells(p, originNameOf(p.originId), t),
  }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(message('Đối tác', 'Partners', '파트너'))}
          actions={
            <Button size="md" className="pointer-coarse:h-12 max-sm:flex-1" onClick={openAdd}>
              <Icon icon={Plus} size={16} />
              {t(message('Thêm đối tác', 'Add partner', '파트너 추가'))}
            </Button>
          }
          tabs={
            <SegmentedControl
              label={t(message('Trạng thái', 'Status', '상태'))}
              hideLabel
              tone="quiet"
              value={filters.view}
              onChange={(v) => patch({ view: PARTNER_TABS.find((value) => value === v) })}
              options={PARTNER_TABS.map((value) => ({
                value,
                label: partnerTabLabel(value, t),
                count: counts[value],
              }))}
            />
          }
          count={
            <BookCount total={rows.length} noun={t(message('đối tác', 'partners', '파트너'))} />
          }
          tools={
            <>
              <SearchField
                placeholder={t(TEXT.searchByPartnerNameOr)}
                value={book.text}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {view === 'grid' && (
                <>
                  <SortSelect
                    options={partnerSortOptions(t)}
                    sort={sort.key}
                    dir={sort.dir}
                    onChange={(key, dir) => setSort({ key, dir })}
                  />
                  <FilterMenu
                    label={t(message('Bộ lọc sổ đối tác', 'Partner filters', '파트너 필터'))}
                    active={filters.origin.length > 0 ? 1 : 0}
                  >
                    <FilterSection title={t(message('Nguồn lead', 'Lead source', '리드 출처'))}>
                      {originBody(noop)}
                    </FilterSection>
                  </FilterMenu>
                </>
              )}
              <ViewSwitch value={view} onChange={setView} />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  onClick={book.clear}
                  className="pointer-coarse:h-12"
                >
                  {t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'))}
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={error ? partnerFailure(error, () => void refetch(), t) : undefined}
          empty={
            rows.length === 0
              ? partnerEmpty({ dirty: book.dirty, clear: book.clear, openAdd, t })
              : undefined
          }
          cards={
            view === 'grid' ? (
              <PartnerCardGrid rows={rows} originName={originNameOf} onOpen={setEditingCode} />
            ) : undefined
          }
          table={
            view === 'table'
              ? {
                  minWidth: 'min-w-[820px]',
                  sort,
                  onSort: toggleSort,
                  columns: partnerColumns(originFilter, t),
                  rows: tableRows,
                }
              : undefined
          }
        />

        <AddPartnerModal key={addSeq} open={adding} onClose={() => setAdding(false)} />
        <EditPartnerModal partner={editing} onClose={() => setEditingCode(null)} />
      </ScreenLayout>
    </AppShell>
  )
}

export default PartnersPage
