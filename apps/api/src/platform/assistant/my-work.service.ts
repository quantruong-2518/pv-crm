import { Injectable } from '@nestjs/common'
import { MyWorkResponse, MyWorkSection, type AssistantRef } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { vietnamDay } from '../clock/vietnam-clock'
import { AssistantToolGate } from './assistant-tools'

type Rows = { trusted: unknown; code?: unknown }[]

const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((v, key) => (v as Record<string, unknown> | null | undefined)?.[key], value)
const list = (value: unknown): Rows => (Array.isArray(value) ? (value as Rows) : [])
/** A row printed as `{ trusted, untrusted }`: only the first half is ever kept. */
const trustedOf = (value: unknown): unknown[] => list(value).map((row) => row.trusted)

const coded = (value: unknown, codes: ReadonlySet<string>): unknown[] =>
  trustedOf(value).filter((row) => codes.has(String(at(row, 'code'))))

/** The model-safe rows of a section's TODAY work, read from where `list_my_work` prints them.
 *  Rows that carry a record code are kept only if that code produced a work item, so a
 *  hold not yet due or a step ahead never reaches the brief's model. */
const TRUSTED_ROWS: Record<MyWorkSection, (out: unknown, codes: ReadonlySet<string>) => unknown[]> =
  {
    'next-step': (out, codes) =>
      list(at(out, 'trusted', 'nextSteps')).filter((row) => codes.has(String(row.code))),
    approval: (out) => trustedOf(at(out, 'approvals', 'waitingOnMe', 'rows')),
    meeting: (out) => [at(out, 'meeting', 'trusted')],
    parked: (out, codes) => coded(at(out, 'holds', 'rows'), codes),
    'stale-deal': (out, codes) => coded(at(out, 'staleDeals', 'rows'), codes),
    'late-debrief': (out) => trustedOf(at(out, 'lateDebriefs', 'rows')),
    'overdue-contract': (out, codes) => coded(at(out, 'overdueContracts', 'rows'), codes),
  }

/** `response` is the HTTP answer. `trusted` is each section's model-safe today rows for
 *  the brief's AI call; it never leaves the server. */
export type MyWorkRead = {
  response: MyWorkResponse
  trusted: Partial<Record<MyWorkSection, unknown[]>>
}

/** Today's work of one person, read through the assistant's own tool gate (ADR 0154 §2),
 *  so the card, the brief and the chat obey the same doors. Platform names the tool by
 *  string and never imports the branch that owns it. The gate writes no row itself.
 *
 *  A section the asker cannot open (gate refusal, a shut door, a 403 or 404 inside) is left
 *  out. One whose read threw is `skipped`: unread, not empty, and a caller must not
 *  take the rest as the whole answer. */
@Injectable()
export class MyWorkService {
  constructor(private readonly gate: AssistantToolGate) {}

  async read(who: Actor, now = Date.now()): Promise<MyWorkResponse> {
    return (await this.gather(who, now)).response
  }

  /** Sequential: each section is one door read, and a page opening must not fan out on Neon. */
  async gather(who: Actor, now = Date.now()): Promise<MyWorkRead> {
    const sections: MyWorkResponse['sections'] = []
    const trusted: MyWorkRead['trusted'] = {}
    for (const section of MyWorkSection.options) {
      const verdict = await this.gate.call(who, {
        id: `my-work-${section}`,
        name: 'list_my_work',
        input: { kind: section },
      })
      if (verdict.outcome === 'refused') continue
      if (verdict.outcome !== 'ok') {
        sections.push({ section, count: 0, more: false, skipped: true, refs: [] })
        continue
      }
      const unread = at(verdict.output, 'trusted', 'skipped')
      if (Array.isArray(unread) && unread.includes(section)) continue
      const items = verdict.workItems.filter((item) => item.section === section)
      const codes = new Set(items.flatMap((item) => (item.code === null ? [] : [item.code])))
      const refs = new Map<string, AssistantRef>()
      for (const ref of verdict.refs) if (codes.has(ref.code)) refs.set(ref.code, ref)
      sections.push({
        section,
        count: items.length,
        more: verdict.workCut.includes(section),
        skipped: false,
        refs: [...refs.values()],
      })
      if (items.length > 0) trusted[section] = TRUSTED_ROWS[section](verdict.output, codes)
    }
    return { response: MyWorkResponse.parse({ day: vietnamDay(now), sections }), trusted }
  }
}
