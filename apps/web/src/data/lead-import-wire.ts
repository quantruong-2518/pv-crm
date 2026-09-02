import {
  LEAD_IMPORT_FIELDS,
  LEAD_MAX,
  LeadImportBody,
  type LeadImportDup,
  type LeadImportField,
  type LeadImportReport,
} from '@pv/contracts'
import type { BuiltRow, RowError } from '@/data/intake'

/** Pure translator between the file-import panel's browser-only shapes and
 *  `LeadImportBody` / `LeadImportReport`, the one contract shared by
 *  `POST /sales/leads/import/preview` and `POST /sales/leads/import`.
 *
 *  No `fetch`, no hook, no React. This is deliberately the part of the
 *  panel → server wiring that does not need a network call to be written or
 *  reviewed — see the handover doc for the two endpoints themselves.
 *
 *  ------------------------------------------------------------------
 *  A REAL TRAP, WRITTEN DOWN RATHER THAN HIDDEN: TWO DIFFERENT DEDUPE KEYS
 *  ------------------------------------------------------------------
 *  The browser and the server do not agree on what makes two rows "the same".
 *
 *   · The panel (`dedupeKeys` / `dedupeKey`, `apps/web/src/data/intake.ts:
 *     607-627`) keys on `mst:<tax code>` first, falling back to
 *     `ten:<company>|<province>` — it is answering "is this the same
 *     COMPANY".
 *   · The server keys on `email:lower(email)`, and only against leads that
 *     have not exited (`lead_email_live_idx` — see the docblock on
 *     `LeadImportPreviewResponse` in the contract). It is answering "is this
 *     the same LIVE LEAD".
 *
 *  Because the two questions are different, a file the panel calls clean can
 *  still collide at the server, and a file the panel flags as full of
 *  duplicates can still be entirely new to the server (e.g. every row shares
 *  one company but has a distinct contact mailbox). This file does NOT
 *  reconcile the two keys — that would hide a real disagreement between two
 *  honest answers to two different questions. Whether the panel keeps running
 *  its own client-side dedupe once the server is the source of truth is a
 *  decision for the panel-wiring ticket, not for this translator. */

// ---------------------------------------------------------------------------
// Panel rows + batch choices → `LeadImportBody`
// ---------------------------------------------------------------------------

/** What the person doing the load picks for the WHOLE batch — everything
 *  `LeadImportBody` needs beyond the rows themselves. */
export type ImportBatchChoices = {
  /** Original file name. Shown in the batch record and in the lead's history
   *  line, so "where did this row come from" has an answer months later. */
  fileName: string
  /** Motion for the whole batch.
   *
   *  Typed as the CONTRACT's canonical value (`LeadImportBody['motion']`,
   *  i.e. one of `MOTION_BY_CHANNEL.IMPORT` — `OUTBOUND · EVENT · PARTNER ·
   *  RECYCLE`, all UPPER_SNAKE), not as `@pv/engines`'s `LeadMotion` that
   *  `LEAD_SPEC.motions` in `data/intake.ts` currently puts on screen
   *  (`outbound · event · partner · recycle`, lower case).
   *
   *  This file deliberately does NOT convert one spelling into the other.
   *  `packages/contracts/src/sales/enums.ts` says, right above its
   *  `LeadMotion` export, that the conversion between the two spellings has
   *  exactly ONE legal site — `lead.mapper.ts` on the server — "a second
   *  conversion site is how two spellings start to drift, so there must not
   *  be one." Adding a `.toUpperCase()` here would be exactly that second
   *  site. Getting a canonical value into this field — a new selector built
   *  on contract values, or a one-line conversion at the call site — is a
   *  decision for whichever ticket wires this builder into the panel, not
   *  for a pure translator. */
  motion: LeadImportBody['motion']
  /** Source code for the whole batch. Wins over any per-row `source` cell —
   *  that precedence is applied by the server (see the contract docblock),
   *  not by this file; a per-row `source` cell, if the column was mapped, is
   *  passed through untouched in `values`. */
  source?: string
}

/** Keep only the sixteen keys the wire actually understands.
 *
 *  `BuiltRow.values` is typed `Record<string, string>` because `ImportSpec`
 *  is shared by three different loaders (`LEAD_SPEC`, `RECIPIENT_SPEC`, the
 *  opportunity one), each with its own field keys. `LEAD_IMPORT_FIELDS` is
 *  the closed set for THIS loader; filtering through it rather than casting
 *  is what keeps a row built from the wrong spec from silently reaching the
 *  server with keys `LeadImportRow.values` was never meant to carry.
 *
 *  A key that is genuinely absent stays absent: `buildRows` in
 *  `data/intake.ts` never writes an empty cell into `values` in the first
 *  place (a blank cell either fails the row, for a required field, or is
 *  skipped — `continue` — for an optional one), so there is no `''` here to
 *  decide the fate of. `importCell` in the contract keeps a *present* empty
 *  string as `''` rather than folding it into "absent" (unlike
 *  `textNhapTuyChon`, which turns `''` into `undefined`) — but this function
 *  never manufactures a present-but-empty cell, so that distinction never
 *  gets exercised on the way out; it only matters if a future caller starts
 *  passing `values` built some other way. */
function pickImportValues(
  values: Record<string, string>,
): Partial<Record<LeadImportField, string>> {
  const out: Partial<Record<LeadImportField, string>> = {}
  for (const field of LEAD_IMPORT_FIELDS) {
    const cell = values[field]
    if (cell !== undefined) out[field] = cell
  }
  return out
}

/** A `BuiltRow` plus the one thing it does not carry: the row's first cell.
 *
 *  `BuiltRow` in `data/intake.ts` is `{ line, values, key }` — no `first`.
 *  Only `RowError` has it, because `buildRows` only keeps `first` around long
 *  enough to attach it to a FAILED row; a row that passes never carries it
 *  forward. That is a real gap between what the FE currently builds and what
 *  `LeadImportRow.first` needs, and this file will not paper over it by
 *  reading `values.company` and calling it "first" — that is a company-column
 *  value, not the literal first cell of the file, and the two only coincide
 *  when the mapping happens to put company first.
 *
 *  So `first` is asked for here explicitly instead. The caller has it for
 *  free: it is the exact same `(raw[0] ?? '').trim()` `buildRows` already
 *  computes for every row (`data/intake.ts`, inside the `buildRows` loop) —
 *  reading it off `Sheet.rows[i][0]` at the same time is not new work, just
 *  not currently kept on `BuiltRow` itself. */
export type ImportableRow = BuiltRow & { first: string }

/** Cut a value that is only ECHOED back down to what the contract accepts.
 *
 *  Two fields, and neither is data: `fileName` is printed in the batch record,
 *  `first` is the column that helps somebody find the row in their own
 *  spreadsheet. Both have a ceiling on the body, and a body that fails its
 *  schema takes the WHOLE batch with it — so a file whose first column happens
 *  to be a long note would report five thousand rows broken because of a label
 *  nobody reads as a value. Cutting is the honest answer here precisely because
 *  the value is decoration: truncating a lead's actual company name would not
 *  be, which is why the CELLS are refused row by row instead (`buildRows`).
 *
 *  An ellipsis rather than a hard cut, so a truncated echo cannot be mistaken
 *  for what the file said. */
const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`

/** Build the body BOTH import endpoints accept, from the rows the panel has
 *  already mapped and the choices made for the batch — and validate it with
 *  the contract's own schema.
 *
 *  `rows` are `BuiltRow[]` as `buildRows` in `data/intake.ts` already
 *  produces them (columns matched, required fields checked, client-side
 *  duplicates dropped), each paired with its first cell — see
 *  `ImportableRow` above for why that pairing is not just `BuiltRow[]`. This
 *  function does not re-run any of the matching or filtering, it only
 *  reshapes what is already built.
 *
 *   · `line` is copied straight from `BuiltRow.line`, which is already the
 *     line IN THE FILE counting the header row (`buildRows` computes it as
 *     `i + 2`) — never a plain array index.
 *   · `first` is copied straight through. The server cannot reconstruct it
 *     once columns are mapped, and a downloadable error file without it loses
 *     the one column that lets someone find the row in their own spreadsheet.
 *
 *  The 5,000-row ceiling (`MAX_IMPORT_ROWS`) is enforced by the schema's own
 *  `rows` bound, not re-checked here — `LeadImportBody.safeParse` fails with
 *  `Một lô tối đa 5.000 dòng` on a `rows` path if it is crossed, exactly the
 *  ceiling the FE-side `MAX_ROWS` in `intake-file.ts` mirrors on purpose. */
export function buildLeadImportBody(
  rows: readonly ImportableRow[],
  choices: ImportBatchChoices,
): ReturnType<typeof LeadImportBody.safeParse> {
  const candidate = {
    fileName: clip(choices.fileName, LEAD_MAX.fileName),
    motion: choices.motion,
    source: choices.source,
    rows: rows.map((row) => ({
      line: row.line,
      first: clip(row.first, LEAD_MAX.company),
      values: pickImportValues(row.values),
    })),
  }

  return LeadImportBody.safeParse(candidate)
}

// ---------------------------------------------------------------------------
// `LeadImportReport` (server) → what the panel already draws
// ---------------------------------------------------------------------------

/** The report shape the panel draws, once it reads it from the server instead
 *  of computing it in the browser.
 *
 *  The first five fields are exactly `ImportReport` in `data/intake.ts` — the
 *  contract kept those five names on purpose so the result table and the
 *  error-file download keep working unchanged. `dupWithBook` / `dupWithinFile`
 *  are the new detail the contract adds on top: the ROWS behind `duplicates`
 *  and `dupInFile`, not just their counts. `field` on an error is the other
 *  addition — it lets a later screen point at the exact column of the exact
 *  row instead of only printing a sentence. Both are carried through intact,
 *  never dropped, even though nothing reads them yet. */
export type LeadImportPanelReport = {
  rows: BuiltRow[]
  errors: (RowError & { field?: LeadImportField })[]
  duplicates: number
  dupInFile: number
  total: number
  dupWithBook: LeadImportDup[]
  dupWithinFile: LeadImportDup[]
  /** Codes minted for `rows`, in the same order — only after a commit. */
  codes?: string[]
}

/** Translate a server `LeadImportReport` — returned by BOTH the preview and
 *  the commit endpoint — into the shape the panel already renders.
 *
 *  Rebuilds `values` as a fresh object rather than passing the parsed one
 *  through: `LeadImportRowOut.values` is `Partial<Record<LeadImportField,
 *  string>>` (a closed set of optional keys), while `BuiltRow.values` is
 *  `Record<string, string>` (an open index signature) — the same two shapes
 *  `pickImportValues` reconciles on the way out, mirrored here on the way
 *  in. */
export function toPanelReport(report: LeadImportReport): LeadImportPanelReport {
  return {
    rows: report.rows.map((row) => ({
      line: row.line,
      values: { ...row.values },
      key: row.key,
    })),
    errors: report.errors.map((err) => ({
      line: err.line,
      first: err.first,
      field: err.field,
      reason: err.reason,
    })),
    duplicates: report.duplicates,
    dupInFile: report.dupInFile,
    total: report.total,
    dupWithBook: report.dupWithBook,
    dupWithinFile: report.dupWithinFile,
  }
}
