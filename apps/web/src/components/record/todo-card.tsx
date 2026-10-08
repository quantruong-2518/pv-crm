import { useId, type ReactNode } from 'react'
import { Check, Minus, Octagon } from '@pv/ui'
import { GlassCard, Icon, Separator, StatusDot, cn } from '@pv/ui'

/** The todo card — the first and heaviest card of every profile body (ADR
 *  0078 §1): the record's rungs, each with its date or clock, then one foot
 *  row — the next step, or what stands in for it — and the record's ONE
 *  primary move beside it.
 *
 *  A local stepper rather than `Stepper`/`StageTrack`: those draw a form's
 *  progress or a bar without dates, and this one carries a caption per rung
 *  and a stop marker. The current rung's name is a text pill (law 16), so the
 *  header needs none. Rungs size to their label and wrap as whole cells, so a
 *  label never breaks across lines. Both foot slots are optional: a
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
  title = 'Việc cần làm',
  rungs,
  rungsLabel,
  next,
  primary,
}: {
  title?: string
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
      className="@container flex flex-col gap-3 p-4 sm:p-5"
    >
      <h2 id={titleId} className="font-display m-0 text-[16px] font-semibold leading-[1.4]">
        {title}
      </h2>
      {/* `list-none` strips the list role in Safari; say it back. */}
      <ol role="list" aria-label={rungsLabel} className="m-0 flex list-none flex-wrap gap-2 p-0">
        {rungs.map((rung) => (
          <RungCell key={rung.key} rung={rung} />
        ))}
      </ol>
      {(next || primary) && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {next && <div className="min-w-0 flex-1 basis-80">{next}</div>}
            {primary && <div className="flex flex-wrap items-center gap-2">{primary}</div>}
          </div>
        </>
      )}
    </GlassCard>
  )
}

/** Done reads green, current azure, everything else grey; a stop or a late
 *  caption stays red. Tint colours carry the state, so no pill is needed. */
function RungCell({ rung }: { rung: TodoRung }) {
  const { mark } = rung
  const done = mark === 'done'
  const current = mark === 'current'
  const tone = done
    ? 'text-on-tint-success-strong'
    : current
      ? 'text-accent-foreground'
      : mark === 'future'
        ? 'text-muted-foreground'
        : 'text-foreground'

  return (
    <li
      aria-current={current ? 'step' : undefined}
      className={cn(
        'flex min-w-0 max-w-full grow items-start gap-2 rounded-md px-2 py-1',
        done ? 'bg-success/20' : current ? 'bg-accent' : 'bg-muted',
      )}
    >
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        <RungMarker mark={mark} />
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span
          className={cn(
            'text-[13px] leading-[1.5]',
            current || done ? 'font-semibold' : 'font-medium',
            tone,
          )}
        >
          {rung.label}
        </span>
        <span
          aria-hidden={rung.caption === null || undefined}
          className={cn(
            'tnum text-[11px] leading-[1.4] opacity-80',
            rung.late || mark === 'stopped' ? 'text-destructive-foreground' : tone,
          )}
        >
          {rung.caption ?? CAPTION_FALLBACK[mark]}
        </span>
      </span>
    </li>
  )
}

/** Row two never stays empty: a rung with nothing to date says where it stands. */
const CAPTION_FALLBACK: Record<RungMark, string> = {
  done: 'Đã xong',
  current: 'Đang ở bậc này',
  waiting: 'Đang chờ',
  stopped: 'Đã dừng',
  skipped: 'Bỏ qua',
  future: 'Chưa tới',
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
