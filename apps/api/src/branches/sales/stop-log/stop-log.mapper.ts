import {
  LEAD_STATE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  type LeadState,
  type StageKey,
  type StopLogFacetItem,
  type StopLogKind,
  type StopLogRow,
} from '@pv/contracts'
import { LEAD_NOTE } from '../lead/lead-write.mapper'
import type { StopFacetRead, StopLogRead, StopStageFacetRead } from './stop-log.repository'

/** What a facet prints for a stop with no stage or no known actor: a pre-0149
 *  park, a contract with no value, a deal stopped before stage events. */
const NONE_LABEL = 'Chưa có'
const NONE_KEY = 'none'

function stageLabel(kind: StopLogKind, raw: string | null): string | null {
  if (raw === null) return null
  if (kind === 'lead') return LEAD_STATE_LABEL[raw as LeadState] ?? raw
  if (kind === 'deal') return OPPORTUNITY_STAGE_LABEL[raw as StageKey] ?? raw
  return `Đã thu ${raw}%`
}

/** The park note is `LEAD_NOTE.nurtured(reason, note)`; the user's sentence is
 *  what follows the reason-only form, so both read from one spelling. */
function parkNoteOf(note: string | null, reasonKey: string): string | null {
  if (note === null) return null
  const bare = `${LEAD_NOTE.nurtured(reasonKey, undefined)} · `
  return note.startsWith(bare) ? note.slice(bare.length) : null
}

export function toRow(r: StopLogRead): StopLogRow {
  const note = r.kind === 'lead' ? parkNoteOf(r.note, r.reasonKey) : r.note
  return {
    at: new Date(r.at).toISOString(),
    kind: r.kind,
    code: r.code,
    name: r.name,
    stage: stageLabel(r.kind, r.stageRaw),
    actorName: r.actorName,
    reasonKey: r.reasonKey,
    reasonLabel: r.reasonLabel,
    note: note?.trim() ? note.trim() : null,
    now: r.now,
  }
}

/** Stage buckets for the legend: one "none" across kinds, and one bucket for
 *  every contract, since a percent per contract splits the bar into slivers.
 *  Kind-qualified keys otherwise: a lead state and a deal stage share `new`. */
function stageBucket(f: StopStageFacetRead): StopLogFacetItem {
  if (f.stageRaw === null) return { key: NONE_KEY, label: NONE_LABEL, count: f.count }
  if (f.kind === 'contract')
    return { key: 'contract-signed', label: 'Hợp đồng đã ký', count: f.count }
  return {
    key: `${f.kind}:${f.stageRaw}`,
    label: stageLabel(f.kind, f.stageRaw) ?? NONE_LABEL,
    count: f.count,
  }
}

export function toStageFacets(read: StopStageFacetRead[]): StopLogFacetItem[] {
  const merged = new Map<string, StopLogFacetItem>()
  for (const b of read.map(stageBucket)) {
    const had = merged.get(b.key)
    merged.set(b.key, had ? { ...had, count: had.count + b.count } : b)
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
}

export const toFacet = (f: StopFacetRead): StopLogFacetItem => ({
  key: f.key || NONE_KEY,
  label: f.label || NONE_LABEL,
  count: f.count,
})
