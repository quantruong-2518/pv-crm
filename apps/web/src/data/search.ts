import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SEARCH_KINDS,
  SEARCH_MIN_CHARS,
  SearchKind,
  SearchRecentResult,
  SearchResult,
  type SearchHit,
  type SearchRecentWrite,
} from '@pv/contracts'
import { ArrowRight, type SearchGroup, type SearchRecords } from '@pv/ui'
import { api, type ApiNeed } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { hitPath, hitRow, pickedKind, SEARCH_KIND_FACTS, splitPrefix } from './search-rows'
import { searchableText } from '@/lib/search-box'

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

/* A record just disabled or reassigned must not linger in results for long,
   so they expire after a minute. */
export const searchQuery = (q: string, kind: SearchKind | null) =>
  queryOptions({
    queryKey: ['sales', 'search', q, kind ?? ''] as const,
    queryFn: ({ signal }) =>
      api.read<SearchResult>(
        `${SEARCH_PATH}?q=${encodeURIComponent(q)}${kind ? `&kinds=${kind}` : ''}`,
        { need: SEARCH_NEED, schema: SearchResult, signal },
      ),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
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
  const { t, lang } = useI18n()
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
  const searching = allowed.lead && searchableText(settled.q) !== undefined

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
      ...hitRow(hit, (picked) => open(picked, log), lang),
      id: `${id}:${i}`,
    })),
  })

  let groups: SearchGroup[] = []
  if (typed === '') {
    const hits = (recent.data?.items ?? []).flatMap((item) =>
      item.type === 'record' ? [item.hit] : [],
    )
    groups = [
      toGroup('recent', t(message('Đã mở gần đây', 'Recently opened', '최근 연 항목')), hits, {
        q: '',
        resultCount: hits.length,
      }),
    ]
  } else if (searching && found.data) {
    const resultCount = found.data.groups.reduce((n, g) => n + g.hits.length, 0)
    const log = { q: settled.q, ...(kind ? { kinds: [kind] } : {}), resultCount }
    groups = found.data.groups.map((g) => {
      const facts = SEARCH_KIND_FACTS[g.kind]
      const group = toGroup(g.kind, t(facts.label), g.hits, log)
      if (g.more) {
        const href = `${facts.book}?q=${encodeURIComponent(settled.q)}`
        group.rows.push({
          id: `${g.kind}:all`,
          icon: ArrowRight,
          label: t(
            message(
              `Xem tất cả trong sổ ${facts.label.vi}`,
              `View all in ${facts.label.en}`,
              `${facts.label.ko} 전체 보기`,
            ),
          ),
          onClick: () => navigate(href),
        })
      }
      return group
    })
  }

  const pending = found.isFetching || current.q !== settled.q
  let status: string | undefined
  if (typed === '') status = undefined
  else if (searchableText(current.q) === undefined)
    status = t(
      message(
        `Gõ ít nhất ${SEARCH_MIN_CHARS} ký tự để tìm bản ghi.`,
        `Type at least ${SEARCH_MIN_CHARS} characters to search records.`,
        `기록을 검색하려면 ${SEARCH_MIN_CHARS}자 이상 입력하세요.`,
      ),
    )
  else if (pending) status = t(message('Đang tìm…', 'Searching…', '검색 중…'))
  else if (found.isError) {
    status = t(
      message(
        'Không tìm được bản ghi. Thử lại sau.',
        'Could not search records. Try again later.',
        '기록을 검색하지 못했습니다. 나중에 다시 시도해 주세요.',
      ),
    )
  } else if (!groups.length) {
    status = t(
      message(
        `Không có bản ghi nào khớp “${current.q}”.`,
        `No records match “${current.q}”.`,
        `“${current.q}”와 일치하는 기록이 없습니다.`,
      ),
    )
  }

  return {
    scopes: SEARCH_KINDS.filter((k) => allowed[k]).map((k) => ({
      id: k,
      label: t(SEARCH_KIND_FACTS[k].label),
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
