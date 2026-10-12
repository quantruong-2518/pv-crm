import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, Button, Drawer, EmptyState, Skeleton } from '@pv/ui'
import type { NotificationRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import {
  NOTIFICATIONS_PATH,
  notificationListQuery,
  useMarkNotificationsRead,
} from '@/data/notifications'
import { NotificationLine } from './notification-line'

/** The bell's panel — the reader's own notifications, newest first.
 *
 *  A `Drawer`, not a popover hung under the bell: `@pv/ui` exports no popover,
 *  and the drawer already owns the scrim, focus return and Escape. It is a
 *  glass surface over the shell, never a second background (law 12), and the
 *  list inside sits on `.glass-b` (law 8). Not a screen, so no ContextRail.
 *  The full list, with filters, is `/notifications`. */

const SKELETON_DELAYS = [0, 80, 160]

const failed = (error: unknown, fallback: string) =>
  isApiError(error) ? userMessage(error) : fallback

export function NotificationPanel({
  open,
  onClose,
  unread,
}: {
  open: boolean
  onClose: () => void
  /** `undefined` while the count is still loading: say nothing rather than "0". */
  unread: number | undefined
}) {
  const navigate = useNavigate()

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Thông báo"
      subtitle={
        unread === undefined
          ? undefined
          : unread > 0
            ? `${unread} thông báo chưa đọc`
            : 'Bạn đã đọc hết thông báo'
      }
      footer={
        <Button
          variant="ghost"
          size="md"
          className="pointer-coarse:h-12 w-full"
          onClick={() => {
            onClose()
            navigate(NOTIFICATIONS_PATH)
          }}
        >
          Xem tất cả
        </Button>
      }
    >
      {/* Mounted only while the drawer is open, so the list is not read before. */}
      <NotificationList onClose={onClose} anyUnread={unread !== 0} />
    </Drawer>
  )
}

function NotificationList({ onClose, anyUnread }: { onClose: () => void; anyUnread: boolean }) {
  const navigate = useNavigate()
  const list = useInfiniteQuery(notificationListQuery())
  const markRead = useMarkNotificationsRead()

  if (list.isPending) {
    return (
      <div className="glass-b flex flex-col gap-4 rounded-lg p-4" aria-busy="true">
        {SKELETON_DELAYS.map((delay) => (
          <Skeleton key={delay} delay={delay} />
        ))}
      </div>
    )
  }

  if (list.error) {
    return (
      <div className="glass-b flex flex-col items-start gap-3 rounded-lg p-4">
        <p className="text-foreground m-0 text-[12.5px] leading-[1.65]">
          {failed(list.error, 'Không tải được danh sách thông báo. Thử lại.')}
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
    )
  }

  const rows = list.data.rows
  if (rows.length === 0) {
    return (
      <EmptyState
        className="glass-b rounded-lg p-6"
        icon={Bell}
        message="Chưa có thông báo nào."
        action={{ label: 'Đóng', onClick: onClose }}
      />
    )
  }

  const press = (row: NotificationRow, path: string | null) => {
    if (!row.readAt) markRead.mutate({ ids: [row.id] })
    if (!path) return
    /* Close first: lead A to lead B keeps this screen mounted, and the panel
       would otherwise stay open over the record just opened. */
    onClose()
    navigate(path)
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="ghost"
        size="sm"
        className="pointer-coarse:h-12 self-end"
        /* The count can be a minute older than this list, so the rows vote too. */
        disabled={!(anyUnread || rows.some((r) => r.readAt === null)) || markRead.isPending}
        onClick={() => markRead.mutate({ all: true })}
      >
        Đánh dấu đã đọc hết
      </Button>

      <ul className="glass-b m-0 flex list-none flex-col gap-1 rounded-lg p-1">
        {rows.map((row) => (
          <NotificationLine key={row.id} row={row} onPress={press} />
        ))}
      </ul>

      {list.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-12 self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Xem thêm
        </Button>
      ) : null}
    </div>
  )
}
