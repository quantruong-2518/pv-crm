import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  ChevronLeft,
  ChevronRight,
  Icon,
  ScreenHeader,
  ScreenLayout,
  SegmentedControl,
} from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { CHARTS_FROZEN_AT, frozenExitsQuery, salesPerformanceQuery } from '@/data/home-charts'
import { workstreamBookQuery, workstreamScorecardQuery } from '@/data/workstreams'
import { dm } from '@/lib/date'
import { ExitsTile, MonthsTile } from './home-charts'
import { PriorityList } from './home-list'
import {
  currentPick,
  keyOf,
  listQueryOf,
  periodLabel,
  stepPick,
  type HomeGrain,
  type ListFilter,
  type PeriodPick,
} from './home-model'
import {
  ChartsFailed,
  FunnelTile,
  OpenValueTile,
  OverdueTile,
  SignedTile,
  TileSkeleton,
  WinRateTile,
} from './home-tiles'

/** Screen 01 · Overview — a bento of sales figures over a short live list.
 *
 *  TWO SOURCES, AND THE SCREEN SAYS WHICH IS WHICH. Only the exits donut is
 *  still the frozen DAS Vina scenario (`frozenExitsQuery`, still `load:`),
 *  pinned to the scenario's own period: the live picker runs on the calendar
 *  and leaves that window. Every other tile and the list are live reads.
 *
 *  `/` has no route permission, so each half is gated on its own permission
 *  and a half the reader may not open is dropped and named, not drawn empty.
 *
 *  A tile filters the list and never the other tiles; the period picker moves
 *  the period-scoped tiles and never the list.
 *
 *  No ContextRail (law 10 debt): a chain anchored on the list's first row
 *  would describe a run nobody picked. It returns once a row can be chosen. */

/* Row two is three-up only from `xl`; below that the funnel and the months
   chart pair up and the donut takes the full row, so no cell is left empty.
   One floor height for the row, skeletons included, so nothing grows on load. */
const BENTO = 'grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12'
const SIGNED = 'md:col-span-6 xl:col-span-5'
const PAIRED = 'min-h-72 md:col-span-3 xl:col-span-4'
const WIDE = 'md:col-span-6 xl:col-span-4 xl:min-h-72'

const GRAINS: { value: HomeGrain; label: string }[] = [
  { value: 'month', label: 'Tháng' },
  { value: 'quarter', label: 'Quý' },
]

function PeriodPicker({ pick, onPick }: { pick: PeriodPick; onPick: (next: PeriodPick) => void }) {
  const earlier = stepPick(pick, -1)
  const later = stepPick(pick, 1)
  const step = 'pointer-coarse:h-12 pointer-coarse:w-12 w-8 px-0'

  return (
    <>
      <SegmentedControl
        label="Độ dài kỳ"
        hideLabel
        tone="quiet"
        value={pick.grain}
        options={GRAINS}
        onChange={(grain) => onPick({ ...pick, grain: grain === 'month' ? 'month' : 'quarter' })}
      />
      <div role="group" aria-label="Chọn kỳ" className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className={step}
          aria-label="Kỳ trước"
          disabled={earlier === null}
          onClick={() => earlier && onPick(earlier)}
        >
          <Icon icon={ChevronLeft} size={16} />
        </Button>
        <span aria-live="polite" className="tnum min-w-32 text-center text-[12.5px] font-semibold">
          {periodLabel(keyOf(pick))}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={step}
          aria-label="Kỳ sau"
          disabled={later === null}
          onClick={() => later && onPick(later)}
        >
          <Icon icon={ChevronRight} size={16} />
        </Button>
      </div>
    </>
  )
}

export function HomePage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, lead, cơ hội, hợp đồng…' })
  const canCharts = useCan('performance.view')
  const canRuns = useCan('workstream.view')

  const [pick, setPick] = useState(() => currentPick())
  const [filter, setFilter] = useState<ListFilter | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /* Previous data stays on screen across a period or filter change, so marks
     slide to their new size instead of dropping to a skeleton and back. */
  const charts = useQuery({
    ...salesPerformanceQuery(keyOf(pick)),
    enabled: canCharts,
    placeholderData: keepPreviousData,
  })
  const frozen = useQuery({ ...frozenExitsQuery, enabled: canCharts })
  const score = useQuery({ ...workstreamScorecardQuery, enabled: canRuns })
  const list = useQuery({
    ...workstreamBookQuery(listQueryOf(filter)),
    enabled: canRuns,
    placeholderData: keepPreviousData,
  })

  /* The list sits under the whole bento, so a tile press brings it into view
     or the press would look like it did nothing. */
  const applyFilter = (next: ListFilter | null) => {
    setFilter(next)
    if (next === null) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    listRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' })
  }

  const frozenDay = dm(CHARTS_FROZEN_AT)
  /* Without the Overdue tile the two beside it widen to close the row; the
     skeletons take the same spans so nothing shifts when the figures land. */
  const openSpan = canRuns ? 'md:col-span-2 xl:col-span-3' : 'md:col-span-3 xl:col-span-4'
  const winSpan = canRuns ? 'md:col-span-2' : 'md:col-span-3'
  const hidden = [!canCharts && 'số hiệu suất', !canRuns && 'hành trình'].filter(Boolean)

  const overdue = canRuns && (
    <OverdueTile
      score={score.data}
      failed={score.error !== null}
      onRetry={() => void score.refetch()}
      scoped={(list.data?.hidden ?? 0) > 0}
      active={filter?.by === 'overdue'}
      onToggle={() => applyFilter(filter?.by === 'overdue' ? null : { by: 'overdue' })}
      className="md:col-span-2"
    />
  )

  /* Its fixture read does not depend on the live one, so it also stands
     beside the failure tile: the caption above names it either way. */
  const exits = frozen.data ? (
    <ExitsTile data={frozen.data} frozenDay={frozenDay} className={WIDE} />
  ) : (
    <TileSkeleton className={WIDE} />
  )

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Tổng quan"
          description={
            canCharts ? (
              <>
                Ô Lý do lead rời luồng là số của kịch bản DAS Vina đóng băng lúc{' '}
                <span className="tnum font-num">{CHARTS_FROZEN_AT.slice(11, 16)}</span> ngày{' '}
                <span className="tnum font-num">{frozenDay}</span>, không đổi theo kỳ đang chọn. Các
                ô còn lại đọc số thật.
              </>
            ) : undefined
          }
          actions={canCharts ? <PeriodPicker pick={pick} onPick={setPick} /> : undefined}
        />

        <div className={BENTO}>
          {!canCharts ? (
            overdue
          ) : charts.error ? (
            <>
              <ChartsFailed
                detail={isApiError(charts.error) ? userMessage(charts.error) : 'Vui lòng thử lại.'}
                onRetry={() => void charts.refetch()}
                className={canRuns ? 'md:col-span-4 xl:col-span-10' : 'col-span-full'}
              />
              {overdue}
              {exits}
            </>
          ) : charts.data ? (
            <>
              <SignedTile data={charts.data} className={SIGNED} />
              <OpenValueTile data={charts.data} className={openSpan} />
              <WinRateTile data={charts.data} className={winSpan} />
              {overdue}
              <FunnelTile data={charts.data} className={PAIRED} />
              <MonthsTile data={charts.data} className={PAIRED} />
              {exits}
            </>
          ) : (
            <>
              <TileSkeleton className={SIGNED} />
              <TileSkeleton className={openSpan} />
              <TileSkeleton className={winSpan} />
              {overdue}
              <TileSkeleton className={PAIRED} />
              <TileSkeleton className={PAIRED} />
              <TileSkeleton className={WIDE} />
            </>
          )}
        </div>

        {canRuns && (
          <div ref={listRef}>
            <PriorityList
              data={list.data}
              error={list.error}
              onRetry={() => void list.refetch()}
              filter={filter}
              onClear={() => setFilter(null)}
            />
          </div>
        )}

        {hidden.length > 0 && (
          <p className="text-muted-foreground text-[12px] leading-4">
            Bị ẩn theo quyền của bạn: {hidden.join(' · ')}.
          </p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default HomePage
