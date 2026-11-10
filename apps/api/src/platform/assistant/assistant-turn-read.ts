import {
  AssistantReadKind,
  type AssistantFooter,
  type AssistantRef,
  type AssistantSuggestion,
  type AssistantSuggestionKey,
} from '@pv/contracts'
import type { ToolVerdict } from './assistant-tools'

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
  /** By code: a search hit opened later is one record read, not two. */
  refs: Map<string, AssistantRef>
  steps: number
  /** `tool` and `tool kind` pairs that came back, e.g. `get_record contract`, each
   *  with the first code it returned. */
  seen: Map<string, string | null>
}

export const newReads = (): TurnReads => ({ refs: new Map(), steps: 0, seen: new Map() })

const see = (reads: TurnReads, pair: string, code: string | null): void => {
  if (!reads.seen.has(pair)) reads.seen.set(pair, code)
}

export function noteReads(
  reads: TurnReads,
  calls: readonly (ToolVerdict & { call: { name: string } })[],
): void {
  for (const c of calls) {
    if (c.outcome !== 'ok') continue
    const tool = c.call.name
    /* A company read lists its leads and deals as refs; only the company is the record read. */
    const only = tool === 'get_record' && c.refs[0]?.kind === 'account' ? c.refs[0] : null
    for (const ref of c.refs) {
      if (!reads.refs.has(ref.code)) reads.refs.set(ref.code, ref)
      if (only && ref !== only) continue
      see(reads, tool, ref.code)
      see(reads, `${tool} ${ref.kind}`, ref.code)
    }
    reads.steps += c.steps
    if (c.steps > 0) see(reads, `${tool} next-step`, null)
  }
}

const KINDS: readonly FooterKind[] = AssistantReadKind.options

/** Kinds with nothing read are left out: the contract counts are positive. */
export function footerOf(reads: Pick<TurnReads, 'refs' | 'steps'>, at: Date): AssistantFooter {
  const refs = [...reads.refs.values()]
  const counted = KINDS.map((kind) => ({ kind, count: refs.filter((r) => r.kind === kind).length }))
  const read = [...counted, { kind: 'next-step' as const, count: reads.steps }]
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
