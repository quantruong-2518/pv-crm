import { z } from 'zod'
import { ObjectCode, Moment, collapseSpaces, textInput, textInputOptional } from '../primitives'
import { AcknowledgedDeals, OpportunityRunningDeal } from './opportunity'

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
 *  already in the book — the lead code and `Account` columns are LOOKUPS, not
 *  new records, and so is the contact column.
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
 *  DIFFERENCE 3 · A LEAD WITH RUNNING DEALS NEEDS A YES, PER ROW
 *  ------------------------------------------------------------------
 *  One lead legitimately holds several deals, so a second one is legal — but a
 *  file carries no intent, and a replayed file would double every deal. So this
 *  door follows the typed door's rule: a row whose lead has running deals is
 *  held in `dupWithBook`, with those deals, and skipped by the commit until the
 *  same row comes back carrying their codes in `acknowledgedDeals`.
 *
 *  "Running" excludes both ends: a stopped (`lost`) deal and a signed one are
 *  off the board, and a customer coming back next quarter is a new deal. */

/** One batch, at most. Lower than the lead import's 5,000 on purpose: a lead
 *  file is a list bought or exported by the thousand, a pipeline is what one
 *  team is working on. A ceiling far above anything real just means the failure
 *  mode is a timeout instead of a sentence. */
export const MAX_IMPORT_OPS = 2_000

// ---------------------------------------------------------------------------
// WHAT A COLUMN MAY BE
// ---------------------------------------------------------------------------

/** The closed field set. The first six are `OP_SPEC` verbatim; `currency` and
 *  `description` are optional and exist because the columns exist on the table
 *  and a file that has them should not have to throw them away.
 *
 *  No `state` column: an imported deal enters at stage `new`, or at `assigned`
 *  when the importer may accept deals — the same rule as the create door
 *  (ADR 0071). A spreadsheet cell naming a state would be the one
 *  way to put a deal in a column no event put it in.
 *
 *  The last four bring a row up to what the typed door asks for:
 *   · `leadCode`    — the lead itself (`LD-…`); blank falls back to `company`.
 *   · `contact`     — the CODE of one person reachable from that lead, the
 *                     row's only contact; blank = the lead's primary contact.
 *   · `contactRole` — an `OpportunityContactRole`; blank = nobody has said.
 *   · `products`    — `PRODUCT` catalogue ids (`PD-…`) joined by commas. */
export const OPPORTUNITY_IMPORT_FIELDS = [
  'name',
  'company',
  'amount',
  'closedDate',
  'saleOwner',
  'bdOwner',
  'currency',
  'description',
  'leadCode',
  'contact',
  'contactRole',
  'products',
] as const

export const OpportunityImportField = z.enum(OPPORTUNITY_IMPORT_FIELDS)

/** Every cell is text, always — the same decision `lead-import.ts` makes and
 *  for the same reason: typing a cell here turns one unconvertible value into a
 *  whole rejected batch carrying one message at the root. Conversion happens in
 *  the check, per row, per field, where the failure can name a line. */
const importCell = z.string().max(1_000, 'Ô dài quá 1.000 ký tự.').transform(collapseSpaces)

export const OpportunityImportRow = z.object({
  line: z.number().int().min(2, 'Dòng 1 là dòng tiêu đề.'),
  /** The row's first non-empty cell, so an error can name a row a human
   *  recognises rather than a line number alone. */
  first: textInputOptional(200),
  values: z.partialRecord(OpportunityImportField, importCell),
  /** This row's yes to its lead's running deals, as `dupWithBook` listed them.
   *  Absent = none shown. Not a cell: a file cannot carry it. */
  acknowledgedDeals: AcknowledgedDeals.optional(),
})

/** ONE body for both endpoints.
 *
 *  Preview and commit differ in what they DO, never in what they accept. The
 *  moment they differ, a batch can pass the preview and fail the commit, and
 *  the preview stops being worth running. */
export const OpportunityImportBody = z.object({
  fileName: textInput(255),
  rows: z
    .array(OpportunityImportRow)
    .min(1, 'Không có dòng nào để nạp.')
    .max(MAX_IMPORT_OPS, `Một lô tối đa ${MAX_IMPORT_OPS} dòng.`),
})

// ---------------------------------------------------------------------------
// THE REPORT
// ---------------------------------------------------------------------------

/** A row that survived, with the two things the client could not know: which
 *  lead it resolved to, and the key it was deduped on. */
export const OpportunityImportRowOut = z.object({
  line: z.number().int().min(2),
  values: z.partialRecord(OpportunityImportField, z.string()),
  /** The customer this deal will hang off, resolved server-side from the
   *  `leadCode` cell, else the `Account` cell. A cell is a lookup like any
   *  other: the server still checks the lead exists, is live and is in scope. */
  leadCode: ObjectCode,
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
})

/** A row held because its lead has running deals the row did not acknowledge
 *  — none sent, or a list the book has since outgrown. `deals` is the current
 *  list; sending the row again with exactly those codes lets it through. */
export const OpportunityImportHeld = OpportunityImportDup.extend({
  leadCode: ObjectCode,
  deals: z.array(OpportunityRunningDeal).min(1),
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
 *  the book is the ordinary result of loading the same list twice. `dupWithBook`
 *  keeps the lead side's name so one panel reads both; here it can be answered. */
export const OpportunityImportReport = z.object({
  rows: z.array(OpportunityImportRowOut),
  errors: z.array(OpportunityImportError),
  /** Rows EXAMINED, not rows accepted. */
  total: z.number().int().nonnegative(),
  dupWithBook: z.array(OpportunityImportHeld),
  dupWithinFile: z.array(OpportunityImportDup),
})

export const OpportunityImportPreviewResponse = OpportunityImportReport

export const OpportunityImportCommitResponse = OpportunityImportReport.extend({
  batchId: z.string().min(1),
  /** ONE timestamp for the whole batch — every row went in together or none
   *  did, and a per-row clock would suggest otherwise. */
  at: Moment,
  accepted: z.number().int().nonnegative(),
  /** Minted codes, in the order of `rows`. */
  codes: z.array(ObjectCode),
})

export type OpportunityImportField = z.infer<typeof OpportunityImportField>
export type OpportunityImportRow = z.infer<typeof OpportunityImportRow>
export type OpportunityImportBody = z.infer<typeof OpportunityImportBody>
export type OpportunityImportRowOut = z.infer<typeof OpportunityImportRowOut>
export type OpportunityImportError = z.infer<typeof OpportunityImportError>
export type OpportunityImportDup = z.infer<typeof OpportunityImportDup>
export type OpportunityImportHeld = z.infer<typeof OpportunityImportHeld>
export type OpportunityImportReport = z.infer<typeof OpportunityImportReport>
export type OpportunityImportPreviewResponse = z.infer<typeof OpportunityImportPreviewResponse>
export type OpportunityImportCommitResponse = z.infer<typeof OpportunityImportCommitResponse>
