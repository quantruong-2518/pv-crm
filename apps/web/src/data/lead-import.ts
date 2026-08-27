import { useQueryClient } from '@tanstack/react-query'
import type {
  LeadImportBody,
  LeadImportCommitResponse,
  LeadImportPreviewResponse,
} from '@pv/contracts'
import type { LeadMotion } from '@pv/engines'
import { api, isApiError, userMessage, type ApiNeed } from '@/app/api'
import {
  buildLeadImportBody,
  toPanelReport,
  type ImportableRow,
  type LeadImportPanelReport,
} from '@/data/lead-import-wire'

/** Module 2 · the FILE door of the lead book — `POST /sales/leads/import`.
 *
 *  ------------------------------------------------------------------
 *  TWO FILES, AND THE SPLIT IS THE POINT
 *  ------------------------------------------------------------------
 *  `lead-import-wire.ts` is the PURE translator: panel shapes in, contract
 *  shapes out, no `fetch` and no hook, so it can be read and reviewed without a
 *  server. This file is the part that actually crosses the wire — it owns the
 *  two paths, the permission they ask for, and the cache they invalidate. Same
 *  split `lead-create.ts` keeps against `lead-form.ts`.
 *
 *  ------------------------------------------------------------------
 *  PREVIEW FIRST, ALWAYS — AND SOMETIMES ONLY PREVIEW
 *  ------------------------------------------------------------------
 *  `preview` is a dry run: it writes nothing, not even a sequence number. It is
 *  asked first because it is the only place that can answer "does this mailbox
 *  already belong to a live lead" — the browser cannot know that. When it comes
 *  back with no surviving row the run STOPS there: opening a transaction for a
 *  batch that is entirely duplicates or entirely broken is a write that has
 *  nothing to write.
 *
 *  `import` is one transaction. The whole batch lands or none of it does, so
 *  there is no half-loaded file to reconcile afterwards.
 *
 *  ------------------------------------------------------------------
 *  THE NUMBERS THE PANEL DRAWS ARE THE SERVER'S NUMBERS
 *  ------------------------------------------------------------------
 *  The browser and the server do not dedupe on the same key — the panel asks
 *  "is this the same COMPANY" (`mst:` then `ten:`), the server asks "is this
 *  the same LIVE LEAD" (`email:`). Two honest answers to two different
 *  questions, which is exactly why the four tallies at the end of the panel
 *  have to come from whichever side actually wrote: a screen reporting "5 into
 *  the book" over a server that wrote 3 is a screen telling a lie. So this
 *  file hands the panel back the server's own `LeadImportReport`, and the lead
 *  screen passes an EMPTY key set into the panel so no row is dropped in the
 *  browser before the server has seen it. */

const PREVIEW_PATH = '/sales/leads/import/preview'
const COMMIT_PATH = '/sales/leads/import'

/** What both routes ask for, in the SAME words `apps/api` uses on the other end
 *  (`@Need({ branch: 'Sales', permission: 'lead.sửa' })` on
 *  `LeadController.preview` and `.import`).
 *
 *  The dry run asks for the write permission too, and that is not an oversight
 *  on either side: a preview reads the whole live book through the mailbox
 *  index and reports which rows collide with it. Presales holds `lead.xem` and
 *  not `lead.sửa`, so the panel refuses them at `requireAccess` before a byte
 *  moves — same fence, one round trip earlier. */
const IMPORT_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.sửa' }

/** Prefix every lead-book query in `data/leads.ts` hangs under — both the page
 *  (`…, 'page', query`) and the facet list (`…, 'facets'`). One prefix
 *  invalidation therefore refreshes the table AND the filter selects, which is
 *  what a freshly loaded batch needs: a new account that is in the book but
 *  missing from the Account filter is a book the user cannot search.
 *
 *  Copied rather than imported for the reason `lead-create.ts` states over its
 *  own copy — `data/leads.ts` exports the query objects, not the prefix. Noted
 *  in both places so a rename finds all of them. */
const LEAD_BOOK_KEY = ['sales', 'lead-book'] as const

/** THE SECOND CONVERSION SITE BETWEEN THE TWO SPELLINGS OF `motion`, AND IT IS
 *  DELIBERATE. READ BEFORE ADDING A THIRD.
 *
 *  `@pv/engines` spells motions lower case (`outbound`) and the whole panel —
 *  `LEAD_SPEC.motions`, `MOTION_BY_INTAKE`, `MOTION_FACE` — is built on that
 *  spelling. `@pv/contracts` spells them UPPER_SNAKE (`OUTBOUND`), and the
 *  server's zod gate refuses the lower-case one outright. So there is no legal
 *  path from the panel's selector to the endpoint that does not convert
 *  somewhere.
 *
 *  `packages/contracts/src/sales/enums.ts` says the conversion has exactly ONE
 *  legal site, `lead.mapper.ts` on the server, because "a second conversion
 *  site is how two spellings start to drift". This IS that second site. It
 *  exists because the underlying debt — one enum declared in two packages —
 *  has not been paid, and it is written down here rather than sprinkled at
 *  three call sites so that paying the debt is one deletion. The real fix is a
 *  sweep moving `packages/engines` to the contract's spelling; it touches
 *  several screens and is not this ticket.
 *
 *  Partial on purpose: `inbound` and `referral` exist in the engine and cannot
 *  come through a file (`MOTION_BY_CHANNEL.IMPORT` has four members). A motion
 *  with no entry is refused here by name instead of being sent and bounced. */
const WIRE_MOTION: Partial<Record<LeadMotion, LeadImportBody['motion']>> = {
  outbound: 'OUTBOUND',
  event: 'EVENT',
  partner: 'PARTNER',
  recycle: 'RECYCLE',
}

export type LeadImportInput = {
  /** Rows the panel already built, each carrying its first cell verbatim. */
  rows: readonly ImportableRow[]
  /** Motion for the whole batch, in the ENGINE's spelling — converted once, at
   *  `WIRE_MOTION` above. */
  motion: LeadMotion
  fileName: string
  /** Source code for the whole batch, when the load started inside a campaign.
   *  The lead book itself has no campaign, so it is normally absent. */
  source?: string
  signal?: AbortSignal
}

export type LeadImportRun = {
  /** What to draw — the SERVER's report whenever the server answered. */
  report: LeadImportPanelReport
  /** Codes minted, in the order of the file. Empty when nothing was written,
   *  including the preview-only path. */
  codes: string[]
  /** Why nothing was written, in Vietnamese, ready to show. Absent means the
   *  run reached the server and the report is its answer. */
  failure?: string
}

/** Nothing was written, and here is the sentence saying why.
 *
 *  Every candidate row becomes an error carrying that sentence rather than the
 *  refusal being reported as one line somewhere: the panel's error table and
 *  its downloadable error file are the only surface that names ROWS, and a
 *  refused batch is a batch where every row still needs re-loading. The four
 *  tallies then read `0 into the book · N could not be loaded`, which is what
 *  actually happened. */
function refused(message: string, rows: readonly ImportableRow[]): LeadImportRun {
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
 *  Three ways a batch ends without a commit, and all three come back as a
 *  normal `LeadImportRun`:
 *   · the motion cannot travel through the file door;
 *   · the body fails the contract's own schema here, before the network;
 *   · the server refuses (permission, validation, a dead session).
 *
 *  A fourth is not a failure at all: the preview survives with no rows, which
 *  is the ordinary outcome of loading a file that is entirely duplicates. That
 *  one returns the preview's report with no `failure`. */
export async function runLeadImport(input: LeadImportInput): Promise<LeadImportRun> {
  const motion = WIRE_MOTION[input.motion]
  if (motion === undefined) {
    return refused(`Thế "${input.motion}" không đi qua cửa nạp tệp được.`, input.rows)
  }

  const body = buildLeadImportBody(input.rows, {
    fileName: input.fileName,
    motion,
    source: input.source,
  })
  if (!body.success) {
    /* The schema running here is the same one the server runs, so its first
       complaint is word for word the one the server would have raised. */
    return refused(body.error.issues[0]?.message ?? 'Lô này không hợp lệ.', input.rows)
  }

  try {
    const preview = await api.write<LeadImportPreviewResponse>(PREVIEW_PATH, {
      body: body.data,
      need: IMPORT_NEED,
      signal: input.signal,
    })

    /* Nothing survived the dry run — every row is broken or already in the
       book. Stop: a transaction for an empty batch is a write with nothing to
       write, and the preview's report is already the whole answer. */
    if (preview.rows.length === 0) return { report: toPanelReport(preview), codes: [] }

    const written = await api.write<LeadImportCommitResponse>(COMMIT_PATH, {
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

/** `runLeadImport` plus the one thing a screen must not forget: refreshing the
 *  book it just wrote into.
 *
 *  Fire-and-forget, like `useCreateLead`: the panel's result table is drawn
 *  from the report it is handed, not from the book query, so making the person
 *  wait for a refetch before seeing their four numbers buys nothing. */
export function useLeadImport() {
  const client = useQueryClient()

  return async (input: LeadImportInput): Promise<LeadImportRun> => {
    const run = await runLeadImport(input)
    void client.invalidateQueries({ queryKey: LEAD_BOOK_KEY })
    return run
  }
}
