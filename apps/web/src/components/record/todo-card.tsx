import { useId, type ReactNode } from 'react'
import { Check, Minus, Octagon } from '@pv/ui'
import { Badge, GlassCard, Icon, Separator, StatusDot, cn } from '@pv/ui'

/** The todo card — the first and heaviest card of every profile body (ADR
 *  0078 §1): the record's rungs, each with its date or clock, then one foot
 *  row — the next step, or what stands in for it — and the record's ONE
 *  primary move beside it.
 *
 *  A local stepper rather than `Stepper`/`StageTrack`: those draw a form's
 *  progress or a bar without dates, and this one carries a caption per rung
 *  and a stop marker. The current rung's name is a text pill (law 16), so the
 *  header needs none. Rungs sit side by side only once the card is wide enough
 *  (a container query, not the viewport). Both foot slots are optional: a
 *  contract has no next step, and with no verdict there is no primary. */

export type RungMark = 'done' | 'current' | 'waiting' | 'stopped' | 'skipped' | 'future'

export type TodoRung = {
  key: string
  label: string
  mark: RungMark
  /** Under the label — a date, a clock, a skip; `null` = nothing to say. */
  caption: string | null
  /** The caption is a lateness sentence. */
  late?: boolean
}

export function TodoCard({
  rungs,
  rungsLabel,
  next,
  primary,
}: {
  rungs: TodoRung[]
  /** What the ladder is, for a screen reader. */
  rungsLabel: string
  /** The foot row: `NextStepCard embedded`, or the screen's stand-in. */
  next?: ReactNode
  /** The primary move, from the server's verdict. */
  primary?: ReactNode
}) {
  const titleId = useId()

  return (
    <GlassCard
      role="region"
      aria-labelledby={titleId}
      className="@container flex flex-col gap-5 p-4 sm:p-6"
    >
      <h2 id={titleId} className="font-display m-0 text-[20px] font-semibold leading-[1.4]">
        Việc cần làm
      </h2>
      {/* `list-none` strips the list role in Safari; say it back. */}
      <ol
        role="list"
        aria-label={rungsLabel}
        className="@3xl:auto-cols-fr @3xl:grid-flow-col m-0 grid list-none gap-2 p-0"
      >
        {rungs.map((rung) => (
          <RungCell key={rung.key} rung={rung} />
        ))}
      </ol>
      {(next || primary) && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            {next && <div className="min-w-0 flex-1 basis-80">{next}</div>}
            {primary && <div className="flex flex-wrap items-center gap-2">{primary}</div>}
          </div>
        </>
      )}
    </GlassCard>
  )
}

/** Only the current rung wears the accent; a waiting one stays muted and its
 *  warning dot says so. */
function RungCell({ rung }: { rung: TodoRung }) {
  const current = rung.mark === 'current'
  const ahead = rung.mark === 'future'

  return (
    <li
      aria-current={current ? 'step' : undefined}
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-md px-3 py-2',
        current ? 'bg-accent' : 'bg-muted',
      )}
    >
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        <RungMarker mark={rung.mark} />
      </span>
      <span className="flex min-w-0 flex-col items-start gap-1">
        {current ? (
          <Badge tone="running">{rung.label}</Badge>
        ) : (
          <span
            className={cn(
              'text-[14px] font-medium leading-[1.5]',
              ahead ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {rung.label}
          </span>
        )}
        {rung.caption && (
          <span
            className={cn(
              'tnum text-[12px] leading-[1.5]',
              rung.late || rung.mark === 'stopped'
                ? 'text-destructive-foreground'
                : current
                  ? 'text-accent-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {rung.caption}
          </span>
        )}
      </span>
    </li>
  )
}

const MARK_WORD: Record<RungMark, string> = {
  done: 'đã xong',
  current: 'đang ở bậc này',
  waiting: 'đang chờ',
  stopped: 'đã dừng',
  skipped: 'bỏ qua',
  future: 'chưa tới',
}

/** A marker's meaning is said in words too, not only by glyph and colour. */
function RungMarker({ mark }: { mark: RungMark }) {
  return (
    <>
      {mark === 'done' ? (
        <Icon icon={Check} size={16} className="text-success" />
      ) : mark === 'stopped' ? (
        <Icon icon={Octagon} size={16} className="text-destructive-foreground" />
      ) : mark === 'skipped' ? (
        <Icon icon={Minus} size={16} className="text-muted-foreground" />
      ) : (
        <StatusDot
          state={mark === 'current' ? 'current' : mark === 'waiting' ? 'warning' : 'next'}
        />
      )}
      <span className="sr-only">{MARK_WORD[mark]}</span>
    </>
  )
}
