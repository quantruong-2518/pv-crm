import { queryOptions } from '@tanstack/react-query'
import {
  QuoteBookQuery,
  type QuoteBookResponse,
  type QuoteDetail,
  type QuoteRow,
  type QuoteStatus,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'

/** Module 4 · the quotation book. Server-backed from day one.
 *
 *  ------------------------------------------------------------------
 *  THERE IS NO FIXTURE CUT-OVER HERE, AND THAT IS WORTH SAYING
 *  ------------------------------------------------------------------
 *  The three books before this one each spent a period reading frozen fixture
 *  data before being cut across to the server — the "drop `load`" rite that
 *  `app/api/client.ts` describes. This book was born after its table existed, so
 *  it never had a `load` to drop: every number on the screen comes from
 *  `sales.quote`, and no branch of it reads a frozen scenario.
 *
 *  The consequence worth knowing: neither frozen scenario contains a quote at
 *  all (`BG-1077` is an E1 mirror row, not a row of the table), so on a freshly
 *  seeded machine this book is empty until somebody drafts the first sheet. That
 *  is the book telling the truth, not a broken screen.
 *
 *  ------------------------------------------------------------------
 *  EXPIRY IS COMPUTED WHEN READ, NOT STORED AS A STATUS
 *  ------------------------------------------------------------------
 *  The table deliberately has no expired status: expiry is `valid_until <
 *  today`, a number that moves with the clock rather than with somebody pressing
 *  a button. The server sends the DATE, the screen applies today — the same
 *  split the deal book uses for its rotting signal, where the server sends a day
 *  count and the screen applies the column's limit. */

export const QUOTE_BOOK_KEY = ['sales', 'quote-book'] as const

/** The three axes `QuoteController.book` declares with `@Need`. Declaring them
 *  on this side cuts NOTHING — the browser holds no rows to cut and must never
 *  be where the decision is made. It is a DECLARATION, so both ends of one
 *  permission matrix read the same sentence; the receipt for the real cut is
 *  `hidden` on the response. */
const BOOK_NEED: ApiNeed = { branch: 'Sales', permission: 'báo-giá.xem', scoped: true }

/** Every field name `QuoteBookQuery` accepts, read straight off the schema
 *  rather than copied out by hand: the day the contract grows another filter,
 *  the two translators below follow it without anybody remembering to. */
const QUOTE_BOOK_QUERY_KEYS = Object.keys(QuoteBookQuery.shape) as (keyof QuoteBookQuery)[]

export const DEFAULT_QUOTE_BOOK_QUERY: QuoteBookQuery = QuoteBookQuery.parse({})

/** `QuoteBookQuery` to URL parameters, DROPPING every field still at default.
 *
 *  The screen writes the address with this very function, so the question sent
 *  to the server and the question in the address bar cannot drift apart — a link
 *  sent to a colleague opens the book the sender was looking at. Dropping the
 *  defaults is required rather than tidy: without it, opening the screen already
 *  shows four parameters nobody chose, and those are what people paste. */
export function quoteBookQueryToParams(query: QuoteBookQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of QUOTE_BOOK_QUERY_KEYS) {
    const value = query[key]
    if (value === undefined) continue
    if (value === DEFAULT_QUOTE_BOOK_QUERY[key]) continue
    params.set(key, String(value))
  }
  return params
}

/** Address to `QuoteBookQuery`. NEVER throws: people edit the address bar by
 *  hand, and a blank screen caused by one stray character is worse than every
 *  other way this could fail. Falling back replaces the WHOLE question rather
 *  than field by field — the schema is what defines which combinations are
 *  legal, and salvaging "the fields that still look fine" is re-deciding by hand
 *  what zod just decided. */
export function parseQuoteBookQuery(params: URLSearchParams): QuoteBookQuery {
  const raw: Record<string, string> = {}
  for (const key of QUOTE_BOOK_QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) raw[key] = value
  }
  const parsed = QuoteBookQuery.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_QUOTE_BOOK_QUERY
}

/** The book, ONE page at a time. The key extends `QUOTE_BOOK_KEY`, so a write
 *  door only has to invalidate that prefix — TanStack invalidates by prefix, so
 *  nobody has to remember to list every page sitting in the cache. */
export const quoteBookQuery = (query: QuoteBookQuery) =>
  queryOptions({
    queryKey: [...QUOTE_BOOK_KEY, 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<QuoteBookResponse>(`/sales/quotes?${quoteBookQueryToParams(query)}`, {
        need: BOOK_NEED,
        signal,
      }),
  })

/** Every version of ONE deal — what the quote card on the deal profile draws.
 *
 *  Through the book's own door with `?opportunityCode=`, not a door of its own:
 *  "every version on this deal" is the book asked a narrower question, and a
 *  second door returning the same rows would be two definitions of one list.
 *
 *  `size` takes the contract's ceiling: a deal that went through two hundred
 *  rounds has bigger problems than its quote card. Ordered by creation ascending,
 *  which IS version order because codes come from a sequence; the card puts the
 *  newest on top by reading the array backwards. */
export const quotesOfOpportunityQuery = (opportunityCode: string) =>
  queryOptions({
    queryKey: [...QUOTE_BOOK_KEY, 'of-op', opportunityCode] as const,
    queryFn: ({ signal }) =>
      api.read<QuoteBookResponse>(
        `/sales/quotes?opportunityCode=${encodeURIComponent(opportunityCode)}&size=200&sort=createdAt&dir=asc`,
        { need: BOOK_NEED, signal },
      ),
    select: (d: QuoteBookResponse) => d.rows,
  })

/** One version, plus every version of the same deal. */
export const quoteProfileQuery = (code: string) =>
  queryOptions({
    queryKey: [...QUOTE_BOOK_KEY, 'one', code] as const,
    queryFn: ({ signal }) =>
      api.read<QuoteDetail>(`/sales/quotes/${code}`, { need: BOOK_NEED, signal }),
  })

// ---------------------------------------------------------------------------
// How a row shows itself
// ---------------------------------------------------------------------------

/** Display labels for the five statuses.
 *
 *  In the app layer rather than the contract: the KEY travels on the wire, the
 *  label is the screen's business — the same seam `STATE_TONE` of the deal book
 *  sits on. */
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  nhap: 'Nháp',
  'da-gui': 'Đã gửi',
  'khach-chot': 'Khách chốt',
  'khach-tu-choi': 'Khách từ chối',
  'thay-the': 'Đã thay',
}

/** Tone per status. Five statuses but NOT five tones: a superseded version
 *  shares the draft tone, because to somebody hunting for the live sheet both
 *  read as the same sentence — "not this one". The words in the pill say which. */
export const QUOTE_STATUS_TONE: Record<QuoteStatus, 'success' | 'danger' | 'running' | 'draft'> = {
  nhap: 'draft',
  'da-gui': 'running',
  'khach-chot': 'success',
  'khach-tu-choi': 'danger',
  'thay-the': 'draft',
}

/** Today, as an ISO date — the comparison point of a LIVE book. */
const today = () => new Date().toISOString().slice(0, 10)

/** A version still waiting on the customer. Only these can expire: an unsent
 *  draft has promised nobody anything, and once an answer has come back the
 *  validity date has stopped meaning anything. */
export const isLive = (q: QuoteRow) => q.status === 'da-gui'

/** Past its validity date — computed on read, never read off a column. */
export function isExpired(q: QuoteRow): boolean {
  return isLive(q) && q.validUntil < today()
}

/** About to expire: live, not yet expired, and inside the window below.
 *
 *  Seven days because that is roughly how long a seller still has to call the
 *  customer back before the sheet is worthless. The threshold lives in the screen
 *  layer rather than the table: it is a working habit of the sales floor, the
 *  kind of thing that changes without wanting a migration. */
const EXPIRING_DAYS = 7

export function daysLeft(q: QuoteRow): number {
  const ms =
    new Date(`${q.validUntil}T00:00:00Z`).getTime() - new Date(`${today()}T00:00:00Z`).getTime()
  return Math.round(ms / 86_400_000)
}

export function isExpiring(q: QuoteRow): boolean {
  if (!isLive(q) || isExpired(q)) return false
  return daysLeft(q) <= EXPIRING_DAYS
}
