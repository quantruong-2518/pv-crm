import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Bell, Button, ChevronRight, Drawer, EmptyState, Icon, Skeleton, cn } from '@pv/ui'
import { NOTIFICATION_KIND_LABEL, type NotificationRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAccess } from '@/app/auth'
import { dmhm } from '@/lib/date'
import {
  notificationListQuery,
  notificationPath,
  useMarkNotificationsRead,
} from '@/data/notifications'

/** The bell's panel — the reader's own notifications, newest first.
 *
 *  A `Drawer`, not a popover hung under the bell: `@pv/ui` exports no popover,
 *  and the drawer already owns the scrim, focus return and Escape. It is a
 *  glass surface over the shell, never a second background (law 12), and the
 *  list inside sits on `.glass-b` (law 8). Not a screen, so no ContextRail.
 *
 *  Unread is said three ways so colour is never the only one: a text
 *  pill, heavier type, and brighter ink. Read rows use `--muted-foreground`
 *  at full opacity; dimming with `opacity` falls under law 13. */

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
          {failed(list.error, 'Không tải được thông báo. Vui lòng thử lại.')}
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

  const rows = list.data
  if (rows.length === 0) {
    return (
      <EmptyState
        className="glass-b rounded-lg p-6"
        icon={Bell}
        message="Chưa có thông báo nào. Khi có việc liên quan đến bạn, thông báo sẽ hiện ở đây."
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

function NotificationLine({
  row,
  onPress,
}: {
  row: NotificationRow
  onPress: (row: NotificationRow, path: string | null) => void
}) {
  /* The run book's own door (`routes.tsx`); every other target is session-only. */
  const canOpenRuns = useAccess({ branch: 'Sales', permission: 'campaign.view' }).ok
  const path = notificationPath(row, canOpenRuns)
  const unread = row.readAt === null
  /* The subject, then the one fact the sentence leaves out: how many, or why. */
  const extra = [
    row.subject.label,
    typeof row.detail?.count === 'number'
      ? `${row.detail.count.toLocaleString('vi-VN')} lead`
      : null,
    row.detail?.reason ? `Lý do: ${row.detail.reason}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            'text-[12.5px] leading-[1.5]',
            unread ? 'text-foreground font-semibold' : 'text-muted-foreground',
          )}
        >
          {NOTIFICATION_KIND_LABEL[row.kind]}
        </span>
        {extra ? (
          <span className="text-muted-foreground text-[12.5px] leading-[1.5]">{extra}</span>
        ) : null}
        <span className="text-muted-foreground tnum flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-[1.5]">
          {unread ? <Badge tone="running">Chưa đọc</Badge> : null}
          {row.actor ? <span>Người thực hiện: {row.actor.name}</span> : null}
          <time dateTime={row.createdAt}>{dmhm(row.createdAt)}</time>
        </span>
      </span>
      {path ? (
        <Icon icon={ChevronRight} size={16} className="text-muted-foreground shrink-0" />
      ) : null}
    </>
  )
  const frame = 'pointer-coarse:min-h-12 flex w-full items-center gap-3 rounded-md p-3 text-left'

  /* Nothing to open and nothing left to mark: a button here would press into
     nothing, so the row is plain text. */
  if (!path && !unread) return <li className={frame}>{body}</li>

  return (
    <li>
      <button
        type="button"
        onClick={() => onPress(row, path)}
        className={cn(frame, 'motion-std hover:bg-surface-ink/10')}
      >
        {body}
      </button>
    </li>
  )
}
