import { z } from 'zod'
import { Ngay } from '../primitives'

/** Bounds and formats EVERY lead door shares — one table, four readers.
 *
 *  ------------------------------------------------------------------
 *  WHY THE NUMBERS MOVED OUT OF THE SCHEMAS
 *  ------------------------------------------------------------------
 *  The same ceilings were typed out in four places: `LeadCreate` and
 *  `LeadPatch` (`./lead`), `LeadIntakeBody` (`./lead-intake`), and `TEXT` in
 *  `apps/api/.../lead-import.check.ts` — which says in its own docblock that it
 *  reuses `LeadCreate`'s bounds "so both doors accept the same data", while
 *  actually re-typing all nine of them. Four copies of `200` is four chances
 *  for one door to accept a company name another door refuses, and the lead
 *  book then holds values the create form could never have produced.
 *
 *  The form needs the same numbers for a second reason: a `maxLength` on the
 *  control is the difference between learning about a ceiling while typing and
 *  learning about it after pressing the button on a twenty-field form. Reading
 *  them off the zod schemas would mean `apps/web` digging into zod internals —
 *  it does not depend on zod's types and should not start (`data/lead-create.ts`
 *  says so where it probes the shape). A plain table crosses that boundary
 *  without dragging the library across it.
 *
 *  The table is CHARACTER ceilings, not column widths: every text column of
 *  `sales.lead` is an unbounded `text`, so these numbers are the only ceiling
 *  that exists anywhere. */
export const LEAD_MAX = {
  company: 200,
  legalName: 200,
  /** 10 digits, or 13 with a branch suffix written `##########-###`. The SHAPE
   *  is `taxCodeOptional`'s job; this number is the raw box, and it is wider
   *  than the 14 characters a canonical code needs because the decoration comes
   *  off afterwards — '0201 234 567 001' is 16 characters of one legal code. */
  taxCode: 20,
  address: 255,
  province: 64,
  mainProduct: 200,
  contactName: 120,
  contactTitle: 120,
  contactChannelUrl: 500,
  pain: 1_000,
  currentStack: 500,
  decisionMaker: 120,
  approver: 120,
  /** `platform.actor.id` on the wire, and the same ceiling `LeadOwnerWrite`
   *  puts on it. */
  actorId: 64,
  /** A campaign code — `MaConfig` shaped, but the file door takes it as free
   *  text because a spreadsheet cell is not validated against the campaign
   *  book until the server resolves it. */
  campaignCode: 64,
  /** The name of an uploaded file, echoed into the batch record. */
  fileName: 255,
} as const

/** Numeric ceilings, for the same reason and with one addition.
 *
 *  `budget` used to have no upper bound at all while `headcount` and `plants`
 *  both did, and the gap showed on screen: a fat-fingered budget fell through
 *  to `z.number().int()`, whose own ceiling is `MAX_SAFE_INTEGER` and whose own
 *  message is English — "Too big: expected int to be <=9007199254740991" — in
 *  the middle of a Vietnamese form. A stated ceiling gives it a stated
 *  sentence, and 10^15 dong is already four orders of magnitude above the
 *  largest deal anyone has typed. */
export const LEAD_NUM = {
  headcountMax: 1_000_000,
  plantsMax: 1_000,
  budgetMax: 1_000_000_000_000_000,
} as const

/** A COUNT of something: whole, above zero, under a stated ceiling.
 *
 *  A helper rather than three chained calls at each site, because the three
 *  calls left to themselves answer in English — `z.number().int().positive()`
 *  produces "Invalid input: expected int, received number" and "Too small:
 *  expected number to be >0", which is what the headcount box was printing
 *  under a Vietnamese label. Naming the field in the sentence is the other
 *  half: a bare "must be a whole number" does not say which of the two number
 *  boxes on the form is being complained about.
 *
 *  `abort` on the first two so one mistyped cell gets one sentence — a value of
 *  `-1.5` is not three separate problems. */
export const counted = (what: string, max: number) =>
  z
    .number(`${what} phải là một số`)
    .int({ error: `${what} phải là số nguyên`, abort: true })
    .positive({ error: `${what} phải lớn hơn 0`, abort: true })
    .max(max, `${what} tối đa ${max.toLocaleString('vi-VN')}`)

/** The window a hand-typed date has to land in.
 *
 *  A `<input type="date">` takes a four-digit year from a two-key typo: `26`
 *  becomes the year 26, which `Ngay` accepts happily — it only asks whether the
 *  day exists on the calendar, and 0026-10-15 does. The row then sorts before
 *  every other lead in the book forever. Bounding the year is the cheapest
 *  place to catch it, and the bound is wide enough that no real deadline ever
 *  meets it. */
export const DEADLINE_YEARS = { from: 2000, to: 2100 } as const

/** A date a PERSON typed, bounded to `DEADLINE_YEARS`. Read side stays `Ngay`:
 *  a row already in the table must be describable whatever it holds. */
export const deadlineDay = Ngay.refine((s) => {
  const year = Number(s.slice(0, 4))
  return year >= DEADLINE_YEARS.from && year <= DEADLINE_YEARS.to
}, `Thời hạn phải trong khoảng năm ${DEADLINE_YEARS.from}…${DEADLINE_YEARS.to}`)

/** Strip the decoration a spreadsheet puts on a tax code, and fold the two
 *  spellings of a branch code into one.
 *
 *  '0201 234 567' · '0201.234.567' · '0201234567001' are one code written three
 *  ways. Unnormalised they are three values to `=`, and the importer's dedupe
 *  key — which strips down to digits — then treats as one company what the
 *  column holds as three. Folding 13 straight digits into `##########-###` is
 *  the same move: that is how every accounting export writes a branch, and the
 *  dash is how the tax office writes it. */
export function normaliseTaxCode(s: string): string {
  const bare = s.trim().replace(/[\s.]/g, '')
  return /^\d{13}$/.test(bare) ? `${bare.slice(0, 10)}-${bare.slice(10)}` : bare
}

/** The one shape a Vietnamese tax code has, and the one sentence saying so. */
const TAX_CODE = /^\d{10}(-\d{3})?$/
const TAX_CODE_WRONG = 'Mã số thuế phải là 10 chữ số, hoặc 10 chữ số kèm 3 số chi nhánh'

/** Tax code, optional. Empty after normalising means ABSENT — same rule as
 *  `textNhapTuyChon`, and for the same reason: `tax_code` is one of the fifteen
 *  columns `CHECK lead_no_blank` covers, so an untouched box submitted as `''`
 *  is a 500 naming a constraint.
 *
 *  Checked rather than left as free text, which is what it was: the create
 *  form's own placeholder already promises ten digits while the contract took
 *  any twenty characters, so a "none yet" note and a code with its own label
 *  glued on both landed in the column. A tax code is the only TRUE identity a
 *  Vietnamese company has —
 *  `dedupeKeys` in the import panel keys on it before anything else — and an
 *  identity nobody validated is an identity that silently fails to match. */
export const taxCodeOptional = z
  .string('Mã số thuế phải là chữ số')
  .max(LEAD_MAX.taxCode, `Mã số thuế tối đa ${LEAD_MAX.taxCode} ký tự`)
  .transform(normaliseTaxCode)
  .transform((s) => (s === '' ? undefined : s))
  .pipe(z.string().regex(TAX_CODE, TAX_CODE_WRONG).optional())
  .optional()

/** Same rule on the door where CLEARING is a thing a person does: `''` writes
 *  NULL instead of meaning "leave it alone".
 *
 *  A second spelling rather than a reuse of the one above, and `clearableText`
 *  in `./lead` states the reason for the whole family — on a create form a
 *  blank box is a field nobody filled in, on a patch it is somebody deleting
 *  what was in it, and one schema cannot mean both. What must NOT be duplicated
 *  is the shape itself, so both spellings check `TAX_CODE`. */
export const taxCodeClearable = z
  .string('Ô này phải là chữ')
  .max(LEAD_MAX.taxCode, `Mã số thuế tối đa ${LEAD_MAX.taxCode} ký tự`)
  .transform(normaliseTaxCode)
  .transform((s): string | null => (s === '' ? null : s))
  .pipe(z.string().regex(TAX_CODE, TAX_CODE_WRONG).nullable())
  .nullish()

/** The customer's page on their contact channel — a shape, not a URL.
 *
 *  It stays deliberately loose because of what people actually paste: the
 *  `linkedin.com/in/abc` off an address bar, a `zalo.me/…` out of a message,
 *  a bare `fb.com/x`. Demanding `z.url()` refuses the one gesture the box
 *  exists for. Accepting ANYTHING, which is what it did, means the column also
 *  holds sentences — a note about the contact rather than an address for them,
 *  and nothing downstream can tell the two apart.
 *
 *  So the rule is the least a web address has and a sentence does not: no
 *  spaces, and at least one dot. `LeadProfile` still forbids building an
 *  `<a href>` out of the value, and that has not changed — this narrows what
 *  gets stored, it does not promise the value resolves anywhere.
 *
 *  `abort` so a value that is plainly not an address gets one sentence, not
 *  one per rule it happens to break. */
const CHANNEL_URL = /^\S+\.\S+$/
const CHANNEL_URL_WRONG = 'Địa chỉ trang phải liền một mạch và có tên miền, ví dụ linkedin.com/in/…'

export const channelUrlOptional = z
  .string('Ô này phải là chữ')
  .max(LEAD_MAX.contactChannelUrl, `Tối đa ${LEAD_MAX.contactChannelUrl} ký tự`)
  .transform((s) => s.trim())
  .transform((s) => (s === '' ? undefined : s))
  .pipe(z.string().regex(CHANNEL_URL, CHANNEL_URL_WRONG).optional())
  .optional()

/** Same shape on the door where clearing is a thing a person does — see
 *  `taxCodeClearable` for why the pair exists rather than one schema. */
export const channelUrlClearable = z
  .string('Ô này phải là chữ')
  .max(LEAD_MAX.contactChannelUrl, `Tối đa ${LEAD_MAX.contactChannelUrl} ký tự`)
  .transform((s) => s.trim())
  .transform((s): string | null => (s === '' ? null : s))
  .pipe(z.string().regex(CHANNEL_URL, CHANNEL_URL_WRONG).nullable())
  .nullish()
