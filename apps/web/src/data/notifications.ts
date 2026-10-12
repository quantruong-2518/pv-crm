import { useEffect, useSyncExternalStore } from 'react'
import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  NotificationListQuery,
  NotificationListResponse,
  NotificationReadBody,
  NotificationReadResponse,
  NotificationRow,
  NotificationSubject,
  NotificationUnreadCount,
} from '@pv/contracts'
import { api, isApiError, userMessage, type ApiError, type ApiNeed } from '@/app/api'
import { toast } from '@/app/toast'
import { bookQueryParams } from '@/app/book-query'
import { useSession } from '@/app/auth'
import { holdNotificationStream, streamIsLive, subscribeStreamLive } from './notification-stream'

/** The in-app bell — the caller's own rows, nothing wider.
 *
 *      GET  /notifications?page&size     newest first; `unread`, `group`, `q` narrow it
 *      GET  /notifications/unread-count  the number on the bell
 *      POST /notifications/read          `{ ids }` or `{ all: true }`
 *
 *  No `load:`: every door is real, there is no fixture behind this file. The
 *  need is empty (a live session) because the server scopes all three to the
 *  caller, the same posture as `GET /approvals/pending`.
 *
 *  Live, not polled: `useNotificationStream` holds the SSE stream and every
 *  signal invalidates `KEY`. Polling every minute is only the fallback while
 *  the stream is not live; window focus always re-asks. Neither inherits the
 *  app-wide `staleTime: Infinity`. */
const NEED: ApiNeed = {}

const KEY = ['platform', 'notifications'] as const

const POLL_MS = 60_000

const fallbackPoll = () => (streamIsLive() ? false : POLL_MS)

const FRESH = {
  staleTime: 60_000,
  refetchInterval: fallbackPoll,
  refetchOnWindowFocus: true,
} as const

export const NOTIFICATION_PAGE_SIZE = 20

/** Called by `useAppChrome`, so one stream serves every screen. Returns
 *  whether it is live, which re-renders the chrome so the queries re-read
 *  their polling rule. */
export function useNotificationStream(): boolean {
  const client = useQueryClient()
  const userId = useSession((s) => (s.status === 'signed-in' ? s.actor?.id : undefined))

  useEffect(
    () =>
      userId
        ? holdNotificationStream(userId, () => void client.invalidateQueries({ queryKey: KEY }))
        : undefined,
    [client, userId],
  )

  return useSyncExternalStore(subscribeStreamLive, streamIsLive)
}

export const unreadNotificationsQuery = () =>
  queryOptions({
    queryKey: [...KEY, 'unread-count'] as const,
    queryFn: ({ signal }) =>
      api.read<NotificationUnreadCount>('/notifications/unread-count', { need: NEED, signal }),
    select: (d: NotificationUnreadCount) => d.count,
    ...FRESH,
  })

/** The filter is part of the key, so each filter reads its own entry; the
 *  mutation's prefix invalidation on `KEY` reaches every one.
 *
 *  Polling stops once a second page is loaded: a deep scroll would otherwise
 *  re-read N pages a minute for rows nobody is looking at. */
export const notificationListQuery = (
  filter: Pick<NotificationListQuery, 'unread' | 'group' | 'q'> = {},
) =>
  infiniteQueryOptions({
    queryKey: [...KEY, 'list', filter] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api.read<NotificationListResponse>(
        `/notifications?${bookQueryParams({ ...filter, page: pageParam, size: NOTIFICATION_PAGE_SIZE })}`,
        { need: NEED, signal },
      ),
    /* An empty page ends the list whatever `total` says, as in `workstreams.ts`. */
    getNextPageParam: (last, pages, lastParam) => {
      if (last.rows.length === 0) return undefined
      const got = pages.reduce((n, page) => n + page.rows.length, 0)
      return got < last.total ? lastParam + 1 : undefined
    },
    /* A row that arrives between two page reads shifts the next page by one,
       so the same id can come back twice; keep the first. `total` is the last
       page's, the freshest read. */
    select: (data): { rows: NotificationRow[]; total: number } => {
      const seen = new Set<string>()
      return {
        rows: data.pages
          .flatMap((page) => page.rows)
          .filter((row) => !seen.has(row.id) && seen.add(row.id)),
        total: data.pages[data.pages.length - 1]?.total ?? 0,
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: (q) => ((q.state.data?.pages.length ?? 0) > 1 ? false : fallbackPoll()),
    refetchOnWindowFocus: (q) => (q.state.data?.pages.length ?? 0) <= 1,
  })

/** One row or everything. Invalidation and the failure toast sit on the hook,
 *  not on the call: a row press navigates away, and per-call callbacks die
 *  with the screen. */
export function useMarkNotificationsRead() {
  const client = useQueryClient()

  return useMutation<NotificationReadResponse, ApiError, NotificationReadBody>({
    mutationFn: (body) =>
      api.write<NotificationReadResponse>('/notifications/read', {
        method: 'POST',
        body,
        need: NEED,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
    onError: (error) =>
      toast(isApiError(error) ? userMessage(error) : 'Chưa đánh dấu được. Vui lòng thử lại.', {
        tone: 'danger',
      }),
  })
}

/** Kept as literals: `app/chrome.tsx` imports this file, so reading its path
 *  constants back would be an import cycle. */
export const NOTIFICATIONS_PATH = '/notifications'
const ACCOUNT = '/account'
const RUN_BOOK = '/sales/campaigns/mail-runs'

/** Where a press on a row goes, by what the row points at. Things about the
 *  reader land on "my account", at the block that shows them. `approval` is
 *  the inbox, which has no per-request address. */
const SUBJECT_PATH: Record<NotificationSubject, (code: string) => string> = {
  lead: (code) => `/sales/leads/${encodeURIComponent(code)}`,
  'lead-pool': () => '/sales/leads',
  opportunity: (code) => `/sales/opportunities/${encodeURIComponent(code)}`,
  'lead-scan': (code) => `/sales/leads/scan/${encodeURIComponent(code)}`,
  approval: () => '/approvals',
  'mail-run': (code) => `${RUN_BOOK}?run=${encodeURIComponent(code)}`,
  user: () => ACCOUNT,
  'google-link': () => `${ACCOUNT}#google`,
}

/** `null` = nowhere to go, the row only marks itself read. A decided request
 *  has left the inbox, so its outcome is read on the requester's own list. The
 *  run book is the one target behind a permission: without it the press would
 *  land on a locked screen. */
export const notificationPath = (row: NotificationRow, canOpenRuns: boolean): string | null => {
  /* The record just left the reader; for some it is no longer theirs to open. */
  if (row.kind === 'lead-removed' || row.kind === 'opportunity-unassigned') return null
  if (row.subject.kind === 'mail-run' && !canOpenRuns) return null
  if (row.subject.kind === 'approval' && row.kind !== 'approval-waiting')
    return `${ACCOUNT}#requests`
  return SUBJECT_PATH[row.subject.kind](row.subject.code)
}
