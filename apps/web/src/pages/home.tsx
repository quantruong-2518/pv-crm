import { useId, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  salesGrainOf,
  type SalesPerformanceResponse,
  type WorkstreamBookQuery,
} from '@pv/contracts'
import { AppShell, Icon, Phone, Plus, ScreenLayout, UserPlus, cn, type IconGlyph } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { salesExitsQuery, salesMoneyQuery, salesPerformanceQuery } from '@/data/home-charts'
import { currentPick, keyOf, type PeriodPick } from '@/data/period-pick'
import { workstreamBookQuery } from '@/data/workstreams'
import { PeriodPicker, PeriodProgress } from '@/components/period-picker'
import { SOFT_SHADOW } from '@/components/period-picker-style'
import { ActivityTile } from './home-activity'
import { FunnelTile } from './home-funnel'
import { ENTER, ICON_TONE } from './home-look'
import { daysOfPeriod, liveRunsQuery, stoppedRunsQuery } from './home-model'
import { ReasonsTile } from './home-reasons'
import { RevenueTile } from './home-revenue'
import { SignedTile } from './home-signed'
import { ChartsFailed, RunsTile, TileSkeleton, WinRateTile } from './home-tiles'

/** Screen 01 · Overview — a bento of sales figures.
 *
 *  The look lives in `home-look.ts` (ADR 0106 §5a). Header on one line: title
 *  and how far the period has run, then the quick actions and the period frame,
 *  wrapping on a narrow screen. Row one fills the first screen: the hero (7)
 *  beside the exit reasons stacked (5). Row two: close rate and journeys. Row
 *  three: the week's activity or the funnel. The hero is revenue
 *  (`home-revenue.tsx`) for a reader of the whole contract book, otherwise the
 *  signed tile (`home-signed.tsx`); the money read's refusal is that switch.
 *
 *  `/` has no route permission, so each half is gated on its own permission
 *  and a half the reader may not open is dropped and named, not drawn empty.
 *  No ContextRail (law 10 debt). */

/* Skeletons take the tiles' own bases. Each bento row is its own wrap, or a
   wide screen would pull row two up beside row one. */
const ROW = 'flex flex-wrap items-stretch gap-4'
const HERO = 'min-w-0 flex-[7_1_560px]'
const SIDE = 'min-w-0 flex-[5_1_340px]'
const HALF = 'min-w-0 flex-[1_1_340px]'
/** A tile alone on its row: beside a neighbour, a stretched row left a tall empty band. */
const ROW_FULL = 'min-w-0 flex-[1_1_100%]'
/** A loading row keeps roughly a tile's height, so the page does not jump when it lands. */
const SKELETON_FULL = `${ROW_FULL} min-h-72`
/** Header plus row one end at the fold from lg: 100dvh less the 64px app header,
 *  the shell's 24px top padding and the 24px it keeps under a page. Row one takes
 *  what the header leaves (`flex-1`), so a header that wraps never pushes it past. */
const FOLD = 'flex flex-col gap-6 lg:min-h-[calc(100dvh-112px)]'
const DIM =
  'duration-(--motion-duration) ease-(--motion-ease) transition-opacity motion-reduce:transition-none'

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
  head: ReactNode
  data: SalesPerformanceResponse | undefined
  error: Error | null
  onRetry: () => void
  /** Figures on screen belong to the previous period until the new read lands. */
  stale: boolean
  canCharts: boolean
  hero: (className: string) => ReactNode
  runsTile: (className: string) => ReactNode
  exitsTile: (className: string) => ReactNode
}

/** Data wins over an error: a failed background refetch keeps the last good tiles. */
function Bento({
  head,
  data,
  error,
  onRetry,
  stale,
  canCharts,
  hero,
  runsTile,
  exitsTile,
}: BentoProps) {
  /* The data's own period decides, not the picker's: a kept placeholder
     still holds the old grain's buckets until the new read lands. */
  const weekly = data !== undefined && salesGrainOf(data.period) === 'week'
  const wrap = (children: ReactNode, extra?: string) => (
    <div aria-busy={stale} className={cn(ROW, DIM, stale && 'opacity-60', extra)}>
      {children}
    </div>
  )

  if (!canCharts)
    return (
      <>
        {head}
        <div className={ROW}>{runsTile(SIDE)}</div>
      </>
    )

  const runs = runsTile(HALF)
  const first = data ? (
    hero(HERO)
  ) : error ? (
    <ChartsFailed
      detail={isApiError(error) ? userMessage(error) : 'Thử lại.'}
      onRetry={onRetry}
      className={HERO}
    />
  ) : (
    <TileSkeleton className={HERO} />
  )

  return (
    <>
      <div className={FOLD}>
        {head}
        {wrap(
          <>
            {first}
            {exitsTile(SIDE)}
          </>,
          'flex-1',
        )}
      </div>
      {data ? (
        <>
          {wrap(
            <>
              <WinRateTile data={data} className={HALF} />
              {runs}
            </>,
          )}
          {wrap(
            weekly ? (
              <ActivityTile data={data} className={ROW_FULL} />
            ) : (
              <FunnelTile data={data} className={ROW_FULL} />
            ),
          )}
        </>
      ) : error ? (
        runs && <div className={ROW}>{runs}</div>
      ) : (
        <>
          <div className={ROW}>
            <TileSkeleton className={HALF} />
            {runs}
          </div>
          <div className={ROW}>
            <TileSkeleton className={SKELETON_FULL} />
          </div>
        </>
      )}
    </>
  )
}

/** Title and progress on the left; quick actions, then the period frame. One
 *  wrapping line, so row one keeps the rest of the first screen. */
function Head({
  data,
  canCharts,
  pick,
  onPick,
  quick,
}: {
  data: SalesPerformanceResponse | undefined
  canCharts: boolean
  pick: PeriodPick
  onPick: (next: PeriodPick) => void
  quick: ReactNode
}) {
  const titleId = useId()
  return (
    <header
      aria-labelledby={titleId}
      className={cn('flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3', ENTER)}
    >
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
        <h2
          id={titleId}
          className="font-display text-[30px] font-bold leading-[38px] tracking-[-0.025em]"
        >
          Tổng quan bán hàng
        </h2>
        {canCharts && (
          <div className="text-muted-foreground min-h-5 text-[12px] leading-[1.6]">
            {data && <PeriodProgress data={data} />}
          </div>
        )}
      </div>
      {quick}
      {canCharts && <PeriodPicker pick={pick} onPick={onPick} />}
    </header>
  )
}

/** The hero slot. Money needs the whole contract book: an own-only reader, one
 *  without `contract.view`, or a refused read (403) gets the signed tile. */
function useHero(period: string, canCharts: boolean) {
  const ownOnly = useSession((s) => s.actor?.ownOnly ?? false)
  const wholeBook = useCan('contract.view') && !ownOnly
  const cashRead = useQuery({
    ...salesMoneyQuery(period),
    enabled: canCharts && wholeBook,
    placeholderData: keepPreviousData,
  })
  const refused = isApiError(cashRead.error) && cashRead.error.kind === 'forbidden'
  const money = canCharts && wholeBook && !refused
  /* A kept money placeholder is joined with the figures of ITS period, read
     from cache, never with the newly picked period's buckets. */
  const perfRead = useQuery({
    ...salesPerformanceQuery(cashRead.data?.period ?? period),
    enabled: money,
  })

  const hero = (data: SalesPerformanceResponse, className: string) => {
    if (!money) return <SignedTile data={data} className={className} />
    const cash = cashRead.data
    const perf = perfRead.data
    if (cash && perf?.period === cash.period)
      return <RevenueTile perf={perf} cash={cash} className={className} />
    if (cashRead.error)
      return (
        <ChartsFailed
          detail={isApiError(cashRead.error) ? userMessage(cashRead.error) : 'Thử lại.'}
          onRetry={() => void cashRead.refetch()}
          className={className}
        />
      )
    return <TileSkeleton className={className} />
  }
  return { hero, stale: money && cashRead.isPlaceholderData }
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

  const heroRead = useHero(keyOf(pick), canCharts)

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
      <ReasonsTile data={exitsRead.data} layout="side" className={className} />
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
  const stale = charts.isPlaceholderData || exitsRead.isPlaceholderData || heroRead.stale

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <Bento
          head={
            <Head
              data={data}
              canCharts={canCharts}
              pick={pick}
              onPick={setPick}
              quick={
                (canLead || canDeal || canLog) && (
                  <QuickActions canLead={canLead} canDeal={canDeal} canLog={canLog} />
                )
              }
            />
          }
          data={data}
          error={charts.error}
          onRetry={() => void charts.refetch()}
          stale={stale}
          canCharts={canCharts}
          hero={(className) => data && heroRead.hero(data, className)}
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
