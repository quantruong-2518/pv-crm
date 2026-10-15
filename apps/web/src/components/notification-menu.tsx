import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Skeleton } from '@pv/ui'
import type { NotificationRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import {
  NOTIFICATIONS_PATH,
  NOTIFICATION_PAGE_SIZE,
  notificationListQuery,
  useMarkNotificationsRead,
} from '@/data/notifications'
import { NotificationLine } from './notification-line'

/** Body of the bell's dropdown — the reader's newest notifications.
 *
 *  `@pv/ui` owns the panel shell; this is only what goes in it. It reads the
 *  bell's own entry, the one the chrome keeps subscribed, so it opens already
 *  filled. The list sits on `.glass-b` (law 8); the first page only, because
 *  `/notifications` has the rest.
 *
 *  Focus goes to the heading on open and back to the bell on close, which the
 *  shell closes on Escape or a click outside. */

const SKELETON_DELAYS = [0, 80, 160]

const failed = (error: unknown, fallback: string) =>
  isApiError(error) ? userMessage(error) : fallback

export function NotificationMenu({
  close,
  unread,
}: {
  close: () => void
  /** `undefined` while the count is still loading. */
  unread: number | undefined
}) {
  const navigate = useNavigate()
  const list = useInfiniteQuery(notificationListQuery())
  const markRead = useMarkNotificationsRead()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const bell = heading.current
      ?.closest('[role="dialog"]')
      ?.parentElement?.querySelector<HTMLElement>(':scope > button')
    heading.current?.focus()
    /* After the click that closed it has moved focus: a click on another
       control keeps it, a click on nothing or Escape leaves it on `body`. */
    return () => {
      window.setTimeout(() => {
        const at = document.activeElement
        if (!at || at === document.body) bell?.focus()
      })
    }
  }, [])

  const press = (row: NotificationRow, path: string | null) => {
    if (!row.readAt) markRead.mutate({ ids: [row.id] })
    if (!path) return
    close()
    navigate(path)
  }

  const rows = list.data?.rows.slice(0, NOTIFICATION_PAGE_SIZE) ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-2">
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-foreground m-0 text-sm font-semibold leading-[1.5] outline-none"
        >
          Thông báo
        </h2>
        {unread ? (
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            disabled={markRead.isPending}
            onClick={() => markRead.mutate({ all: true })}
          >
            Đánh dấu đã đọc hết
          </Button>
        ) : null}
      </div>

      {list.isPending ? (
        <div className="glass-b flex flex-col gap-4 rounded-lg p-4" aria-busy="true">
          {SKELETON_DELAYS.map((delay) => (
            <Skeleton key={delay} delay={delay} />
          ))}
        </div>
      ) : list.error ? (
        <div className="glass-b flex flex-col items-start gap-3 rounded-lg p-4">
          <p className="text-foreground m-0 text-[12.5px] leading-[1.65]">
            {failed(list.error, 'Không tải được thông báo.')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            onClick={() => void list.refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="glass-b text-muted-foreground m-0 rounded-lg p-4 text-[12.5px] leading-[1.65]">
          Chưa có thông báo nào.
        </p>
      ) : (
        <ul className="glass-b m-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto rounded-lg p-1">
          {rows.map((row) => (
            <NotificationLine key={row.id} row={row} onPress={press} />
          ))}
        </ul>
      )}

      <Button
        variant="ghost"
        size="md"
        className="pointer-coarse:h-12 w-full shrink-0"
        onClick={() => {
          close()
          navigate(NOTIFICATIONS_PATH)
        }}
      >
        Xem tất cả thông báo
      </Button>
    </div>
  )
}
