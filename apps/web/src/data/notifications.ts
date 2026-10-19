import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import {
  KpiPeriodKey,
  NOTIFICATION_SUBJECT_PERMISSION,
  type NotificationListQuery,
  type NotificationListResponse,
  type NotificationReadBody,
  type NotificationReadResponse,
  type NotificationRow,
  type NotificationStreamEvent,
  type NotificationSubject,
  type NotificationUnreadCount,
  type Permission,
} from '@pv/contracts'
import { api, isApiError, userMessage, type ApiError, type ApiNeed } from '@/app/api'
import { toast } from '@/app/toast'
import { bookQueryParams } from '@/app/book-query'
import { access, sessionIsLive, useSession } from '@/app/auth'
import { whileLive } from '@/app/query-client'
import { isParked } from '@/app/parked'
import { overdueReasonNo } from './notification-sentence'
import { holdNotificationStream, streamIsLive, subscribeStreamLive } from './notification-stream'
import { snapshotNotifications, toastNewNotifications } from './notification-toasts'

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
 *  Live, not polled: `useNotificationStream` holds the SSE stream; a signal
 *  re-reads the bell's first page and the count, and the full page only while
 *  it is on screen. Polling every minute is only the fallback while the stream
 *  is not live; window focus re-asks once the answer is stale. */
const NEED: ApiNeed = {}

const KEY = ['platform', 'notifications'] as const
/** The bell and `/notifications` keep apart: a deep scroll on the page must
 *  not become pages the bell re-reads on every signal. */
const BELL_KEY = [...KEY, 'bell'] as const
const PAGE_KEY = [...KEY, 'page'] as const
const COUNT_KEY = [...KEY, 'unread-count'] as const

const POLL_MS = 60_000

const fallbackPoll = () => (streamIsLive() ? false : POLL_MS)

const FRESH = {
  staleTime: POLL_MS,
  refetchInterval: whileLive(fallbackPoll),
} as const

export const NOTIFICATION_PAGE_SIZE = 20

/** Called by `useAppChrome`, so one stream serves every screen. Returns
 *  whether it is live, which re-renders the chrome so the queries re-read
 *  their polling rule. */
export function useNotificationStream(): boolean {
  const client = useQueryClient()
  const userId = useSession((s) => (s.status === 'signed-in' ? s.actor?.id : undefined))
  const navigate = useNavigate()
  const { mutate: markRead } = useMarkNotificationsRead()

  useEffect(() => {
    if (!userId) return undefined
    /* "Xem" on a toast does what a press on the bell row does. */
    const open = (row: NotificationRow) => {
      const path = notificationPath(row, mayOpen(useSession.getState().actor))
      if (!path) return null
      return () => {
        if (!row.readAt) markRead({ ids: [row.id] })
        navigate(path)
      }
    }
    return holdNotificationStream(userId, (event) => onStreamSignal(client, userId, event, open))
  }, [client, userId, navigate, markRead])

  return useSyncExternalStore(subscribeStreamLive, streamIsLive)
}

/** One signal at a time, so a `changed` never diffs before the `ready`
 *  snapshot it depends on has landed. */
let signals: Promise<void> = Promise.resolve()

function onStreamSignal(
  client: QueryClient,
  userId: string,
  event: NotificationStreamEvent,
  open: (row: NotificationRow) => (() => void) | null,
) {
  void client.invalidateQueries({ queryKey: PAGE_KEY, refetchType: 'active' })
  signals = signals
    .then(async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: BELL_KEY }),
        client.invalidateQueries({ queryKey: COUNT_KEY }),
      ])
      /* A failed read would diff stale rows: a `ready` then drops the snapshot,
         a `changed` waits for the next signal. */
      const ok = client.getQueryState(BELL_KEY)?.status === 'success'
      const page = client.getQueryData<InfiniteData<NotificationListResponse>>(BELL_KEY)?.pages[0]
      const rows = ok ? page?.rows : undefined
      if (event === 'ready') snapshotNotifications(userId, rows ?? null)
      else if (rows) toastNewNotifications(userId, rows, streamIsLive(), open)
    })
    .catch(() => undefined)
}

export const unreadNotificationsQuery = () =>
  queryOptions({
    queryKey: COUNT_KEY,
    queryFn: ({ signal }) =>
      api.read<NotificationUnreadCount>('/notifications/unread-count', { need: NEED, signal }),
    select: (d: NotificationUnreadCount) => d.count,
    ...FRESH,
  })

type ListFilter = Pick<NotificationListQuery, 'unread' | 'group' | 'q'>

const readPage = (filter: ListFilter, page: number, signal: AbortSignal) =>
  api.read<NotificationListResponse>(
    `/notifications?${bookQueryParams({ ...filter, page, size: NOTIFICATION_PAGE_SIZE })}`,
    { need: NEED, signal },
  )

/** A row that arrives between two page reads shifts the next page by one, so
 *  the same id can come back twice; keep the first. `total` is the last
 *  page's, the freshest read. */
const flatten = (
  data: InfiniteData<NotificationListResponse>,
): { rows: NotificationRow[]; total: number } => {
  const seen = new Set<string>()
  return {
    rows: data.pages
      .flatMap((page) => page.rows)
      .filter((row) => !seen.has(row.id) && seen.add(row.id)),
    total: data.pages[data.pages.length - 1]?.total ?? 0,
  }
}

/** The bell's dropdown: the unfiltered first page and never a second, so a
 *  signal costs one read. Infinite only to share its shape with the page. */
export const notificationListQuery = () =>
  infiniteQueryOptions({
    queryKey: BELL_KEY,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => readPage({}, pageParam, signal),
    getNextPageParam: () => undefined,
    select: flatten,
    ...FRESH,
  })

/** `/notifications`. The filter is part of the key, so each filter reads its
 *  own entry; a stream signal, or the mutation while the stream is down,
 *  invalidates every one.
 *
 *  Polling and focus re-reads stop once a second page is loaded: a deep
 *  scroll would otherwise re-read N pages a minute. A stream signal still
 *  re-reads it while it is on screen. */
export const notificationPageQuery = (filter: ListFilter) =>
  infiniteQueryOptions({
    queryKey: [...PAGE_KEY, filter] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => readPage(filter, pageParam, signal),
    /* An empty page ends the list whatever `total` says, as in `workstreams.ts`. */
    getNextPageParam: (last, pages, lastParam) => {
      if (last.rows.length === 0) return undefined
      const got = pages.reduce((n, page) => n + page.rows.length, 0)
      return got < last.total ? lastParam + 1 : undefined
    },
    select: flatten,
    placeholderData: keepPreviousData,
    staleTime: POLL_MS,
    refetchInterval: whileLive((q: { state: { data?: InfiniteData<NotificationListResponse> } }) =>
      (q.state.data?.pages.length ?? 0) > 1 ? false : fallbackPoll(),
    ),
    refetchOnWindowFocus: (q) => sessionIsLive() && (q.state.data?.pages.length ?? 0) <= 1,
  })

/** One row or everything. Invalidation and the failure toast sit on the hook,
 *  not on the call: a row press navigates away, and per-call callbacks die
 *  with the screen. A live stream announces the read itself (the `read_at`
 *  trigger), so re-reading here too would fetch everything twice. */
export function useMarkNotificationsRead() {
  const client = useQueryClient()

  return useMutation<NotificationReadResponse, ApiError, NotificationReadBody>({
    mutationFn: (body) =>
      api.write<NotificationReadResponse>('/notifications/read', {
        method: 'POST',
        body,
        need: NEED,
      }),
    onSuccess: () => (streamIsLive() ? undefined : client.invalidateQueries({ queryKey: KEY })),
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
  contract: (code) => `/sales/contracts/${encodeURIComponent(code)}`,
  campaign: (code) => `/sales/campaigns/${encodeURIComponent(code)}`,
  /* Two code shapes: `<period>:<role>` from a role target's proposal or
     agreement, a bare `<period>` from a person's own line (ADR 0098 §3). */
  'kpi-target': (code) => {
    const [month = '', role] = code.split(':')
    const q = `?month=${encodeURIComponent(month)}`
    return role
      ? `/sales/kpi/targets${q}&role=${encodeURIComponent(role)}`
      : `/sales/kpi/receive${q}`
  },
  comm: (code) => `/comms/${encodeURIComponent(code)}`,
  /* The leads book has no batch filter in its address yet; a batch lands on the book. */
  'lead-batch': () => '/sales/leads',
  'opportunity-batch': () => '/sales/opportunities',
  'comm-record': (code) => `/comms/${encodeURIComponent(code)}`,
  'kpi-scorecard': (code) => `/sales/kpi/me?month=${encodeURIComponent(code)}`,
  'kpi-allocation': (code) => `/sales/kpi/proposals?month=${encodeURIComponent(code)}`,
  'kpi-team': (code) => `/sales/kpi/team/${encodeURIComponent(code)}`,
}

/** An overdue-installment row, read back. `detail` keys are named by the
 *  sweeper that writes them (`installmentNo` · `amountVnd` · `due`); `null`
 *  when the row is another kind or carries no installment number, so no path
 *  ends in `/undefined`. */
export type OverdueInstallment = {
  id: string
  code: string
  /** The company only — the contract code already sits in the caller's title,
   *  so the raw `"<code> · <company>"` label would say the code twice. */
  company: string | null
  no: number
  amount: number | null
  due: string | null
  path: string
}

export function overdueInstallment(row: NotificationRow): OverdueInstallment | null {
  if (row.kind !== 'contract-installment-overdue' || row.subject.kind !== 'contract') return null
  const { installmentNo, amountVnd, due } = row.detail ?? {}
  const n = Number(installmentNo)
  if (!Number.isInteger(n) || n < 1) return null
  const { code, label } = row.subject
  const company = label?.startsWith(`${code} · `) ? label.slice(code.length + 3) : (label ?? null)
  return {
    id: row.id,
    code,
    company,
    no: n,
    amount: typeof amountVnd === 'number' ? amountVnd : null,
    due: typeof due === 'string' ? due : null,
    path: `${SUBJECT_PATH.contract(code)}/installments/${n}`,
  }
}

/** `null` = nowhere to go, the row only marks itself read. A decided request
 *  has left the inbox, so its outcome is read on the requester's own list. A
 *  target the reader may not open has no link: the press would land on a
 *  locked screen. */
export const notificationPath = (
  row: NotificationRow,
  may: (permission: Permission) => boolean,
): string | null => {
  /* The record just left the reader; for some it is no longer theirs to open. */
  if (row.kind === 'lead-removed' || row.kind === 'opportunity-unassigned') return null
  const need = NOTIFICATION_SUBJECT_PERMISSION[row.subject.kind]
  if (need && !may(need)) return null
  const installment = overdueInstallment(row)
  if (installment) return installment.path
  const reasonNo = overdueReasonNo(row)
  if (reasonNo) return `${SUBJECT_PATH.contract(row.subject.code)}/installments/${reasonNo}`
  if (row.subject.kind === 'kpi-team') {
    const month = KpiPeriodKey.safeParse(row.detail?.period)
    const path = SUBJECT_PATH['kpi-team'](row.subject.code)
    return month.success ? `${path}?month=${month.data}` : path
  }
  if (row.subject.kind === 'approval' && row.kind !== 'approval-waiting')
    return `${ACCOUNT}#requests`
  /* The book opens on its `active` tab, which hides both batches' leads. */
  if (row.subject.kind === 'lead-batch' && row.kind === 'lead-nurtured')
    return '/sales/leads?state=nurturing'
  if (row.subject.kind === 'lead-batch' && row.kind === 'lead-received')
    return '/sales/leads?state=all'
  return SUBJECT_PATH[row.subject.kind](row.subject.code)
}

/** The same question the route gate asks: every gated target is a Sales door
 *  (`routes.tsx`), and a parked module is shut whatever the role holds. */
const mayOpen =
  (actor: Parameters<typeof access.check>[0]) =>
  (permission: Permission): boolean =>
    !isParked(permission) && access.check(actor, { branch: 'Sales', permission }).ok

/** Where a row press goes for the signed-in reader. */
export function useNotificationPath(): (row: NotificationRow) => string | null {
  const actor = useSession((s) => s.actor)
  return (row) => notificationPath(row, mayOpen(actor))
}
