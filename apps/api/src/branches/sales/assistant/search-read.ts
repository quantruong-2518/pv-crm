import {
  AssistantReadKind,
  ContractCode,
  ObjectCode,
  type SearchHit,
  type SearchResult,
} from '@pv/contracts'
import { z } from 'zod'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import type { ToolRead } from '@api/platform/assistant/assistant-tools'
import { refOf } from './record-read-kit'

/** A hit's `code` is a bare string in the contract: re-checked here to earn `trusted`. */
const HitTrusted = z.object({ kind: AssistantReadKind, code: ContractCode.or(ObjectCode) })

/** `matched` and `score` stay behind: `matched.text` is the phone or email on a
 *  contact hit, and a deal's contact name on a deal hit. */
export function searchRead(result: SearchResult, mayReach: boolean): ToolRead {
  const groups = result.groups
  /* A contact hit carries its LEAD's code (the screen opens the lead): read as a lead, and
     dropped when that lead is already a hit, or `get_record` would take the code as a person's. */
  const all = groups.flatMap((g) =>
    g.hits.map((h) => ({
      ...h,
      kind: h.kind === 'contact' ? ('lead' as const) : h.kind,
      /* A reload re-reads the lead and labels it with its company: the live chip does too. */
      label: h.kind === 'contact' ? (h.subtitle ?? h.title) : h.title,
    })),
  )
  const hits = all.filter(
    (h, i) => all.findIndex((o) => o.kind === h.kind && o.code === h.code) === i,
  )
  const text = (h: SearchHit) => ({ title: h.title, subtitle: h.subtitle })
  const trusted = hits.map((h) => HitTrusted.parse(h))
  return {
    data: {
      trusted: { more: groups.filter((g) => g.more).map((g) => g.kind) },
      hits: hits.map((h, i) => ({
        trusted: trusted[i],
        untrusted: mayReach ? text(h) : maskContact(text(h)),
      })),
    },
    codes: hits.map((h) => h.code),
    rowCount: hits.length,
    hidden: null,
    refs: trusted.map((t, i) => refOf(t.kind, t.code, hits[i]?.label ?? '', mayReach)),
  }
}
