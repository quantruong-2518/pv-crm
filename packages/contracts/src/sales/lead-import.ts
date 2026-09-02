import { z } from 'zod'
import { MaObject, Moc, gomKhoangTrang, textNhap, textNhapTuyChon } from '../primitives'
import { LeadSourceKind } from './enums'
import { LEAD_MAX } from './lead-fields'
import { MOTION_BY_CHANNEL } from './lead-intake'

/** Loading leads from a file — TWO endpoints, one body.
 *
 *      POST /sales/leads/import/preview    dry run, writes NOTHING
 *      POST /sales/leads/import            same body, writes and reports
 *
 *  ------------------------------------------------------------------
 *  WHY TWO ENDPOINTS AND NOT ONE WITH A FLAG
 *  ------------------------------------------------------------------
 *  The panel is three steps — map the columns, inspect the damage, commit — and
 *  step 2 is the one that earns the whole feature. A person about to push 500
 *  rows into the book needs to see, BEFORE anything is written, how many rows
 *  are broken and why, how many collide with the book, and how many collide
 *  with each other. A `?dryRun=true` flag would put "write" and "do not write"
 *  one typo apart on the same route; two routes cannot be confused, and only
 *  one of them needs a write permission.
 *
 *  The preview is also where the second half of validation happens. The client
 *  can only check what a spreadsheet knows — is the cell empty, does the value
 *  belong to a closed list. It cannot know whether the mailbox already belongs
 *  to a live lead. That answer requires the book, so it can only be given here.
 *
 *  ------------------------------------------------------------------
 *  WHERE THESE ROWS COME FROM, AND WHAT IS ALREADY TRUE ABOUT THEM
 *  ------------------------------------------------------------------
 *  Every batch carries a `motion` chosen by the person doing the load, and its
 *  door is fixed: `IMPORT`. That is not decoration — `CHANNEL_TRUST` reads it
 *  as `THO`, "nobody has confirmed anything". Rows that land through here are a
 *  pile of data until someone touches them, and any conversion rate computed
 *  over a book that has swallowed such a pile without recording it is wrong.
 *
 *  The response shapes below are deliberately assignable to what the screen
 *  already draws — `ImportReport`, `BuiltRow` and `RowError` in
 *  `apps/web/src/data/intake.ts`. Where a field was added it is added, never
 *  renamed or removed, so the panel keeps working while gaining somewhere to
 *  put the detail it does not have yet. */

// ---------------------------------------------------------------------------
// The columns one lead row can carry
// ---------------------------------------------------------------------------

/** The closed set of field keys a mapped row may contain — exactly the sixteen
 *  fields of `LEAD_SPEC` in `apps/web/src/data/intake.ts`.
 *
 *  It belongs in the contract rather than staying an app-side detail, because
 *  the server is the one that has to turn `values` into columns. Leaving the
 *  keys open (`Record<string, string>`) means a column mapping renamed on the
 *  screen goes on parsing cleanly and silently drops a field on the way into
 *  the table — the worst kind of import bug, because the file looks accepted.
 *
 *  Two of these keys do not line up with the table, and saying so here is
 *  cheaper than discovering it during the first real load:
 *   · `owner`   carries a person's NAME, while `lead.owner_id` references
 *               `actor.id`. The server has to resolve it, and two staff with
 *               one name make that resolution ambiguous (debt #2).
 *   · `channel` is the spreadsheet's name for `contact_channel`. */
export const LEAD_IMPORT_FIELDS = [
  'company',
  'province',
  'category',
  'source',
  'owner',
  'tier',
  'legalName',
  'taxCode',
  'address',
  'contactName',
  'contactTitle',
  'phone',
  'email',
  'channel',
  'headcount',
  'pain',
] as const

export const LeadImportField = z.enum(LEAD_IMPORT_FIELDS)

export type LeadImportField = z.infer<typeof LeadImportField>

/** Row ceiling for one batch. Mirrors `MAX_ROWS` in
 *  `apps/web/src/data/intake-file.ts`, and mirrors it on purpose: a ceiling
 *  that only exists in the browser is a suggestion, since the endpoint is
 *  reachable without the browser. 5.000 rows is already more than one person
 *  can review before pressing the button — past that the right move is to split
 *  the file, not to load it and then go cleaning. */
export const MAX_IMPORT_ROWS = 5_000

/** One cell as it left the spreadsheet: TEXT, always.
 *
 *  Deliberately not typed per field. A cell is a string — `headcount` arrives
 *  as `'1400'` or `'1.400 người'`, `deadline` as `'15/10/2026'` — and typing
 *  them in the request schema would turn every unconvertible cell into a whole
 *  rejected batch with one message at the root. Keeping them as text means a
 *  bad cell comes back as one row error naming one field, which is the entire
 *  reason the preview step exists. Conversion happens at commit, against the
 *  column types.
 *
 *  Whitespace is still collapsed on the way in: leading and trailing spaces
 *  from a spreadsheet are invisible to the person who made the file and very
 *  visible to `=`, to `UNIQUE`, and to `CHECK lead_no_blank`.
 *
 *  `MAX_IMPORT_CELL` is EXPORTED, and the reason is a failure the panel used to
 *  have: this ceiling sits on the body, so one 1.001-character cell in a
 *  5.000-row file failed `LeadImportBody.safeParse` and the screen reported the
 *  whole batch refused — five thousand rows marked broken because of one. The
 *  panel now stops the same cell in the browser as ONE ROW, which is only
 *  possible if it can read the number rather than guess it. */
export const MAX_IMPORT_CELL = 1_000

const importCell = z
  .string()
  .max(MAX_IMPORT_CELL, `Ô dài quá ${MAX_IMPORT_CELL.toLocaleString('vi-VN')} ký tự`)
  .transform(gomKhoangTrang)

/** One row of the file after the columns have been mapped.
 *
 *  `key` is NOT accepted even though the screen has one on `BuiltRow`: the
 *  dedupe key is computed by the server, because a key sent by the client is a
 *  key the client can edit, and editing it is how a row walks past the
 *  duplicate check. `z.object` strips it silently, so the screen can keep
 *  posting `BuiltRow[]` unchanged. */
export const LeadImportRow = z.object({
  /** Line number IN THE FILE, counting the header row. This is the number the
   *  user sees down the left margin when they open the file, which is the only
   *  reason it is worth carrying at all — it is what makes "17 rows failed"
   *  into something a person can act on. Starts at 2 because line 1 is the
   *  header. */
  line: z.number().int().min(2, 'Dòng 1 là dòng tiêu đề'),
  /** The first cell of the row, as it appeared in the file.
   *
   *  Sent by the client because the server cannot reconstruct it: once the
   *  columns are mapped, the raw row order is gone. Without it the downloadable
   *  error file loses the column that lets someone find the row in their own
   *  spreadsheet. When absent the server falls back to `values.company`. */
  first: textNhapTuyChon(LEAD_MAX.company),
  values: z.partialRecord(LeadImportField, importCell),
})

/** The body of BOTH import endpoints. Same shape on purpose: preview and commit
 *  differ in what they DO, never in what they accept — the moment they differ,
 *  a batch can pass the preview and fail the commit, and the preview stops
 *  being worth reading. */
export const LeadImportBody = z.object({
  /** Shown in the batch record and in the lead's history line, so six months
   *  later "where did this row come from" has an answer. */
  fileName: textNhap(LEAD_MAX.fileName),
  /** Narrowed to the motions the `tep` door can carry — the same four the
   *  screen offers (`LEAD_SPEC.motions`). A pair outside `MOTION_BY_CHANNEL`
   *  does not mean "not supported"; it means it does not happen, so it fails at
   *  the gate on the `motion` field rather than being stored and then
   *  disbelieved by every report that reads it. */
  motion: z.enum(MOTION_BY_CHANNEL.IMPORT, 'Thế này không đi qua cửa nạp tệp được'),
  /** Source code for the WHOLE batch — the campaign's code when the load is
   *  started from inside a campaign profile. Optional: a file brought in on its
   *  own belongs to no campaign.
   *
   *  Precedence, and it matters because both places exist: the batch source
   *  wins over the per-row `source` cell. The person clicking the button is
   *  saying something about the whole file, and a stale code in a column should
   *  not quietly overrule them. */
  source: textNhapTuyChon(LEAD_MAX.campaignCode),
  rows: z
    .array(LeadImportRow)
    .min(1, 'Không có dòng nào để nạp')
    .max(MAX_IMPORT_ROWS, `Một lô tối đa ${MAX_IMPORT_ROWS} dòng`),
})

// ---------------------------------------------------------------------------
// What comes back
// ---------------------------------------------------------------------------

/** A row that passed. Same shape as `BuiltRow` on the screen. */
export const LeadImportRowOut = z.object({
  line: z.number().int().min(2),
  values: z.partialRecord(LeadImportField, z.string()),
  /** Dedupe key the server computed for this row. Empty = there was not enough
   *  in the row to compare it against anything. */
  key: z.string(),
})

/** A row that did not pass. Superset of `RowError` on the screen.
 *
 *  `field` is the addition, and it is the one the brief asked for: without it a
 *  reason is a sentence, and a sentence cannot highlight a cell. With it the
 *  panel can point at the exact column of the exact row. Optional because a row
 *  can also fail as a whole — absent means "this is not about one field", not
 *  "the server could not be bothered". */
export const LeadImportError = z.object({
  line: z.number().int().min(2),
  /** Echoed back so the downloadable error file has a column that identifies
   *  the row inside the user's own spreadsheet. */
  first: z.string(),
  field: LeadImportField.optional(),
  reason: z.string().min(1),
})

/** A row dropped for being a duplicate.
 *
 *  Duplicates are reported as ROWS and not only as a count, because a count
 *  answers "how many" and the question people actually have is "which ones, and
 *  is that right". A batch that reports "312 duplicates" and nothing else gets
 *  either trusted blindly or abandoned. */
export const LeadImportDup = z.object({
  line: z.number().int().min(2),
  first: z.string(),
  /** The key that collided. */
  key: z.string(),
  /** The lead already holding that key. Only present on `dupWithBook` — a
   *  collision inside the file has no lead behind it yet. */
  code: MaObject.optional(),
})

/** The report both endpoints return.
 *
 *  The first five fields are exactly `ImportReport` on the screen, down to the
 *  names, so the result table and the error download keep working untouched.
 *  The two arrays at the end are the detail those counts throw away.
 *
 *  Yes, `duplicates === dupWithBook.length` and `dupInFile ===
 *  dupWithinFile.length`, and yes, redundancy in a contract is a place for two
 *  numbers to disagree. It is here only to avoid making the screen change shape
 *  in the same step that moves it onto a real server. The day the panel reads
 *  the arrays, drop the two counters.
 *
 *  The two are counted SEPARATELY and must stay separate: a collision inside
 *  the file is a defect in the file, while a collision with the book is the
 *  normal outcome of loading the same list a second time. One combined number
 *  leaves the person unable to tell whether to go fix the file or ignore it. */
export const LeadImportReport = z.object({
  /** Rows that passed everything and would be written. */
  rows: z.array(LeadImportRowOut),
  errors: z.array(LeadImportError),
  /** Count of rows dropped for matching a lead ALREADY in the book. */
  duplicates: z.number().int().nonnegative(),
  /** Count of rows dropped for matching ANOTHER row in this same file. */
  dupInFile: z.number().int().nonnegative(),
  /** Rows examined — not rows accepted. */
  total: z.number().int().nonnegative(),

  dupWithBook: z.array(LeadImportDup),
  dupWithinFile: z.array(LeadImportDup),
})

/** Dry run. Nothing is written, no code is minted, no batch exists afterwards.
 *
 *  Duplicates against the book are decided on `lower(email)`: it is the only
 *  identity the lead table actually enforces (`lead_email_live_idx`, unique
 *  among leads that have not exited). Note the mismatch this creates with the
 *  screen, which dedupes on tax code, then on company+province — see the
 *  handover; the two sides are answering "is this the same company" and "is
 *  this the same live lead", which are not the same question. */
export const LeadImportPreviewResponse = LeadImportReport

/** The real load. Same report, plus what was actually written.
 *
 *  Returning the report and not just a count is what keeps the panel's final
 *  screen — four numbers and a downloadable error file — which is the most
 *  worth-reading thing in the whole flow. */
export const LeadImportCommitResponse = LeadImportReport.extend({
  /** The batch this load created. Deleting a batch deletes exactly its rows, so
   *  this id is what makes a wrong load undoable instead of permanent. */
  batchId: z.string().min(1),
  /** ONE timestamp for the whole batch. Not one per row: with per-row stamps
   *  the first and last row of a single load differ by seconds, and a table
   *  sorted by time renders one load as two. */
  at: Moc,
  /** The origin, stated by the server rather than assumed by the client. Always
   *  `IMPORT` for this endpoint, and it is what `CHANNEL_TRUST` reads to decide
   *  the batch is `THO` — a trust label the client asserting itself would be
   *  worth nothing.
   *
   *  `APOLLO` does NOT come out of this endpoint even for an Apollo file: a
   *  vendor is a fact about where the file was bought, not about the HTTP call
   *  that carried it, and the panel has no field for it yet. Rows loaded here
   *  are `IMPORT` until that field exists — an honest generic beats a vendor
   *  name nobody actually confirmed. */
  intake: LeadSourceKind,
  motion: z.enum(MOTION_BY_CHANNEL.IMPORT),
  /** Rows written. Equals `rows.length` and `codes.length`; carried because the
   *  screen's batch record has a field by this name. */
  accepted: z.number().int().nonnegative(),
  /** Codes minted, in the order of `rows`. This is what lets the screen link
   *  straight to what it just created instead of asking the user to go find it. */
  codes: z.array(MaObject),
})

export type LeadImportRow = z.infer<typeof LeadImportRow>
export type LeadImportBody = z.infer<typeof LeadImportBody>
export type LeadImportRowOut = z.infer<typeof LeadImportRowOut>
export type LeadImportError = z.infer<typeof LeadImportError>
export type LeadImportDup = z.infer<typeof LeadImportDup>
export type LeadImportReport = z.infer<typeof LeadImportReport>
export type LeadImportPreviewResponse = z.infer<typeof LeadImportPreviewResponse>
export type LeadImportCommitResponse = z.infer<typeof LeadImportCommitResponse>
