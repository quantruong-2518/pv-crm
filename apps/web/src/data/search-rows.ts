import {
  Building,
  Contact,
  FileCheck,
  Handshake,
  Megaphone,
  Users,
  type IconGlyph,
  type SearchRow,
} from '@pv/ui'
import type { SearchHit, SearchKind } from '@pv/contracts'

/** Pure pieces of the header record search: what each kind is called, where it
 *  lives, how a typed prefix narrows it, and how a hit becomes a row.
 *
 *  Icons repeat the Sales nav's glyph for the same module (`SALES_MODULES` in
 *  `app/chrome.tsx`). The paths are copied, not imported, because chrome
 *  imports `data/search.ts` and the reverse import would be a cycle. */

type KindFacts = { label: string; icon: IconGlyph; book: string; detail: string }

/** Order here is the order of the scope chips. */
export const SEARCH_KIND_FACTS: Record<SearchKind, KindFacts> = {
  lead: { label: 'Lead', icon: Users, book: '/sales/leads', detail: '/sales/leads' },
  account: { label: 'Công ty', icon: Building, book: '/sales/accounts', detail: '/sales/accounts' },
  contact: { label: 'Liên hệ', icon: Contact, book: '/sales/contacts', detail: '/sales/leads' },
  opportunity: {
    label: 'Cơ hội',
    icon: Handshake,
    book: '/sales/opportunities',
    detail: '/sales/opportunities',
  },
  campaign: {
    label: 'Chiến dịch',
    icon: Megaphone,
    book: '/sales/campaigns',
    detail: '/sales/campaigns',
  },
  contract: {
    label: 'Hợp đồng',
    icon: FileCheck,
    book: '/sales/contracts',
    detail: '/sales/contracts',
  },
}

/** Same folding as `header-search.tsx`, which `@pv/ui` does not export. */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()

/* A Map, not an object: the key is typed text, and `constructor:` must not
   find something on a prototype. */
const PREFIXES = new Map<string, SearchKind>([
  ['lead', 'lead'],
  ['cong ty', 'account'],
  ['lien he', 'contact'],
  ['co hoi', 'opportunity'],
  ['chien dich', 'campaign'],
  ['hop dong', 'contract'],
])

/** `co hoi: abc` → the opportunity kind and `abc`. The head is folded alone and
 *  the remainder sliced from the raw text, so folding never shifts the cut. */
export function splitPrefix(text: string): { kind: SearchKind | null; q: string } {
  const colon = text.indexOf(':')
  const kind =
    colon < 0 ? undefined : PREFIXES.get(fold(text.slice(0, colon)).trim().replace(/\s+/g, ' '))
  return kind ? { kind, q: text.slice(colon + 1).trim() } : { kind: null, q: text.trim() }
}

/** The code of the record to open: a contact hit already carries its lead's. */
export const hitPath = (hit: SearchHit) =>
  `${SEARCH_KIND_FACTS[hit.kind].detail}/${encodeURIComponent(hit.code)}`

/** The kind to log as picked: opening a contact opens its lead, so that is
 *  what the recent list must remember. */
export const pickedKind = (kind: SearchKind): SearchKind => (kind === 'contact' ? 'lead' : kind)

const MATCH_LABEL = {
  contact: 'Liên hệ',
  email: 'Email',
  phone: 'Điện thoại',
  taxCode: 'Mã số thuế',
  code: 'Mã',
} as const

/** Which field matched when it was not the title; else the subtitle. A matched
 *  text equal to the title would only repeat the row's label. */
function hitNote(hit: SearchHit): string | undefined {
  const { field, text } = hit.matched
  if (field === 'title' || text === '' || text === hit.title) return hit.subtitle
  return `${MATCH_LABEL[field]}: ${text}`
}

export function hitRow(hit: SearchHit, onPick: (hit: SearchHit) => void): SearchRow {
  return {
    id: `${hit.kind}:${hit.code}`,
    icon: SEARCH_KIND_FACTS[hit.kind].icon,
    label: hit.title,
    note: hitNote(hit),
    onClick: () => onPick(hit),
  }
}
