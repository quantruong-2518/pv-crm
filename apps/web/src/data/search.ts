import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SEARCH_KINDS,
  SearchKind,
  SearchRecentResult,
  SearchResult,
  type SearchHit,
  type SearchRecentWrite,
} from '@pv/contracts'
import { ArrowRight, type SearchGroup, type SearchRecords } from '@pv/ui'
import { api, type ApiNeed } from '@/app/api'
import { useCan } from '@/app/auth'
import { hitPath, hitRow, pickedKind, SEARCH_KIND_FACTS, splitPrefix } from './search-rows'

/** The header search box's data — `GET /sales/search` and `/sales/search/recent`.
 *
 *      GET    /sales/search?q=&kinds=   `lead.view` · scoped
 *      GET    /sales/search/recent      `lead.view` · scoped
 *      POST   /sales/search/recent      `lead.view` · scoped
 *
 *  The same `need` as every route of the module (`SearchController`): the
 *  server drops the kinds a role may not see, so one door is enough here. A
 *  role without `lead.view` gets no hook value, and the box lists screens only.
 *
 *  Past QUERIES from the recent list are not shown: picking a row closes the
 *  box and clears its text, so a past text could not be re-run in place. */

const SEARCH_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }
const SEARCH_PATH = '/sales/search'
const RECENT_PATH = '/sales/search/recent'
const RECENT_KEY = ['sales', 'search', 'recent'] as const

const SEARCH_DELAY_MS = 200
const MIN_CHARS = 2

/* The app default is `staleTime: Infinity`; here a record just disabled or
   reassigned must not linger in results, so they expire after a minute. */
export const searchQuery = (q: string, kind: SearchKind | null) =>
  queryOptions({
    queryKey: ['sales', 'search', q, kind ?? ''] as const,
    queryFn: ({ signal }) =>
      api.read<SearchResult>(
        `${SEARCH_PATH}?q=${encodeURIComponent(q)}${kind ? `&kinds=${kind}` : ''}`,
        { need: SEARCH_NEED, schema: SearchResult, signal },
      ),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  })

/** Refreshed at most once a minute, and at once after a pick (see `useHeaderSearch`). */
export const searchRecentQuery = queryOptions({
  queryKey: RECENT_KEY,
  queryFn: ({ signal }) =>
    api.read<SearchRecentResult>(RECENT_PATH, {
      need: SEARCH_NEED,
      schema: SearchRecentResult,
      signal,
    }),
  staleTime: 60_000,
  retry: false,
})

/** Mirrors a value after it stops changing — see `useSettled` in
 *  `address-suggest.ts`, which waits 300ms for a different endpoint. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

export function useHeaderSearch(): SearchRecords | undefined {
  const navigate = useNavigate()
  const client = useQueryClient()
  const allowed: Record<SearchKind, boolean> = {
    lead: useCan('lead.view'),
    contact: useCan('lead.view'),
    account: useCan('account.view'),
    opportunity: useCan('opportunity.view'),
    campaign: useCan('campaign.view'),
    contract: useCan('contract.view'),
    partner: useCan('lead-origin.manage'),
  }
  const [text, setText] = useState('')
  const [chip, setChip] = useState<SearchKind | null>(null)

  const typed = text.trim()
  /* A prefix wins over the chip: the chip lights up for it, so what the box
     shows is always the scope the query ran with. */
  const current = splitPrefix(text)
  const scope = current.kind ?? chip
  const settled = splitPrefix(useSettled(text))
  const kind = settled.kind ?? chip
  const searching = allowed.lead && settled.q.length >= MIN_CHARS

  const found = useQuery({ ...searchQuery(settled.q, kind), enabled: searching })
  const recent = useQuery({ ...searchRecentQuery, enabled: allowed.lead })

  if (!allowed.lead) return undefined

  const remember = (body: SearchRecentWrite) =>
    // Fire and forget: a lost log line must not block opening the record.
    api
      .write(RECENT_PATH, { method: 'POST', body, need: SEARCH_NEED })
      .then(() => client.invalidateQueries({ queryKey: RECENT_KEY }))
      .catch(() => undefined)

  const open = (hit: SearchHit, log: Omit<SearchRecentWrite, 'picked'>) => {
    void remember({ ...log, picked: { kind: pickedKind(hit.kind), code: hit.code } })
    navigate(hitPath(hit))
  }

  const toGroup = (
    id: string,
    label: string,
    hits: SearchHit[],
    log: SearchRecentWrite,
  ): SearchGroup => ({
    id,
    label,
    // Two contacts of one lead share kind + code, so the position joins the id.
    rows: hits.map((hit, i) => ({
      ...hitRow(hit, (picked) => open(picked, log)),
      id: `${id}:${i}`,
    })),
  })

  let groups: SearchGroup[] = []
  if (typed === '') {
    const hits = (recent.data?.items ?? []).flatMap((item) =>
      item.type === 'record' ? [item.hit] : [],
    )
    groups = [toGroup('recent', 'Đã mở gần đây', hits, { q: '', resultCount: hits.length })]
  } else if (searching && found.data) {
    const resultCount = found.data.groups.reduce((n, g) => n + g.hits.length, 0)
    const log = { q: settled.q, ...(kind ? { kinds: [kind] } : {}), resultCount }
    groups = found.data.groups.map((g) => {
      const facts = SEARCH_KIND_FACTS[g.kind]
      const group = toGroup(g.kind, facts.label, g.hits, log)
      if (g.more) {
        const href = `${facts.book}?q=${encodeURIComponent(settled.q)}`
        group.rows.push({
          id: `${g.kind}:all`,
          icon: ArrowRight,
          label: `Xem tất cả trong sổ ${facts.label}`,
          onClick: () => navigate(href),
        })
      }
      return group
    })
  }

  const pending = found.isFetching || current.q !== settled.q
  let status: string | undefined
  if (typed === '') status = undefined
  else if (current.q.length < MIN_CHARS) status = `Gõ ít nhất ${MIN_CHARS} ký tự để tìm bản ghi.`
  else if (pending) status = 'Đang tìm…'
  else if (found.isError) status = 'Không tìm được bản ghi. Thử lại sau.'
  else if (!groups.length) status = `Không có bản ghi nào khớp “${current.q}”.`

  return {
    scopes: SEARCH_KINDS.filter((k) => allowed[k]).map((k) => ({
      id: k,
      label: SEARCH_KIND_FACTS[k].label,
    })),
    scope,
    onScopeChange: (id) => {
      // A typed prefix outranks the chip, so the click has to remove it too.
      setText(current.q)
      setChip(id === null ? null : SearchKind.parse(id))
    },
    query: text,
    onQueryChange: setText,
    groups,
    status,
  }
}
