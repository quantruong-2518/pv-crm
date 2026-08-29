import { z } from 'zod'
import { PageQuery, SortDir, paged } from '../pagination'
import { Dong, MaObject, Moc, Ngay, textNhap, textNhapTuyChon } from '../primitives'
import { CurrencyCode } from './enums'

/** Module 4 · Quote — the wire shape of the quotation book.
 *
 *  ------------------------------------------------------------------
 *  THIS FILE IS A LEAF, AND THAT IS LOAD-BEARING
 *  ------------------------------------------------------------------
 *  It imports `../primitives`, `../pagination` and `./enums` — nothing under
 *  `./sales` that could import back. `./contract` will import THIS module one
 *  way (a contract points at the quote version it was signed from); the reverse
 *  direction would close a module cycle that dies at load time, which is not a
 *  hypothetical here: the contract number primitive had to move up into
 *  `primitives.ts` the day the deal row grew a contract code, and the reasoning
 *  is written out where that declaration now stands.
 *
 *  ------------------------------------------------------------------
 *  ONE CODE PER VERSION — THE DECISION EVERYTHING ELSE HANGS OFF
 *  ------------------------------------------------------------------
 *  `BG-5001` is the first draft. The customer asks for a discount and the next
 *  draft is `BG-5002`, a wholly new number. `version` is a reading aid ("draft
 *  2"), never a key. The superseded row is NEVER updated — it stays as it was,
 *  with a status saying it has been replaced.
 *
 *  The reason is that `BG-5001` has already LEFT the system: it is in the letter
 *  the customer is holding, in an E1 edge, in a touch row. Editing it in place
 *  means the paper in their hand and the row in the machine quietly disagree,
 *  and nothing anywhere records that they did.
 *
 *  Two things fall out of the shape, and both are why it is worth the gaps it
 *  burns in the number sequence:
 *
 *   · the contract's foreign key needs TWO columns instead of three, because a
 *     quote code identifies a version on its own;
 *   · the mail `event_key` differs between versions for free. One code carrying
 *     several drafts would collide on `<flow>/<audience>/v1/<code>`, and the
 *     outbox insert is `onConflictDoNothing` — it would swallow the second
 *     letter in silence. No error, no log, and a customer who receives nothing.
 *
 *  ------------------------------------------------------------------
 *  MONEY IS ROUNDED TWICE PER LINE, AND THE FORMULA LIVES HERE
 *  ------------------------------------------------------------------
 *  `sales.quote_line.line_total` is a GENERATED column: Postgres owns the
 *  number, because a stored column cannot drift from the row it is computed
 *  from. But the compose modal has to print a running total BEFORE anything is
 *  written, so the same arithmetic has to exist on the screen too.
 *
 *  It exists exactly once, right below, and the SQL expression mirrors it —
 *  same split as `STAGE_OF_STATE`, one table read by both ends. A second copy
 *  typed into a screen is how the paper and the database start disagreeing by a
 *  few dong, and a few dong on a billion-dong document is a phone call. */

// ---------------------------------------------------------------------------
// THE LIFECYCLE
// ---------------------------------------------------------------------------

/** Five statuses, and there is deliberately no `expired` among them.
 *
 *  Expiry is `valid_until < today`, computed WHEN READ. Storing it as a status
 *  rebuilds the `days_here` mistake the schema notes already record once: a
 *  number that changes with the clock, frozen into a column that only a nightly
 *  job could keep honest.
 *
 *  `thay-the` is written when the NEXT version is SENT, not when it is drafted.
 *  Starting a draft and abandoning it half-written must not kill the version the
 *  customer is holding — otherwise the deal has no live quote while nobody has
 *  sent the customer anything. */
export const QuoteStatus = z.enum(['nhap', 'da-gui', 'khach-chot', 'khach-tu-choi', 'thay-the'])

/** The two ways a customer answers. A subset of `QuoteStatus` rather than an
 *  enum of its own: the decide door writes one of these values straight into
 *  the status column, so a second vocabulary would only be a mapping table
 *  waiting to fall out of step. */
export const QuoteOutcome = z.enum(['khach-chot', 'khach-tu-choi'])

// ---------------------------------------------------------------------------
// LINE ITEMS
// ---------------------------------------------------------------------------

/** A percentage, 0…100, at most two decimals.
 *
 *  Bounded on both ends because neither end is meaningful: a negative discount
 *  is a surcharge nobody asked this form for, and a discount above 100 turns a
 *  line total negative — which the two-stage rounding below would happily carry
 *  all the way to the printed grand total. */
const Pct = z
  .number('Phần trăm là bắt buộc')
  .min(0, 'Không được âm')
  .max(100, 'Tối đa 100%')
  .refine((v) => Number.isInteger(v * 100), 'Tối đa hai chữ số thập phân')

/** Quantity. `numeric(12,2)` in the table, so two decimals here as well.
 *
 *  Strictly positive: a zero-quantity line prints on the customer's paper as a
 *  row worth nothing, which is a line somebody meant to delete. */
const Qty = z
  .number('Số lượng là bắt buộc')
  .positive('Số lượng phải lớn hơn 0')
  .max(9_999_999_999, 'Số lượng quá lớn')
  .refine((v) => Number.isInteger(v * 100), 'Tối đa hai chữ số thập phân')

/** What a person types into one row of the line table.
 *
 *  `lineTotal` is absent, and its absence is the contract: the server computes
 *  it, Postgres stores it, and a body carrying its own total is a body that can
 *  make the paper say one thing while the columns say another. */
export const QuoteLineDraft = z.object({
  /** Position on the printed page, 1-based. Sent rather than inferred from the
   *  array index so that the two arrow buttons that reorder rows have something
   *  to move, and so a reordered draft round-trips unchanged. */
  lineNo: z.number('Số dòng là bắt buộc').int().min(1).max(200),
  description: textNhap(500),
  /** Unit of measure — 'bo', 'thang', 'nguoi'. Optional because a solution line
   *  ("Factory MES + One Plus") has no unit anybody would print. */
  unit: textNhapTuyChon(32),
  qty: Qty,
  unitPrice: Dong,
  discountPct: Pct,
  vatPct: Pct,
})

/** One line as a screen reads it back — the draft plus the number Postgres
 *  computed. */
export const QuoteLineRow = QuoteLineDraft.extend({
  lineTotal: Dong,
})

/** At most this many lines on one quote. A bound rather than a hope, same
 *  reasoning as the attachment cap on a deal: every read of the book carries
 *  the whole array, so an unbounded one is a row that grows past what the book
 *  expects to hold. */
const MAX_LINES = 100

// ---------------------------------------------------------------------------
// THE ARITHMETIC — one declaration, two ends
// ---------------------------------------------------------------------------

/** What one line is worth after its discount and before VAT, in whole dong.
 *
 *  Rounded here, then rounded again in `lineTotalOf` — two stages, each landing
 *  on a whole dong. That is not fussiness: the customer adds up the printed
 *  "thanh tien" column by hand, and the grand total the machine prints has to
 *  match that addition. Summing first and rounding once at the end differs by a
 *  few dong, and those few dong are the ones somebody phones about. */
export function lineNetOf(line: { qty: number; unitPrice: number; discountPct: number }): number {
  return Math.round(line.qty * line.unitPrice * (1 - line.discountPct / 100))
}

/** What one line is worth with VAT — the printed "thanh tien" cell.
 *
 *  MUST stay identical to the `line_total` expression in `quote.schema.ts`.
 *  Postgres owns the stored value; this exists so the compose modal can show a
 *  total before the first save. */
export function lineTotalOf(line: {
  qty: number
  unitPrice: number
  discountPct: number
  vatPct: number
}): number {
  return Math.round(lineNetOf(line) * (1 + line.vatPct / 100))
}

/** The four numbers under the line table, and the four columns on the row.
 *
 *  ------------------------------------------------------------------
 *  THE DESIGN NAMES THE FOUR COLUMNS BUT NOT THEIR FORMULAS — THIS IS THE
 *  CHOICE THAT WAS MADE, AND WHY
 *  ------------------------------------------------------------------
 *  The cheapest set that adds up exactly, with no fifth number to reconcile:
 *
 *      subtotal      sum of the lines BEFORE any discount
 *      discountTotal what the discounts took off
 *      vatTotal      what VAT put back on
 *      total         sum of the printed line totals
 *
 *  and by construction `total === subtotal - discountTotal + vatTotal`, so the
 *  summary panel is an addition the reader can follow rather than four numbers
 *  that happen to appear together. `total` being the plain sum of the line
 *  totals is the part that must not be traded away — it is the number the
 *  contract is signed for, and it has to equal what the customer adds up.
 *
 *  VAT is per LINE, not per document, because a software licence is taxed at a
 *  different rate from training. Per-line covers per-document (set the same
 *  percentage on every row); the reverse does not open back up.
 *
 *  Written into the row's four columns by the service, inside the transaction
 *  that changed a line — a cross-row SUM is the one thing a GENERATED column
 *  cannot do. NOT computed at read time: the number on a contract has to be the
 *  number frozen when the customer accepted, not one recomputed every time
 *  somebody opens a screen. */
export function totalsOf(
  lines: readonly { qty: number; unitPrice: number; discountPct: number; vatPct: number }[],
): { subtotal: number; discountTotal: number; vatTotal: number; total: number } {
  let subtotal = 0
  let net = 0
  let total = 0

  for (const line of lines) {
    subtotal += Math.round(line.qty * line.unitPrice)
    net += lineNetOf(line)
    total += lineTotalOf(line)
  }

  return { subtotal, discountTotal: subtotal - net, vatTotal: total - net, total }
}

// ---------------------------------------------------------------------------
// THE WRITE DOORS
// ---------------------------------------------------------------------------

/** The fields a person fills in on the compose modal.
 *
 *  Shared by three doors — create, edit, and "draft a replacement" — because
 *  they are one form opened from three places. A quote drafted from scratch and
 *  a quote seeded from the version it replaces ask for exactly the same things;
 *  what differs is what the SERVER does with the answer, and that difference
 *  belongs in the service, not in three near-identical schemas. */
const quoteFields = {
  /** The heading printed on the customer's paper. */
  title: textNhap(200),
  note: textNhapTuyChon(2_000),

  /** How long the numbers hold. A calendar day, not a moment: "valid until the
   *  15th" is a date somebody reads off paper, and expiry is decided by
   *  comparing it to today rather than by a stored status. */
  validUntil: Ngay,

  currency: CurrencyCode,
}

/** `POST /sales/quotes` — draft the first quote on a deal.
 *
 *  `opportunityCode` travels in the BODY, not on the path, and that is what
 *  makes the door un-scopable: there is no `ref` for the access guard to read
 *  before the row exists. The scope check therefore has to happen in the
 *  service, against the PARENT DEAL — skip it and a Sale who may only see their
 *  own deals can draft a quote on somebody else's. No other door catches that.
 *
 *  `code` and `version` are absent for the reason the deal create door has no
 *  `code`: the server mints both, the sequence for one and `max(version)+1`
 *  within the deal for the other, and a body naming its own would be two tabs
 *  racing for one primary key. `version` in particular is NOT derivable from
 *  the code — `BG-5002` may be version 2 of this deal or version 1 of another,
 *  because the sequence belongs to the whole system rather than to one deal. */
export const QuoteCreate = z.object({
  opportunityCode: MaObject,
  ...quoteFields,
  lines: z
    .array(QuoteLineDraft)
    .min(1, 'Báo giá phải có ít nhất một dòng hàng')
    .max(MAX_LINES, `Tối đa ${MAX_LINES} dòng hàng`),
})

/** `PATCH /sales/quotes/:code` — save a draft that has not left the building.
 *
 *  Same shape as create minus the deal: a quote does not move to another
 *  opportunity, and a request that could move it could rewrite somebody's
 *  pipeline by typo. The server answers 409 once the quote has been sent —
 *  editing a version the customer is holding is the exact thing the one-code-
 *  per-version rule exists to prevent. */
export const QuoteUpdate = QuoteCreate.omit({ opportunityCode: true })

/** `POST /sales/quotes/:code/replace` — the next round of negotiation.
 *
 *  Same body as an edit, entirely different act: this one mints a NEW code,
 *  numbers it `max(version)+1`, and links it behind the version it replaces.
 *  The screen seeds the modal from the old lines so the common case (one number
 *  changed) is a single edit. */
export const QuoteReplace = QuoteUpdate

/** `POST /sales/quotes/:code/decide` — record what the customer said.
 *
 *  Guarded by the DEAL-CLOSING permission rather than a quote permission of its
 *  own. The hand that marks a version accepted is the hand that decides the
 *  number a contract will be signed for, so binding the two to one permission
 *  describes what actually happens and saves a row in the matrix. */
export const QuoteDecision = z.object({
  outcome: QuoteOutcome,
  /** What the customer said, when they said anything worth keeping. */
  note: textNhapTuyChon(1_000),
})

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One quote, as a screen prints it. */
export const QuoteRow = z.object({
  code: MaObject,
  /** Reading aid — "draft 2 of this deal". Never a key, and never inferred from
   *  the code; see the docblock at the top of this file. */
  version: z.number().int().min(1),

  opportunityCode: MaObject,
  leadCode: MaObject,
  /** The customer's name, carried so the book need not join the lead book to
   *  print who a quote is for.
   *
   *  NOT in the design's field list, and added deliberately: the quote book cuts
   *  ACROSS every deal, so a row that names only codes is a row nobody can read.
   *  Same call the deal book already made for the same reason. */
  account: textNhap(200),

  status: QuoteStatus,
  currency: CurrencyCode,
  title: textNhap(200),
  note: z.string().optional(),

  validUntil: Ngay,

  subtotal: Dong,
  discountTotal: Dong,
  vatTotal: Dong,
  total: Dong,

  /** When it left the building. Present exactly when the status is not `nhap` —
   *  the table enforces that pairing with a CHECK, so a screen may read either
   *  one and get the same answer. */
  sentAt: Moc.nullable(),
  /** When the customer answered. `null` until they do. */
  decidedAt: Moc.nullable(),
  createdAt: Moc,

  lines: z.array(QuoteLineRow),
})

/** `GET /sales/quotes/:code` — one version, plus every version of the same deal.
 *
 *  BOTH halves, because the screen needs both and neither implies the other:
 *  the quote card prints the live version with the superseded ones indented
 *  under it, and "which drafts came before this one" cannot be asked of a single
 *  row. `versions` INCLUDES the one asked for, ordered oldest first, so the card
 *  renders one list and `quote.code` marks where the reader is standing. */
export const QuoteDetail = z.object({
  quote: QuoteRow,
  versions: z.array(QuoteRow),
})

// ---------------------------------------------------------------------------
// ASKING THE BOOK A NARROWER QUESTION
// ---------------------------------------------------------------------------

/** Columns the book may be sorted by. A closed list for the reason every other
 *  book has one: a sort key with no column behind it has to die at the zod gate
 *  rather than inside the query builder.
 *
 *  `validUntil` is here because it answers the question the book exists for —
 *  "which quotes are about to go stale". */
export const QuoteSortKey = z.enum(['createdAt', 'validUntil', 'total'])

/** What `GET /sales/quotes` accepts.
 *
 *  `opportunityCode` is the filter the deal profile's quote card rides on, and
 *  it is why that card needs no door of its own: "every version on this deal" is
 *  the book asked a narrower question. Adding a second door returning the same
 *  rows would be two definitions of one list. */
export const QuoteBookQuery = PageQuery.extend({
  opportunityCode: MaObject.optional(),
  leadCode: MaObject.optional(),
  status: QuoteStatus.optional(),

  /** Free text, matched against the quote code, its title and the customer —
   *  the three things people paste into one box. */
  q: z.string().trim().min(1).max(120).optional(),

  /** Newest first by default, which is both what the screen shows before anybody
   *  touches a header and what the repository already did.
   *
   *  `code` is appended as a final tiebreaker on every sort, for the reason the
   *  deal book records: ties make paging unstable, so the same row lands on two
   *  pages or on neither. */
  sort: QuoteSortKey.default('createdAt'),
  dir: SortDir.default('desc'),
})

export const QuoteBookResponse = paged(QuoteRow)

/** Every write door answers with the whole row, in the same shape a read gives.
 *
 *  Not `{ ok: true }`: the screen that just saved needs to know what the server
 *  normalised it into — which code was minted, which version number it landed
 *  on, what the four totals came to. Returning a flag and making the caller ask
 *  again is two round trips for one question, and between them the screen shows
 *  numbers it guessed. */
export const QuoteWriteResponse = QuoteRow

export type QuoteStatus = z.infer<typeof QuoteStatus>
export type QuoteOutcome = z.infer<typeof QuoteOutcome>
export type QuoteLineDraft = z.infer<typeof QuoteLineDraft>
export type QuoteLineRow = z.infer<typeof QuoteLineRow>
export type QuoteCreate = z.infer<typeof QuoteCreate>
export type QuoteUpdate = z.infer<typeof QuoteUpdate>
export type QuoteReplace = z.infer<typeof QuoteReplace>
export type QuoteDecision = z.infer<typeof QuoteDecision>
export type QuoteRow = z.infer<typeof QuoteRow>
export type QuoteDetail = z.infer<typeof QuoteDetail>
export type QuoteSortKey = z.infer<typeof QuoteSortKey>
export type QuoteBookQuery = z.infer<typeof QuoteBookQuery>
export type QuoteBookResponse = z.infer<typeof QuoteBookResponse>
export type QuoteWriteResponse = z.infer<typeof QuoteWriteResponse>
