import type { ReactNode } from 'react'
import { Badge, Button, Icon, cn, type StatusDotState } from '@pv/ui'
import { MAIL_LETTER_STATE_LABEL, type MailMergeKey } from '@pv/contracts'
import { CommLateMark, CommOverdueMark, CommStateBadge } from '@/components/comm-bits'
import { LETTER_TONE } from '@/components/mail-letter/letter-model'
import { MERGE_PATTERN } from '@/components/mail-rich-body-model'
import { COMM_FOCUS, COMM_STATE_DOT } from '@/data/comm-record-detail'
import { COMMS_CHANNEL_ICON, COMMS_CHANNEL_LABEL } from '@/data/comms'
import { MERGE_LABEL } from '@/data/mail-hints'
import { dm, dmhm } from '@/lib/date'
import type { JourneyRow, MergeValues } from './comm-journey-rows'

/** The rows of `CommJourney`: a gutter of channel icon over date, then what
 *  was said, then who said it. The icon stands where a dot would and takes the
 *  dot's colour, so channel and state cost one mark, not a mark and a word. */

const NOTE = 'm-0 text-[12.5px] leading-[1.6] text-muted-foreground'

/** `StatusDot`'s fills as icon ink; the faint `next` grey would vanish on a
 *  stroke, so it reads as muted text instead. */
const DOT_TEXT: Record<StatusDotState, string> = {
  ok: 'text-success',
  current: 'text-primary',
  next: 'text-muted-foreground',
  bad: 'text-destructive-foreground',
  warning: 'text-warning',
}

/** A comm's pill only while unfinished; a letter's for every state but SENT,
 *  the plain outcome. An empty comm gets no pill: its fill button says it. */
function RowPill({ row }: { row: JourneyRow }) {
  if (row.commState === 'empty') return null
  if (row.commState && row.commState !== 'done') return <CommStateBadge state={row.commState} />
  const state = row.letter?.state
  if (!state || state === 'SENT') return null
  return <Badge tone={LETTER_TONE[state].badge}>{MAIL_LETTER_STATE_LABEL[state]}</Badge>
}

/** A scheduled letter or a booked meeting has not happened yet, so it carries
 *  its hour under the day. */
function Stamp({ row }: { row: JourneyRow }) {
  if (!row.at) return null
  const ahead = row.letter?.state === 'SCHEDULED' || row.commState === 'scheduled'
  const [day, hour] = (ahead ? dmhm(row.at) : dm(row.at)).split(' ')
  return (
    <span className="text-muted-foreground tnum flex flex-col items-center text-[11.5px] leading-[1.4]">
      <span>{day}</span>
      {hour && <span>{hour}</span>}
    </span>
  )
}

/** A letter's subject is stored as its template. Each key shows its value, or
 *  its label when the row cannot know it; bold either way, so it reads as filled in. */
function mergeParts(text: string, values: MergeValues) {
  const parts: { text: string; merged: boolean }[] = []
  let last = 0
  for (const match of text.matchAll(new RegExp(MERGE_PATTERN, 'g'))) {
    const key = match[1] as MailMergeKey
    parts.push({ text: text.slice(last, match.index), merged: false })
    parts.push({ text: values[key] || MERGE_LABEL[key], merged: true })
    last = match.index + match[0].length
  }
  parts.push({ text: text.slice(last), merged: false })
  return parts
}

function Body({ row, open }: { row: JourneyRow; open: (() => void) | null }) {
  if (row.commState === 'empty') {
    return row.canFill && open ? (
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={open}>
        Bổ sung nội dung
      </Button>
    ) : (
      <p className={NOTE}>Chưa có nội dung.</p>
    )
  }
  const parts = mergeParts(row.title, row.merge)
  /* One line: the card is a glance, the hover and the record give the rest. */
  const text = (
    <span
      title={parts.map((part) => part.text).join('')}
      className={cn(
        'block w-full min-w-0 truncate text-[13px] leading-[1.5]',
        row.titleMuted ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {parts.map((part, i) =>
        part.merged ? (
          <strong key={i} className="font-bold">
            {part.text}
          </strong>
        ) : (
          part.text
        ),
      )}
    </span>
  )
  return open ? (
    <button
      type="button"
      onClick={open}
      className={cn(
        'pointer-coarse:min-h-12 flex w-full min-w-0 items-center rounded-sm text-left hover:underline',
        COMM_FOCUS,
      )}
    >
      {text}
    </button>
  ) : (
    text
  )
}

export function JourneyList({
  rows,
  openOf,
  actionsOf,
}: {
  rows: JourneyRow[]
  openOf: (row: JourneyRow) => (() => void) | null | undefined | false
  actionsOf: (row: JourneyRow) => ReactNode
}) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {rows.map((row, i) => {
        const actions = actionsOf(row)
        return (
          <li key={row.key} className="flex gap-3">
            <div className="flex w-12 shrink-0 flex-col items-center gap-1">
              <span
                className={cn(
                  'inline-flex',
                  DOT_TEXT[
                    row.letter
                      ? LETTER_TONE[row.letter.state].dot
                      : row.commState
                        ? COMM_STATE_DOT[row.commState]
                        : 'next'
                  ],
                )}
              >
                <Icon icon={COMMS_CHANNEL_ICON[row.channel]} size={16} />
                <span className="sr-only">{COMMS_CHANNEL_LABEL[row.channel]}</span>
              </span>
              <Stamp row={row} />
              {i < rows.length - 1 && <span aria-hidden className="bg-surface-ink/8 w-px flex-1" />}
            </div>

            <div
              className={cn(
                'flex min-w-0 flex-1 flex-col items-start gap-1',
                i < rows.length - 1 && 'pb-5',
              )}
            >
              <Body row={row} open={openOf(row) || null} />
              <p className="text-muted-foreground m-0 flex flex-wrap items-center gap-x-2 text-[12px] leading-[1.5]">
                {row.owner && <span className="italic">{row.owner}</span>}
                <RowPill row={row} />
                <CommLateMark late={row.late} />
                <CommOverdueMark overdue={row.overdue} />
              </p>
              {row.letter?.failureReason && (
                <p className="text-muted-foreground m-0 text-[12px] leading-[1.5]">
                  {row.letter.failureReason}
                </p>
              )}
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
