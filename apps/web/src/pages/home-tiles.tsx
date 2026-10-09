import type { ReactNode } from 'react'
import {
  Button,
  EmptyState,
  GlassCard,
  Icon,
  Minus,
  Skeleton,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  billions,
  cn,
  percent,
} from '@pv/ui'
import type { WorkstreamScorecard } from '@pv/contracts'
import type { Performance } from '@/data/performance'
import { deltaOf, funnelRate, num, type Delta } from './home-model'

/** Row one of the overview bento and the funnel that opens row two.
 *
 *  Tiles are built on `GlassCard`, not `StatCard`: the compact `StatCard`
 *  prints its label in uppercase mono, and here the label is the tile's
 *  sentence-case title (law 6). Every figure arrives as a prop, and every
 *  tile's head says what it covers: a period, a frozen snapshot, or now. */

/** Shared with `home-charts.tsx`: only the measured mark moves, never the tile
 *  (the global reduced-motion rule in the token file switches both off). */
export const GROW_WIDTH = 'transition-[width] duration-(--motion-duration) ease-(--motion-ease)'
export const GROW_HEIGHT = 'transition-[height] duration-(--motion-duration) ease-(--motion-ease)'

export const TILE = 'flex min-w-0 flex-col gap-3 p-4'
export const NOTE = 'text-muted-foreground text-[12px] leading-4'
/** The neutral mark. `surface-ink/28` measured 2.5:1 on the card; this hue is
 *  8.3:1 in Aurora and 7.9:1 in stone, over the 3:1 a graphic needs. */
export const NEUTRAL_MARK = 'bg-muted-foreground'
const BIG = 'tnum font-num text-[34px] font-semibold leading-none tracking-[-1.2px]'
const TITLE = 'text-[13px] font-semibold leading-5'

export function TileHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className={TITLE}>{title}</h3>
      {aside && <span className={NOTE}>{aside}</span>}
    </div>
  )
}

const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus }
/* Up is good for all three deltas on this screen (contracts, win rate, funnel). */
const DELTA_TONE = {
  up: 'text-success',
  down: 'text-warning',
  flat: 'text-muted-foreground',
}

function DeltaLine({ delta, children }: { delta: Delta | null; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4">
      {delta && (
        <span
          className={cn(
            'tnum font-num inline-flex items-center gap-1 font-semibold',
            DELTA_TONE[delta.direction],
          )}
        >
          <Icon icon={DELTA_ICON[delta.direction]} size={14} />
          {delta.text}
        </span>
      )}
      <span className="text-muted-foreground">{children}</span>
    </div>
  )
}

const versus = (data: Performance) =>
  data.previous ? `so với ${data.previous.label.toLowerCase()}` : 'kỳ đầu, chưa có mốc so'

/** The lead tile counts contracts: the scenario records which were signed and
 *  when, but not their value, and the note says so instead of a blank sum. */
export function SignedTile({ data, className }: { data: Performance; className?: string }) {
  const o = data.overview
  const top = Math.max(1, ...data.months.map((m) => m.signed))

  return (
    <GlassCard className={cn(TILE, 'sm:flex-row sm:gap-6', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <TileHead title="Hợp đồng đã ký" aside={data.period.short} />
        <div className="mt-auto flex flex-col gap-2">
          <span className={BIG}>{num(o.signedInPeriod)}</span>
          <DeltaLine
            delta={deltaOf(o.signedInPeriod, data.previous?.overview.signedInPeriod, 'count')}
          >
            {versus(data)}
          </DeltaLine>
          <span className={NOTE}>Kịch bản chưa ghi giá trị hợp đồng đã ký.</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 sm:w-48 sm:shrink-0">
        <span className={NOTE}>Số hợp đồng ký theo tháng</span>
        {/* In or out of the period is told by fill and by the label's weight. */}
        <div className="flex h-16 items-end gap-2">
          {data.months.map((m) => (
            <span
              key={m.key}
              className={cn(
                'min-h-0.5 flex-1 rounded-t-sm',
                GROW_HEIGHT,
                m.selected ? 'bg-primary' : NEUTRAL_MARK,
              )}
              style={{ height: `${(m.signed / top) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {data.months.map((m) => (
            <span
              key={m.key}
              className={cn(
                'tnum font-num flex-1 text-center text-[12px] leading-4',
                m.selected ? 'text-foreground font-semibold' : 'text-muted-foreground',
              )}
            >
              {m.short} · {num(m.signed)}
            </span>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

export function OpenValueTile({
  data,
  frozenDay,
  className,
}: {
  data: Performance
  frozenDay: string
  className?: string
}) {
  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead title="Giá trị đang mở" aside={`số chụp tại ${frozenDay}`} />
      <div className="mt-auto flex flex-col gap-2">
        <span className={BIG}>{billions(data.overview.openValue, 1)}</span>
        <span className={NOTE}>{num(data.overview.openDeals)} cơ hội đang mở</span>
      </div>
    </GlassCard>
  )
}

/** Read on the cohort, as the Performance screen reads it, and the denominator
 *  is printed: the same label on the workstream book means won over closed. */
export function WinRateTile({ data, className }: { data: Performance; className?: string }) {
  const o = data.overview
  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead title="Tỷ lệ thắng" aside={data.period.short} />
      <div className="mt-auto flex flex-col gap-2">
        <span className={BIG}>{o.winRate === null ? '—' : percent(o.winRate)}</span>
        <DeltaLine delta={deltaOf(o.winRate, data.previous?.overview.winRate, 'points')}>
          {versus(data)}
        </DeltaLine>
        <span className={cn(NOTE, 'tnum font-num')}>
          {num(o.won)} đã ký trên {num(o.sql)} lead của kỳ đã thành cơ hội
        </span>
      </div>
    </GlassCard>
  )
}

/** The live count of exactly the set its press opens in the list below, so
 *  the number and the rows cannot disagree.
 *
 *  A button wrapping a painted span rather than the card itself: the active
 *  ring is a shadow, and on the card it would replace the panel shadow. */
export function OverdueTile({
  score,
  failed,
  onRetry,
  scoped,
  active,
  onToggle,
  className,
}: {
  /** Undefined while loading, and after a failed read (`failed` tells which). */
  score: WorkstreamScorecard | undefined
  failed: boolean
  onRetry: () => void
  /** The book cut rows for scope, so this count is the reader's own share. */
  scoped: boolean
  active: boolean
  onToggle: () => void
  className?: string
}) {
  if (score === undefined) {
    return (
      <GlassCard className={cn(TILE, className)}>
        <TileHead title="Quá hạn" aside="hiện tại" />
        {failed ? (
          <div className="mt-auto flex flex-col items-start gap-2">
            <span className={NOTE}>Không tải được.</span>
            <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onRetry}>
              Thử lại
            </Button>
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-2">
            <Skeleton height={32} width="60%" />
            <Skeleton />
          </div>
        )}
      </GlassCard>
    )
  }

  const open = score.stages.reduce((n, s) => n + s.count, 0)
  const late = score.overdue

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'motion-std pointer-coarse:min-h-12 group relative block w-full cursor-pointer rounded-lg text-left',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        active && 'shadow-[0_0_0_2px_var(--ring)]',
        className,
      )}
    >
      <span className={cn('glass-a h-full rounded-lg', TILE)}>
        {/* Spans, not `TileHead`: a heading may not sit inside a button. */}
        <span className="flex items-baseline justify-between gap-3">
          <span className={TITLE}>Quá hạn</span>
          <span className={NOTE}>hiện tại</span>
        </span>
        <span className="mt-auto flex flex-wrap items-baseline gap-2">
          <span className={cn(BIG, late > 0 && 'text-warning')}>{num(late)}</span>
          <span className={NOTE}>
            / {num(open)} hành trình đang chạy{scoped && ' trong phạm vi của bạn'}
          </span>
        </span>
        <span className="bg-surface-ink/10 block h-2 overflow-hidden rounded-sm">
          <span
            className={cn('bg-warning block h-full rounded-sm', GROW_WIDTH)}
            style={{ width: open > 0 ? `${(late / open) * 100}%` : 0 }}
          />
        </span>
      </span>
      <span
        aria-hidden
        className="motion-std bg-surface-ink/0 group-hover:bg-surface-ink/8 pointer-events-none absolute inset-0 rounded-lg"
      />
    </button>
  )
}

/** Four steps of one cohort, each a subset of the one above, so a bar is
 *  never wider than the bar before it. */
export function FunnelTile({ data, className }: { data: Performance; className?: string }) {
  const first = data.funnel[0]
  const rate = funnelRate(data.funnel)

  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead
        title="Phễu chuyển đổi"
        aside={`${data.period.short} · số lượng · % từ bước trước`}
      />
      {/* Rate and delta share one line: the tile is one bento row tall. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={BIG}>{rate === null ? '—' : percent(rate, 1)}</span>
        <span className={NOTE}>lead thành hợp đồng</span>
        <DeltaLine delta={deltaOf(rate, funnelRate(data.previous?.funnel), 'points')}>
          {versus(data)}
        </DeltaLine>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-2">
        {data.funnel.map((step) => (
          <div key={step.key} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px]" title={step.label}>
                {step.label}
              </span>
              <span className="tnum font-num text-[18px] font-semibold leading-6">
                {num(step.count)}
              </span>
              <span className={cn(NOTE, 'tnum font-num w-10 text-right')}>
                {step.ratio === null ? '' : percent(step.ratio)}
              </span>
            </div>
            <div
              className={cn('bg-primary h-3 min-w-1 rounded-sm', GROW_WIDTH)}
              style={{
                width: `${first && first.count > 0 ? (step.count / first.count) * 100 : 0}%`,
              }}
            />
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

/** One cell of the bento while its figures load: same spans as the real tile. */
export function TileSkeleton({ className }: { className?: string }) {
  return (
    <GlassCard className={cn(TILE, className)}>
      <Skeleton width="40%" />
      <Skeleton height={32} width="60%" />
      <Skeleton />
    </GlassCard>
  )
}

/** The frozen figures did not load. One tile for the whole bento, with the
 *  retry the books offer: the filters are not what broke. */
export function ChartsFailed({
  detail,
  onRetry,
  className,
}: {
  detail: string
  onRetry: () => void
  className?: string
}) {
  return (
    <GlassCard className={cn(TILE, className)}>
      <EmptyState
        icon={TriangleAlert}
        message={`Không tải được số liệu biểu đồ. ${detail}`}
        action={{ label: 'Thử lại', onClick: onRetry }}
        className="py-12"
      />
    </GlassCard>
  )
}
