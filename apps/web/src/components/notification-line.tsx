import { Badge, Chip, Icon, cn, vnd } from '@pv/ui'
import {
  NOTIFICATION_DETAIL_CONTRACT,
  NOTIFICATION_DETAIL_COUNT,
  NOTIFICATION_DETAIL_DEALS,
  NOTIFICATION_DETAIL_FAILED,
  NOTIFICATION_DETAIL_NO,
  NOTIFICATION_DETAIL_STAGE,
  NOTIFICATION_GROUP_LABEL,
  NOTIFICATION_KIND_GROUP,
  NOTIFICATION_KIND_LABEL,
  type NotificationRow,
  type NotificationSubject,
} from '@pv/contracts'
import { dm, hm } from '@/lib/date'
import { overdueInstallment } from '@/data/notifications'
import { sentenceOf } from '@/data/notification-sentence'
import { GROUP_ICON, GROUP_TONE, TONE_INK, type Tone } from './notification-group'

/** Kinds that say something went wrong or is late, whatever their group. */
const TROUBLE = /overdue|failed|broken|late|about-to-miss/

/** Only these subjects carry a code a person reads (`OP-5020`); the rest carry
 *  an id. */
const READABLE_CODE = new Set<NotificationSubject>(['lead', 'opportunity', 'contract'])

/** One notification, as the bell and `/notifications` draw it. `rows` is a run
 *  of identical ones the list folded together, newest first; the caller owns
 *  what a press does, the line only says whether there is a place to go.
 *
 *  Unread is said three ways so colour is never the only one: a spoken label,
 *  heavier type, and a tinted row. Read rows use `--muted-foreground` at full
 *  opacity; dimming with `opacity` falls under law 13. The day sits in the
 *  list heading, so the row carries the hour only. */
export function NotificationLine({
  rows,
  path,
  onPress,
}: {
  rows: NotificationRow[]
  path: string | null
  onPress: (rows: NotificationRow[], path: string | null) => void
}) {
  const row = rows[0]!
  const unread = rows.some((r) => r.readAt === null)
  const group = NOTIFICATION_KIND_GROUP[row.kind]
  const tone: Tone = TROUBLE.test(row.kind) ? 'danger' : GROUP_TONE[group]
  const installment = overdueInstallment(row)
  const sentence = sentenceOf(row)
  const { code, label } = row.subject
  /* An id inside the label already says it; saying it twice is noise. */
  const showCode = READABLE_CODE.has(row.subject.kind) && !label?.includes(code)
  /* An overdue installment adds which one, how much and since when. A built
     sentence already says the name and the counts. */
  const context = [
    ...(sentence
      ? []
      : [
          label,
          ...detailFragments(row),
          installment ? `Đợt ${installment.no}` : null,
          typeof installment?.amount === 'number' ? vnd(installment.amount) : null,
          installment?.due ? `hạn ${dm(installment.due)}` : null,
        ]),
    row.actor?.name,
  ]
    .filter(Boolean)
    .join(' · ')
  const body = (
    <>
      <Icon
        icon={GROUP_ICON[group]}
        size={20}
        className={cn('mt-1', unread ? TONE_INK[tone] : 'text-muted-foreground')}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-start gap-3">
          <span
            className={cn(
              'line-clamp-2 min-w-0 flex-1 text-[13px] leading-[1.5]',
              unread ? 'text-foreground font-semibold' : 'text-muted-foreground',
            )}
          >
            {unread ? <span className="sr-only">Chưa đọc. </span> : null}
            {sentence ?? NOTIFICATION_KIND_LABEL[row.kind]}
          </span>
          <time
            dateTime={row.createdAt}
            className="text-muted-foreground tnum shrink-0 text-[11.5px] leading-[1.5]"
          >
            {hm(row.createdAt)}
          </time>
        </span>
        <span className="text-muted-foreground tnum flex flex-wrap items-center gap-2 text-[12px] leading-[1.5]">
          <Badge tone={unread ? tone : 'draft'}>{NOTIFICATION_GROUP_LABEL[group]}</Badge>
          {rows.length > 1 ? (
            <span className="text-foreground font-semibold">{rows.length} lần</span>
          ) : null}
          {showCode ? <Chip>{code}</Chip> : null}
          {context ? <span className="min-w-0">{context}</span> : null}
        </span>
      </span>
    </>
  )
  const frame = cn(
    'pointer-coarse:min-h-12 flex w-full items-start gap-3 rounded-md p-3 text-left',
    unread && 'bg-primary/10',
  )

  /* Nothing to open and nothing left to mark: a button here would press into
     nothing, so the row is plain text. */
  if (!path && !unread) return <li className={frame}>{body}</li>

  return (
    <li>
      <button
        type="button"
        onClick={() => onPress(rows, path)}
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
