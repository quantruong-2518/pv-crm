import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  DataTable,
  EmptyState,
  GlassCard,
  Inbox,
  Money,
  ScreenHeader,
  ScreenLayout,
  ScreenToolbar,
  SearchField,
  Select,
  Skeleton,
  TriangleAlert,
  cn,
  type TableSort,
} from '@pv/ui'
import { QuoteStatus, type QuoteBookQuery, type QuoteRow } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import { dm } from '@/lib/date'
import {
  DEFAULT_QUOTE_BOOK_QUERY,
  daysLeft,
  isExpired,
  isExpiring,
  parseQuoteBookQuery,
  quoteBookQuery,
  quoteBookQueryToParams,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
} from '@/data/quotes'
import { Pager } from '@/components/table-bits'

/** The quotation book — module 4, a NEW screen.
 *
 *  ------------------------------------------------------------------
 *  A ROW OPENS THE DEAL PROFILE, NOT A QUOTE PROFILE
 *  ------------------------------------------------------------------
 *  There is no `/sales/quotes/:code`, and that is a decision rather than
 *  unfinished work: everything a quote profile would print — which customer,
 *  which deal, the earlier versions, the button to draft the next one — is
 *  already on the DEAL profile, where the quote card lives beside the contract
 *  card. A second route just to reprint that is two screens to fix every time a
 *  column changes.
 *
 *  ------------------------------------------------------------------
 *  THE QUESTION THIS BOOK ANSWERS: "WHICH SHEETS ARE ABOUT TO GO STALE"
 *  ------------------------------------------------------------------
 *  So the validity column does not print only a date: it prints the DAYS LEFT,
 *  and turns amber inside a week. Expiry is computed on read (`data/quotes.ts`)
 *  rather than read off a status column — the table deliberately has no expired
 *  status, because a number that moves with the clock, frozen into a column, is
 *  only right on the night a job last ran.
 *
 *  NO scorecard above the book. The deal book has four cards because an endpoint
 *  counts them in SQL; there is none here, and counting the PAGE would be exactly
 *  the bug that endpoint was built to fix — four numbers that look like the whole
 *  book and are really the fifty rows the server just sent. Better absent than
 *  lying.
 *
 *  NO "draft a quote" button in the header, for the reason the deal book has no
 *  "create a deal" button: a quote grows out of a DEAL, so it starts on the deal
 *  profile. A blank form here would have to ask "for which deal" with a picker
 *  over the entire deal book. */

const SEARCH_DELAY_MS = 300
const PAGE_SIZE = DEFAULT_QUOTE_BOOK_QUERY.size
const ANY = '__any__'

export default function QuotesPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm báo giá, khách hàng…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const urlQuery = parseQuoteBookQuery(params)
  const query: QuoteBookQuery = urlQuery

  const {
    data,
    isPending,
    error: bookError,
    refetch: refetchBook,
  } = useQuery(quoteBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0

  const patch = (p: Partial<QuoteBookQuery>) =>
    setParams(quoteBookQueryToParams({ ...urlQuery, ...p, page: DEFAULT_QUOTE_BOOK_QUERY.page }))

  /* The search box keeps its text in state so typing shows up immediately, then
     trickles into the address. `replace` rather than pushing history: an
     eight-character search that pushed eight entries would turn the Back button
     into a delete-one-letter button. */
  const [text, setText] = useState(urlQuery.q ?? '')

  /* When the address changes from OUTSIDE — Back, a refresh, a link somebody
     sent — the box has to follow, or the text on screen says one thing while the
     table is filtered by another. */
  useEffect(() => setText(urlQuery.q ?? ''), [urlQuery.q])

  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(
      () =>
        setParams(
          quoteBookQueryToParams({
            ...urlQuery,
            q: wanted,
            page: DEFAULT_QUOTE_BOOK_QUERY.page,
          }),
          { replace: true },
        ),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageIndex = Math.min(pageIndexFromQueryPage(query.page), pageCount - 1)

  /* A page number past the end FIXES THE ADDRESS rather than merely clamping the
     number being drawn — clamping alone leaves the old `page` in the question
     sent to the server, the page comes back empty, and the screen reads that
     emptiness as "this book has no sheets yet". The deal book writes this case
     out in full. */
  useEffect(() => {
    if (!data) return
    if (pageIndexFromQueryPage(query.page) <= pageCount - 1) return
    setParams(quoteBookQueryToParams({ ...urlQuery, page: DEFAULT_QUOTE_BOOK_QUERY.page }), {
      replace: true,
    })
  }, [data, query.page, pageCount, urlQuery, setParams])

  const goPage = (index: number) =>
    setParams(quoteBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  const dirty = text.trim() !== '' || query.status !== undefined

  const clearFilters = () => patch({ q: undefined, status: undefined })

  /* The arrow lights only on the column the book is CURRENTLY sorted by. The
     default is newest-first on a column the table does not show, so by default no
     header carries an arrow. */
  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_QUOTE_BOOK_QUERY.sort ? undefined : { key: query.sort, dir: query.dir }

  /** Pressing the same column again REVERSES it; pressing another starts that
   *  column at its natural direction. Money and dates read most naturally with
   *  the largest and the nearest first. */
  const onSort = (key: string) => {
    const parsed = key as QuoteBookQuery['sort']
    patch({ sort: parsed, dir: query.sort === parsed && query.dir === 'desc' ? 'asc' : 'desc' })
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader title="Sổ báo giá" />

        <ScreenToolbar
          label="Bộ lọc sổ báo giá"
          className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.6fr)_minmax(150px,1fr)_auto] xl:items-center"
        >
          <SearchField
            size="topbar"
            placeholder="Tìm theo mã báo giá, tiêu đề hoặc khách hàng…"
            value={text}
            onChange={setText}
            className="w-full"
          />
          <Select
            label="Trạng thái"
            value={query.status ?? ANY}
            onChange={(v) =>
              patch({ status: v === ANY ? undefined : (v as QuoteBookQuery['status']) })
            }
            className="w-full max-w-none"
            options={[
              { value: ANY, label: 'Mọi trạng thái' },
              ...QuoteStatus.options.map((s) => ({ value: s, label: QUOTE_STATUS_LABEL[s] })),
            ]}
          />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clearFilters} className="w-full xl:w-auto">
              Bỏ hết bộ lọc
            </Button>
          )}
        </ScreenToolbar>

        {/* A table ALWAYS stands on `glass-b` — rule 8. The count line and the
            pager sit INSIDE the card as its first row: they describe the table
            directly beneath them, and outside the card they would float between
            two blocks belonging to neither. */}
        <GlassCard variant="b" className="overflow-hidden">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
            <span className="text-muted-foreground text-[11.5px]">
              {/* The SERVER's `total`, not `rows.length`: a page of ten rows has
                  no idea how many rows in the book match the filter. */}
              <span className="tnum text-foreground font-num text-[15px] font-semibold">
                {total}
              </span>{' '}
              bản khớp bộ lọc
              {/* Rule 7 — the server counts this one too, because the screen
                  cannot count what it never received. */}
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
              /* `h-12` is EXACTLY the row height `DataTable` draws — one step
                 off and every row jumps 4px at the moment the data lands, which
                 reads as the screen repainting rather than the data arriving. */
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : bookError ? (
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ báo giá. ${
                  isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetchBook() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              /* Two different sentences, and `dirty` is what tells them apart.
                 The second one names the STARTING POINT: this book has no create
                 button, so somebody opening it for the first time needs to be
                 told where a quote comes from. */
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có báo giá nào khớp bộ lọc đang chọn.'
                    : 'Chưa có báo giá nào. Mở hồ sơ một cơ hội rồi bấm "Soạn báo giá".'
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
                sort={tableSort}
                onSort={onSort}
                columns={[
                  { header: 'Mã · bản', width: 'minmax(130px,1fr)' },
                  { header: 'Khách hàng', width: 'minmax(160px,1.4fr)' },
                  { header: 'Tiêu đề', width: 'minmax(180px,1.6fr)' },
                  { header: 'Trạng thái', width: '130px' },
                  { header: 'Hạn hiệu lực', width: 'minmax(150px,1fr)', sortKey: 'validUntil' },
                  {
                    header: 'Tổng cộng',
                    width: 'minmax(130px,1fr)',
                    align: 'right',
                    sortKey: 'total',
                  },
                ]}
                rows={rows.map((q) => ({
                  id: q.code,
                  /* The whole row opens the DEAL profile — see the file
                     docblock. */
                  onOpen: () => navigate(`/sales/opportunities/${q.opportunityCode}`),
                  cells: [
                    <span key="code" className="flex flex-col gap-1">
                      <span className="font-num text-[12.5px]">{q.code}</span>
                      <span className="text-muted-foreground text-[11.5px]">bản {q.version}</span>
                    </span>,
                    <span key="account" className="truncate">
                      {q.account}
                    </span>,
                    <span key="title" className="truncate">
                      {q.title}
                    </span>,
                    <Badge key="status" tone={QUOTE_STATUS_TONE[q.status]}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </Badge>,
                    <ValidUntil key="valid" quote={q} />,
                    <Money key="total" value={q.total} scale="table" />,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>
      </ScreenLayout>
    </AppShell>
  )
}

/** The validity date, and the question it actually answers — HOW MANY DAYS LEFT.
 *
 *  Printing only the date makes the reader do the subtraction for every row, and
 *  that subtraction is the very question this book exists to answer. Coloured
 *  only for a LIVE version: once a sheet has been superseded or refused its date
 *  has stopped meaning anything, and colouring it amber would send somebody off
 *  to rescue paper nobody is waiting on. */
function ValidUntil({ quote }: { quote: QuoteRow }) {
  const expired = isExpired(quote)
  const expiring = isExpiring(quote)
  const left = daysLeft(quote)

  return (
    <span className="flex flex-col gap-1">
      <span className={cn('text-[12.5px]', expired && 'text-destructive-foreground')}>
        {dm(quote.validUntil)}
      </span>
      {expired ? (
        <span className="text-destructive-foreground text-[11.5px]">đã quá hạn</span>
      ) : expiring ? (
        <span className="text-warning text-[11.5px]">còn {left} ngày</span>
      ) : null}
    </span>
  )
}
