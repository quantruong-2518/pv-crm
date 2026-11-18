import { commDraftKey } from '@/data/comm-record-detail'

/** Which parts of one AI job's suggestions the person already took or dropped,
 *  kept in this browser beside the unsent form. Without it a reopened record
 *  re-reads the landed job and offers the same suggestions again. */

/** The parts of a ready suggestion a person can fill or drop one by one. */
export type DraftPart = 'title' | 'note' | 'answers' | 'step'

export type Settled = {
  jobId: string
  taken: DraftPart[]
  dropped: DraftPart[]
  dismissed: boolean
}

/** Its own key: `writeCommDraft` replaces the form's key whole and would lose this. */
const settledKey = (recordId: string) => `${commDraftKey(recordId)}:ai`

const isParts = (value: unknown): value is DraftPart[] =>
  Array.isArray(value) &&
  value.every((p) => p === 'title' || p === 'note' || p === 'answers' || p === 'step')

/** Null for another job, so a new press starts with every part open. */
export function readSettled(recordId: string, jobId: string): Settled | null {
  try {
    const raw = localStorage.getItem(settledKey(recordId))
    const found: unknown = raw ? JSON.parse(raw) : null
    if (typeof found !== 'object' || found === null) return null
    const { taken, dropped, dismissed, jobId: stored } = found as Partial<Settled>
    if (stored !== jobId || !isParts(taken) || !isParts(dropped)) return null
    return { jobId, taken, dropped, dismissed: dismissed === true }
  } catch {
    return null
  }
}

export function writeSettled(recordId: string, settled: Settled) {
  try {
    localStorage.setItem(settledKey(recordId), JSON.stringify(settled))
  } catch {
    /* storage unavailable — the suggestions may be offered again on reopen */
  }
}

export function clearSettled(recordId: string) {
  try {
    localStorage.removeItem(settledKey(recordId))
  } catch {
    /* storage unavailable — nothing was kept */
  }
}
