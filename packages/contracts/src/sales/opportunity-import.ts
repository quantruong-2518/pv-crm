import { z } from 'zod'
import { MaObject, Moc, gomKhoangTrang, textNhap, textNhapTuyChon } from '../primitives'

/** Loading deals from a file — TWO endpoints, one body.
 *
 *      POST /sales/opportunities/import/preview   dry run, writes NOTHING
 *      POST /sales/opportunities/import           same body, writes and reports
 *
 *  The shape mirrors `lead-import.ts` deliberately, down to the field names, so
 *  that the panel driving both (`ImportZone`) needs one translator rather than
 *  two. Read that file first; this one only documents where the two differ, and
 *  every difference below is forced by what an opportunity IS.
 *
 *  ------------------------------------------------------------------
 *  DIFFERENCE 1 · THIS DOOR CREATES NO CUSTOMERS
 *  ------------------------------------------------------------------
 *  `sales.opportunity.lead_code` is `NOT NULL` and a foreign key. A deal cannot
 *  exist without a customer, so every row in the file must find a lead that is
 *  already in the book — the `Account` column is a LOOKUP, not a new record.
 *
 *  This is the single most important thing to understand about the endpoint,
 *  and it is a deliberate refusal rather than a missing feature. A file that
 *  quietly created the missing leads would be a second lead intake, wearing no
 *  `sourceKind` and no `motion`, feeding `CHANNEL_TRUST` a pile of rows nobody
 *  confirmed — the exact failure `lead-import.ts` describes at length and takes
 *  care to record. One door makes customers. This one makes deals for customers
 *  who already exist, and says so when they do not.
 *
 *  ------------------------------------------------------------------
 *  DIFFERENCE 2 · NO `motion`
 *  ------------------------------------------------------------------
 *  `motion` says how a LEAD arrived, and it lands in a lead column. A deal has
 *  no such column, so the body does not ask. `ImportZone` will keep sending one
 *  because `OP_SPEC` declares three; `z.object` strips it silently, which is the
 *  right outcome — a value with nowhere to land should not become a 400, and it
 *  must not become a column invented to receive it.
 *
 *  ------------------------------------------------------------------
 *  DIFFERENCE 3 · THE DUPLICATE KEY IS THE LEAD, AND IT MEANS SOMETHING NARROWER
 *  ------------------------------------------------------------------
 *  `sales.lead` has `lead_email_live_idx`, so the lead import's `dupWithBook` is
 *  backed by a constraint: a row it calls a duplicate is a row Postgres would
 *  refuse. There is NO comparable unique index on `sales.opportunity`, and there
 *  should not be — one lead legitimately holds several deals, which is why
 *  `lead_code` moved onto this table in the first place.
 *
 *  So `dupWithBook` here is a WARNING, not a prediction of refusal: the lead
 *  already has a deal that is still open. Loading it again is usually a file
 *  being replayed, and the commit skips those rows — but a second live deal for
 *  one customer is legal, and the day somebody genuinely wants one they will
 *  open it through `POST /sales/opportunities`, where there is a person to ask.
 *
 *  "Still open" excludes both terminal ends: a lost deal and a signed one are
 *  finished, and a customer coming back next quarter is a new deal, not a
 *  duplicate of an old one. */

/** One batch, at most. Lower than the lead import's 5,000 on purpose: a lead
 *  file is a list bought or exported by the thousand, a pipeline is what one
 *  team is working on. A ceiling far above anything real just means the failure
 *  mode is a timeout instead of a sentence. */
export const MAX_IMPORT_OPS = 2_000

// ---------------------------------------------------------------------------
// WHAT A COLUMN MAY BE
// ---------------------------------------------------------------------------

/** The closed field set. The first six are `OP_SPEC` verbatim; the last three
 *  are optional and exist because the columns exist on the table and a file
 *  that has them should not have to throw them away. */
export const OPPORTUNITY_IMPORT_FIELDS = [
  'name',
  'company',
  'amount',
  'closedDate',
  'saleOwner',
  'bdOwner',
  'state',
  'currency',
  'description',
] as const

export const OpportunityImportField = z.enum(OPPORTUNITY_IMPORT_FIELDS)

/** Every cell is text, always — the same decision `lead-import.ts` makes and
 *  for the same reason: typing a cell here turns one unconvertible value into a
 *  whole rejected batch carrying one message at the root. Conversion happens in
 *  the check, per row, per field, where the failure can name a line. */
const importCell = z.string().max(1_000, 'Ô dài quá 1.000 ký tự').transform(gomKhoangTrang)

export const OpportunityImportRow = z.object({
  line: z.number().int().min(2, 'Dòng 1 là dòng tiêu đề'),
  /** The row's first non-empty cell, so an error can name a row a human
   *  recognises rather than a line number alone. */
  first: textNhapTuyChon(200),
  values: z.partialRecord(OpportunityImportField, importCell),
})

/** ONE body for both endpoints.
 *
 *  Preview and commit differ in what they DO, never in what they accept. The
 *  moment they differ, a batch can pass the preview and fail the commit, and
 *  the preview stops being worth running. */
export const OpportunityImportBody = z.object({
  fileName: textNhap(255),
  rows: z
    .array(OpportunityImportRow)
    .min(1, 'Không có dòng nào để nạp')
    .max(MAX_IMPORT_OPS, `Một lô tối đa ${MAX_IMPORT_OPS} dòng`),
})

// ---------------------------------------------------------------------------
// THE REPORT
// ---------------------------------------------------------------------------

/** A row that survived, with the two things the client could not know: which
 *  lead it resolved to, and the key it was deduped on. */
export const OpportunityImportRowOut = z.object({
  line: z.number().int().min(2),
  values: z.partialRecord(OpportunityImportField, z.string()),
  /** The customer this deal will hang off. Resolved server-side from the
   *  `Account` cell — never accepted from the client, for the reason the lead
   *  import refuses a client-sent `key`: a value the caller can edit is a value
   *  the caller can use to walk past the check. */
  leadCode: MaObject,
  key: z.string(),
})

export const OpportunityImportError = z.object({
  line: z.number().int().min(2),
  first: z.string(),
  /** Absent = the row failed as a whole rather than at one cell. */
  field: OpportunityImportField.optional(),
  reason: z.string().min(1),
})

export const OpportunityImportDup = z.object({
  line: z.number().int().min(2),
  first: z.string(),
  key: z.string(),
  /** On `dupWithBook`, the open deal already standing on that customer. */
  code: MaObject.optional(),
})

/** Kept as ARRAYS with no parallel counters.
 *
 *  `LeadImportReport` carries `duplicates` and `dupInFile` beside the arrays
 *  they count, and its own docblock calls that redundancy a courtesy to a panel
 *  that existed first. This report has no such panel to protect, so it ships one
 *  representation of each fact. A count is `.length`.
 *
 *  The two duplicate classes stay separate for the reason they do on the lead
 *  side: a collision inside the file is a defect in the file, a collision with
 *  the book is the ordinary result of loading the same list twice. */
export const OpportunityImportReport = z.object({
  rows: z.array(OpportunityImportRowOut),
  errors: z.array(OpportunityImportError),
  /** Rows EXAMINED, not rows accepted. */
  total: z.number().int().nonnegative(),
  dupWithBook: z.array(OpportunityImportDup),
  dupWithinFile: z.array(OpportunityImportDup),
})

export const OpportunityImportPreviewResponse = OpportunityImportReport

export const OpportunityImportCommitResponse = OpportunityImportReport.extend({
  batchId: z.string().min(1),
  /** ONE timestamp for the whole batch — every row went in together or none
   *  did, and a per-row clock would suggest otherwise. */
  at: Moc,
  accepted: z.number().int().nonnegative(),
  /** Minted codes, in the order of `rows`. */
  codes: z.array(MaObject),
})

export type OpportunityImportField = z.infer<typeof OpportunityImportField>
export type OpportunityImportRow = z.infer<typeof OpportunityImportRow>
export type OpportunityImportBody = z.infer<typeof OpportunityImportBody>
export type OpportunityImportRowOut = z.infer<typeof OpportunityImportRowOut>
export type OpportunityImportError = z.infer<typeof OpportunityImportError>
export type OpportunityImportDup = z.infer<typeof OpportunityImportDup>
export type OpportunityImportReport = z.infer<typeof OpportunityImportReport>
export type OpportunityImportPreviewResponse = z.infer<typeof OpportunityImportPreviewResponse>
export type OpportunityImportCommitResponse = z.infer<typeof OpportunityImportCommitResponse>
