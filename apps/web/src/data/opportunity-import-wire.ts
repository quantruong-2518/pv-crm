import {
  OPPORTUNITY_IMPORT_FIELDS,
  OpportunityImportBody,
  type OpportunityImportDup,
  type OpportunityImportField,
  type OpportunityImportReport,
} from '@pv/contracts'
import type { BuiltRow, RowError } from '@/data/intake'

/** Pure translator between the file-import panel's browser-only shapes and
 *  `OpportunityImportBody` / `OpportunityImportReport`, the one contract shared
 *  by `POST /sales/ops/import/preview` and `POST /sales/ops/import`.
 *
 *  No `fetch`, no hook, no React — the same split `lead-import-wire.ts` keeps
 *  against `lead-import.ts`, and this file is deliberately the twin of that one.
 *  Read it first: everything below only records where the deal door differs from
 *  the lead door, and every difference is forced by what an opportunity IS.
 *
 *  ------------------------------------------------------------------
 *  DIFFERENCE 1 · NO `motion`, AND NOTHING TO CONVERT
 *  ------------------------------------------------------------------
 *  `lead-import-wire.ts` carries a long note about the two spellings of
 *  `motion` and the one legal conversion site. None of it applies here:
 *  `motion` says how a LEAD arrived and lands in a lead column, a deal has no
 *  such column, and `OpportunityImportBody` therefore never asks for one. The
 *  panel still hands a motion to every `onCommit` — `ImportCommit.motion` is one
 *  type for three loaders — and this door DROPS it. That is not a value being
 *  lost: `OP_SPEC` no longer offers the selector at all (decision 2 of
 *  `docs/ban-giao-co-hoi.md`), so nobody chose it.
 *
 *  ------------------------------------------------------------------
 *  DIFFERENCE 2 · NO CLIENT-SIDE DEDUPE KEY WORTH SENDING
 *  ------------------------------------------------------------------
 *  `BuiltRow.key` is the panel's own key (`mst:` then `ten:company|province`)
 *  and it does not travel: the server dedupes on the LEAD a row resolves to
 *  (`lead:<mã>`), a value the browser cannot compute because it does not know
 *  which lead the `Account` cell names. So `key` is built here on the way IN
 *  only — from the server's answer — and never sent on the way out. Same reason
 *  the ops screen hands the panel an EMPTY `existingKeys`.
 *
 *  ------------------------------------------------------------------
 *  DIFFERENCE 3 · THE REPORT HAS NO COUNTERS, SO THE COUNTERS ARE MADE HERE
 *  ------------------------------------------------------------------
 *  `LeadImportReport` ships `duplicates` / `dupInFile` beside the arrays they
 *  count; `OpportunityImportReport` deliberately does not — its own docblock
 *  says a count is `.length`. The panel's `ImportReport` still wants two
 *  numbers, so they are computed at the boundary, once, in `toPanelReport`. */

// ---------------------------------------------------------------------------
// Panel rows → `OpportunityImportBody`
// ---------------------------------------------------------------------------

/** A `BuiltRow` plus the row's first cell, exactly as `ImportCommit.rows` hands
 *  it over — see `ImportableRow` in `lead-import-wire.ts` for why `first` is a
 *  separate field rather than something read back out of `values`. Declared
 *  again here rather than imported so this translator stays readable on its own;
 *  both spellings are `BuiltRow & { first: string }` and both exist because
 *  `buildRows` only keeps `first` on FAILED rows. */
export type ImportableOpRow = BuiltRow & { first: string }

/** Keep only the keys the wire understands.
 *
 *  `OP_SPEC` puts six of the nine on screen; the other three (`state`,
 *  `currency`, `description`) exist on the table and are accepted by the
 *  contract, so a spec that grows a column later needs no change here.
 *  Filtering through the closed set rather than casting is what keeps a row
 *  built from the WRONG spec — `BuiltRow.values` is an open
 *  `Record<string, string>`, shared by three loaders — from reaching the server
 *  with keys `OpportunityImportRow.values` was never meant to carry. */
function pickImportValues(
  values: Record<string, string>,
): Partial<Record<OpportunityImportField, string>> {
  const out: Partial<Record<OpportunityImportField, string>> = {}
  for (const field of OPPORTUNITY_IMPORT_FIELDS) {
    const cell = values[field]
    if (cell !== undefined) out[field] = cell
  }
  return out
}

/** Build the body BOTH endpoints accept, and validate it with the contract's
 *  own schema before anything crosses the wire.
 *
 *  `rows` are what `buildRows` in `data/intake.ts` already produced (columns
 *  matched, required cells present), each paired with its first cell. Nothing is
 *  re-matched or re-filtered here — this only reshapes.
 *
 *   · `line` is copied straight from `BuiltRow.line`, already the line IN THE
 *     FILE counting the header row (`i + 2`), never an array index.
 *   · `first` is copied straight through: once columns are mapped the server
 *     cannot reconstruct it, and the downloadable error file without it loses
 *     the one column that lets someone find the row in their own spreadsheet.
 *
 *  The 2,000-row ceiling (`MAX_IMPORT_OPS`) is enforced by the schema's own
 *  `rows` bound, not re-checked here. */
export function buildOpportunityImportBody(
  rows: readonly ImportableOpRow[],
  fileName: string,
): ReturnType<typeof OpportunityImportBody.safeParse> {
  const candidate = {
    fileName,
    rows: rows.map((row) => ({
      line: row.line,
      first: row.first,
      values: pickImportValues(row.values),
    })),
  }

  return OpportunityImportBody.safeParse(candidate)
}

// ---------------------------------------------------------------------------
// `OpportunityImportReport` (server) → what the panel already draws
// ---------------------------------------------------------------------------

/** The report shape the panel draws, once the numbers come from the side that
 *  actually wrote.
 *
 *  The five fields `ImportReport` in `data/intake.ts` declares keep their names
 *  so the result table and the error-file download work unchanged. The rest is
 *  detail the contract carries and nothing draws yet — the duplicate ROWS behind
 *  the two counts, the `field` an error names, and the lead each surviving row
 *  resolved to. Carried through intact rather than dropped, exactly as the lead
 *  side carries its own extras. */
export type OpportunityImportPanelReport = {
  /** `leadCode` is the one thing the browser could not have known: which
   *  customer the `Account` cell named. */
  rows: (BuiltRow & { leadCode: string })[]
  errors: (RowError & { field?: OpportunityImportField })[]
  duplicates: number
  dupInFile: number
  total: number
  dupWithBook: OpportunityImportDup[]
  dupWithinFile: OpportunityImportDup[]
}

/** Translate a server `OpportunityImportReport` — returned by BOTH the preview
 *  and the commit endpoint — into the shape the panel already renders.
 *
 *  Rebuilds `values` as a fresh object rather than passing the parsed one
 *  through: `OpportunityImportRowOut.values` is a closed set of optional keys,
 *  `BuiltRow.values` is an open index signature — the same two shapes
 *  `pickImportValues` reconciles on the way out, mirrored here on the way in. */
export function toPanelReport(report: OpportunityImportReport): OpportunityImportPanelReport {
  return {
    rows: report.rows.map((row) => ({
      line: row.line,
      values: { ...row.values },
      key: row.key,
      leadCode: row.leadCode,
    })),
    errors: report.errors.map((err) => ({
      line: err.line,
      first: err.first,
      field: err.field,
      reason: err.reason,
    })),
    duplicates: report.dupWithBook.length,
    dupInFile: report.dupWithinFile.length,
    total: report.total,
    dupWithBook: report.dupWithBook,
    dupWithinFile: report.dupWithinFile,
  }
}
