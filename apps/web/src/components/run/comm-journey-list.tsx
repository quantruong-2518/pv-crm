import type { ReactNode } from 'react'
import { Badge, Button, Icon, StatusDot, cn } from '@pv/ui'
import { MAIL_LETTER_STATE_LABEL } from '@pv/contracts'
import { CommLateMark, CommOverdueMark, CommStateBadge } from '@/components/comm-bits'
import { LETTER_TONE } from '@/components/mail-letter/letter-model'
import { COMM_FOCUS, COMM_STATE_DOT } from '@/data/comm-record-detail'
import { COMMS_CHANNEL_ICON, COMMS_CHANNEL_LABEL } from '@/data/comms'
import { dm, dmhm } from '@/lib/date'
import type { JourneyRow } from './comm-journey-rows'

/** The rows of `CommJourney`: a gutter of dot over date, then who made the
 *  contact and through what, then what was said. The date sits under its dot
 *  so the line one reads is the person, not a column of numbers. */

const NOTE = 'm-0 text-[12.5px] leading-[1.6] text-muted-foreground'

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
  const text = (
    <span
      className={cn(
        'text-[13px] leading-[1.5]',
        row.titleMuted ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {row.title}
    </span>
  )
  return open ? (
    <button
      type="button"
      onClick={open}
      className={cn(
        'pointer-coarse:min-h-12 flex w-full items-center rounded-sm text-left hover:underline',
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
  showCode,
  openOf,
  actionsOf,
}: {
  rows: JourneyRow[]
  showCode: boolean
  openOf: (row: JourneyRow) => (() => void) | null | undefined | false
  actionsOf: (row: JourneyRow) => ReactNode
}) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {rows.map((row, i) => {
        const actions = actionsOf(row)
        return (
          <li key={row.key} className="flex gap-3">
            <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-1">
              <StatusDot
                state={
                  row.letter
                    ? LETTER_TONE[row.letter.state].dot
                    : row.commState
                      ? COMM_STATE_DOT[row.commState]
                      : 'next'
                }
              />
              <Stamp row={row} />
              {i < rows.length - 1 && <span aria-hidden className="bg-surface-ink/8 w-px flex-1" />}
            </div>

            <div
              className={cn(
                'flex min-w-0 flex-1 flex-col items-start gap-1',
                i < rows.length - 1 && 'pb-5',
              )}
            >
              <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] leading-[1.5]">
                {row.owner && <span className="font-semibold">{row.owner}</span>}
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Icon icon={COMMS_CHANNEL_ICON[row.channel]} size={16} />
                  {COMMS_CHANNEL_LABEL[row.channel]}
                </span>
                {showCode && <span className="text-muted-foreground font-mono">{row.code}</span>}
                <RowPill row={row} />
                <CommLateMark late={row.late} />
                <CommOverdueMark overdue={row.overdue} />
              </p>
              <Body row={row} open={openOf(row) || null} />
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
