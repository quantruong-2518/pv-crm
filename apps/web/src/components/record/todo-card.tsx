import type { ReactNode } from 'react'
import { Check, Minus, Octagon } from '@pv/ui'
import { GlassCard, Icon, cn } from '@pv/ui'

/** The record's stepper and, under it, its next step (ADR 0078 §1, reshaped
 *  14/10): rungs joined by a line on the bare screen background, then ONE
 *  compact card row holding the next step or what stands in for it.
 *
 *  The record's primary move lives in `RecordHeader actions`, so the card has
 *  no button slot. A local stepper rather than `Stepper`/`StageTrack`: those
 *  draw a form's progress or a bar without dates, and this one carries a
 *  caption per rung and a stop marker. Equal columns from `sm`, rows below;
 *  `layout="list"` keeps rows at any width, for a checklist that is not a
 *  sequence of stages. The state a rung is in is shown by the page's header
 *  badge (law 16), never by this stepper alone. */

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

/** `steps` = equal columns from `sm`, rows below; `list` = rows at any width. */
export type RungLayout = 'steps' | 'list'

export function TodoCard({
  rungs,
  rungsLabel,
  layout,
  next,
}: {
  rungs: TodoRung[]
  /** What the ladder is, for a screen reader (and printed in `list` layout). */
  rungsLabel: string
  layout?: RungLayout
  /** The next-step row: `NextStepCard embedded`, or the screen's stand-in. */
  next?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <TodoRungs rungs={rungs} label={rungsLabel} layout={layout} />
      {next && (
        <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1 basis-80">{next}</div>
        </GlassCard>
      )}
    </div>
  )
}

/** The stepper by itself, for a profile that draws it inside another card.
 *  `className` lets a flex row give it the full width on a phone. */
export function TodoRungs({
  rungs,
  label,
  layout = 'steps',
  className,
}: {
  rungs: TodoRung[]
  label: string
  layout?: RungLayout
  className?: string
}) {
  if (rungs.length === 0) return null
  const list = layout === 'list'
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      {list && <p className="text-muted-foreground m-0 text-[12px] font-semibold">{label}</p>}
      {/* `list-none` strips the list role in Safari; say it back. */}
      <ol
        role="list"
        aria-label={label}
        className={cn(
          'm-0 grid min-w-0 list-none p-0',
          !list && 'sm:auto-cols-fr sm:grid-flow-col',
        )}
      >
        {rungs.map((rung, i) => (
          <RungStep
            key={rung.key}
            rung={rung}
            no={i + 1}
            joined={i < rungs.length - 1}
            list={list}
          />
        ))}
      </ol>
    </div>
  )
}

/** Circle fill and text per mark. The glyph is `background`-coloured on the
 *  bright fills (success, warning) and white on the dark ones; the current
 *  circle uses `primary-strong`, since white on `primary` is 4.46:1. */
const DISC: Record<RungMark, string> = {
  done: 'bg-success text-background',
  current:
    'bg-primary-strong text-primary-foreground shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_24%,transparent)]',
  waiting: 'bg-warning text-background',
  stopped: 'bg-destructive text-primary-foreground',
  skipped: 'bg-surface-ink/9 text-muted-foreground',
  future: 'bg-surface-ink/9 text-muted-foreground',
}

const TONE: Record<RungMark, string> = {
  done: 'text-success',
  current: 'text-accent-foreground',
  waiting: 'text-warning',
  stopped: 'text-destructive-foreground',
  skipped: 'text-muted-foreground',
  future: 'text-muted-foreground',
}

/** Rows first; `sm:` turns them into columns unless the list is a checklist. */
const ITEM = {
  rows: 'relative flex min-w-0 items-start gap-3 pb-4 last:pb-0',
  steps: 'sm:flex-col sm:items-center sm:gap-1 sm:px-1 sm:pb-0 sm:text-center',
}
const LINE = {
  rows: 'absolute left-[11px] top-7 bottom-1 w-0.5',
  steps: 'sm:bottom-auto sm:left-[calc(50%+20px)] sm:top-[11px] sm:h-0.5 sm:w-[calc(100%-40px)]',
}

/** Captions arrive in whatever case their producer wrote; sentence case here. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A late caption or a stop stays red; everything else follows the mark. The
 *  line after a done step is green, so progress reads as one run. */
function RungStep({
  rung,
  no,
  joined,
  list,
}: {
  rung: TodoRung
  no: number
  joined: boolean
  list: boolean
}) {
  const { mark } = rung
  const tone = TONE[mark]
  const caption = rung.caption ?? CAPTION_FALLBACK[mark]

  return (
    <li
      aria-current={mark === 'current' ? 'step' : undefined}
      className={cn(ITEM.rows, !list && ITEM.steps)}
    >
      <span
        className={cn(
          'tnum relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
          DISC[mark],
        )}
      >
        <RungGlyph mark={mark} no={no} />
      </span>
      {joined && (
        <span
          aria-hidden
          className={cn(
            LINE.rows,
            !list && LINE.steps,
            mark === 'done' ? 'bg-success' : 'bg-surface-ink/16',
          )}
        />
      )}
      <span className={cn('flex min-w-0 flex-col gap-1', !list && 'sm:items-center')}>
        <span
          className={cn(
            'text-[12px] font-semibold',
            list ? 'leading-6' : 'leading-6 sm:leading-[1.5]',
            tone,
          )}
        >
          {rung.label}
        </span>
        {caption && (
          <span
            className={cn(
              'tnum text-[11px] leading-[1.4]',
              rung.late || mark === 'stopped' ? 'text-destructive-foreground' : tone,
            )}
          >
            {sentence(caption)}
          </span>
        )}
      </span>
    </li>
  )
}

/** Only a mark with something to add says it: a future or current rung needs
 *  no sentence under a label that already names it. */
const CAPTION_FALLBACK: Record<RungMark, string | null> = {
  done: 'Đã xong',
  current: null,
  waiting: 'Đang chờ',
  stopped: 'Đã dừng',
  skipped: 'Bỏ qua',
  future: null,
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
function RungGlyph({ mark, no }: { mark: RungMark; no: number }) {
  return (
    <>
      {mark === 'done' ? (
        <Icon icon={Check} size={16} />
      ) : mark === 'stopped' ? (
        <Icon icon={Octagon} size={16} />
      ) : mark === 'skipped' ? (
        <Icon icon={Minus} size={16} />
      ) : (
        no
      )}
      <span className="sr-only">{MARK_WORD[mark]}</span>
    </>
  )
}
