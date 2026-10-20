import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  cn,
  Factory,
  Icon,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  ColumnFilter,
  ColumnFilterList,
  type TableSort,
} from '@pv/ui'
import { AccountBookQuery, AccountSortKey, type LeadCategory } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { searchHint } from '@/lib/search-box'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import {
  accountBookQuery,
  accountFacetsQuery,
  accountProfileQuery,
  CATEGORY_LABEL,
} from '@/data/accounts'
import { useRowIntent } from '@/components/row-intent'
import { BookCount, BookPage } from '@/components/book-page'
import { FilterMenu, TableFooter } from '@/components/table-bits'
import { AccountCardGrid } from '@/components/account-cards'
import { FilterSection, SortSelect, ViewSwitch } from '@/components/book-cards'
import { GRID_PAGE_SIZE, noop, useBookView } from '@/components/book-view'
import { MoneyCell } from '@/components/money-cell'
import { AccountCreateDialog } from '@/components/account-create-dialog'

/** The customer company book — `/sales/accounts`.
 *
 *  ------------------------------------------------------------------
 *  THIS BOOK ANSWERS A QUESTION NO OTHER BOOK CAN
 *  ------------------------------------------------------------------
 *  "How many times has this company bought." The lead book counts ENQUIRIES,
 *  the deal book counts DEALS, the contract book counts SIGNATURES — none of
 *  the three counts CUSTOMERS, because before this sweep no row represented a
 *  customer. One company enquiring three times was three rows across those
 *  three books.
 *
 *  So the four number columns on the right of the table are not decoration:
 *  they ARE the content. A table with only a name and an address is a
 *  directory, not a customer book.
 *
 *  ------------------------------------------------------------------
 *  NO SCOPE AXIS HERE
 *  ------------------------------------------------------------------
 *  Unlike all four other books, and on purpose — see the docblock of
 *  `data/accounts.ts`. The visible effect on screen: there is no "N hidden by
 *  your permissions" line, because no row is hidden. The server's `hidden`
 *  always comes back 0.
 *
 *  ------------------------------------------------------------------
 *  THE "BOUGHT / NOT BOUGHT" TABS ARE THIS REPO'S TWO SCENARIOS, ASKED OF
 *  THE REAL BOOK
 *  ------------------------------------------------------------------
 *  One frozen scenario is a customer who has bought and the other is one who
 *  has not. This filter asks that exact question of live data: is
 *  there a row in `sales.contract` under any lead of this company. It does
 *  NOT mix the two scenarios (the `no-scenario-mix` rule); it just reuses the
 *  same split the whole product already thinks in. */

const PAGE_SIZE = 50

const CUSTOMER_TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: '1', label: 'Đã ký hợp đồng' },
  { value: '0', label: 'Chưa ký hợp đồng' },
]

const OPEN_DEALS_OPTIONS = [
  { value: '1', label: 'Có cơ hội đang mở' },
  { value: '0', label: 'Không có cơ hội đang mở' },
]

const csvOf = (v?: string) => (v ? v.split(',') : [])

type Facet = { value: string; count: number }

/** Facet choices with their counts, plus any picked value the facet no longer
 *  returns, so a pick never vanishes from its own list. */
function facetOptions(facets: Facet[], picked: string[], labelOf: (v: string) => string) {
  const known = new Set(facets.map((f) => f.value))
  return [
    ...facets.map((f) => ({ value: f.value, label: `${labelOf(f.value)} · ${f.count}` })),
    ...picked.filter((v) => !known.has(v)).map((v) => ({ value: v, label: labelOf(v) })),
  ]
}

/** A zero says "none" and fades, so the eye lands on the rows that have something. */
function CountCell({ value, bold = false }: { value: number; bold?: boolean }) {
  return (
    <span
      className={cn(
        'tnum font-num',
        value === 0 ? 'text-muted-foreground' : bold && 'font-semibold',
      )}
    >
      {value}
    </span>
  )
}

/** The grid's sort pick: the table's sort keys, each in its useful direction. */
const ACCOUNT_SORTS = [
  { value: 'name:asc', label: 'Tên A → Z' },
  { value: 'name:desc', label: 'Tên Z → A' },
  { value: 'signedAmountVnd:desc', label: 'Giá trị đã ký cao nhất' },
  { value: 'signedDeals:desc', label: 'Nhiều hợp đồng đã ký nhất' },
  { value: 'openDeals:desc', label: 'Nhiều cơ hội đang mở nhất' },
  { value: 'leads:desc', label: 'Nhiều lead nhất' },
  { value: 'createdAt:desc', label: 'Mới thêm gần đây' },
]

export default function AccountsPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const intent = useRowIntent(accountProfileQuery, () => import('@/pages/account-detail'))
  const canWrite = useCan('account.edit')
  const [creating, setCreating] = useState(false)

  /* The address is the source of truth; the hook owns patch, the debounced
     search box, the page reset and "clear all". */
  const [view, setView] = useBookView('pv.accounts.view')
  const pageSize = view === 'grid' ? GRID_PAGE_SIZE : PAGE_SIZE
  const book = useBookQuery(AccountBookQuery, {
    size: pageSize,
    filterKeys: ['province', 'category', 'customer', 'openDeals'],
  })
  const { query } = book

  const { data, isPending, error, refetch } = useQuery(accountBookQuery(query))
  const { data: facets } = useQuery(accountFacetsQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const { pageIndex } = useBookPageClamp(book, data?.total)

  const provincePicked = csvOf(query.province)
  const categoryPicked = csvOf(query.category)
  const provinceOptions = facetOptions(facets?.provinces ?? [], provincePicked, (v) => v)
  const categoryOptions = facetOptions(
    facets?.categories ?? [],
    categoryPicked,
    (v) => CATEGORY_LABEL[v as LeadCategory] ?? v,
  )

  const listFilter = (
    label: string,
    key: 'province' | 'category',
    options: { value: string; label: string }[],
    iconOnly?: boolean,
  ) => (
    <ColumnFilter iconOnly={iconOnly} label={label} active={query[key] !== undefined}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(query[key])}
          close={close}
          onApply={(v) => book.patch({ [key]: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )
  const openDealsFilter = (
    <ColumnFilter iconOnly label="Cơ hội đang mở" active={query.openDeals !== undefined}>
      {(close) => (
        <ColumnFilterList
          options={OPEN_DEALS_OPTIONS}
          selected={query.openDeals === undefined ? [] : [String(query.openDeals)]}
          close={close}
          searchable={false}
          onApply={(v) =>
            book.patch({ openDeals: v.length === 1 ? (Number(v[0]) as 0 | 1) : undefined })
          }
        />
      )}
    </ColumnFilter>
  )

  /* The tab counts come from the facets, which ignore the tab's own filter. */
  const signed = facets?.byCustomer.signed
  const unsigned = facets?.byCustomer.unsigned
  const tabCounts = {
    all: signed === undefined || unsigned === undefined ? undefined : signed + unsigned,
    '1': signed,
    '0': unsigned,
  }
  const tabs = CUSTOMER_TABS.map((t) => ({
    ...t,
    count: tabCounts[t.value as keyof typeof tabCounts],
  }))
  const onTab = (value: string) =>
    book.patch({ customer: value === 'all' ? undefined : (Number(value) as 0 | 1) })

  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  const onSort = (key: string) => {
    const parsed = AccountSortKey.safeParse(key)
    if (!parsed.success) return
    book.patch(
      query.sort === parsed.data
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: parsed.data, dir: 'asc' },
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ công ty"
          actions={
            canWrite ? (
              <Button size="md" className="pointer-coarse:h-12" onClick={() => setCreating(true)}>
                <Icon icon={Factory} size={16} />
                Thêm công ty
              </Button>
            ) : undefined
          }
          tabs={
            <SegmentedControl
              label="Nhóm công ty"
              hideLabel
              tone="quiet"
              value={query.customer === undefined ? 'all' : String(query.customer)}
              options={tabs}
              onChange={onTab}
            />
          }
          count={<BookCount total={total} noun="công ty" />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo tên công ty hoặc mã số thuế…"
                value={book.text}
                meta={searchHint(book.text)}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {view === 'grid' && (
                <>
                  <SortSelect
                    options={ACCOUNT_SORTS}
                    sort={query.sort}
                    dir={query.dir}
                    onChange={(sort, dir) => book.patch({ sort: sort as typeof query.sort, dir })}
                  />
                  <FilterMenu
                    label="Bộ lọc sổ công ty"
                    active={
                      (query.province ? 1 : 0) +
                      (query.category ? 1 : 0) +
                      (query.openDeals !== undefined ? 1 : 0)
                    }
                  >
                    <FilterSection title="Tỉnh/thành">
                      <ColumnFilterList
                        options={provinceOptions}
                        selected={provincePicked}
                        close={noop}
                        onApply={(v) =>
                          book.patch({ province: v.length ? v.join(',') : undefined })
                        }
                      />
                    </FilterSection>
                    <FilterSection title="Ngành">
                      <ColumnFilterList
                        options={categoryOptions}
                        selected={categoryPicked}
                        close={noop}
                        onApply={(v) =>
                          book.patch({ category: v.length ? v.join(',') : undefined })
                        }
                      />
                    </FilterSection>
                    <FilterSection title="Cơ hội đang mở">
                      <ColumnFilterList
                        options={OPEN_DEALS_OPTIONS}
                        selected={query.openDeals === undefined ? [] : [String(query.openDeals)]}
                        close={noop}
                        searchable={false}
                        onApply={(v) =>
                          book.patch({
                            openDeals: v.length === 1 ? (Number(v[0]) as 0 | 1) : undefined,
                          })
                        }
                      />
                    </FilterSection>
                  </FilterMenu>
                </>
              )}
              <ViewSwitch value={view} onChange={setView} />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={book.clear}
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
                  message: `Không tải được danh sách công ty. ${
                    isApiError(error) ? userMessage(error) : 'Thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? 'Không có công ty nào khớp bộ lọc.'
                    : 'Chưa có công ty nào.',
                  action: book.dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: book.clear }
                    : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          table={
            view === 'table'
              ? {
                  minWidth: 'min-w-[960px]',
                  sort: tableSort,
                  onSort,
                  columns: [
                    { header: 'Tên công ty', width: '2.6fr', sortKey: 'name' },
                    {
                      header: 'Tỉnh/thành',
                      width: '1fr',
                      sortKey: 'province',
                      filter: listFilter('Tỉnh/thành', 'province', provinceOptions, true),
                    },
                    { header: listFilter('Ngành', 'category', categoryOptions), width: '0.8fr' },
                    {
                      header: 'Số lead',
                      width: 'minmax(72px,0.6fr)',
                      align: 'right',
                      sortKey: 'leads',
                    },
                    {
                      header: 'Cơ hội đang mở',
                      /* Floors keep a header and its icons on one line at the table's min width. */
                      width: 'minmax(128px,0.7fr)',
                      align: 'right',
                      sortKey: 'openDeals',
                      filter: openDealsFilter,
                    },
                    {
                      header: 'Hợp đồng đã ký',
                      width: 'minmax(112px,0.7fr)',
                      align: 'right',
                      sortKey: 'signedDeals',
                    },
                    {
                      header: 'Giá trị đã ký (₫)',
                      /* The deal book's money track: full digits up to tens of billions. */
                      width: '144px',
                      align: 'right',
                      sortKey: 'signedAmountVnd',
                    },
                  ],
                  rows: rows.map((a) => ({
                    id: a.code,
                    onOpen: () => navigate(`/sales/accounts/${a.code}`),
                    ...intent(a.code),
                    cells: [
                      <span key="n" className="flex min-w-0 flex-col gap-1">
                        <span className="truncate font-semibold" title={a.legalName ?? a.name}>
                          {a.name}
                        </span>
                        <span className="text-muted-foreground tnum truncate text-[11.5px]">
                          <span className="font-mono">{a.code}</span>
                          {a.taxCode && ` · MST ${a.taxCode}`}
                        </span>
                      </span>,
                      <span key="p" className="block truncate">
                        {a.province ?? '—'}
                      </span>,
                      <span key="g" className="block truncate">
                        {a.category ? CATEGORY_LABEL[a.category] : '—'}
                      </span>,
                      <CountCell key="l" value={a.leads} />,
                      <CountCell key="o" value={a.openDeals} />,
                      /* The signed count is what separates a CUSTOMER from a name:
                   bold it, and only it. The other three are context. */
                      <CountCell key="s" value={a.signedDeals} bold />,
                      <MoneyCell
                        key="m"
                        amount={a.signedAmountVnd > 0 ? a.signedAmountVnd : null}
                        missing="Chưa có giá trị hợp đồng đã ký"
                      />,
                    ],
                  })),
                }
              : undefined
          }
          cards={view === 'grid' ? <AccountCardGrid rows={rows} /> : undefined}
          footer={
            <TableFooter page={pageIndex} pageSize={pageSize} total={total} onPage={book.goPage} />
          }
        />

        <AccountCreateDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(row) => navigate(`/sales/accounts/${row.code}`)}
        />
      </ScreenLayout>
    </AppShell>
  )
}
