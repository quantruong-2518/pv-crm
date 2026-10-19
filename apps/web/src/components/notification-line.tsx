import { Badge, ChevronRight, Icon, cn, vnd } from '@pv/ui'
import {
  NOTIFICATION_DETAIL_CONTRACT,
  NOTIFICATION_DETAIL_COUNT,
  NOTIFICATION_DETAIL_DEALS,
  NOTIFICATION_DETAIL_FAILED,
  NOTIFICATION_DETAIL_NO,
  NOTIFICATION_DETAIL_STAGE,
  NOTIFICATION_KIND_LABEL,
  type NotificationRow,
  type NotificationSubject,
} from '@pv/contracts'
import { dm, dmhm } from '@/lib/date'
import { overdueInstallment, useNotificationPath } from '@/data/notifications'
import { sentenceOf } from '@/data/notification-sentence'

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
  const installment = overdueInstallment(row)
  const sentence = sentenceOf(row)
  /* An overdue installment adds which one, how much and since when. A built
     sentence already says the name and the counts. */
  const extra = sentence
    ? ''
    : [
        row.subject.label,
        ...detailFragments(row),
        installment ? `Đợt ${installment.no}` : null,
        typeof installment?.amount === 'number' ? vnd(installment.amount) : null,
        installment?.due ? `hạn ${dm(installment.due)}` : null,
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
          {sentence ?? NOTIFICATION_KIND_LABEL[row.kind]}
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

/** What a counted row counts; a subject with no entry has no honest unit. */
const COUNT_UNIT: Partial<Record<NotificationSubject, string>> = {
  lead: 'lead',
  'lead-pool': 'lead',
  'lead-batch': 'lead',
  opportunity: 'cơ hội',
  'opportunity-batch': 'cơ hội',
}

const num = (n: number) => n.toLocaleString('vi-VN')

/** The facts the sentence leaves out, one short fragment each: how many, why,
 *  how many deals went along, the stage, the contract, the instalment. */
function detailFragments({ subject, detail }: NotificationRow): (string | null)[] {
  const count = detail?.[NOTIFICATION_DETAIL_COUNT]
  const deals = detail?.[NOTIFICATION_DETAIL_DEALS]
  const failed = detail?.[NOTIFICATION_DETAIL_FAILED]
  const stage = detail?.[NOTIFICATION_DETAIL_STAGE]
  const contract = detail?.[NOTIFICATION_DETAIL_CONTRACT]
  const no = detail?.[NOTIFICATION_DETAIL_NO]
  const unit = COUNT_UNIT[subject.kind]
  return [
    typeof count === 'number' && count > 0 && unit ? `${num(count)} ${unit}` : null,
    typeof deals === 'number' && deals > 0 ? `kèm ${num(deals)} cơ hội` : null,
    stage ? String(stage) : null,
    contract ? String(contract) : null,
    no !== undefined && no !== '' ? `đợt ${no}` : null,
    detail?.reason ? `Lý do: ${detail.reason}` : null,
    typeof failed === 'number' && failed > 0 ? `${num(failed)} thư không tới nơi` : null,
  ]
}
