import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  salesGrainOf,
  type SalesPerformanceResponse,
  type WorkstreamBookQuery,
} from '@pv/contracts'
import {
  AppShell,
  Icon,
  Phone,
  Plus,
  ScreenHeader,
  ScreenLayout,
  UserPlus,
  cn,
  type IconGlyph,
} from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { salesExitsQuery, salesPerformanceQuery } from '@/data/home-charts'
import { currentPick, keyOf } from '@/data/period-pick'
import { workstreamBookQuery } from '@/data/workstreams'
import { PeriodPicker, PeriodProgress } from '@/components/period-picker'
import { SOFT_SHADOW } from '@/components/period-picker-style'
import { ActivityTile } from './home-activity'
import { FunnelTile } from './home-funnel'
import { ENTER, ICON_TONE } from './home-look'
import { daysOfPeriod, liveRunsQuery, stoppedRunsQuery } from './home-model'
import { ReasonsTile } from './home-reasons'
import { SignedTile } from './home-signed'
import { ChartsFailed, RunsTile, TileSkeleton, WinRateTile } from './home-tiles'

/** Screen 01 · Overview — a bento of sales figures.
 *
 *  The look lives in `home-look.ts` (ADR 0106 §5a). Header: bold title, how far
 *  the period has run, and one pill frame with the four grains and the ‹ period ›
 *  stepper. Under it, pill quick actions that have a destination.
 *  Bento: row one is the signed tile (7) beside a column of three tiles (5),
 *  stacking below its basis; then the week's activity or the funnel, and then
 *  the exit reasons, each alone on a full-width row.
 *  The "fullest step now" tile (`home-fullest.tsx`) is kept but not drawn for now.
 *
 *  `/` has no route permission, so each half is gated on its own permission
 *  and a half the reader may not open is dropped and named, not drawn empty.
 *  The runs tile links to the workstream book; the period picker moves the
 *  period-scoped tiles. No ContextRail (law 10 debt). */

/* Skeletons take the tiles' own bases. Each bento row is its own wrap, or a
   wide screen would pull row two up beside row one. */
const ROW = 'flex flex-wrap items-stretch gap-4'
const HERO = 'min-w-0 flex-[7_1_560px]'
const SIDE = 'min-w-0 flex-[5_1_340px]'
const SIDE_STACK = `${SIDE} flex flex-col gap-4`
const SIDE_TILE = 'min-w-0 flex-1'
/** A tile alone on its row: beside a neighbour, a stretched row left a tall empty band. */
const ROW_FULL = 'min-w-0 flex-[1_1_100%]'
/** A loading row keeps roughly a tile's height, so the page does not jump when it lands. */
const SKELETON_FULL = `${ROW_FULL} min-h-72`

/* The header enters with the cards (ENTER). The quick actions are buttons, so
   they keep a pointer response: a small lift and a press. No hover brightness,
   unlike the system button: it took white text to 4.28:1 on Aurora's primary. */
const PRESS =
  'transition-[translate,scale,background-color] duration-(--motion-duration) ease-(--motion-ease) hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-ring focus-visible:outline-2'

const PILL =
  'pointer-coarse:h-12 inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-4 text-[13px] font-semibold'

function QuickAction({
  icon,
  label,
  primary,
  onClick,
}: {
  icon: IconGlyph
  label: string
  primary: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        PILL,
        PRESS,
        primary
          ? 'text-primary-foreground shadow-primary bg-[linear-gradient(180deg,var(--primary),var(--primary-strong))]'
          : cn('bg-card text-foreground', SOFT_SHADOW),
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full',
          primary ? 'bg-primary-foreground/20' : ICON_TONE.primary,
        )}
      >
        <Icon icon={icon} size={16} />
      </span>
      {label}
    </button>
  )
}

/** Only actions that open a page that exists: the design's quote, meeting, mail
 *  and export pills have no destination yet. Its call pill opens the contact
 *  log, which takes any channel, so it carries that page's name. */
function QuickActions({
  canLead,
  canDeal,
  canLog,
}: {
  canLead: boolean
  canDeal: boolean
  canLog: boolean
}) {
  const navigate = useNavigate()

  return (
    <nav aria-label="Thao tác nhanh" className="flex flex-wrap items-center gap-2">
      {canLead && (
        <QuickAction
          icon={UserPlus}
          label="Thêm lead"
          primary
          onClick={() => navigate('/sales/leads/new')}
        />
      )}
      {canDeal && (
        <QuickAction
          icon={Plus}
          label="Tạo cơ hội"
          primary={!canLead}
          onClick={() => navigate('/sales/opportunities/new')}
        />
      )}
      {canLog && (
        <QuickAction
          icon={Phone}
          label="Ghi liên hệ"
          primary={!canLead && !canDeal}
          onClick={() => navigate('/comms/log')}
        />
      )}
    </nav>
  )
}

type BentoProps = {
  data: SalesPerformanceResponse | undefined
  error: Error | null
  onRetry: () => void
  /** Figures on screen belong to the previous period until the new read lands. */
  stale: boolean
  canCharts: boolean
  canRuns: boolean
  runsTile: (className: string) => ReactNode
  exitsTile: (className: string) => ReactNode
}

/** Data wins over an error: a failed background refetch keeps the last good tiles. */
function Bento({
  data,
  error,
  onRetry,
  stale,
  canCharts,
  canRuns,
  runsTile,
  exitsTile,
}: BentoProps) {
  /* The data's own period decides, not the picker's: a kept placeholder
     still holds the old grain's buckets until the new read lands. */
  const weekly = data !== undefined && salesGrainOf(data.period) === 'week'

  return (
    <div
      aria-busy={stale}
      className={cn(
        'duration-(--motion-duration) ease-(--motion-ease) flex flex-col gap-6 transition-opacity motion-reduce:transition-none',
        stale && 'opacity-60',
      )}
    >
      {!canCharts ? (
        <div className={ROW}>{runsTile(SIDE)}</div>
      ) : data ? (
        <>
          <div className={ROW}>
            <SignedTile data={data} className={HERO} />
            <div className={SIDE_STACK}>
              <WinRateTile data={data} className={SIDE_TILE} />
              {runsTile(SIDE_TILE)}
            </div>
          </div>
          <div className={ROW}>
            {weekly ? (
              <ActivityTile data={data} className={ROW_FULL} />
            ) : (
              <FunnelTile data={data} className={ROW_FULL} />
            )}
          </div>
          <div className={ROW}>{exitsTile(ROW_FULL)}</div>
        </>
      ) : error ? (
        <>
          <div className={ROW}>
            <ChartsFailed
              detail={isApiError(error) ? userMessage(error) : 'Thử lại.'}
              onRetry={onRetry}
              className={canRuns ? HERO : ROW_FULL}
            />
            {canRuns && <div className={SIDE_STACK}>{runsTile(SIDE_TILE)}</div>}
          </div>
          <div className={ROW}>{exitsTile(ROW_FULL)}</div>
        </>
      ) : (
        <>
          <div className={ROW}>
            <TileSkeleton className={HERO} />
            <div className={SIDE_STACK}>
              <TileSkeleton className={SIDE_TILE} />
              {canRuns && <TileSkeleton className={SIDE_TILE} />}
            </div>
          </div>
          <div className={ROW}>
            <TileSkeleton className={SKELETON_FULL} />
          </div>
          <div className={ROW}>
            <TileSkeleton className={SKELETON_FULL} />
          </div>
        </>
      )}
    </div>
  )
}

/** One page of one row: only the book's `total` is read. */
function useRunsTotal(query: WorkstreamBookQuery, enabled: boolean) {
  return useQuery({
    ...workstreamBookQuery({ ...query, size: 1 }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function HomePage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, lead, cơ hội, hợp đồng…' })
  const canCharts = useCan('performance.view')
  const canRuns = useCan('workstream.view')
  const canLead = useCan('lead.edit')
  const canDeal = useCan('opportunity.create')
  const canLog = useCan('comm.view') && canRuns

  const [pick, setPick] = useState(() => currentPick())

  /* Previous data stays on screen across a period change, so marks
     slide to their new size instead of dropping to a skeleton and back. */
  const charts = useQuery({
    ...salesPerformanceQuery(keyOf(pick)),
    enabled: canCharts,
    placeholderData: keepPreviousData,
  })
  const exitsRead = useQuery({
    ...salesExitsQuery(keyOf(pick)),
    enabled: canCharts,
    placeholderData: keepPreviousData,
  })
  /* The tile's span is the figures' own, so a kept placeholder moves both
     together; before any figures it is the picked period. */
  const runsSpan = charts.data?.span ?? daysOfPeriod(keyOf(pick))
  const stoppedRead = useRunsTotal(stoppedRunsQuery(runsSpan), canRuns)
  const liveRead = useRunsTotal(liveRunsQuery(runsSpan), canRuns)

  const hidden = [!canCharts && 'số hiệu suất', !canRuns && 'hành trình'].filter(Boolean)

  const runsTile = (className: string) =>
    canRuns && (
      <RunsTile
        stopped={stoppedRead.data?.total}
        live={liveRead.data?.total}
        span={runsSpan}
        failed={stoppedRead.error !== null || liveRead.error !== null}
        onRetry={() => {
          void stoppedRead.refetch()
          void liveRead.refetch()
        }}
        className={className}
      />
    )

  /* Its read does not depend on the figures', so it also stands beside the
     failure tile. */
  const exitsTile = (className: string) =>
    exitsRead.data ? (
      <ReasonsTile data={exitsRead.data} className={className} />
    ) : exitsRead.error ? (
      <ChartsFailed
        detail={isApiError(exitsRead.error) ? userMessage(exitsRead.error) : 'Thử lại.'}
        onRetry={() => void exitsRead.refetch()}
        className={className}
      />
    ) : (
      <TileSkeleton className={cn(className, 'min-h-72')} />
    )

  const data = charts.data
  const stale = charts.isPlaceholderData || exitsRead.isPlaceholderData

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={
            <span className="block text-[30px] font-bold leading-[38px] tracking-[-0.025em]">
              Tổng quan bán hàng
            </span>
          }
          description={
            data ? (
              <PeriodProgress data={data} />
            ) : canCharts ? (
              <span aria-hidden className="block h-4" />
            ) : undefined
          }
          actions={canCharts ? <PeriodPicker pick={pick} onPick={setPick} /> : undefined}
          context={
            canLead || canDeal || canLog ? (
              <QuickActions canLead={canLead} canDeal={canDeal} canLog={canLog} />
            ) : undefined
          }
          className={cn('gap-5', ENTER)}
        />

        <Bento
          data={data}
          error={charts.error}
          onRetry={() => void charts.refetch()}
          stale={stale}
          canCharts={canCharts}
          canRuns={canRuns}
          runsTile={runsTile}
          exitsTile={exitsTile}
        />

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
