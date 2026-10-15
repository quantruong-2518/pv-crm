import { Badge, ChevronRight, Icon, cn } from '@pv/ui'
import {
  NOTIFICATION_DETAIL_FAILED,
  NOTIFICATION_KIND_LABEL,
  type NotificationRow,
} from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { useNotificationPath } from '@/data/notifications'

/** One notification, as the `/notifications` screen draws it. The caller owns
 *  what a press does; the line only says whether there is a place to go.
 *
 *  Unread is said three ways so colour is never the only one: a text
 *  pill, heavier type, and brighter ink. Read rows use `--muted-foreground`
 *  at full opacity; dimming with `opacity` falls under law 13. */
export function NotificationLine({
  row,
  onPress,
}: {
  row: NotificationRow
  onPress: (row: NotificationRow, path: string | null) => void
}) {
  const path = useNotificationPath()(row)
  const unread = row.readAt === null
  /* The subject, then the one fact the sentence leaves out: how many, or why. */
  const extra = [
    row.subject.label,
    typeof row.detail?.count === 'number' && row.detail.count > 0
      ? `${row.detail.count.toLocaleString('vi-VN')} lead`
      : null,
    row.detail?.reason ? `Lý do: ${row.detail.reason}` : null,
    failedLetters(row) > 0
      ? `${failedLetters(row).toLocaleString('vi-VN')} thư không tới nơi`
      : null,
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
          <span className="text-muted-foreground tnum text-[12.5px] leading-[1.5]">{extra}</span>
        ) : null}
        <span className="text-muted-foreground tnum flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-[1.5]">
          {unread ? <Badge tone="running">Chưa đọc</Badge> : null}
          {row.actor ? <span>{row.actor.name}</span> : null}
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

/** A bulk run's closing line carries its failed-letter count (ADR 0093 §4). */
function failedLetters(row: NotificationRow): number {
  const n = row.detail?.[NOTIFICATION_DETAIL_FAILED]
  return typeof n === 'number' ? n : 0
}
