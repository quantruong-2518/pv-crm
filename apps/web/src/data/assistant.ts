import { matchPath } from 'react-router-dom'
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AssistantAvailability,
  AssistantReportResponse,
  AssistantSessionDetail,
  AssistantSessionList,
  type AssistantRecordKind,
  type AssistantRef,
  type AssistantReportBody,
  type AssistantSessionPatchBody,
  type AssistantSubject,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { SEARCH_KIND_FACTS } from './search-rows'

/** One Core · CRM assistant reads and writes (ADR 0133). Live only: no `load:`.
 *
 *      GET    /assistant/availability          `assistant.use`
 *      GET    /assistant/sessions · /:id       `assistant.use`
 *      PATCH|DELETE /assistant/sessions/:id    `assistant.use`
 *      POST   /assistant/turns/:id/stop        `assistant.use`
 *      POST   /assistant/messages/:id/report   `assistant.use`
 *      GET    /assistant/reports               `assistant.review`
 *
 *  The turn itself streams; it lives in `./assistant-stream`. */

/** The Sales licence too, as on the API: the assistant reads Sales books. */
export const USE_NEED: ApiNeed = { branch: 'Sales', permission: 'assistant.use' }
const REVIEW_NEED: ApiNeed = { permission: 'assistant.review' }

const KEY = ['platform', 'assistant'] as const
export const AVAILABILITY_KEY = [...KEY, 'availability'] as const
export const SESSIONS_KEY = [...KEY, 'sessions'] as const

export const availabilityQuery = queryOptions({
  queryKey: AVAILABILITY_KEY,
  queryFn: ({ signal }) =>
    api.read('/assistant/availability', { need: USE_NEED, schema: AssistantAvailability, signal }),
  ...cacheTier.reference,
})

/** Keyset pages, already in order (pinned, then last opened); `nextBefore` goes back as it came. */
export const sessionsQuery = infiniteQueryOptions({
  queryKey: SESSIONS_KEY,
  initialPageParam: null as string | null,
  queryFn: ({ pageParam, signal }) =>
    api.read(`/assistant/sessions${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`, {
      need: USE_NEED,
      schema: AssistantSessionList,
      signal,
    }),
  getNextPageParam: (page) => page.nextBefore,
})

/** `poll` re-asks every 3 s while the server still holds a running answer this tab is not streaming. */
export const sessionQuery = (id: string, poll = false) =>
  queryOptions({
    queryKey: [...SESSIONS_KEY, id] as const,
    queryFn: ({ signal }) =>
      api.read(`/assistant/sessions/${id}`, {
        need: USE_NEED,
        schema: AssistantSessionDetail,
        signal,
      }),
    refetchInterval: (query) =>
      poll && query.state.data?.messages.some((msg) => msg.state === 'running') ? 3_000 : false,
  })

export const reportsQuery = (page: number, size: number) =>
  queryOptions({
    queryKey: [...KEY, 'reports', page, size] as const,
    queryFn: ({ signal }) =>
      api.read(`/assistant/reports?page=${page}&size=${size}`, {
        need: REVIEW_NEED,
        schema: AssistantReportResponse,
        signal,
      }),
  })

export function usePatchSession() {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, { id: string; body: AssistantSessionPatchBody }>({
    mutationFn: ({ id, body }) =>
      api.write(`/assistant/sessions/${id}`, { method: 'PATCH', body, need: USE_NEED }),
    onSuccess: () => void client.invalidateQueries({ queryKey: SESSIONS_KEY }),
  })
}

export function useDeleteSession() {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) =>
      api.write(`/assistant/sessions/${id}`, { method: 'DELETE', need: USE_NEED }),
    onSuccess: () => void client.invalidateQueries({ queryKey: SESSIONS_KEY }),
  })
}

export function useReportMessage() {
  return useMutation<unknown, ApiError, { id: string; body: AssistantReportBody }>({
    mutationFn: ({ id, body }) =>
      api.write(`/assistant/messages/${id}/report`, { body, need: USE_NEED }),
  })
}

/** Takes the turn id: the `session` event names it, and so does a saved running row. */
export function useStopTurn() {
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => api.write(`/assistant/turns/${id}/stop`, { need: USE_NEED }),
  })
}

/** A record's profile route, from the same table the header search opens hits with. */
export const refPath = (ref: Pick<AssistantRef, 'kind' | 'code'>) =>
  `${SEARCH_KIND_FACTS[ref.kind].detail}/${encodeURIComponent(ref.code)}`

/** The browser keeps the path percent-encoded; a contract code is not ASCII. */
function decoded(segment: string | undefined) {
  if (!segment) return undefined
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Static segments that share a profile's path shape and are not records. */
const NOT_A_CODE = new Set(['new', 'scan'])
const PROFILE_KINDS: AssistantRecordKind[] = ['lead', 'opportunity', 'contract']

/** The record a profile route shows, so "this customer" means the one on screen. */
export function subjectOf(pathname: string): AssistantSubject | undefined {
  for (const kind of PROFILE_KINDS) {
    const hit = matchPath({ path: `${SEARCH_KIND_FACTS[kind].detail}/:code`, end: false }, pathname)
    const code = decoded(hit?.params.code)
    if (code && !NOT_A_CODE.has(code)) return { kind, code }
  }
  return undefined
}
