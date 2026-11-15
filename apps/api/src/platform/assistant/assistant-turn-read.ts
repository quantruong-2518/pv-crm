import {
  AssistantReadKind,
  type AssistantFooter,
  type AssistantRef,
  type AssistantSuggestion,
  type AssistantSuggestionKey,
} from '@pv/contracts'
import type { FooterReads, ToolVerdict } from './assistant-tools'

/** What a turn's tools read, for the screen alone: the ref chips, the footer under
 *  the answer, and the suggestion chips. None of it enters a model request.
 *
 *  Labels are door text (D5), so they stay on the screen. A suggestion is a template
 *  key, keyed by which tool ran and which kind came back, and at most a record code
 *  a tool returned: no tool prose and no model text reach a chip, and the screen
 *  words it in the viewer's language. Only `ok` calls count, since a refused or
 *  over-cap call reached the model with nothing in it. */

type FooterKind = AssistantFooter['read'][number]['kind']

export type TurnReads = {
  /** Every ref the calls returned, by code, for the chips. */
  refs: Map<string, AssistantRef>
  /** The refs the footer counts: a search hit opened later is one record read, not two. */
  counted: Map<string, AssistantRef>
  /** Reads with no record ref (next steps, approvals, holds, meetings), summed. */
  steps: FooterReads
  /** `tool` and `tool kind` pairs that came back, e.g. `get_record contract`, each
   *  with the first code it returned. */
  seen: Map<string, string | null>
}

export const newReads = (): TurnReads => ({
  refs: new Map(),
  counted: new Map(),
  steps: {},
  seen: new Map(),
})

const see = (reads: TurnReads, pair: string, code: string | null): void => {
  if (!reads.seen.has(pair)) reads.seen.set(pair, code)
}

/** The order the footer lists them in, after the record kinds. */
const READ_KEYS = [
  'next-step',
  'approval',
  'hold',
  'meeting',
] as const satisfies readonly (keyof FooterReads)[]

function addReads(into: FooterReads, from: FooterReads): void {
  for (const key of READ_KEYS) if (from[key]) into[key] = (into[key] ?? 0) + from[key]
}

/** Per-call reads of one answer, summed: the reloaded footer's side of `noteReads`. */
export function sumReads(list: readonly FooterReads[]): FooterReads {
  const total: FooterReads = {}
  for (const reads of list) addReads(total, reads)
  return total
}

export function noteReads(
  reads: TurnReads,
  calls: readonly (ToolVerdict & { call: { name: string } })[],
): void {
  for (const c of calls) {
    if (c.outcome !== 'ok') continue
    const tool = c.call.name
    for (const ref of c.refs) if (!reads.refs.has(ref.code)) reads.refs.set(ref.code, ref)
    const counted = c.counted === 'first' ? c.refs.slice(0, 1) : c.counted === 'none' ? [] : c.refs
    for (const ref of counted) {
      if (!reads.counted.has(ref.code)) reads.counted.set(ref.code, ref)
      see(reads, tool, ref.code)
      see(reads, `${tool} ${ref.kind}`, ref.code)
    }
    addReads(reads.steps, c.reads)
    for (const key of READ_KEYS) if ((c.reads[key] ?? 0) > 0) see(reads, `${tool} ${key}`, null)
  }
}

const KINDS: readonly FooterKind[] = AssistantReadKind.options

/** Kinds with nothing read are left out: the contract counts are positive. */
export function footerOf(reads: Pick<TurnReads, 'counted' | 'steps'>, at: Date): AssistantFooter {
  const refs = [...reads.counted.values()]
  const counted = KINDS.map((kind) => ({ kind, count: refs.filter((r) => r.kind === kind).length }))
  const read = [...counted, ...READ_KEYS.map((kind) => ({ kind, count: reads.steps[kind] ?? 0 }))]
  return { read: read.filter((r) => r.count > 0), at: at.toISOString() }
}

/** In order of use; the first three that match are sent. Each is answerable by the
 *  tool that matched it, from the trusted fields that tool returns. */
const TEMPLATES: readonly { when: string; key: AssistantSuggestionKey; code: boolean }[] = [
  { when: 'list_my_work next-step', key: 'overdue-steps', code: false },
  { when: 'list_my_work lead', key: 'stale-leads', code: false },
  { when: 'list_my_work opportunity', key: 'closing-deals', code: false },
  { when: 'get_record lead', key: 'lead-converted', code: true },
  { when: 'get_record opportunity', key: 'deal-contract', code: true },
  { when: 'get_record contract', key: 'contract-collected', code: true },
  { when: 'search_records', key: 'open-first-hit', code: true },
]

export const suggestionsOf = (reads: TurnReads): AssistantSuggestion[] =>
  TEMPLATES.filter((t) => reads.seen.has(t.when))
    .slice(0, 3)
    .map(({ when, key, code }) => {
      const seen = code ? reads.seen.get(when) : null
      return { key, params: seen ? { code: seen } : {} }
    })
