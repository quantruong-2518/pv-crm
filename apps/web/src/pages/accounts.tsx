import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Chip,
  Factory,
  Icon,
  ScreenLayout,
  SearchField,
  ColumnFilter,
  ColumnFilterList,
  billions,
  type TableSort,
} from '@pv/ui'
import { AccountSortKey, type AccountBookQuery } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import {
  accountBookQuery,
  accountBookQueryToParams,
  DEFAULT_ACCOUNT_BOOK_QUERY,
  parseAccountBookQuery,
} from '@/data/accounts'
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
 *  THE "BOUGHT / NOT BOUGHT" FILTER IS THIS REPO'S TWO SCENARIOS, ASKED OF
 *  THE REAL BOOK
 *  ------------------------------------------------------------------
 *  One frozen scenario is a customer who has bought and the other is one who
 *  has not. This filter asks that exact question of live data: is
 *  there a row in `sales.contract` under any lead of this company. It does
 *  NOT mix the two scenarios (the `no-scenario-mix` rule); it just reuses the
 *  same split the whole product already thinks in. */

const PAGE_SIZE = DEFAULT_ACCOUNT_BOOK_QUERY.size

export default function AccountsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm công ty, mã số thuế…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const canWrite = useCan('account.edit')
  const [creating, setCreating] = useState(false)

  const query = useMemo(() => parseAccountBookQuery(params), [params])

  /* The filters live in the URL, not in `useState` — same rule as the lead
     book and the deal book: a filtered book page must be pasteable for
     someone else, and the browser's Back button must undo exactly one filter
     step. */
  const patch = (next: Partial<AccountBookQuery>) => {
    const merged = { ...query, ...next, page: next.page ?? 1 }
    setParams(new URLSearchParams(accountBookQueryToParams(merged)), { replace: true })
  }
  const clearAll = () => setParams(new URLSearchParams(), { replace: true })

  const { data, isPending, error, refetch } = useQuery(accountBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageIndex = pageIndexFromQueryPage(query.page)

  const dirty =
    query.q !== undefined ||
    query.province !== undefined ||
    query.category !== undefined ||
    query.customer !== undefined
  /* The province list is built from the CURRENT PAGE, plus whatever is already
     picked so a choice never vanishes from its own list. A list of all 63
     provinces needs its own facet door, and nobody has asked for that yet. */
  const picked = query.province?.split(',') ?? []
  const provinceOptions = [
    ...new Set([...picked, ...rows.map((r) => r.province).filter((p) => p !== undefined)]),
  ].map((p) => ({ value: p, label: p }))
  const signedOptions = [
    { value: '1', label: 'Đã mua' },
    { value: '0', label: 'Chưa mua' },
  ]
  const provinceFilter = (
    <ColumnFilter iconOnly label="Tỉnh/thành" active={picked.length > 0}>
      {(close) => (
        <ColumnFilterList
          options={provinceOptions}
          selected={picked}
          close={close}
          onApply={(v) => patch({ province: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )
  /* Both ticked is the same question as none ticked: everyone. */
  const signedFilter = (
    <ColumnFilter iconOnly label="Đã ký" active={query.customer !== undefined}>
      {(close) => (
        <ColumnFilterList
          options={signedOptions}
          selected={query.customer === undefined ? [] : [String(query.customer)]}
          close={close}
          searchable={false}
          onApply={(v) => patch({ customer: v.length === 1 ? (Number(v[0]) as 0 | 1) : undefined })}
        />
      )}
    </ColumnFilter>
  )

  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  const onSort = (key: string) => {
    const parsed = AccountSortKey.safeParse(key)
    if (!parsed.success) return
    patch(
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
              <Button size="md" onClick={() => setCreating(true)}>
                <Icon icon={Factory} size={16} />
                Mở công ty mới
              </Button>
            ) : undefined
          }
          count={<BookCount total={total} noun="công ty" />}
          tools={
            <>
              <SearchField
                placeholder="Tên, tên trên giấy tờ, mã số thuế"
                value={query.q ?? ''}
                onChange={(v) => patch({ q: v.trim() === '' ? undefined : v })}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {dirty && (
                <Button size="md" variant="ghost" onClick={clearAll}>
                  Bỏ hết bộ lọc
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không lấy được sổ công ty. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: dirty
                    ? 'Không có công ty nào khớp bộ lọc đang chọn.'
                    : 'Sổ công ty chưa có dòng nào. Mỗi lead vào sổ tự mở hoặc nối vào một công ty, nên sổ này thường không rỗng lâu.',
                  action: dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearAll }
                    : { label: 'Về sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          table={{
            minWidth: 'min-w-[1100px]',
            sort: tableSort,
            onSort,
            columns: [
              { header: 'Mã', width: '0.8fr' },
              { header: 'Công ty', width: '2.2fr', sortKey: 'name' },
              { header: 'MST', width: '1.1fr' },
              { header: 'Tỉnh/thành', width: '1fr', sortKey: 'province', filter: provinceFilter },
              { header: 'Lead', width: '0.6fr', align: 'right', sortKey: 'leads' },
              { header: 'Đơn mở', width: '0.7fr', align: 'right', sortKey: 'openDeals' },
              {
                header: 'Đã ký',
                width: '0.7fr',
                align: 'right',
                sortKey: 'signedDeals',
                filter: signedFilter,
              },
              { header: 'Doanh số', width: '1.1fr', align: 'right', sortKey: 'signedAmountVnd' },
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
            <TableFooter
              page={pageIndex}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={(p) => patch({ page: queryPageFromPageIndex(p) })}
            />
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
