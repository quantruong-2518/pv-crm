import {
  totalsOf,
  type CurrencyCode,
  type QuoteLineDraft,
  type QuoteLineRow,
  type QuoteRow,
  type QuoteStatus,
} from '@pv/contracts'
import type { ObjectRef } from '@pv/engines'
import type { quote, quoteLine, QuoteLineRowDb, QuoteRowDb } from './quote.schema'

/** Table to wire. Decides nothing, reads nothing.
 *
 *  ------------------------------------------------------------------
 *  TWO NUMBER SYSTEMS MEET HERE, AND THIS IS THE ONLY PLACE THEY DO
 *  ------------------------------------------------------------------
 *  `qty`, `discount_pct` and `vat_pct` are `numeric` columns, and a driver hands
 *  `numeric` back as a STRING — deliberately, because the type carries more
 *  precision than a JS number can hold. The wire wants numbers. Converting in
 *  one direction in one function, and back in the other, is what stops a screen
 *  from receiving `'3.00'` where it expects `3` and rendering it into an
 *  arithmetic that silently concatenates.
 *
 *  ------------------------------------------------------------------
 *  THE FOUR TOTALS ARE COMPUTED FROM THE DRAFT, NOT READ BACK
 *  ------------------------------------------------------------------
 *  `totalsOf` comes from `@pv/contracts` — the same function the compose modal
 *  prints its summary panel with, so the number the user watched add up is the
 *  number that lands in the column. It sums per-line values built by the same
 *  two-stage rounding the GENERATED column uses, so the row's `total` equals the
 *  sum of the stored `line_total`s exactly. */

/** Columns of a `sales.quote` row, minus the two the server assigns inside the
 *  transaction.
 *
 *  `code` and `version` are absent for the same reason a deal draft has no
 *  code: the only legal source of one is the sequence, and of the other
 *  `max(version)+1` within the deal, both read under the transaction that
 *  writes the row. A draft carrying either is an invitation to mint it
 *  elsewhere. */
export type QuoteValues = Omit<typeof quote.$inferInsert, 'code' | 'version'>

/** Columns of a line, minus its owner and minus the generated total. */
export type QuoteLineValues = Omit<typeof quoteLine.$inferInsert, 'quoteCode' | 'lineTotal'>

/** What one write door has ready before it opens a transaction. */
export type QuoteWrite = {
  values: QuoteValues
  lines: QuoteLineValues[]
}

/** The compose form plus its context, turned into columns.
 *
 *  `status` is a parameter rather than a constant because both write doors that
 *  use this produce a DRAFT today — but the parameter is what stops a future
 *  door from reaching around the mapper to set the column directly, which is
 *  how `sent_at` and `status` would start disagreeing across the CHECK that
 *  pairs them. `sentAt` is likewise derived here, never passed in: the pair is
 *  one fact and one function owns it. */
export function fromDraft(
  body: {
    title: string
    note?: string | undefined
    validUntil: string
    currency: CurrencyCode
    lines: readonly QuoteLineDraft[]
  },
  ctx: { opportunityCode: string; leadCode: string; createdBy: string; status: QuoteStatus },
): QuoteWrite {
  const totals = totalsOf(body.lines)

  return {
    values: {
      opportunityCode: ctx.opportunityCode,
      leadCode: ctx.leadCode,
      status: ctx.status,
      sentAt: null,
      decidedAt: null,
      validUntil: body.validUntil,
      currency: body.currency,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      total: totals.total,
      title: body.title,
      note: body.note ?? null,
      createdBy: ctx.createdBy,
    },
    lines: body.lines.map((l) => toLineValues(l)),
  }
}

/** One line, wire to column. `numeric` takes a string — see the file docblock. */
function toLineValues(line: QuoteLineDraft): QuoteLineValues {
  return {
    lineNo: line.lineNo,
    description: line.description,
    unit: line.unit ?? null,
    qty: line.qty.toFixed(2),
    unitPrice: line.unitPrice,
    discountPct: line.discountPct.toFixed(2),
    vatPct: line.vatPct.toFixed(2),
  }
}

/** The columns a SAVE is allowed to move.
 *
 *  A narrowing type rather than a discipline: the four columns left out —
 *  `opportunity_code`, `lead_code`, `status`, `created_by` — are the ones that
 *  would let an edit move a quote to another deal, resurrect a sent version, or
 *  rewrite who drafted it. A column absent from the object is a column the
 *  `UPDATE … SET` never mentions, which is a stronger promise than remembering
 *  not to set it. Same move `OpportunityEdit` makes by dropping `leadCode`.
 *
 *  `sent_at` and `decided_at` are left out too, and that pairing is what keeps
 *  `quote_sent_pair` satisfiable: the two timestamps move only through
 *  `markSent` and `markDecided`, beside the status they belong to. */
export function editsOf(
  values: QuoteValues,
): Pick<
  QuoteValues,
  'validUntil' | 'currency' | 'subtotal' | 'discountTotal' | 'vatTotal' | 'total' | 'title' | 'note'
> {
  return {
    validUntil: values.validUntil,
    currency: values.currency,
    subtotal: values.subtotal,
    discountTotal: values.discountTotal,
    vatTotal: values.vatTotal,
    total: values.total,
    title: values.title,
    note: values.note,
  }
}

/** Columns that change when a draft is sent.
 *
 *  Both halves of the CHECK pair move together and only here, so there is no
 *  write path that can set one without the other. */
export function markSent(now: Date): Pick<QuoteValues, 'status' | 'sentAt'> {
  return { status: 'da-gui', sentAt: now }
}

/** Columns that change when the customer answers. */
export function markDecided(
  outcome: 'khach-chot' | 'khach-tu-choi',
  now: Date,
): Pick<QuoteValues, 'status' | 'decidedAt'> {
  return { status: outcome, decidedAt: now }
}

/** One line, column to wire. */
export function toLineContract(row: QuoteLineRowDb): QuoteLineRow {
  return {
    lineNo: row.lineNo,
    description: row.description,
    ...(row.unit ? { unit: row.unit } : {}),
    qty: Number(row.qty),
    unitPrice: row.unitPrice,
    discountPct: Number(row.discountPct),
    vatPct: Number(row.vatPct),
    lineTotal: row.lineTotal,
  }
}

/** One quote, as a screen reads it. */
export function toContract(input: {
  row: QuoteRowDb
  /** The customer's name, read from `sales.lead` — the book prints people, not
   *  codes. */
  account: string
  lines: QuoteLineRowDb[]
}): QuoteRow {
  const { row } = input

  return {
    code: row.code,
    version: row.version,
    opportunityCode: row.opportunityCode,
    leadCode: row.leadCode,
    account: input.account,
    status: row.status,
    currency: row.currency,
    title: row.title,
    ...(row.note ? { note: row.note } : {}),
    validUntil: row.validUntil,
    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    vatTotal: row.vatTotal,
    total: row.total,
    sentAt: row.sentAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lines: input.lines.map(toLineContract),
  }
}

/** The `platform.object` mirror row for a quote.
 *
 *  Without one, `story()` cannot see the quote at all and the rail jumps
 *  straight from the deal to the contract — rule 10 breaking in silence, the way
 *  the object mirror's own docblock describes. `quote.code` carries no foreign
 *  key into that table (same gap the deal code has), so the ordering here is
 *  service discipline rather than a fence; the EDGE endpoints are fenced, which
 *  is what makes the mirror write happen first in practice.
 *
 *  `state` carries the quote status and `amount` the grand total, so the rail
 *  can print "which draft, worth how much" without joining a branch table —
 *  which platform is not allowed to do. `owner` is the display NAME of the Sale
 *  standing on the parent deal, because the mirror table holds labels while the
 *  join table holds ids. */
export function refOf(
  row: Pick<QuoteRowDb, 'code' | 'status' | 'total' | 'title'>,
  opts: { account: string; ownerName: string | null },
): ObjectRef {
  return {
    code: row.code,
    kind: 'BG',
    branch: 'Sales',
    label: `${opts.account} · ${row.title}`,
    ...(opts.ownerName ? { owner: opts.ownerName } : {}),
    state: row.status,
    amount: row.total,
  }
}
