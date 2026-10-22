import type { ReactNode } from 'react'
import { Activity, Ban, CircleCheck, Plus, StatCard, cn, percent, type IconGlyph } from '@pv/ui'
import type { SalesDayRange, WorkstreamBookQuery, WorkstreamScorecard } from '@pv/contracts'
import { compareLabel } from '@/data/period-pick'
import { NARROWING_CLEARED } from '@/data/workstreams'
import { deltaOf, rateOf, type Delta } from './home-model'

/** The workstream book's four cards: runs live in the period, opened in it,
 *  and the share of those closed that were won or stopped. Each is counted by
 *  the server for the picked period, compared with the stretch before it, and
 *  pressing one narrows the table to exactly the rows it counted. Tab and
 *  search never move the numbers.
 *
 *  A scorecard without `inPeriod` (an API one deploy behind, or a failed read)
 *  prints "—" and cannot be pressed: the book below must still open. */

type InPeriod = NonNullable<WorkstreamScorecard['inPeriod']>
type Patch = (next: Partial<WorkstreamBookQuery>) => void

type Card = {
  key: 'live' | 'opened' | 'won' | 'stopped'
  label: string
  icon: IconGlyph
  rows: (span: SalesDayRange) => Partial<WorkstreamBookQuery>
  on: (q: WorkstreamBookQuery, span: SalesDayRange) => boolean
}

const closedIn = (q: WorkstreamBookQuery, s: SalesDayRange) =>
  q.closedFrom === s.first && q.closedTo === s.last

const CARDS: Card[] = [
  {
    key: 'live',
    label: 'Đang chạy trong kỳ',
    icon: Activity,
    rows: (s) => ({ status: 'all', liveFrom: s.first, liveTo: s.last }),
    on: (q, s) => q.liveFrom === s.first && q.liveTo === s.last,
  },
  {
    key: 'opened',
    label: 'Mở mới',
    icon: Plus,
    rows: (s) => ({ status: 'all', openedFrom: s.first, openedTo: s.last }),
    on: (q, s) => q.openedFrom === s.first && q.openedTo === s.last,
  },
  {
    key: 'won',
    label: 'Thắng',
    icon: CircleCheck,
    rows: (s) => ({ status: 'closed', closeReason: 'WON', closedFrom: s.first, closedTo: s.last }),
    on: (q, s) => q.closeReason === 'WON' && closedIn(q, s),
  },
  {
    key: 'stopped',
    label: 'Đã dừng',
    icon: Ban,
    rows: (s) => ({ status: 'closed', stopped: true, closedFrom: s.first, closedTo: s.last }),
    on: (q, s) => q.stopped === true && closedIn(q, s),
  },
]

type Face = {
  value: string
  hint?: string
  delta?: {
    direction: Delta['direction']
    tone: 'success' | 'danger' | 'warning' | 'muted'
    text: string
  }
}

/** `upIsGood` false for a count nobody wants to grow. A fall in a plain count is
 *  only a warning; a fall in the win share is the alarm. */
function deltaFace(
  delta: Delta | null,
  against: string,
  upIsGood: boolean,
  fall: 'danger' | 'warning',
): Face['delta'] {
  if (!delta) return undefined
  const tone =
    delta.direction === 'flat'
      ? 'muted'
      : (delta.direction === 'up') === upIsGood
        ? 'success'
        : delta.direction === 'up'
          ? 'danger'
          : fall
  return { direction: delta.direction, tone, text: `${delta.text} ${against}` }
}

function faceOf(key: Card['key'], data: InPeriod): Face {
  const { now, compare } = data
  const against = compareLabel(data)
  if (key === 'live' || key === 'opened') {
    return {
      value: String(now[key]),
      delta: deltaFace(deltaOf(now[key], compare.figures[key], 'count'), against, true, 'warning'),
    }
  }
  const rate = (f: InPeriod['now']) => rateOf(f[key], f.closed)
  const delta = deltaFace(
    deltaOf(rate(now), rate(compare.figures), 'points'),
    against,
    key === 'won',
    'danger',
  )
  /* One context line, like the two count cards: the base rides in front of the
     comparison, so the four cards stay one height (a fourth line grew the row). */
  return {
    value: now.closed === 0 ? '—' : percent(now[key] / now.closed),
    hint: delta ? undefined : `${now[key]} trên ${now.closed} hành trình đã đóng`,
    delta: delta && { ...delta, text: `${now[key]}/${now.closed} · ${delta.text}` },
  }
}

/* `StatCard` has no pressed form, so the button wraps it (a div inside a
   button is invalid HTML; the card lives in `@pv/ui`, out of this zone). The
   active cue is a shadow ring and keyboard focus an outline, so both can show. */
function PressableCard({
  label,
  active,
  onPress,
  children,
}: {
  label: string
  active: boolean
  onPress: (() => void) | undefined
  children: ReactNode
}) {
  return (
    <div className="relative h-full">
      {children}
      {/* A sibling overlay, not a wrapper: the card keeps the grid row's full height. */}
      <button
        type="button"
        disabled={onPress === undefined}
        aria-pressed={active}
        aria-label={`Lọc: ${label}`}
        onClick={onPress}
        className={cn(
          'motion-std group absolute inset-0 rounded-lg',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          active && 'shadow-[0_0_0_2px_var(--ring)]',
          onPress && 'hover:bg-surface-ink/8 cursor-pointer',
        )}
      />
    </div>
  )
}

export function WorkstreamScoreStrip({
  query,
  patch,
  data,
  stale,
}: {
  query: WorkstreamBookQuery
  patch: Patch
  data: InPeriod | undefined
  /** The figures belong to the previous period until the new read lands; no card presses then. */
  stale: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Thẻ điểm sổ hành trình"
      aria-busy={stale}
      className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4"
    >
      {CARDS.map((card) => {
        const face = data && faceOf(card.key, data)
        const active = data !== undefined && card.on(query, data.span)
        return (
          <PressableCard
            key={card.key}
            label={card.label}
            active={active}
            onPress={
              data === undefined || stale
                ? undefined
                : () =>
                    patch(
                      active
                        ? NARROWING_CLEARED
                        : { ...NARROWING_CLEARED, ...card.rows(data.span) },
                    )
            }
          >
            <StatCard
              size="compact"
              className="h-full"
              icon={card.icon}
              label={card.label}
              value={face?.value ?? '—'}
              hint={face?.hint}
              delta={face?.delta}
            />
          </PressableCard>
        )
      })}
    </div>
  )
}
