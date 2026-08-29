import { queryOptions } from '@tanstack/react-query'
import {
  ContractBookQuery,
  type ContractBookResponse,
  type ContractBookRow,
  type ContractTermRow,
} from '@pv/contracts'
import { toDong } from '@pv/engines/fixtures/das-vina'
import { api, type ApiNeed } from '@/app/api'

/** The contract book — module 4, pass 4. Reads the server directly, no `load`.
 *
 *  By the ritual in `app/api/client.ts`, a query without `load` is one that
 *  goes over real HTTP. This book never had a fixture version, so there was
 *  nothing to cut: it was born on the server side, and that is exactly why it
 *  is the FIRST place the question "how much did we sign this month" has a real
 *  answer — `data/performance.ts` still says in code today that the fixture
 *  carries no signed contract value, so it cannot add one in.
 *
 *  ------------------------------------------------------------------
 *  NO WRITE DOOR ON THE CONTRACT ITSELF, AND NONE ON ITS INSTALMENTS YET
 *  ------------------------------------------------------------------
 *  Signing stays in `data/opportunities-write.ts` because signing is an act on
 *  a DEAL. Un-signing exists nowhere, deliberately. The server does carry two
 *  write doors for the payment plan (`POST` and `PATCH .../contracts/:code/terms`),
 *  and no screen calls them yet — the card below draws the plan read-only. A
 *  hook here with no caller would be a hook nobody runs, so the doors wait for
 *  the screen that edits a plan rather than the other way round. */

export const CONTRACT_BOOK_KEY = ['sales', 'contract-book'] as const

/** The three axes `ContractController` declares. Written ONCE, for the book and
 *  the single row alike.
 *
 *  `scoped` on this side cuts NOTHING — the browser holds no rows to cut and
 *  must never be where that is decided. It is a DECLARATION, so both ends of
 *  one permission matrix read the same sentence; the receipt for the real cut
 *  is `hidden` on the response (see `ApiNeed` in `app/api/client.ts`). */
const BOOK_NEED: ApiNeed = { branch: 'Sales', permission: 'hợp-đồng.xem', scoped: true }

/** Every field name `ContractBookQuery` accepts, read off the schema rather
 *  than copied by hand — the move `data/opportunities.ts` made, for the reason
 *  it wrote down: a hand-written list of names is the first place the two ends
 *  drift apart. */
const CONTRACT_BOOK_QUERY_KEYS = Object.keys(ContractBookQuery.shape) as (keyof ContractBookQuery)[]

export const DEFAULT_CONTRACT_BOOK_QUERY: ContractBookQuery = ContractBookQuery.parse({})

/** `ContractBookQuery` into URL parameters, DROPPING every field still at its
 *  default.
 *
 *  The screen writes the address with this very function, so the question sent
 *  to the server and the question in the address bar cannot disagree. Dropping
 *  defaults is required rather than decorative: without it the screen opens
 *  showing four parameters nobody chose, and those are exactly the four a user
 *  pastes verbatim into a shared link. */
export function contractBookQueryToParams(query: ContractBookQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of CONTRACT_BOOK_QUERY_KEYS) {
    const value = query[key]
    if (value === undefined) continue
    if (value === DEFAULT_CONTRACT_BOOK_QUERY[key]) continue
    params.set(key, String(value))
  }
  return params
}

/** Address into `ContractBookQuery`. NEVER throws.
 *
 *  People edit the address bar by hand, and a white screen over one stray
 *  character is worse than any other way of failing. Falling back drops the
 *  WHOLE question rather than field by field: picking "the fields that still
 *  look fine" out of a failed parse is re-deriving by hand the judgement zod
 *  just made. */
export function parseContractBookQuery(params: URLSearchParams): ContractBookQuery {
  const raw: Record<string, string> = {}
  for (const key of CONTRACT_BOOK_QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) raw[key] = value
  }
  const parsed = ContractBookQuery.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_CONTRACT_BOOK_QUERY
}

/** The book, ONE page at a time — `{ rows, total, hidden }`, the `paged()`
 *  shape.
 *
 *  The parameters ride in the `queryKey`; without that TanStack hands the
 *  previous filter's cache to the next filter. The key EXTENDS
 *  `CONTRACT_BOOK_KEY` so a write on the payment plan can invalidate by prefix
 *  and every cached page re-runs, with nobody having to list them. */
export const contractBookQuery = (query: ContractBookQuery) =>
  queryOptions({
    queryKey: [...CONTRACT_BOOK_KEY, 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<ContractBookResponse>(`/sales/contracts?${contractBookQueryToParams(query)}`, {
        need: BOOK_NEED,
        signal,
      }),
  })

/** One deal's contract, for the contract card on the deal profile.
 *
 *  ------------------------------------------------------------------
 *  READ BY CONTRACT CODE, NOT BY FILTERING THE BOOK ON A DEAL CODE
 *  ------------------------------------------------------------------
 *  `OpportunityRow` has carried `contractCode` since 29/08, so the deal profile
 *  already knows the code to ask for, and a book filter on the deal code would
 *  be a filter axis built to return exactly one row. `enabled` switches the
 *  query off while the deal is unsigned: an undefined code means there is
 *  nothing to ask, not ask for everything.
 *
 *  The code carries a non-ASCII letter, so it has to go through
 *  `encodeURIComponent` — unencoded, Fastify matches a different path. */
export const contractProfileQuery = (code: string | undefined) =>
  queryOptions({
    queryKey: [...CONTRACT_BOOK_KEY, 'one', code ?? null] as const,
    queryFn: ({ signal }) =>
      api.read<ContractBookRow>(`/sales/contracts/${encodeURIComponent(code ?? '')}`, {
        need: BOOK_NEED,
        signal,
      }),
    enabled: code !== undefined,
  })

/** A contract's value converted to the base currency, or `null` when it has
 *  no value at all.
 *
 *  `null` rather than 0, and the distance between those two is the whole reason
 *  this exists: the six older contracts genuinely carry no value on Neon, and
 *  the design settled on leaving them NULL instead of inventing revenue. A zero
 *  here would flow straight into the sum of every scorecard built later. */
export const contractDong = (c: ContractBookRow) =>
  c.amount === null || c.currency === null ? null : toDong(c.amount, c.currency)

/** The collection plan's total. Added on the screen, not on the server.
 *
 *  There is no `CHECK (SUM(amount) = contract.amount)` on the table — a `CHECK`
 *  cannot see other rows — so this total and `contract.amount` CAN disagree,
 *  and the screen has to be able to print both so a reader sees that they do.
 *  Hiding the addition on the server would hand the user one reconciled number
 *  for something nothing has reconciled. */
export const termsTotal = (terms: ContractTermRow[]) => terms.reduce((sum, t) => sum + t.amount, 0)

/** An instalment past its date — computed on read, never stored.
 *
 *  The table deliberately has no "overdue" status: overdue is `dueDate` before
 *  today, a value that moves with the clock, and freezing it into a column is
 *  the `days_here` mistake `docs/ban-giao-db.md` fixed once already. An
 *  instalment with no date cannot be overdue — no deadline, nothing to pass.
 *
 *  Compared as `YYYY-MM-DD` strings — they sort correctly, and unlike parsing
 *  both sides into `Date` there is no moment to get wrong.
 *
 *  "Today" is built from the LOCAL date parts, not from `toISOString()`. That
 *  method prints the UTC day, which in Hanoi is still yesterday until 07:00 —
 *  so an instalment that fell due yesterday would read as on time for the first
 *  seven hours of every working day. Same trap the sign drawer records for
 *  `signedAt`, in the other direction. */
export const isTermOverdue = (t: ContractTermRow, today = new Date()) =>
  t.status === 'cho-thu' && t.dueDate !== null && t.dueDate < localDay(today)

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
