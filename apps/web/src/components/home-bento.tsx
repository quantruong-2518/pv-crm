import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  ContractSummary,
  LeadScorecard,
  OpportunityHistogram,
  OpportunityScorecard,
} from '@pv/contracts'
import { DUE_NEAR_DAYS } from '@pv/engines'
import {
  BarChart,
  BriefCard,
  EmptyState,
  GlassCard,
  Inbox,
  SectionTitle,
  Skeleton,
  Sparkline,
  StatCard,
  Target,
  cn,
  type BarDatum,
} from '@pv/ui'
import { money, ratio, type DeskView } from '@/data/home'

/** Tier 1 of the home screen — the department's figures, as one bento.
 *
 *  Six cells of four different sizes rather than a four-up score grid: the
 *  money block is the only thing here anyone opens this screen for, and a row
 *  of equal tiles gave it the same weight as the win rate. Spans are declared
 *  in `DeskBento` and nowhere else, so the shape of the grid is readable in one
 *  place instead of being scattered across six components.
 *
 *  Each cell is gated on the permission behind its query (`data/home.ts`): a
 *  disabled query returns nothing, and a cell printing 0 ₫ for a book the
 *  reader may not open is a lie rather than an empty state. */

const BENTO = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6'

const HERO_CELL = 'md:col-span-2 lg:col-span-3 lg:row-span-2'
const HALF_CELL = 'md:col-span-2 lg:col-span-3'

export function DeskBento({ desk }: { desk: DeskView }) {
  /* Spans above are tuned to fill 6 columns when every book is open. A role
     left with only one cell (e.g. `lead.view` alone → just `Funnel`) would
     otherwise keep a half-width span and leave the rest of the row empty. */
  const visible =
    (desk.can.ops || desk.can.contract ? 1 : 0) +
    (desk.can.ops ? 3 : 0) +
    (desk.can.contract ? 1 : 0) +
    (desk.can.lead ? 1 : 0)
  const span = (base: string) => (visible === 1 ? 'lg:col-span-full' : base)

  return (
    <div className={BENTO}>
      {desk.can.ops || desk.can.contract ? (
        <MoneyHero
          scorecard={desk.scorecard}
          contracts={desk.contracts}
          canOps={desk.can.ops}
          canContract={desk.can.contract}
          className={span(HERO_CELL)}
        />
      ) : null}
      {desk.can.ops ? (
        <WinRate scorecard={desk.scorecard} className={span('lg:col-span-1')} />
      ) : null}
      {desk.can.ops ? (
        <DealAlert histogram={desk.histogram} className={span('lg:col-span-2')} />
      ) : null}
      {desk.can.contract ? (
        <MoneyAlert contracts={desk.contracts} className={span(HALF_CELL)} />
      ) : null}
      {desk.can.ops ? (
        <PipelineBoard histogram={desk.histogram} className={span(HALF_CELL)} />
      ) : null}
      {desk.can.lead ? <Funnel funnel={desk.funnel} className={span(HALF_CELL)} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE HERO — the four amounts, each printed exactly once
// ---------------------------------------------------------------------------

/** Sparkline geometry, from `Sparkline`'s own viewBox. Eight points because the
 *  component steps x by 12 across a fixed 86px box; a ninth would fall off. */
const SPARK_HEIGHT = 26
const SPARK_POINTS = 8
/** Below this many months, `Sparkline`'s last point still snaps to x=86 while
 *  earlier ones step by 12 — the final segment stretches out of proportion and
 *  reads as a move that never happened. Skip the line rather than show that. */
const SPARK_MIN_POINTS = 6

/** Amounts → the y coordinates `Sparkline` wants (INVERTED, 0 is the box top),
 *  plus the count actually plotted — callers must report THIS count as the
 *  source, not the server's full month list, or the label lies about the line. */
function spark(values: number[]): { points: number[]; monthCount: number } {
  const tail = values.slice(-SPARK_POINTS)
  const top = Math.max(...tail, 0)
  const points =
    top === 0
      ? tail.map(() => SPARK_HEIGHT)
      : tail.map((v) => SPARK_HEIGHT - (v / top) * SPARK_HEIGHT)
  return { points, monthCount: tail.length }
}

function Figure({
  label,
  value,
  note,
  children,
}: {
  label: string
  value: string
  note: string
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
      <span className="tnum font-num text-[34px] font-semibold leading-none tracking-[-1.2px]">
        {value}
      </span>
      <span className="text-muted-foreground text-[11px] leading-[1.5]">{note}</span>
      {children}
    </div>
  )
}

function MiniFigure({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note: string
  tone?: 'danger'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span
        className={cn(
          'tnum font-num text-[18px] font-semibold leading-none',
          tone === 'danger' && 'text-destructive-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[10.5px] leading-[1.5]">{note}</span>
    </div>
  )
}

/** Signed and collected large, open and overdue small.
 *
 *  NOT a funnel and nothing here may call it one — the four amounts share a
 *  unit and a screen, not a denominator. Open pipeline is a forecast, signed is
 *  the whole book, collected is cash. Each amount appears here and nowhere else
 *  on the screen; the alert cards below carry counts, not money already shown.
 *
 *  Gated per cluster, not as one block: the contract figures (signed,
 *  collected, overdue) answer to `canContract`, the open-pipeline figure
 *  answers to `canOps` — a role holding only one permission must not see the
 *  other book default to 0 ₫ next to it. */
export function MoneyHero({
  scorecard,
  contracts,
  canOps,
  canContract,
  className,
}: {
  scorecard: OpportunityScorecard | undefined
  contracts: ContractSummary | undefined
  canOps: boolean
  canContract: boolean
  className?: string
}) {
  const open = scorecard?.openAmountVnd ?? 0
  const openBlank = scorecard?.openBlank ?? 0
  const signed = contracts?.signedAmountVnd ?? 0
  const collected = contracts?.collectedVnd ?? 0
  const overdue = contracts?.overdueVnd ?? 0
  const trend = spark((contracts?.byMonth ?? []).map((m) => m.signedAmountVnd))

  const kicker =
    canOps && canContract
      ? 'Sổ cơ hội · sổ hợp đồng · cả sổ'
      : canContract
        ? 'Sổ hợp đồng · cả sổ'
        : 'Sổ cơ hội · cả sổ'

  return (
    <GlassCard className={cn('flex flex-col gap-4 p-5', className)}>
      <SectionTitle kicker={kicker} size="detail">
        Tiền
      </SectionTitle>

      {canContract ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Figure
            label="Đã ký"
            value={money(signed)}
            note={`${contracts?.signedCount ?? 0} hợp đồng`}
          >
            {/* The only real time series the server can produce today. Everything
                else here is a snapshot, and a snapshot must not be given a
                sparkline just because the block looks bare without one. */}
            {trend.monthCount < SPARK_MIN_POINTS ? null : (
              <Sparkline
                points={trend.points}
                source={`${trend.monthCount} tháng`}
                tone="success"
              />
            )}
          </Figure>
          <Figure
            label="Đã thu"
            value={money(collected)}
            note={`${ratio(collected, contracts?.scheduledVnd ?? 0)} của lịch thu`}
          />
        </div>
      ) : null}

      <div className="mt-auto grid gap-4 sm:grid-cols-2">
        {canOps ? (
          <MiniFigure
            label="Đang mở"
            value={money(open)}
            note={
              openBlank === 0
                ? `${scorecard?.open ?? 0} cơ hội`
                : `${scorecard?.open ?? 0} cơ hội · ${openBlank} chưa có tiền`
            }
          />
        ) : null}
        {canContract ? (
          <MiniFigure
            label="Quá hạn thu"
            value={money(overdue)}
            note={overdue === 0 ? 'không đồng nào trễ' : `${contracts?.overdueCount ?? 0} đợt`}
            tone={overdue === 0 ? undefined : 'danger'}
          />
        ) : null}
      </div>
    </GlassCard>
  )
}

export function WinRate({
  scorecard,
  className,
}: {
  scorecard: OpportunityScorecard | undefined
  className?: string
}) {
  const won = scorecard?.won ?? 0
  const care = scorecard?.care ?? 0
  const decided = won + care

  return (
    <StatCard
      size="compact"
      icon={Target}
      value={ratio(won, decided)}
      label="Tỷ lệ thắng"
      source={
        decided === 0 ? 'Sổ cơ hội · chưa đơn nào đóng' : `${won} thắng · ${care} vào chăm sóc`
      }
      className={className}
    />
  )
}

// ---------------------------------------------------------------------------
// THE TWO ALERTS — computed, never written by hand
// ---------------------------------------------------------------------------

/** Deals past the limit of the column they stand in. The amount lives here and
 *  not in the hero: no other block prints rotting money. */
export function DealAlert({
  histogram,
  className,
}: {
  histogram: OpportunityHistogram | undefined
  className?: string
}) {
  const buckets = histogram?.buckets ?? []
  const rotting = buckets.reduce((n, b) => n + b.rotting, 0)
  const rottingAmount = buckets.reduce((n, b) => n + b.rottingAmountVnd, 0)
  const worst = [...buckets].sort((a, b) => b.rotting - a.rotting)[0]

  return (
    <BriefCard
      className={className}
      state={rotting === 0 ? 'ok' : 'warning'}
      title={rotting === 0 ? 'Không đơn nào quá hạn cột' : `${rotting} đơn quá hạn cột`}
      badge={{ label: 'Cơ hội', tone: rotting === 0 ? 'success' : 'warning' }}
      description={
        rotting === 0
          ? 'Mọi đơn đang mở còn trong hạn cột.'
          : `${money(rottingAmount)} treo quá hạn${worst === undefined ? '' : `, đọng ở cột ${worst.label}`}.`
      }
      /* No objects: a stage key is not an object code, and `RailObject` renders
         it in the same mono chip ContextRail uses for real codes. */
      objects={[]}
    />
  )
}

/** Late collection, as a COUNT plus what is coming. The overdue amount is in
 *  the hero, so repeating it here would be the same figure twice. */
export function MoneyAlert({
  contracts,
  className,
}: {
  contracts: ContractSummary | undefined
  className?: string
}) {
  const overdueCount = contracts?.overdueCount ?? 0
  const dueSoonCount = contracts?.dueSoonCount ?? 0
  const dueSoon = contracts?.dueSoonVnd ?? 0
  const soon =
    dueSoonCount === 0
      ? `Không đợt nào tới hạn trong ${DUE_NEAR_DAYS} ngày.`
      : `${dueSoonCount} đợt tới hạn trong ${DUE_NEAR_DAYS} ngày · ${money(dueSoon)}.`

  return (
    <BriefCard
      className={className}
      state={overdueCount === 0 ? 'ok' : 'bad'}
      title={overdueCount === 0 ? 'Không đợt thu nào trễ' : `${overdueCount} đợt thu quá hạn`}
      badge={{ label: 'Hợp đồng', tone: overdueCount === 0 ? 'success' : 'danger' }}
      description={soon}
      objects={[]}
    />
  )
}

// ---------------------------------------------------------------------------
// THE TWO CHARTS
// ---------------------------------------------------------------------------

/** Open pipeline split across the columns it is standing in. */
export function PipelineBoard({
  histogram,
  className,
}: {
  histogram: OpportunityHistogram | undefined
  className?: string
}) {
  const navigate = useNavigate()
  const buckets = histogram?.buckets ?? []

  const data: BarDatum[] = buckets.map((b) => ({
    key: b.stage,
    label: b.label,
    value: b.amountVnd,
    display: money(b.amountVnd),
    note: b.rotting === 0 ? `${b.count} đơn` : `${b.count} đơn · ${b.rotting} quá hạn`,
    tone: b.rotting === 0 ? 'primary' : 'warning',
  }))

  return (
    <GlassCard className={cn('flex flex-col gap-4 p-5', className)}>
      <SectionTitle kicker="Sổ cơ hội" size="detail">
        Pipeline theo chặng
      </SectionTitle>
      {data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Không có đơn nào đang mở."
          action={{ label: 'Mở sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
        />
      ) : (
        // Funnel beside this cell is 4 bar rows tall (~220px); a taller barArea
        // here closes most of that gap without chasing an exact pixel match.
        <BarChart
          data={data}
          orientation="column"
          height={150}
          source="Đơn đang mở · cả sổ · hạn cột từ Thiết lập"
        />
      )}
    </GlassCard>
  )
}

/** Lead, first meeting, deal, contract — the four counts the lead scorecard
 *  already returns, each with its drop from the step above.
 *
 *  Deliberately NOT the funnel on the Performance screen: that one measures
 *  tier conversion over a chosen period, this one counts the whole book against
 *  events that happened. The source line says which is which. */
export function Funnel({
  funnel,
  className,
}: {
  funnel: LeadScorecard | undefined
  className?: string
}) {
  const leads = funnel?.leads ?? 0
  const steps = [
    { key: 'lead', label: 'Lead vào sổ', value: leads },
    { key: 'met', label: 'Đã gặp mặt', value: funnel?.firstMeetings ?? 0 },
    { key: 'opportunity', label: 'Thành cơ hội', value: funnel?.opportunities ?? 0 },
    { key: 'contract', label: 'Thành hợp đồng', value: funnel?.contracts ?? 0 },
  ]

  const data: BarDatum[] = steps.map((s, i) => {
    const prev = steps[i - 1]?.value ?? 0
    return {
      key: s.key,
      label: s.label,
      value: s.value,
      display: String(s.value),
      note: i === 0 ? 'toàn bộ sổ' : `${ratio(s.value, prev)} của bậc trên`,
      tone: 'primary',
    }
  })

  return (
    <GlassCard className={cn('flex flex-col gap-4 p-5', className)}>
      <SectionTitle kicker="Sổ lead" size="detail">
        Phễu cả sổ
      </SectionTitle>
      <BarChart
        data={data}
        orientation="bar"
        max={leads}
        source="Thẻ điểm lead · cả sổ · chuyển bậc ở màn Hiệu suất"
      />
    </GlassCard>
  )
}

/** The bento while the desk is loading — the same six cells at the same spans,
 *  so nothing jumps sideways when the numbers land. */
export function DeskSkeleton() {
  return (
    <div className={BENTO}>
      <Skeleton className={cn('h-[280px]', HERO_CELL)} />
      <Skeleton className="h-[124px] lg:col-span-1" />
      <Skeleton className="h-[124px] lg:col-span-2" />
      <Skeleton className={cn('h-[124px]', HALF_CELL)} />
      <Skeleton className={cn('h-[220px]', HALF_CELL)} />
      <Skeleton className={cn('h-[220px]', HALF_CELL)} />
    </div>
  )
}
