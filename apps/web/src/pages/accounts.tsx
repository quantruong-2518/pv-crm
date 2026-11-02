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
import { AccountBookQuery, AccountSortKey } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import { searchHint } from '@/lib/search-box'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { accountBookQuery, accountFacetsQuery, accountProfileQuery } from '@/data/accounts'
import { configName, leadIndustryOptionsQuery } from '@/data/industries'
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

const CUSTOMER_TABS = ['all', '1', '0'] as const
const OPEN_DEALS_OPTIONS = ['1', '0'] as const

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
export default function AccountsPage() {
  const { t } = useI18n()
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
    filterKeys: ['province', 'categoryId', 'customer', 'openDeals'],
  })
  const { query } = book

  const { data, isPending, error, refetch } = useQuery(accountBookQuery(query))
  const { data: facets } = useQuery(accountFacetsQuery(query))
  const { data: industries } = useQuery(leadIndustryOptionsQuery)

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const { pageIndex } = useBookPageClamp(book, data?.total)

  const provincePicked = csvOf(query.province)
  const categoryPicked = csvOf(query.categoryId)
  const provinceOptions = facetOptions(facets?.provinces ?? [], provincePicked, (v) => v)
  const categoryOptions = facetOptions(
    (facets?.categories ?? []).map((c) => ({ value: c.id, count: c.count })),
    categoryPicked,
    (v) => configName(industries, v),
  )

  const listFilter = (
    label: string,
    key: 'province' | 'categoryId',
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
    <ColumnFilter
      iconOnly
      label={t(message('Cơ hội đang mở', 'Open opportunities', '진행 중인 기회'))}
      active={query.openDeals !== undefined}
    >
      {(close) => (
        <ColumnFilterList
          options={OPEN_DEALS_OPTIONS.map((value) => ({
            value,
            label:
              value === '1'
                ? t(message('Có cơ hội đang mở', 'Has open opportunities', '진행 중인 기회 있음'))
                : t(
                    message(
                      'Không có cơ hội đang mở',
                      'No open opportunities',
                      '진행 중인 기회 없음',
                    ),
                  ),
          }))}
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
  const tabs = CUSTOMER_TABS.map((value) => ({
    value,
    label:
      value === 'all'
        ? t(message('Tất cả', 'All', '전체'))
        : value === '1'
          ? t(message('Đã ký hợp đồng', 'Signed', '계약 체결'))
          : t(message('Chưa ký hợp đồng', 'Not signed', '미체결')),
    count: tabCounts[value as keyof typeof tabCounts],
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
          title={t(message('Sổ công ty', 'Companies', '회사'))}
          actions={
            canWrite ? (
              <Button size="md" className="pointer-coarse:h-12" onClick={() => setCreating(true)}>
                <Icon icon={Factory} size={16} />
                {t(message('Thêm công ty', 'Add company', '회사 추가'))}
              </Button>
            ) : undefined
          }
          tabs={
            <SegmentedControl
              label={t(message('Nhóm công ty', 'Company group', '회사 그룹'))}
              hideLabel
              tone="quiet"
              value={query.customer === undefined ? 'all' : String(query.customer)}
              options={tabs}
              onChange={onTab}
            />
          }
          count={<BookCount total={total} noun={t(message('công ty', 'companies', '회사'))} />}
          tools={
            <>
              <SearchField
                placeholder={t(
                  message(
                    'Tìm theo tên công ty hoặc mã số thuế…',
                    'Search by company name or tax ID…',
                    '회사명 또는 사업자등록번호 검색…',
                  ),
                )}
                value={book.text}
                meta={searchHint(book.text)}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {view === 'grid' && (
                <>
                  <SortSelect
                    options={[
                      {
                        value: 'name:asc',
                        label: t(message('Tên A → Z', 'Name A → Z', '이름 A → Z')),
                      },
                      {
                        value: 'name:desc',
                        label: t(message('Tên Z → A', 'Name Z → A', '이름 Z → A')),
                      },
                      {
                        value: 'signedAmountVnd:desc',
                        label: t(
                          message(
                            'Giá trị đã ký cao nhất',
                            'Highest signed value',
                            '계약 금액 높은순',
                          ),
                        ),
                      },
                      {
                        value: 'signedDeals:desc',
                        label: t(
                          message(
                            'Nhiều hợp đồng đã ký nhất',
                            'Most signed contracts',
                            '체결 계약 많은순',
                          ),
                        ),
                      },
                      {
                        value: 'openDeals:desc',
                        label: t(
                          message(
                            'Nhiều cơ hội đang mở nhất',
                            'Most open opportunities',
                            '진행 중인 기회 많은순',
                          ),
                        ),
                      },
                      {
                        value: 'leads:desc',
                        label: t(message('Nhiều lead nhất', 'Most leads', '리드 많은순')),
                      },
                      {
                        value: 'createdAt:desc',
                        label: t(message('Mới thêm gần đây', 'Recently added', '최근 추가순')),
                      },
                    ]}
                    sort={query.sort}
                    dir={query.dir}
                    onChange={(sort, dir) => book.patch({ sort: sort as typeof query.sort, dir })}
                  />
                  <FilterMenu
                    label={t(message('Bộ lọc sổ công ty', 'Company filters', '회사 필터'))}
                    active={
                      (query.province ? 1 : 0) +
                      (query.categoryId ? 1 : 0) +
                      (query.openDeals !== undefined ? 1 : 0)
                    }
                  >
                    <FilterSection title={t(message('Tỉnh/thành', 'Province / city', '시/도'))}>
                      <ColumnFilterList
                        options={provinceOptions}
                        selected={provincePicked}
                        close={noop}
                        onApply={(v) =>
                          book.patch({ province: v.length ? v.join(',') : undefined })
                        }
                      />
                    </FilterSection>
                    <FilterSection title={t(message('Nhóm ngành', 'Industry group', '산업 분야'))}>
                      <ColumnFilterList
                        options={categoryOptions}
                        selected={categoryPicked}
                        close={noop}
                        onApply={(v) =>
                          book.patch({ categoryId: v.length ? v.join(',') : undefined })
                        }
                      />
                    </FilterSection>
                    <FilterSection
                      title={t(message('Cơ hội đang mở', 'Open opportunities', '진행 중인 기회'))}
                    >
                      <ColumnFilterList
                        options={OPEN_DEALS_OPTIONS.map((value) => ({
                          value,
                          label:
                            value === '1'
                              ? t(
                                  message(
                                    'Có cơ hội đang mở',
                                    'Has open opportunities',
                                    '진행 중인 기회 있음',
                                  ),
                                )
                              : t(
                                  message(
                                    'Không có cơ hội đang mở',
                                    'No open opportunities',
                                    '진행 중인 기회 없음',
                                  ),
                                ),
                        }))}
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
                  {t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'))}
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `${t(message('Không tải được danh sách công ty.', 'Could not load companies.', '회사 목록을 불러오지 못했습니다.'))} ${
                    isApiError(error)
                      ? userMessage(error)
                      : t(message('Thử lại.', 'Please try again.', '다시 시도해 주세요.'))
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? t(
                        message(
                          'Không có công ty nào khớp bộ lọc.',
                          'No companies match these filters.',
                          '필터와 일치하는 회사가 없습니다.',
                        ),
                      )
                    : t(message('Chưa có công ty nào.', 'No companies yet.', '회사가 없습니다.')),
                  action: book.dirty
                    ? {
                        label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
                        onClick: book.clear,
                      }
                    : {
                        label: t(message('Xem sổ lead', 'View leads', '리드 보기')),
                        onClick: () => navigate('/sales/leads'),
                      },
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
                    {
                      header: t(message('Tên công ty', 'Company name', '회사명')),
                      width: '2.6fr',
                      sortKey: 'name',
                    },
                    {
                      header: t(message('Tỉnh/thành', 'Province / city', '시/도')),
                      width: '1fr',
                      sortKey: 'province',
                      filter: listFilter(
                        t(message('Tỉnh/thành', 'Province / city', '시/도')),
                        'province',
                        provinceOptions,
                        true,
                      ),
                    },
                    {
                      header: listFilter(
                        t(message('Nhóm ngành', 'Industry group', '산업 분야')),
                        'categoryId',
                        categoryOptions,
                      ),
                      width: '0.8fr',
                    },
                    {
                      header: t(message('Số lead', 'Leads', '리드')),
                      width: 'minmax(72px,0.6fr)',
                      align: 'right',
                      sortKey: 'leads',
                    },
                    {
                      header: t(message('Cơ hội đang mở', 'Open opportunities', '진행 중인 기회')),
                      /* Floors keep a header and its icons on one line at the table's min width. */
                      width: 'minmax(128px,0.7fr)',
                      align: 'right',
                      sortKey: 'openDeals',
                      filter: openDealsFilter,
                    },
                    {
                      header: t(message('Hợp đồng đã ký', 'Signed contracts', '체결 계약')),
                      width: 'minmax(112px,0.7fr)',
                      align: 'right',
                      sortKey: 'signedDeals',
                    },
                    {
                      header: t(message('Giá trị đã ký (₫)', 'Signed value (₫)', '계약 금액 (₫)')),
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
                        {a.category?.name ?? '—'}
                      </span>,
                      <CountCell key="l" value={a.leads} />,
                      <CountCell key="o" value={a.openDeals} />,
                      /* The signed count is what separates a CUSTOMER from a name:
                   bold it, and only it. The other three are context. */
                      <CountCell key="s" value={a.signedDeals} bold />,
                      <MoneyCell
                        key="m"
                        amount={a.signedAmountVnd > 0 ? a.signedAmountVnd : null}
                        missing={t(
                          message(
                            'Chưa có giá trị hợp đồng đã ký',
                            'No signed contract value',
                            '체결 계약 금액 없음',
                          ),
                        )}
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
