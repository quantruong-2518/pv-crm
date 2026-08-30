import { useEffect, useMemo, useState } from 'react'
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
  Inbox,
  SearchField,
  Skeleton,
  ScreenHeader,
  ScreenLayout,
  ScreenToolbar,
  TriangleAlert,
  billions,
  type TableSort,
} from '@pv/ui'
import { ContractSortKey, type ContractBookQuery, type ContractBookRow } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import { dmy } from '@/lib/date'
import {
  contractBookQuery,
  contractBookQueryToParams,
  contractDong,
  DEFAULT_CONTRACT_BOOK_QUERY,
  isTermOverdue,
  parseContractBookQuery,
  termsTotal,
} from '@/data/contracts'
import { Pager, PersonCell } from '@/components/table-bits'

/** Module 4 · the contract book — `GET /sales/contracts`. READ ONLY.
 *
 *  ------------------------------------------------------------------
 *  THE FRAME IS THE OPS BOOK'S, ON PURPOSE
 *  ------------------------------------------------------------------
 *  Same three-block shape as `pages/opportunities.tsx` and `pages/leads.tsx`,
 *  minus the scorecard: a header, a filter row, and a paged table on `.glass-b`
 *  (rule 8). People move between the three books of one department every day,
 *  and a layout that shifts between them means re-finding the search box by eye
 *  on every screen change. `Pager` and `PersonCell` are the SHARED ones from
 *  `components/table-bits.tsx`, not copies.
 *
 *  ------------------------------------------------------------------
 *  READ ONLY, AND NO PROFILE ROUTE
 *  ------------------------------------------------------------------
 *  Section 11.2 of the design settles both. Rows open the DEAL profile, where
 *  the contract card lives — a contract gets a route of its own the day it has
 *  something to go on living for (sales orders, delivery, collection), which is
 *  module 5. Opening rows onto a screen that would exist only to repeat this
 *  row is a route with nothing behind it.
 *
 *  ------------------------------------------------------------------
 *  NO SCORECARD, ALTHOUGH THE DESIGN NAMES THE QUESTION
 *  ------------------------------------------------------------------
 *  "How much did we sign this month" wants counting across the WHOLE book in
 *  SQL, the way `GET /sales/opportunities/scorecard` does — not a sum over the
 *  ten rows on screen, which would answer a different question under the same
 *  words. That endpoint does not exist yet, and adding one here would be this
 *  pass quietly growing a door the design puts elsewhere. The row count under
 *  the table answers what this page can honestly answer today, and
 *  `docs/ban-giao-hop-dong.md` records the gap.
 *
 *  ------------------------------------------------------------------
 *  RULE 10 DEBT — ContextRail, written down rather than passed over
 *  ------------------------------------------------------------------
 *  Rule 10 wants the rail on every screen and this one has none, for the reason
 *  `pages/opportunities.tsx` and `pages/leads.tsx` both record: a BOOK has no
 *  object open. The design puts the rail in pass 6, lit on all four Sales
 *  screens at once, because half a rail is worse than none.
 *
 *  ------------------------------------------------------------------
 *  SIX COLUMNS
 *  ------------------------------------------------------------------
 *  Contract · Deal · Customer · Value · Signed · Plan. Three carry a signal
 *  beyond their text:
 *   · **Value** — right-aligned and monospaced, because a money column is read
 *     DOWNWARDS. The six older contracts have no value and print an em dash,
 *     never a zero.
 *   · **Plan** — how many instalments, and whether one is past due. An overdue
 *     instalment is computed on read (`isTermOverdue`), never stored.
 *   · **Customer** — the company, not the lead code: a code is what the system
 *     calls them, a name is what the reader calls them.
 *
 *  Getting to this screen means holding the contract-view permission; the gate
 *  is `app/guard.tsx` and is not re-checked here. The scope axis is cut by the
 *  server, and `hidden` is the number it sends back. */

/** Rows this table draws. Overrides the contract's default `size` of 50 rather
 *  than writing it into the address — a shared link should not carry a number
 *  nobody chose. */
const PAGE_SIZE = 10

/** Minimum table width, which is what gives the wrapping `overflow-x-auto`
 *  something to do: without it a scroll container's child never grows wider
 *  than the container, so the horizontal scrollbar never appears and the `fr`
 *  tracks get squeezed instead. Narrower than the Ops book's because this table
 *  has six columns rather than eight. */
const TABLE_MIN_WIDTH = 'min-w-[920px]'

/** The search box drips into the address after this long. Typing feels instant
 *  because of `useState`; writing every keystroke to the address turns Back
 *  into a key that deletes one letter. */
const SEARCH_DELAY_MS = 300

const NO_OWNER_TITLE = 'Chưa gán người ăn hoa hồng'

export function ContractsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  /* The ADDRESS is the filter's source of truth — both directions translate in
     `data/contracts.ts`. `size` is overridden here rather than written to the
     address, for the reason on `PAGE_SIZE`. */
  const urlQuery = useMemo(() => parseContractBookQuery(params), [params])
  const query = useMemo<ContractBookQuery>(() => ({ ...urlQuery, size: PAGE_SIZE }), [urlQuery])

  /* `error` is READ, not dropped. Dropping it turns a dead server into "no
     contract matches the current filter" with a button offering to clear the
     filter: the user goes and fixes a filter over an infrastructure failure,
     and only stops once every filter is gone and the book is still empty. */
  const { data, isPending, error: bookError, refetch } = useQuery(contractBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0

  /* Rows open the DEAL, not a contract of their own — see the docblock above. */
  const open = (row: ContractBookRow) => navigate(`/sales/opportunities/${row.opportunityCode}`)

  const patch = (next: Partial<ContractBookQuery>) =>
    setParams(
      contractBookQueryToParams({
        ...urlQuery,
        ...next,
        page: DEFAULT_CONTRACT_BOOK_QUERY.page,
      }),
    )

  const [text, setText] = useState(urlQuery.q ?? '')

  /* The address changing from OUTSIDE — Back, F5, a link somebody sent — has to
     move the search box with it, or the box says one thing while the table
     filters by another. */
  useEffect(() => setText(urlQuery.q ?? ''), [urlQuery.q])

  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(
      () =>
        setParams(
          contractBookQueryToParams({
            ...urlQuery,
            q: wanted,
            page: DEFAULT_CONTRACT_BOOK_QUERY.page,
          }),
          { replace: true },
        ),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageIndex = Math.min(pageIndexFromQueryPage(query.page), pageCount - 1)

  /* A page beyond the end FIXES THE ADDRESS rather than only clamping the
     number being drawn. Clamping `pageIndex` above repairs the `Pager` alone;
     the question sent to the server still carries the old `page`, so `OFFSET`
     still runs off the end and the page comes back empty — and empty here reads
     as a sentence that is simply false. Happens for real with a link somebody
     sent after the book shrank, or when the scope axis cuts the reader's book
     shorter than the sender's.

     `replace` rather than a history entry: the user did not choose to be here,
     so Back has to go where they actually came from. Waiting for `data` is
     required — `total` before the first response is 0, and correcting early
     throws everyone to page 1 mid-load. */
  useEffect(() => {
    if (!data) return
    if (pageIndexFromQueryPage(query.page) <= pageCount - 1) return
    setParams(contractBookQueryToParams({ ...urlQuery, page: DEFAULT_CONTRACT_BOOK_QUERY.page }), {
      replace: true,
    })
  }, [data, query.page, pageCount, urlQuery, setParams])

  const goPage = (index: number) =>
    setParams(contractBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  /* Reads `text`, not `query.q`: the clear button has to appear on the first
     keystroke rather than after the 300ms wait. */
  const dirty = text.trim() !== ''
  const clearFilters = () => patch({ q: undefined })

  /* The arrow only lights on the column the book is actually sorted by. The
     default is `signedAt desc` — newest first — and that is a column here, so
     unlike the Ops book the default order is visible on a header. */
  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_CONTRACT_BOOK_QUERY.sort && query.dir === DEFAULT_CONTRACT_BOOK_QUERY.dir
      ? undefined
      : { key: query.sort, dir: query.dir }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {/* No action in the header, and that is the screen's whole posture: a
            contract is created by signing a deal, and there is no button here
            that writes anything. */}
        <ScreenHeader title="Sổ hợp đồng" />

        <ScreenToolbar
          label="Bộ lọc sổ hợp đồng"
          className="grid gap-3 p-4 md:grid-cols-[minmax(280px,1.6fr)_auto] md:items-center"
        >
          <SearchField
            size="topbar"
            placeholder="Tìm theo mã hợp đồng, mã cơ hội hoặc khách hàng…"
            value={text}
            onChange={setText}
            className="w-full"
          />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clearFilters} className="w-full md:w-auto">
              Bỏ hết bộ lọc
            </Button>
          )}
        </ScreenToolbar>

        {/* The table always sits on glass-b — rule 8. The count line and the
            `Pager` live INSIDE the card as its first row: they describe the
            table right below them, so outside the card they would float between
            two blocks. Both other books stand this way. */}
        <GlassCard variant="b" className="overflow-hidden">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
            <span className="text-muted-foreground text-[11.5px]">
              {/* The SERVER's `total`, not `rows.length`: a ten-row page does
                  not know how many rows match the filter. */}
              <span className="tnum text-foreground font-num text-[15px] font-semibold">
                {total}
              </span>{' '}
              dòng khớp bộ lọc
              {/* Rule 7 — also counted by the server, because the screen cannot
                  count what it never received. */}
              {hidden > 0 && (
                <>
                  {' · '}
                  <span className="text-warning">
                    <span className="tnum font-num">{hidden}</span> bị ẩn theo quyền của bạn
                  </span>
                </>
              )}
            </span>
            {total > PAGE_SIZE && <Pager page={pageIndex} pageCount={pageCount} onPage={goPage} />}
          </div>

          <div aria-hidden className="bg-white/6 h-px" />

          <div className="overflow-x-auto p-4 pt-3 lg:p-5 lg:pt-4">
            {isPending ? (
              /* `h-12` is the exact row height `DataTable` draws. One step off
                 and every row jumps 4px the moment data arrives — a flinch the
                 user reads as "the screen redrew", not "the data came". */
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : bookError ? (
              /* If the question failed, say the question failed. The button
                 offers a RETRY rather than clearing filters: the filter is not
                 the thing that broke, and a button that fixes the wrong thing
                 costs the user more time than no button at all. */
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ hợp đồng. ${
                  isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              /* Two different sentences, told apart by `dirty` rather than by
                 counting the book: the screen holds one page, so "the book is
                 empty" is not something it can check — but "nobody touched the
                 filter and page one is still blank" is exactly that. */
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có hợp đồng nào khớp bộ lọc đang chọn.'
                    : 'Chưa có hợp đồng nào. Hợp đồng sinh ra khi một cơ hội được chốt thắng.'
                }
                action={
                  dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                    : { label: 'Về sổ cơ hội', onClick: () => navigate('/sales/opportunities') }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className={TABLE_MIN_WIDTH}
                sort={tableSort}
                onSort={(key) => {
                  /* Three columns carry a `sortKey` and all three are keys the
                     server accepts. Anything outside `ContractSortKey` would die
                     at the server's zod gate, so it is stopped here rather than
                     sent off to earn a 400 — the move both other books make. */
                  const parsed = ContractSortKey.safeParse(key)
                  if (!parsed.success) return
                  patch(
                    query.sort === parsed.data
                      ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                      : { sort: parsed.data, dir: 'asc' },
                  )
                }}
                columns={[
                  { header: 'Mã hợp đồng', width: '1fr', sortKey: 'code' },
                  { header: 'Cơ hội', width: '0.9fr' },
                  { header: 'Khách hàng', width: '1.6fr' },
                  { header: 'Giá trị', width: '1fr', align: 'right', sortKey: 'amount' },
                  { header: 'Ngày ký', width: '0.9fr', sortKey: 'signedAt' },
                  { header: 'Đợt thanh toán', width: '1.3fr' },
                  { header: 'Hoa hồng về', width: '1.3fr' },
                ]}
                rows={rows.map((c) => ({
                  id: c.code,
                  onOpen: () => open(c),
                  cells: [
                    <Chip key="c">{c.code}</Chip>,
                    <span key="o" className="text-muted-foreground block truncate">
                      {c.opportunityCode}
                    </span>,
                    <span key="a" className="block truncate" title={c.account}>
                      {c.account}
                    </span>,
                    <ValueCell key="v" contract={c} />,
                    <span key="s" className="tnum font-num block">
                      {dmy(c.signedAt)}
                    </span>,
                    <TermsCell key="t" contract={c} />,
                    <PersonCell key="p" value={c.ownerName} missing={NO_OWNER_TITLE} />,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>

        {total > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager page={pageIndex} pageCount={pageCount} onPage={goPage} />
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** The signed value in the base currency, or an em dash.
 *
 *  An em dash rather than a zero, and this is the screen end of a decision the
 *  design states in writing: the six contracts predating module 4 have a NULL
 *  `amount` on Neon and stay that way, because inventing a value here would be
 *  inventing revenue. A `0` in this column would be read as "signed for
 *  nothing", which is a different and false sentence. */
function ValueCell({ contract }: { contract: ContractBookRow }) {
  const inDong = contractDong(contract)
  if (contract.amount === null || inDong === null) {
    return (
      <span className="text-muted-foreground" title="Hợp đồng cũ, chưa có giá trị trên máy chủ">
        —
      </span>
    )
  }
  return (
    <span
      className="tnum block truncate font-mono text-[11.5px]"
      title={
        contract.currency === 'VND'
          ? undefined
          : `${contract.amount.toLocaleString('vi-VN')} ${contract.currency} quy ra đồng`
      }
    >
      {billions(inDong)}
    </span>
  )
}

/** The collection plan in one cell: how many instalments, how much of it is
 *  collected, and whether one is past due.
 *
 *  A contract with no plan prints a dash rather than a zero count: no plan written
 *  yet and a plan of zero instalments are the same state today, and the shorter
 *  of the two readings is the one that does not claim somebody decided. */
function TermsCell({ contract }: { contract: ContractBookRow }) {
  const terms = contract.terms
  if (terms.length === 0) {
    return (
      <span className="text-muted-foreground" title="Chưa lập kế hoạch thu cho hợp đồng này">
        —
      </span>
    )
  }

  const paid = terms.filter((t) => t.status === 'da-thu').length
  const overdue = terms.some((t) => isTermOverdue(t))

  return (
    <span className="flex items-center gap-2">
      <span className="tnum font-num text-[11.5px]">
        {paid}/{terms.length} đợt
      </span>
      {overdue ? (
        <Badge tone="danger">Quá hạn</Badge>
      ) : (
        <span className="text-muted-foreground text-[11px]" title="Tổng kế hoạch thu">
          {billions(termsTotal(terms))}
        </span>
      )}
    </span>
  )
}

export default ContractsPage
