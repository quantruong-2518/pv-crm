import { useQueryClient } from '@tanstack/react-query'
import type {
  OpportunityImportCommitResponse,
  OpportunityImportPreviewResponse,
} from '@pv/contracts'
import { api, isApiError, userMessage } from '@/app/api'
import { OPS_BOOK_KEY } from '@/data/ops'
import { OPS_WRITE_NEED } from '@/data/ops-write'
import {
  buildOpportunityImportBody,
  toPanelReport,
  type ImportableOpRow,
  type OpportunityImportPanelReport,
} from '@/data/opportunity-import-wire'

/** Module 3 · the FILE door of the deal book — `POST /sales/ops/import`.
 *
 *  ------------------------------------------------------------------
 *  TWO FILES, AND THE SPLIT IS THE POINT
 *  ------------------------------------------------------------------
 *  `opportunity-import-wire.ts` is the PURE translator: panel shapes in,
 *  contract shapes out, no `fetch` and no hook, readable without a server. This
 *  file is the part that crosses the wire — it owns the two paths, the
 *  permission they ask for, and the cache they invalidate. Same split
 *  `lead-import.ts` keeps, and this file is its twin.
 *
 *  ------------------------------------------------------------------
 *  PREVIEW FIRST, ALWAYS — AND SOMETIMES ONLY PREVIEW
 *  ------------------------------------------------------------------
 *  `preview` is a dry run: it writes nothing, not even a sequence number. It is
 *  asked first because it is the only side that can answer the two questions the
 *  browser cannot — "is there a lead named like this `Account` cell" and "does
 *  that customer already have an open deal". When it comes back with no
 *  surviving row the run STOPS there: opening a transaction for a batch that is
 *  entirely duplicates or entirely broken is a write with nothing to write.
 *
 *  `import` is one transaction. The whole batch lands or none of it does, so
 *  there is no half-loaded pipeline to reconcile afterwards.
 *
 *  ------------------------------------------------------------------
 *  THE NUMBERS THE PANEL DRAWS ARE THE SERVER'S NUMBERS
 *  ------------------------------------------------------------------
 *  The two sides do not dedupe on the same key and cannot: the panel asks "is
 *  this the same COMPANY" (`mst:` then `ten:`), the server asks "does this
 *  customer already have an open deal" (`lead:<mã>`), and only the server knows
 *  which lead an `Account` cell names. So the ops screen hands the panel an
 *  EMPTY key set — no row is dropped in the browser before the server has seen
 *  it — and this file hands back the server's own report, because a screen
 *  reporting "5 deals opened" over a server that wrote 3 is a screen telling a
 *  lie. */

const PREVIEW_PATH = '/sales/ops/import/preview'
const COMMIT_PATH = '/sales/ops/import'

/** What both routes ask for, in the SAME words `apps/api` uses on the other end
 *  (`@Need({ branch: 'Sales', permission: 'cơ-hội.sửa' })` on
 *  `OpportunityController.importPreview` and `.import`). Reused from
 *  `ops-write.ts` rather than declared again — one door, one need, one place to
 *  change it.
 *
 *  The dry run asks for the write permission too, and that is not an oversight
 *  on either side: a preview reads the whole live lead book and the open deals
 *  standing on it. Presales holds `cơ-hội.xem` and not `cơ-hội.sửa`, so the call
 *  is refused at `requireAccess` before a byte moves — same fence, one round
 *  trip earlier. */
const IMPORT_NEED = OPS_WRITE_NEED

export type OpportunityImportInput = {
  /** Rows the panel already built, each carrying its first cell verbatim. */
  rows: readonly ImportableOpRow[]
  fileName: string
  signal?: AbortSignal
}

export type OpportunityImportRun = {
  /** What to draw — the SERVER's report whenever the server answered. */
  report: OpportunityImportPanelReport
  /** Codes minted, in the order of the file. Empty when nothing was written,
   *  including the preview-only path. */
  codes: string[]
  /** Why nothing was written, in Vietnamese, ready to show. Absent means the run
   *  reached the server and the report is its answer. */
  failure?: string
}

/** Nothing was written, and here is the sentence saying why.
 *
 *  Every candidate row becomes an error carrying that sentence rather than the
 *  refusal being reported as one line somewhere: the panel's error table and its
 *  downloadable error file are the only surface that names ROWS, and a refused
 *  batch is a batch where every row still needs re-loading. */
function refused(message: string, rows: readonly ImportableOpRow[]): OpportunityImportRun {
  return {
    failure: message,
    codes: [],
    report: {
      rows: [],
      errors: rows.map((row) => ({ line: row.line, first: row.first, reason: message })),
      duplicates: 0,
      dupInFile: 0,
      total: rows.length,
      dupWithBook: [],
      dupWithinFile: [],
    },
  }
}

/** Run one batch against the two endpoints. NEVER throws — see `onCommit` in
 *  `components/import-zone.tsx`: the panel has no words for a failed write and
 *  no way to know what was written, so the screen that calls the network is the
 *  one that has to turn its own failure into a report.
 *
 *  Two ways a batch ends without a commit, and both come back as an ordinary
 *  `OpportunityImportRun`:
 *   · the body fails the contract's own schema here, before the network;
 *   · the server refuses (permission, validation, a dead session).
 *
 *  A third is not a failure at all: the preview survives with no rows — the
 *  ordinary outcome of a file whose accounts are not in the lead book yet, or of
 *  the same pipeline being loaded twice. That one returns the preview's report
 *  with no `failure`. */
export async function runOpportunityImport(
  input: OpportunityImportInput,
): Promise<OpportunityImportRun> {
  const body = buildOpportunityImportBody(input.rows, input.fileName)
  if (!body.success) {
    /* The schema running here is the same one the server runs, so its first
       complaint is word for word the one the server would have raised. */
    return refused(body.error.issues[0]?.message ?? 'Lô này không hợp lệ.', input.rows)
  }

  try {
    const preview = await api.write<OpportunityImportPreviewResponse>(PREVIEW_PATH, {
      body: body.data,
      need: IMPORT_NEED,
      signal: input.signal,
    })

    /* Nothing survived the dry run — every row is broken, or every customer in
       the file already has an open deal. Stop: a transaction for an empty batch
       is a write with nothing to write, and the preview's report is already the
       whole answer. */
    if (preview.rows.length === 0) return { report: toPanelReport(preview), codes: [] }

    const written = await api.write<OpportunityImportCommitResponse>(COMMIT_PATH, {
      body: body.data,
      need: IMPORT_NEED,
      signal: input.signal,
    })
    return { report: toPanelReport(written), codes: written.codes }
  } catch (error) {
    /* `dispatch` guarantees `ApiError`; the `isApiError` guard is what keeps a
       genuinely unexpected throw from being read as one. */
    return refused(isApiError(error) ? userMessage(error) : 'Không nạp được lô này.', input.rows)
  }
}

/** `runOpportunityImport` plus the one thing a screen must not forget:
 *  refreshing the book it just wrote into.
 *
 *  Fire-and-forget, like `usePromoteLead`: the panel's result table is drawn
 *  from the report it is handed, not from the book query, so making the person
 *  wait for a refetch before seeing their four numbers buys nothing. */
export function useOpportunityImport() {
  const client = useQueryClient()

  return async (input: OpportunityImportInput): Promise<OpportunityImportRun> => {
    const run = await runOpportunityImport(input)
    void client.invalidateQueries({ queryKey: OPS_BOOK_KEY })
    return run
  }
}
