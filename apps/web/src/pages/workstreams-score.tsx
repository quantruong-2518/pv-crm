import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CircleCheck, StatCard, cn, percent } from '@pv/ui'
import type { WorkstreamBookQuery } from '@pv/contracts'
import { workstreamScorecardQuery } from '@/data/workstreams'
import { WorkstreamStageChart } from './workstreams-chart'

/** The workstream book's dashboard strip: a chart of open runs per rung and two
 *  cards, each of which filters the table below. Whole-book counts from
 *  `GET /sales/workstreams/scorecard`; tab and search never move them, but the
 *  active stage / overdue filter is reflected. No deltas: the endpoint has no
 *  previous period (law 15).
 *
 *  A failed or not-yet-deployed read leaves `data` undefined and everything
 *  prints "—" and cannot be clicked: the book below must still open. */

type Props = {
  query: WorkstreamBookQuery
  patch: (next: Partial<WorkstreamBookQuery>) => void
}

/* `StatCard` has no pressed form, so the button wraps it (a div inside a
   button is invalid HTML; the card lives in `@pv/ui`, out of this zone). The
   active cue is a shadow ring and keyboard focus an outline, so both can show. */
function PressableCard({
  active,
  onPress,
  children,
}: {
  active: boolean
  onPress: (() => void) | undefined
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={onPress === undefined}
      aria-pressed={active}
      onClick={onPress}
      className={cn(
        'motion-std pointer-coarse:min-h-12 group relative block w-full rounded-lg text-left',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        active && 'shadow-[0_0_0_2px_var(--ring)]',
        onPress && 'cursor-pointer',
      )}
    >
      {children}
      {/* An overlay, not a background: the card paints its own glass over the button. */}
      {onPress && (
        <span
          aria-hidden
          className="motion-std bg-surface-ink/0 group-hover:bg-surface-ink/8 pointer-events-none absolute inset-0 rounded-lg"
        />
      )}
    </button>
  )
}

/* A press and the other card's press replace each other and drop the typed
   search and company chip, so the rows that open are exactly the count named. */
const FRESH_BOOK = {
  status: 'open',
  closeReason: undefined,
  q: undefined,
  accountCode: undefined,
} satisfies Partial<WorkstreamBookQuery>
const NO_STAGE = { standKind: undefined, standKey: undefined }

export function WorkstreamScoreStrip({ query, patch }: Props) {
  const { data } = useQuery(workstreamScorecardQuery)
  const late = data?.overdue ?? 0
  const closed = data ? data.won + data.stopped : 0
  const overdueActive = query.overdue === true

  return (
    <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="col-span-2 lg:col-span-1">
        <WorkstreamStageChart
          stages={data?.stages}
          active={{ standKind: query.standKind, standKey: query.standKey }}
          onPick={(stage) =>
            patch(
              stage
                ? { ...FRESH_BOOK, overdue: undefined, standKind: stage.kind, standKey: stage.key }
                : NO_STAGE,
            )
          }
        />
      </div>
      {/* The server's overdue set is open runs only, so turning it on leaves the closed tab. */}
      <PressableCard
        active={overdueActive}
        onPress={
          data === undefined
            ? undefined
            : () =>
                patch(
                  overdueActive
                    ? { overdue: undefined }
                    : { ...FRESH_BOOK, ...NO_STAGE, overdue: true },
                )
        }
      >
        <StatCard
          size="compact"
          icon={CalendarClock}
          label="Quá hạn"
          value={data ? String(late) : '—'}
          hint={
            data && late === 0
              ? 'Không có hành trình nào quá hạn'
              : 'Hành trình đang chạy có bậc quá hạn'
          }
          tone={late > 0 ? 'warning' : 'default'}
        />
      </PressableCard>
      <StatCard
        size="compact"
        icon={CircleCheck}
        label="Tỷ lệ thắng"
        value={data && closed > 0 ? percent(data.won / closed) : '—'}
        hint={data ? `${data.won} thắng / ${closed} đã đóng` : 'Hành trình đã đóng'}
      />
    </div>
  )
}
