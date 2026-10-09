import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor, Permission } from '@pv/engines'
import {
  SEARCH_KINDS,
  SearchRecentResult,
  SearchResult,
  type SearchHit,
  type SearchKind,
  type SearchQuery,
  type SearchRecentItem,
  type SearchRecentWrite,
} from '@pv/contracts'
import { csvOf } from '@api/platform/db/book-filter'
import { ACCESS } from '@api/platform/engines/tokens'
import { SearchRepository, type SearchRow } from './search.repository'

/** The view permission each kind is behind; `@Need` can name only one. */
const VIEW: Record<SearchKind, Permission> = {
  lead: 'lead.view',
  contact: 'lead.view',
  account: 'account.view',
  opportunity: 'opportunity.view',
  campaign: 'campaign.view',
  contract: 'contract.view',
  partner: 'lead-origin.manage',
}

/** Newest rows kept per person; the list shows them all. */
const RECENT_KEEP = 20

const hitOf = (r: SearchRow): SearchHit => ({
  kind: r.kind,
  code: r.code,
  title: r.title,
  ...(r.subtitle === null ? {} : { subtitle: r.subtitle }),
  matched: { field: r.field, text: r.text },
  score: r.score,
})

/** Global search: E2 judges each kind, the repository searches only what passed. */
@Injectable()
export class SearchService {
  constructor(
    private readonly repo: SearchRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async search(who: Actor, q: SearchQuery): Promise<SearchResult> {
    const asked = q.kinds ? ([...new Set(csvOf(q.kinds))] as SearchKind[]) : [...SEARCH_KINDS]
    const kinds = this.viewable(who, asked)
    if (kinds.length === 0) return { groups: [] }

    const rows = await this.repo.search({ id: who.id, ownOnly: !!who.ownOnly }, kinds, q.q, q.limit)
    const groups = kinds
      .map((kind) => rows.filter((r) => r.kind === kind))
      .filter((own) => own.length > 0)
      .map((own) => ({
        kind: own[0]!.kind,
        hits: own.slice(0, q.limit).map(hitOf),
        more: own.length > q.limit,
      }))
    return SearchResult.parse({ groups })
  }

  async recent(who: Actor): Promise<SearchRecentResult> {
    const rows = await this.repo.recent(who.id, RECENT_KEEP)
    const wanted = new Map<SearchKind, string[]>()
    for (const kind of this.viewable(who, [...SEARCH_KINDS])) {
      const codes = rows.filter((r) => r.pickedKind === kind).map((r) => r.pickedCode!)
      if (codes.length > 0) wanted.set(kind, codes)
    }
    const seen = new Map<string, SearchHit>()
    for (const r of await this.repo.resolve({ id: who.id, ownOnly: !!who.ownOnly }, wanted)) {
      const key = `${r.kind}:${r.code}`
      if (!seen.has(key)) seen.set(key, hitOf(r))
    }

    const items = rows.flatMap((r): SearchRecentItem[] => {
      const at = r.at.toISOString()
      if (r.pickedKind === null) return r.resultCount > 0 ? [{ type: 'query', q: r.q, at }] : []
      const found = seen.get(`${r.pickedKind}:${r.pickedCode}`)
      return found ? [{ type: 'record', hit: found, at }] : []
    })
    return SearchRecentResult.parse({ items })
  }

  /** A pick, or a non-empty query, is worth a row; nothing typed and nothing picked is not. */
  async record(who: Actor, w: SearchRecentWrite): Promise<void> {
    if (!w.picked && w.q === '') return
    await this.repo.record(who.id, w, RECENT_KEEP)
  }

  clear(who: Actor): Promise<void> {
    return this.repo.clear(who.id)
  }

  /** `check`, not `allows`: `allows` skips the license axis. */
  private viewable(who: Actor, kinds: SearchKind[]): SearchKind[] {
    return kinds.filter((k) => this.access.check(who, { branch: 'Sales', permission: VIEW[k] }).ok)
  }
}
