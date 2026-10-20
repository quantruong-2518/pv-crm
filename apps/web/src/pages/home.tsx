import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { salesGrainOf, type SalesPerformanceResponse } from '@pv/contracts'
import {
  AppShell,
  ChevronLeft,
  ChevronRight,
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
import { workstreamBookQuery, workstreamScorecardQuery } from '@/data/workstreams'
import { ActivityTile } from './home-activity'
import { FunnelTile } from './home-funnel'
import { PriorityList } from './home-list'
import { listQueryOf, type ListFilter } from './home-model'
import {
  GRAINS,
  compareLabel,
  currentPick,
  keyOf,
  periodLabel,
  progressOf,
  stepPick,
  type PeriodPick,
} from './home-period'
import { ReasonsTile } from './home-reasons'
import { SignedTile } from './home-signed'
import {
  ChartsFailed,
  GROW_WIDTH,
  OpenValueTile,
  OverdueTile,
  TileSkeleton,
  WinRateTile,
} from './home-tiles'

/** Screen 01 · Overview — a bento of sales figures over a short live list.
 *
 *  Follows the canvas design. Header: bold title, how far the period has run,
 *  and one pill frame with the four grains and the ‹ period › stepper. Under
 *  it, pill quick actions that have a destination.
 *  Bento: flex-wrap rows as in the design. Row one is the signed tile (7)
 *  beside a column of three tiles (5); row two is the week's activity or the
 *  funnel (7) beside the exit reasons (5). Each row stacks below its basis.
 *
 *  `/` has no route permission, so each half is gated on its own permission
 *  and a half the reader may not open is dropped and named, not drawn empty.
 *  A tile filters the list and never the other tiles; the period picker moves
 *  the period-scoped tiles and never the list. No ContextRail (law 10 debt). */

/* Flex bases are the design's, and skeletons take the same ones. Each bento row
   is its own wrap, or a wide screen would pull row two up beside row one. */
const ROW = 'flex flex-wrap items-stretch gap-4'
const HERO = 'min-w-0 flex-[7_1_560px]'
const SIDE = 'min-w-0 flex-[5_1_340px]'
const SIDE_STACK = `${SIDE} flex flex-col gap-4`
const SIDE_TILE = 'min-w-0 flex-1'
const ROW_TWO_MAIN = 'min-h-72 min-w-0 flex-[7_1_560px]'
const ROW_TWO_SIDE = 'min-h-72 min-w-0 flex-[5_1_380px]'
/** Beside a failed figures tile nothing shares the row, so the reasons take it whole. */
const ROW_TWO_ALONE = 'min-h-72 min-w-0 flex-[1_1_100%]'

/* Entry and hover motion: only opacity and translate/scale move, and the
   reduced-motion variant turns the transition off. */
const ENTER =
  'starting:translate-y-3 starting:opacity-0 transition-[opacity,translate] duration-500 ease-(--motion-ease) motion-reduce:transition-none'
const PRESS =
  'transition-[translate,scale,box-shadow,filter,background-color] duration-200 ease-(--motion-ease) hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-ring focus-visible:outline-2'
const SOFT_SHADOW =
  'shadow-[0_1px_2px_color-mix(in_srgb,var(--brand-navy)_6%,transparent),0_6px_18px_color-mix(in_srgb,var(--brand-navy)_8%,transparent)]'
const NAVY_GRADIENT =
  'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand-blue)_45%,var(--brand-navy)),var(--brand-navy))]'
const NAVY_LIFT = 'shadow-[0_4px_12px_color-mix(in_srgb,var(--brand-navy)_22%,transparent)]'
const ROUND_ICON =
  'pointer-coarse:size-12 text-foreground hover:bg-surface-ink/8 flex size-9 items-center justify-center rounded-full disabled:opacity-50 disabled:hover:bg-transparent'

function StepButton({
  icon,
  label,
  target,
  onPick,
}: {
  icon: IconGlyph
  label: string
  target: PeriodPick | null
  onPick: (next: PeriodPick) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={target === null}
      onClick={() => target && onPick(target)}
      className={cn(ROUND_ICON, 'focus-visible:outline-ring focus-visible:outline-2')}
    >
      <Icon icon={icon} size={16} />
    </button>
  )
}

function PeriodPicker({ pick, onPick }: { pick: PeriodPick; onPick: (next: PeriodPick) => void }) {
  return (
    <div
      role="group"
      aria-label="Chọn kỳ"
      className={cn('bg-card/80 flex flex-wrap items-center gap-1 rounded-full p-1', SOFT_SHADOW)}
    >
      {GRAINS.map((g) => {
        const on = g.value === pick.grain
        return (
          <button
            key={g.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick({ ...pick, grain: g.value })}
            className={cn(
              'pointer-coarse:h-12 h-9 min-w-[60px] rounded-full px-3 text-[13px] font-semibold',
              'duration-(--motion-duration) ease-(--motion-ease) transition-[background-color,color] motion-reduce:transition-none',
              'focus-visible:outline-ring focus-visible:outline-2',
              on
                ? cn(NAVY_GRADIENT, NAVY_LIFT, 'text-primary-foreground')
                : 'text-muted-foreground hover:bg-surface-ink/8',
            )}
          >
            {g.label}
          </button>
        )
      })}
      <span aria-hidden className="bg-surface-ink/12 mx-1 block h-5 w-px" />
      <StepButton icon={ChevronLeft} label="Kỳ trước" target={stepPick(pick, -1)} onPick={onPick} />
      <span
        aria-live="polite"
        className="tnum min-w-28 text-center text-[13px] font-semibold leading-5"
      >
        {periodLabel(keyOf(pick))}
      </span>
      <StepButton icon={ChevronRight} label="Kỳ sau" target={stepPick(pick, 1)} onPick={onPick} />
    </div>
  )
}

/** Names the data's own period, not the picker's, so a kept placeholder stays
 *  truthful. A finished period has no days left to count, so it gets no bar. */
function PeriodProgress({ data }: { data: SalesPerformanceResponse }) {
  const { ran, total } = progressOf(data)
  const compare = compareLabel(data)
  if (ran === total) {
    return (
      <span className="tnum font-num">{compare.charAt(0).toUpperCase() + compare.slice(1)}</span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden
        className="bg-surface-ink/8 block h-1.5 w-[120px] overflow-hidden rounded-full"
      >
        <span
          className={cn(
            'block h-full rounded-full bg-[linear-gradient(90deg,var(--channel-meeting),var(--primary))]',
            GROW_WIDTH,
          )}
          style={{ width: `${(ran / total) * 100}%` }}
        />
      </span>
      <span className="tnum font-num">
        Đã qua {ran}/{total} ngày · {compare}
      </span>
    </span>
  )
}

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
          ? 'text-primary-foreground bg-[linear-gradient(135deg,var(--primary),var(--primary-strong))] shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_28%,transparent)] hover:shadow-[0_16px_36px_color-mix(in_srgb,var(--primary)_42%,transparent)]'
          : cn('bg-card text-foreground', SOFT_SHADOW),
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full',
          primary
            ? 'bg-primary-foreground/20'
            : 'text-accent-foreground from-accent to-primary/25 bg-linear-to-br',
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
  overdueTile: (className: string) => ReactNode
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
  overdueTile,
  exitsTile,
}: BentoProps) {
  /* The data's own period decides, not the picker's: a kept placeholder
     still holds the old grain's buckets until the new read lands. */
  const weekly = data !== undefined && salesGrainOf(data.period) === 'week'

  return (
    <div
      aria-busy={stale}
      className={cn(
        'duration-(--motion-duration) flex flex-col gap-6 transition-opacity motion-reduce:transition-none',
        stale && 'opacity-60',
      )}
    >
      {!canCharts ? (
        <div className={ROW}>{overdueTile(SIDE)}</div>
      ) : data ? (
        <>
          <div className={ROW}>
            <SignedTile data={data} className={HERO} />
            <div className={SIDE_STACK}>
              <OpenValueTile data={data} className={SIDE_TILE} />
              <WinRateTile data={data} className={SIDE_TILE} />
              {overdueTile(SIDE_TILE)}
            </div>
          </div>
          <div className={ROW}>
            {weekly ? (
              <ActivityTile data={data} className={ROW_TWO_MAIN} />
            ) : (
              <FunnelTile data={data} className={ROW_TWO_MAIN} />
            )}
            {exitsTile(ROW_TWO_SIDE)}
          </div>
        </>
      ) : error ? (
        <>
          <div className={ROW}>
            <ChartsFailed
              detail={isApiError(error) ? userMessage(error) : 'Thử lại.'}
              onRetry={onRetry}
              className={canRuns ? HERO : ROW_TWO_ALONE}
            />
            {canRuns && <div className={SIDE_STACK}>{overdueTile(SIDE_TILE)}</div>}
          </div>
          <div className={ROW}>{exitsTile(ROW_TWO_ALONE)}</div>
        </>
      ) : (
        <>
          <div className={ROW}>
            <TileSkeleton className={HERO} />
            <div className={SIDE_STACK}>
              <TileSkeleton className={SIDE_TILE} />
              <TileSkeleton className={SIDE_TILE} />
              {canRuns && <TileSkeleton className={SIDE_TILE} />}
            </div>
          </div>
          <div className={ROW}>
            <TileSkeleton className={ROW_TWO_MAIN} />
            <TileSkeleton className={ROW_TWO_SIDE} />
          </div>
        </>
      )}
    </div>
  )
}

export function HomePage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, lead, cơ hội, hợp đồng…' })
  const canCharts = useCan('performance.view')
  const canRuns = useCan('workstream.view')
  const canLead = useCan('lead.edit')
  const canDeal = useCan('opportunity.create')
  const canLog = useCan('comm.view') && canRuns

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
  const exitsRead = useQuery({
    ...salesExitsQuery(keyOf(pick)),
    enabled: canCharts,
    placeholderData: keepPreviousData,
  })
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

  /* The overdue tile's "within your scope" note must not flip with the filter,
     so it remembers the unfiltered read's `hidden` and ignores kept placeholders. */
  const [scopedBook, setScopedBook] = useState(false)
  if (filter === null && list.data && !list.isPlaceholderData) {
    const scoped = list.data.hidden > 0
    if (scoped !== scopedBook) setScopedBook(scoped)
  }

  const hidden = [!canCharts && 'số hiệu suất', !canRuns && 'hành trình'].filter(Boolean)

  const overdueTile = (className: string) =>
    canRuns && (
      <OverdueTile
        score={score.data}
        failed={score.error !== null}
        onRetry={() => void score.refetch()}
        scoped={scopedBook}
        active={filter?.by === 'overdue'}
        onToggle={() => applyFilter(filter?.by === 'overdue' ? null : { by: 'overdue' })}
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
      <TileSkeleton className={className} />
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
          overdueTile={overdueTile}
          exitsTile={exitsTile}
        />

        {canRuns && (
          <div ref={listRef}>
            <PriorityList
              data={list.data}
              score={score.data}
              error={list.error}
              refreshing={list.isPlaceholderData}
              onRetry={() => void list.refetch()}
              filter={filter}
              onFilter={setFilter}
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
