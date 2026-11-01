import type { LeadAiFillField, LeadAiFillValue, LeadAiJob } from '@pv/contracts'
import type { LeadAiJobRowDb } from './lead-ai-job.schema'
import type { LeadRowDb } from './lead.schema'

/** Row → `LeadAiJob`, and the one rule for "which of this job's fields can
 *  still be taken back", read by the tray's `canUndo` and by the undo itself. */

/** A finished job stays in the tray, and undoable, this long (ADR 0131 §6–7). */
export const LEAD_AI_JOB_SHOWN_MS = 24 * 60 * 60_000

/** Dismissed or past the day: out of the tray, so out of Undo's reach too. */
export const pastUndo = (job: Pick<LeadAiJobRowDb, 'finishedAt' | 'dismissedAt'>): boolean =>
  !!job.dismissedAt ||
  !job.finishedAt ||
  Date.now() - job.finishedAt.getTime() > LEAD_AI_JOB_SHOWN_MS

/** Contact person columns: the primary contact's writer owns them. */
export const PERSON_FIELDS = ['contactTitle', 'phone'] as const satisfies readonly LeadAiFillField[]

export const isPerson = (field: LeadAiFillField): field is (typeof PERSON_FIELDS)[number] =>
  (PERSON_FIELDS as readonly LeadAiFillField[]).includes(field)

/** The value a fillable field holds now, in the shape the job recorded. */
function current(row: LeadRowDb, industries: readonly string[], field: LeadAiFillField) {
  if (field === 'industries') return industries
  return field === 'category' ? row.categoryId : row[field]
}

function same(now: unknown, wrote: LeadAiFillValue): boolean {
  if (!Array.isArray(wrote) || !Array.isArray(now)) return now === wrote
  return now.length === wrote.length && wrote.every((id) => now.includes(id))
}

/** Fields this job wrote that still hold its value AND its own mark: the
 *  mark's `at` is the job's `finished_at`, so a later fill's mark never counts. */
export function undoable(
  job: Pick<LeadAiJobRowDb, 'state' | 'result' | 'finishedAt' | 'undoneAt' | 'dismissedAt'>,
  row: LeadRowDb,
  industries: readonly string[],
): LeadAiFillField[] {
  if (job.state !== 'DONE' || job.undoneAt || !job.result || pastUndo(job)) return []
  const at = job.finishedAt!.toISOString()
  const fields = job.result.filled
    .filter((f) => row.aiFill[f.field]?.at === at)
    .filter((f) => same(current(row, industries, f.field), f.value))
    .map((f) => f.field)
  /* An emptied category drops the industries under it; keep it if a person picked some. */
  const keepsCategory = !fields.includes('industries') && industries.length > 0
  return keepsCategory ? fields.filter((f) => f !== 'category') : fields
}

export function toLeadAiJob(job: LeadAiJobRowDb, leadName: string, canUndo: boolean): LeadAiJob {
  return {
    id: job.id,
    leadCode: job.leadCode,
    leadName,
    state: job.state,
    step: job.step,
    stepMs: job.stepMs,
    result: job.result,
    errorKind: job.errorKind,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    canUndo,
    undoneAt: job.undoneAt?.toISOString() ?? null,
  }
}
