import { useMemo, useState } from 'react'
import { Factory, Inbox, TriangleAlert } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  ScreenToolbar,
  SearchField,
  Select,
  Skeleton,
  billions,
  type TableSort,
} from '@pv/ui'
import { AccountSortKey, LeadCategory, type AccountBookQuery } from '@pv/contracts'
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
import { Pager } from '@/components/table-bits'
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

const CUSTOMER_OPTIONS = [
  { value: '', label: 'Tất cả khách' },
  { value: '1', label: 'Đã mua' },
  { value: '0', label: 'Chưa mua' },
]

export default function AccountsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm công ty, mã số thuế…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const canWrite = useCan('khách-hàng.sửa')
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

  const { data, isPending, error, refetch } = useQuery(accountBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageIndex = pageIndexFromQueryPage(query.page)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const dirty =
    query.q !== undefined ||
    query.province !== undefined ||
    query.category !== undefined ||
    query.customer !== undefined

  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="Kinh doanh · Khách hàng"
          title="Sổ công ty khách"
          description="Mỗi dòng là MỘT công ty, không phải một lần hỏi hàng. Bốn cột số bên phải nói công ty đó đã đi tới đâu."
          meta={
            <Badge tone="draft">
              {total} công ty
              {dirty ? ' khớp bộ lọc' : ''}
            </Badge>
          }
          actions={
            canWrite ? (
              <Button size="md" onClick={() => setCreating(true)}>
                <Icon icon={Factory} size={16} />
                Mở công ty mới
              </Button>
            ) : undefined
          }
        />

        <ScreenToolbar label="Lọc sổ công ty">
          <SearchField
            placeholder="Tên, tên trên giấy tờ, mã số thuế"
            value={query.q ?? ''}
            onChange={(v) => patch({ q: v.trim() === '' ? undefined : v })}
          />
          <Select
            label="Tỉnh/thành"
            value={query.province ?? ''}
            neutralValue=""
            onChange={(v) => patch({ province: v === '' ? undefined : v })}
            options={[
              { value: '', label: 'Mọi tỉnh/thành' },
              /* The province list is built from the CURRENT PAGE being
                 viewed, not from a province table. That is a real limit and
                 it is spelled out in the label: filtering by province can
                 only pick provinces present on this page. A select with all
                 63 provinces needs its own facet door, and nobody has asked
                 for that yet. */
              ...[...new Set(rows.map((r) => r.province).filter((p) => p !== undefined))].map(
                (p) => ({ value: p, label: p }),
              ),
            ]}
          />
          <Select
            label="Ngành"
            value={query.category ?? ''}
            neutralValue=""
            onChange={(v) =>
              patch({ category: v === '' ? undefined : (v as AccountBookQuery['category']) })
            }
            options={[
              { value: '', label: 'Mọi ngành' },
              ...LeadCategory.options.map((c) => ({ value: c, label: c })),
            ]}
          />
          <Select
            label="Đã mua chưa"
            value={query.customer === undefined ? '' : String(query.customer)}
            neutralValue=""
            onChange={(v) => patch({ customer: v === '' ? undefined : (Number(v) as 0 | 1) })}
            options={CUSTOMER_OPTIONS}
          />
        </ScreenToolbar>

        <GlassCard variant="b" className="p-0">
          <div className="overflow-x-auto p-4 lg:p-5">
            {isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ công ty. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có công ty nào khớp bộ lọc đang chọn.'
                    : 'Sổ công ty chưa có dòng nào. Mỗi lead vào sổ tự mở hoặc nối vào một công ty, nên sổ này thường không rỗng lâu.'
                }
                action={
                  dirty
                    ? {
                        label: 'Bỏ hết bộ lọc',
                        onClick: () =>
                          setParams(new URLSearchParams(), {
                            replace: true,
                          }),
                      }
                    : { label: 'Về sổ lead', onClick: () => navigate('/sales/leads') }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className="min-w-[1100px]"
                sort={tableSort}
                onSort={(key) => {
                  const parsed = AccountSortKey.safeParse(key)
                  if (!parsed.success) return
                  patch(
                    query.sort === parsed.data
                      ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                      : { sort: parsed.data, dir: 'asc' },
                  )
                }}
                columns={[
                  { header: 'Mã', width: '0.8fr' },
                  { header: 'Công ty', width: '2.2fr', sortKey: 'name' },
                  { header: 'MST', width: '1.1fr' },
                  { header: 'Tỉnh/thành', width: '1fr', sortKey: 'province' },
                  { header: 'Lead', width: '0.6fr', align: 'right', sortKey: 'leads' },
                  { header: 'Đơn mở', width: '0.7fr', align: 'right', sortKey: 'openDeals' },
                  { header: 'Đã ký', width: '0.7fr', align: 'right', sortKey: 'signedDeals' },
                  {
                    header: 'Doanh số',
                    width: '1.1fr',
                    align: 'right',
                    sortKey: 'signedAmountVnd',
                  },
                ]}
                rows={rows.map((a) => ({
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
                    /* The signed count is what separates a CUSTOMER from a
                       name: bold it, and only it. The other three number
                       columns are context. */
                    <span
                      key="s"
                      className={
                        a.signedDeals > 0 ? 'tnum font-num font-semibold' : 'tnum font-num'
                      }
                    >
                      {a.signedDeals}
                    </span>,
                    <span key="m" className="tnum font-num">
                      {a.signedAmountVnd > 0 ? billions(a.signedAmountVnd) : '—'}
                    </span>,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>

        {total > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager
              page={pageIndex}
              pageCount={pageCount}
              onPage={(p) => patch({ page: queryPageFromPageIndex(p) })}
            />
          </div>
        )}

        <AccountCreateDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(row) => navigate(`/sales/accounts/${row.code}`)}
        />
      </ScreenLayout>
    </AppShell>
  )
}
