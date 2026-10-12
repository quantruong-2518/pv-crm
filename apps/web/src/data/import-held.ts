import { OPPORTUNITY_STAGE_LABEL, type OpportunityRunningDeal } from '@pv/contracts'
import type { DupRow, ImportReport } from '@/data/intake'

/** Rows of the opportunity file the book held back (ADR 0088 §9): the lead has
 *  running deals, and the row goes in once it comes back naming exactly them.
 *  Pure, so the panel only draws what these return. */

/** One running deal as a line of the result list: code, name, column, holder. */
export const dealLine = (deal: OpportunityRunningDeal): string =>
  [deal.code, deal.name, OPPORTUNITY_STAGE_LABEL[deal.stage], deal.holder?.name]
    .filter(Boolean)
    .join(' · ')

/** Fold the answer for one re-sent row into the report on screen.
 *
 *  The row leaves the held list wherever it lands: in, still held under a
 *  newer list, or refused. This door never fills `codes`, so none are merged. */
export function mergeResent(prev: ImportReport, next: ImportReport, line: number): ImportReport {
  const rows = [...prev.rows, ...next.rows].sort((a, b) => a.line - b.line)
  const held: DupRow[] = [
    ...(prev.dupWithBook ?? []).filter((d) => d.line !== line),
    ...(next.dupWithBook ?? []),
  ].sort((a, b) => a.line - b.line)

  return {
    ...prev,
    rows,
    errors: [...prev.errors, ...next.errors].sort((a, b) => a.line - b.line),
    duplicates: held.length,
    dupWithBook: held,
  }
}
