import { useMemo, useState } from 'react'
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
  type TableRowModel,
  type TableSort,
} from '@pv/ui'
import type { Partner } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { listField, oneOf, useClientBookFilter, type BookFilters } from '@/app/client-book-filter'
import { isApiError, userMessage } from '@/app/api'
import { useOriginNames } from '@/data/lead-origins'
import { normalise } from '@/data/intake'
import { partnersQuery } from '@/data/partners'
import { BookCount, BookPage } from '@/components/book-page'
import { AddPartnerModal, EditPartnerModal } from './partners-parts'

/** Admin · the partner book — who sends us leads, picked by `REFERRER`-asking
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
const PARTNER_TABS = [
  { value: 'active', label: 'Đang dùng' },
  { value: 'hidden', label: 'Đã ẩn' },
  { value: 'all', label: 'Tất cả' },
] as const

/** Address keys of this book. Module-level so the hook's memo key is stable. */
const PARTNER_FILTERS = {
  view: oneOf(
    PARTNER_TABS.map((t) => t.value),
    'active',
  ),
  origin: listField(),
}

type PartnerFilters = BookFilters<typeof PARTNER_FILTERS>

/** Pure: search covers code and name; `view: undefined` skips the tab, for its counts. */
function filterPartnerBook(
  rows: Partner[],
  f: Omit<PartnerFilters, 'view'> & { view?: PartnerFilters['view'] },
): Partner[] {
  const needle = normalise(f.q)
  return rows.filter((p) => {
    if (needle && !normalise(`${p.code} ${p.name}`).includes(needle)) return false
    if (f.view === 'active' && !p.active) return false
    if (f.view === 'hidden' && p.active) return false
    return f.origin.length === 0 || f.origin.includes(p.originId)
  })
}

/** Name sorts in Vietnamese order; code is a plain string. Other keys never arrive. */
const PARTNER_SORTS: Record<string, (a: Partner, b: Partner) => number> = {
  code: (a, b) => a.code.localeCompare(b.code),
  name: (a, b) => a.name.localeCompare(b.name, 'vi'),
}

/** The rows to draw, sorted, plus each tab's count. Counts follow the search and
 *  origin filter but not the tab, so a tab never promises rows the table lacks. */
function partnerView(all: Partner[], filters: PartnerFilters, sort: TableSort) {
  const compare = PARTNER_SORTS[sort.key]
  const asc = compare ? [...filterPartnerBook(all, filters)].sort(compare) : []
  const beforeView = filterPartnerBook(all, { ...filters, view: undefined })
  const active = beforeView.filter((p) => p.active).length
  return {
    rows: sort.dir === 'asc' ? asc : asc.reverse(),
    counts: { active, hidden: beforeView.length - active, all: beforeView.length },
  }
}

const nextSort = (cur: TableSort, key: string): TableSort =>
  cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }

export function PartnersPage() {
  const chrome = useAppChrome()
  const originNames = useOriginNames()

  const book = useClientBookFilter(PARTNER_FILTERS)
  const { filters, patch } = book
  const [sort, setSort] = useState<TableSort>({ key: 'code', dir: 'asc' })
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

  const originFilter = (
    <ColumnFilter label="Nguồn lead" active={filters.origin.length > 0}>
      {(close) => (
        <ColumnFilterList
          options={originOptions}
          selected={filters.origin}
          close={close}
          onApply={(origin) => patch({ origin })}
        />
      )}
    </ColumnFilter>
  )

  const tableRows: TableRowModel[] = rows.map((p) => ({
    id: p.code,
    onOpen: () => setEditingCode(p.code),
    cells: [
      <span key="c" className="font-mono text-[12px]">
        {p.code}
      </span>,
      <span key="n" className="truncate text-[12.5px] font-semibold">
        {p.name}
      </span>,
      <span key="o" className="truncate text-[12.5px]">
        {originNames.get(p.originId) ?? p.originId}
      </span>,
      p.active ? (
        <Badge key="s" tone="success">
          Đang dùng
        </Badge>
      ) : (
        <Badge key="s" tone="draft">
          Đã ẩn
        </Badge>
      ),
    ],
  }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Đối tác giới thiệu lead"
          actions={
            <Button size="md" className="pointer-coarse:h-12 max-sm:flex-1" onClick={openAdd}>
              <Icon icon={Plus} size={16} />
              Thêm đối tác
            </Button>
          }
          tabs={
            <SegmentedControl
              label="Trạng thái"
              hideLabel
              tone="quiet"
              value={filters.view}
              onChange={(v) => patch({ view: PARTNER_TABS.find((t) => t.value === v)?.value })}
              options={PARTNER_TABS.map((t) => ({ ...t, count: counts[t.value] }))}
            />
          }
          count={<BookCount total={rows.length} noun="đối tác" />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo mã đối tác hoặc tên…"
                value={book.text}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  onClick={book.clear}
                  className="pointer-coarse:h-12"
                >
                  Bỏ hết bộ lọc
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không tải được danh sách đối tác. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? book.dirty
                ? {
                    message: 'Không có đối tác nào phù hợp với bộ lọc hiện tại.',
                    action: { label: 'Bỏ hết bộ lọc', onClick: book.clear },
                  }
                : {
                    message: 'Chưa có đối tác nào.',
                    action: { label: 'Thêm đối tác', onClick: openAdd },
                  }
              : undefined
          }
          table={{
            minWidth: 'min-w-[720px]',
            sort,
            onSort: toggleSort,
            columns: [
              { header: 'Mã', width: '0.8fr', sortKey: 'code' },
              { header: 'Tên đối tác', width: 'minmax(0,2fr)', sortKey: 'name' },
              { header: originFilter, width: 'minmax(0,1.4fr)' },
              { header: 'Trạng thái', width: 'minmax(0,1fr)' },
            ],
            rows: tableRows,
          }}
        />

        <AddPartnerModal key={addSeq} open={adding} onClose={() => setAdding(false)} />
        <EditPartnerModal partner={editing} onClose={() => setEditingCode(null)} />
      </ScreenLayout>
    </AppShell>
  )
}

export default PartnersPage
