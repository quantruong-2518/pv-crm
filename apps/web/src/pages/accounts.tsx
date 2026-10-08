import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Chip,
  Factory,
  Icon,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  ColumnFilter,
  ColumnFilterList,
  billions,
  type TableSort,
} from '@pv/ui'
import { AccountBookQuery, AccountSortKey, type LeadCategory } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { accountBookQuery, accountFacetsQuery, CATEGORY_LABEL } from '@/data/accounts'
import { BookCount, BookPage } from '@/components/book-page'
import { TableFooter } from '@/components/table-bits'
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

export default function AccountsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm công ty, mã số thuế…' })
  const navigate = useNavigate()
  const canWrite = useCan('account.edit')
  const [creating, setCreating] = useState(false)

  /* The address is the source of truth; the hook owns patch, the debounced
     search box, the page reset and "clear all". */
  const book = useBookQuery(AccountBookQuery, {
    size: PAGE_SIZE,
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
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
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
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? 'Không có công ty nào phù hợp với bộ lọc hiện tại.'
                    : 'Chưa có công ty nào. Công ty sẽ được tạo tự động khi bạn thêm lead.',
                  action: book.dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: book.clear }
                    : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          table={{
            minWidth: 'min-w-[1200px]',
            sort: tableSort,
            onSort,
            columns: [
              { header: 'Mã', width: '0.8fr' },
              { header: 'Tên công ty', width: '2.2fr', sortKey: 'name' },
              { header: 'Mã số thuế', width: '1.1fr' },
              {
                header: 'Tỉnh/thành',
                width: '1fr',
                sortKey: 'province',
                filter: listFilter('Tỉnh/thành', 'province', provinceOptions, true),
              },
              { header: listFilter('Ngành', 'category', categoryOptions), width: '0.8fr' },
              { header: 'Số lead', width: '0.6fr', align: 'right', sortKey: 'leads' },
              {
                header: 'Cơ hội đang mở',
                width: '0.7fr',
                align: 'right',
                sortKey: 'openDeals',
                filter: openDealsFilter,
              },
              {
                header: 'Hợp đồng đã ký',
                width: '0.7fr',
                align: 'right',
                sortKey: 'signedDeals',
              },
              {
                header: 'Giá trị đã ký',
                width: '1.1fr',
                align: 'right',
                sortKey: 'signedAmountVnd',
              },
            ],
            rows: rows.map((a) => ({
              id: a.code,
              onOpen: () => navigate(`/sales/accounts/${a.code}`),
              cells: [
                <Chip key="c">{a.code}</Chip>,
                <span key="n" className="block truncate" title={a.legalName ?? a.name}>
                  {a.name}
                </span>,
                <span key="t" className="tnum font-num block truncate">
                  {a.taxCode ?? '—'}
                </span>,
                <span key="p" className="block truncate">
                  {a.province ?? '—'}
                </span>,
                <span key="g" className="block truncate">
                  {a.category ? CATEGORY_LABEL[a.category] : '—'}
                </span>,
                <span key="l" className="tnum font-num">
                  {a.leads}
                </span>,
                <span key="o" className="tnum font-num">
                  {a.openDeals}
                </span>,
                /* The signed count is what separates a CUSTOMER from a name:
                   bold it, and only it. The other three are context. */
                <span
                  key="s"
                  className={a.signedDeals > 0 ? 'tnum font-num font-semibold' : 'tnum font-num'}
                >
                  {a.signedDeals}
                </span>,
                <span key="m" className="tnum font-num">
                  {a.signedAmountVnd > 0 ? billions(a.signedAmountVnd) : '—'}
                </span>,
              ],
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={book.goPage} />
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
