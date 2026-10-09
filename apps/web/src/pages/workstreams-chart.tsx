import { GlassCard, cn } from '@pv/ui'
import {
  WORKSTREAM_JOURNEY_STEPS,
  type WorkstreamScorecard,
  type WorkstreamStandKind,
} from '@pv/contracts'

/** The open runs per rung, one bar each, grouped under the journey step they
 *  belong to. A bar is a rung and not a whole step because the book filters by
 *  one `standKind` + `standKey` pair: a step-wide bar could not open its rows.
 *
 *  Order, labels and counts are the server's, zeros included: a screen-side
 *  ladder would print a renamed stage under its old word. One hue for every
 *  bar (law 15); the active row is marked by ring and weight, not by a tint
 *  that would eat the bar-vs-track contrast. Built locally because
 *  `BarChart`'s horizontal rows take no `onSelect`. */

type Stage = { kind: WorkstreamStandKind; key: string }
type Rungs = WorkstreamScorecard['stages']
type Group = { kind: WorkstreamStandKind; rungs: Rungs }

const STEP_OF_KIND: Record<WorkstreamStandKind, (typeof WORKSTREAM_JOURNEY_STEPS)[number]['key']> =
  { LD: 'lead', OP: 'opportunity', HĐ: 'contract' }

const stepTitle = (kind: WorkstreamStandKind) =>
  WORKSTREAM_JOURNEY_STEPS.find((s) => s.key === STEP_OF_KIND[kind])?.label ?? kind

/* Kinds in first-appearance order: the server already sends the ladder in
   process order, so the screen never sorts. */
function groupsOf(stages: Rungs): Group[] {
  const kinds = [...new Set(stages.map((s) => s.kind))]
  return kinds.map((kind) => ({ kind, rungs: stages.filter((s) => s.kind === kind) }))
}

/* Outline for keyboard focus and shadow for the active ring: two properties,
   so a focused active row shows both instead of one overwriting the other. */
const FOCUS = 'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2'

function Rung({
  label,
  count,
  top,
  active,
  onSelect,
  className,
}: {
  label: string
  count: number | undefined
  top: number
  active: boolean
  onSelect: (() => void) | undefined
  className?: string
}) {
  const empty = count === undefined || count === 0
  return (
    <button
      type="button"
      disabled={onSelect === undefined}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'motion-std pointer-coarse:min-h-12 flex w-full flex-col justify-center gap-1 rounded-md px-2 py-1 text-left',
        FOCUS,
        active && 'shadow-[0_0_0_2px_var(--ring)]',
        onSelect && !active && 'hover:bg-surface-ink/8 cursor-pointer',
        className,
      )}
    >
      <span className="flex items-baseline justify-between gap-2 text-[12px] leading-4">
        <span
          className={cn(
            'truncate',
            active
              ? 'text-foreground font-bold'
              : empty
                ? 'text-muted-foreground'
                : 'text-foreground',
          )}
          title={label}
        >
          {label}
        </span>
        <span
          className={cn(
            'tnum font-num shrink-0 font-semibold',
            active ? 'text-accent-foreground' : empty ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {count ?? '—'}
        </span>
      </span>
      <span className="bg-surface-ink/10 block h-2 overflow-hidden rounded-sm">
        {!empty && (
          <span
            className="bg-primary block h-full rounded-sm"
            style={{ width: `${Math.max((count / top) * 100, 2)}%` }}
          />
        )}
      </span>
    </button>
  )
}

export function WorkstreamStageChart({
  stages,
  active,
  onPick,
}: {
  /** Undefined until the scorecard arrives: one dash row, nothing clicks. */
  stages: Rungs | undefined
  active: { standKind?: WorkstreamStandKind; standKey?: string }
  /** The same pair again means "clear". */
  onPick: (stage: Stage | undefined) => void
}) {
  const known = stages !== undefined && stages.length > 0
  const groups: Group[] = known
    ? groupsOf(stages)
    : (['LD', 'OP'] as const).map((kind) => ({ kind, rungs: [] }))
  const top = Math.max(1, ...(stages ?? []).map((s) => s.count))
  const isOn = (kind: WorkstreamStandKind, key: string) =>
    active.standKind === kind && active.standKey === key
  /* Under `sm` a zero rung is dropped (the strip would push the table below the
     fold); the active one stays so it can still be cleared. */
  const quiet = (s: Rungs[number]) => s.count === 0 && !isOn(s.kind, s.key)
  const allQuiet = known && stages.every(quiet)

  return (
    <GlassCard
      role="group"
      aria-label="Hành trình đang chạy theo giai đoạn"
      className={cn('grid gap-x-6 gap-y-2 px-2 py-3 sm:grid-cols-2', allQuiet && 'max-sm:hidden')}
    >
      {groups.map((group) => (
        <div
          key={group.kind}
          className={cn(
            'flex min-w-0 flex-col gap-1',
            group.rungs.length > 0 && group.rungs.every(quiet) && 'max-sm:hidden',
          )}
        >
          <div className="text-muted-foreground px-2 text-[12px] font-semibold leading-4">
            {stepTitle(group.kind)}
          </div>
          {group.rungs.length === 0 && (
            <Rung label="—" count={undefined} top={top} active={false} onSelect={undefined} />
          )}
          {group.rungs.map((rung) => {
            const on = isOn(rung.kind, rung.key)
            /* An active empty bar stays clickable or a stale address could not be cleared. */
            const live = on || rung.count > 0
            return (
              <Rung
                key={rung.key}
                label={rung.label}
                count={rung.count}
                top={top}
                active={on}
                className={quiet(rung) ? 'max-sm:hidden' : undefined}
                onSelect={
                  live
                    ? () => onPick(on ? undefined : { kind: rung.kind, key: rung.key })
                    : undefined
                }
              />
            )
          })}
        </div>
      ))}
    </GlassCard>
  )
}
