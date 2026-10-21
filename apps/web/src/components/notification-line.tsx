import { Badge, Icon, cn } from '@pv/ui'
import {
  NOTIFICATION_DETAIL_OBJECT,
  NOTIFICATION_GROUP_LABEL,
  NOTIFICATION_KIND_GROUP,
  NOTIFICATION_KIND_LABEL,
  type NotificationRow,
  type NotificationSubject,
} from '@pv/contracts'
import { hm } from '@/lib/date'
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
 *  Short on purpose: the source pill, one sentence, and the object it is about.
 *  The detail lives on the object's own screen, one press away.
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
  const sentence = sentenceOf(row)
  const { code, label } = row.subject
  const object = row.detail?.[NOTIFICATION_DETAIL_OBJECT]
  /* An id inside the label already says it; a built sentence already names it. */
  const showCode = READABLE_CODE.has(row.subject.kind) && !label?.includes(code)
  const about = [sentence ? null : label, object, showCode ? code : null]
    .filter(Boolean)
    .join(' · ')
  /* The place a late record is about leads its sentence, in bold. */
  const [before, after] =
    row.kind === 'comm-record-late' && label && sentence ? sentence.split(label) : [sentence, null]
  const body = (
    <>
      <Icon
        icon={GROUP_ICON[group]}
        size={20}
        className={cn('mt-1', unread ? TONE_INK[tone] : 'text-muted-foreground')}
      />
      <span
        className={cn(
          'line-clamp-3 min-w-0 flex-1 text-[13px] leading-[1.5]',
          unread ? 'text-foreground font-semibold' : 'text-muted-foreground',
        )}
      >
        <Badge tone="draft" className="mr-2 align-middle">
          {NOTIFICATION_GROUP_LABEL[group]}
        </Badge>
        {unread ? <span className="sr-only">Chưa đọc. </span> : null}
        {rows.length > 1 ? <span className="tnum">{rows.length} lần · </span> : null}
        {sentence === null ? NOTIFICATION_KIND_LABEL[row.kind] : before}
        {after === null || after === undefined ? null : (
          <>
            <strong className="font-bold">{label}</strong>
            {after}
          </>
        )}
        {about ? (
          <span className="text-muted-foreground tnum font-normal">{`: "${about}"`}</span>
        ) : null}
      </span>
      <time
        dateTime={row.createdAt}
        className="text-muted-foreground tnum shrink-0 text-[10.5px] leading-[1.5]"
      >
        {hm(row.createdAt)}
      </time>
    </>
  )
  const frame = cn(
    'pointer-coarse:min-h-12 flex w-full items-start gap-3 rounded-md px-3 py-2 text-left',
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
