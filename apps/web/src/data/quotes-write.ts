import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  totalsOf,
  type MaObject,
  type QuoteCreate,
  type QuoteDecision,
  type QuoteLineDraft,
  type QuoteRow,
  type QuoteUpdate,
  type QuoteWriteResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { QUOTE_BOOK_KEY } from '@/data/quotes'
import { OPPORTUNITY_BOOK_KEY } from '@/data/opportunities'

/** Module 4 · the five WRITE doors of the quotation book, and the form's shape.
 *
 *  ------------------------------------------------------------------
 *  THREE `ApiNeed`s, BECAUSE THREE PERMISSIONS — AND THEY DO NOT COLLAPSE
 *  ------------------------------------------------------------------
 *  Drafting is undone by typing over it. Sending is not — the sheet is in the
 *  customer's hands. Recording that the customer accepted is a decision about
 *  the AMOUNT a contract will be signed for, so it borrows the closing
 *  permission rather than minting a fourth one.
 *
 *  Declared here so the button is OFF before anybody presses it, instead of
 *  letting them fill the whole form and eat a 403. The real fence is still
 *  `@Need` on the server; this only stops the screen inviting people to do what
 *  they may not. */

const BOOK_PATH = '/sales/quotes'

export const QUOTE_WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'báo-giá.sửa' }

export const QUOTE_SEND_NEED: ApiNeed = {
  branch: 'Sales',
  permission: 'báo-giá.gửi',
  scoped: true,
}

export const QUOTE_DECIDE_NEED: ApiNeed = {
  branch: 'Sales',
  permission: 'cơ-hội.chốt',
  scoped: true,
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/** One line item AS SOMEBODY IS TYPING IT.
 *
 *  The numbers are STRINGS, and that is the whole point of this type: an input
 *  bound to a numeric `value` will not accept "1." or an empty box halfway
 *  through — React writes the deleted character straight back, so the field
 *  cannot be cleared and a decimal point cannot be typed. Keep strings in state,
 *  convert exactly once in `toLineDraft` below.
 *
 *  The same boundary the deal book's `draftOf` holds for text fields
 *  (`undefined` on the wire, `''` in the box), here for numeric ones. */
export type QuoteLineForm = {
  description: string
  unit: string
  qty: string
  unitPrice: string
  discountPct: string
  vatPct: string
}

/** The compose modal's form. */
export type QuoteForm = {
  title: string
  note: string
  validUntil: string
  currency: 'VND' | 'USD'
  lines: QuoteLineForm[]
}

/** Default VAT on a new line.
 *
 *  10% because that is the rate on most of what the company sells, so in the
 *  common case it is a number nobody has to type. Still editable per line — that
 *  is the entire reason VAT sits at line level rather than document level. */
const DEFAULT_VAT = '10'

export const emptyLine = (): QuoteLineForm => ({
  description: '',
  unit: '',
  qty: '1',
  unitPrice: '',
  discountPct: '0',
  vatPct: DEFAULT_VAT,
})

/** A typed numeric field to a number. Empty and rubbish both become 0.
 *
 *  Does not throw: a half-typed box is a normal state, and `missingOf` below is
 *  the place that decides whether the form may be submitted. */
const num = (s: string): number => {
  const v = Number(s.trim().replace(/\s/g, ''))
  return Number.isFinite(v) ? v : 0
}

/** A form line to a contract line. `lineNo` comes from the array position, so
 *  the two arrow buttons that reorder the array reorder the printed sheet too —
 *  there is no second column to forget to update. */
export const toLineDraft = (line: QuoteLineForm, index: number): QuoteLineDraft => ({
  lineNo: index + 1,
  description: line.description,
  ...(line.unit.trim() === '' ? {} : { unit: line.unit }),
  qty: num(line.qty),
  unitPrice: num(line.unitPrice),
  discountPct: num(line.discountPct),
  vatPct: num(line.vatPct),
})

/** The four numbers of the summary panel, computed by the SAME function the
 *  server writes the columns with.
 *
 *  `totalsOf` comes from `@pv/contracts`, and the `line_total` column in
 *  Postgres is the same expression. Three places, one formula: the total running
 *  under the user's fingers IS the number that will be in the table after they
 *  press save, not the screen's estimate of it. */
export const formTotals = (lines: QuoteLineForm[]) => totalsOf(lines.map(toLineDraft))

/** What is still missing before this form can be saved — a LIST OF WORDS, not a
 *  boolean.
 *
 *  A greyed-out button with no reason is a dead end: the user cannot tell which
 *  field to fix to light it again. This copy checks the same conditions
 *  `QuoteCreate` checks on the server — the two are not duplication: this one
 *  toggles a button before any request exists, that one is the real fence for
 *  every caller. */
export function missingOf(form: QuoteForm): string[] {
  const missing: string[] = []
  if (form.title.trim() === '') missing.push('tiêu đề báo giá')
  if (form.validUntil === '') missing.push('hạn hiệu lực')
  if (form.lines.length === 0) missing.push('ít nhất một dòng hàng')
  if (form.lines.some((l) => l.description.trim() === '')) missing.push('mô tả của mọi dòng hàng')
  if (form.lines.some((l) => num(l.qty) <= 0)) missing.push('số lượng lớn hơn 0 ở mọi dòng')
  return missing
}

/** Form to request body. One function for all three write doors, because all
 *  three take the same fields — what differs is what the SERVER does with them,
 *  and the place that says so is the path. */
export function bodyOf(form: QuoteForm): QuoteUpdate {
  return {
    title: form.title,
    ...(form.note.trim() === '' ? {} : { note: form.note }),
    validUntil: form.validUntil,
    currency: form.currency,
    lines: form.lines.map(toLineDraft),
  }
}

/** An existing version to a form — for editing it, and for seeding the next
 *  round from the one it replaces.
 *
 *  The common case of a negotiation round is EXACTLY ONE number changing, so
 *  seeding the whole sheet is the difference between editing one box and
 *  retyping ten lines.
 *
 *  `validUntil` IS carried over here, because for an edit that is the right
 *  answer: somebody reopening a draft to fix a price has not asked for its
 *  expiry to be cleared, and a blank required field would block the save button
 *  on a form they never touched. The REPLACE path overwrites it with a fresh
 *  date in the modal instead — the old sheet's expiry belongs to the previous
 *  offer, and carrying it into a new one can hand the customer paper that
 *  expired before it was sent. One function, and the caller that needs the other
 *  behaviour says so. */
export function formOf(quote: QuoteRow): QuoteForm {
  return {
    title: quote.title,
    note: quote.note ?? '',
    validUntil: quote.validUntil,
    currency: quote.currency,
    lines: quote.lines.map((l) => ({
      description: l.description,
      unit: l.unit ?? '',
      qty: String(l.qty),
      unitPrice: String(l.unitPrice),
      discountPct: String(l.discountPct),
      vatPct: String(l.vatPct),
    })),
  }
}

// ---------------------------------------------------------------------------
// The five doors
// ---------------------------------------------------------------------------

/** `api.write`, never `fetch`: a write door goes through the SAME interceptor
 *  chain every read does — it stamps the session, refuses a dead one, and asks
 *  E2 before a single byte leaves the browser. A bare `fetch` in a `mutationFn`
 *  is a data path that walks around the permission fence. */
function draftQuote(body: QuoteCreate): Promise<QuoteWriteResponse> {
  return api.write<QuoteWriteResponse>(BOOK_PATH, {
    method: 'POST',
    body,
    need: QUOTE_WRITE_NEED,
  })
}

function saveQuote(code: MaObject, body: QuoteUpdate): Promise<QuoteWriteResponse> {
  return api.write<QuoteWriteResponse>(`${BOOK_PATH}/${code}`, {
    method: 'PATCH',
    body,
    need: QUOTE_WRITE_NEED,
  })
}

function replaceQuote(code: MaObject, body: QuoteUpdate): Promise<QuoteWriteResponse> {
  return api.write<QuoteWriteResponse>(`${BOOK_PATH}/${code}/replace`, {
    method: 'POST',
    body,
    need: QUOTE_WRITE_NEED,
  })
}

function sendQuote(code: MaObject): Promise<QuoteWriteResponse> {
  return api.write<QuoteWriteResponse>(`${BOOK_PATH}/${code}/send`, {
    method: 'POST',
    need: QUOTE_SEND_NEED,
  })
}

function decideQuote(code: MaObject, body: QuoteDecision): Promise<QuoteWriteResponse> {
  return api.write<QuoteWriteResponse>(`${BOOK_PATH}/${code}/decide`, {
    method: 'POST',
    body,
    need: QUOTE_DECIDE_NEED,
  })
}

/** Invalidate BOTH books after every write, and the second one is not spare.
 *
 *  Sending a quote pushes the deal onto the quotation step IN THE SAME
 *  transaction — that is the entire point of the send door — so a deal book left
 *  un-refetched draws the deal in its old column until the next mount, and the
 *  person who just pressed send is the person looking at that deal.
 *
 *  By PREFIX, so every page sitting in the cache re-runs; nobody has to remember
 *  to list the keys. */
function useQuoteInvalidate() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: QUOTE_BOOK_KEY })
    void client.invalidateQueries({ queryKey: OPPORTUNITY_BOOK_KEY })
  }
}

export function useDraftQuote() {
  const invalidate = useQuoteInvalidate()
  return useMutation<QuoteWriteResponse, ApiError, QuoteCreate>({
    mutationFn: draftQuote,
    onSuccess: invalidate,
  })
}

export function useSaveQuote(code: MaObject) {
  const invalidate = useQuoteInvalidate()
  return useMutation<QuoteWriteResponse, ApiError, QuoteUpdate>({
    mutationFn: (body) => saveQuote(code, body),
    onSuccess: invalidate,
  })
}

export function useReplaceQuote(code: MaObject) {
  const invalidate = useQuoteInvalidate()
  return useMutation<QuoteWriteResponse, ApiError, QuoteUpdate>({
    mutationFn: (body) => replaceQuote(code, body),
    onSuccess: invalidate,
  })
}

export function useSendQuote() {
  const invalidate = useQuoteInvalidate()
  return useMutation<QuoteWriteResponse, ApiError, MaObject>({
    mutationFn: sendQuote,
    onSuccess: invalidate,
  })
}

export function useDecideQuote() {
  const invalidate = useQuoteInvalidate()
  return useMutation<QuoteWriteResponse, ApiError, { code: MaObject; body: QuoteDecision }>({
    mutationFn: ({ code, body }) => decideQuote(code, body),
    onSuccess: invalidate,
  })
}
