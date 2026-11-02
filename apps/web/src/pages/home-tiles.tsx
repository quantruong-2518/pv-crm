import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  Minus,
  Skeleton,
  Route,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  cn,
  percent,
  type IconGlyph,
} from '@pv/ui'
import type { SalesDayRange, SalesPerformanceResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { CARD, ICON_TONE, MARK_EASE, WASH, WASH_WARN } from './home-look'
import {
  WORKSTREAM_BOOK_HREF,
  dealsHref,
  deltaOf,
  liveRunsQuery,
  num,
  rateOf,
  runsHref,
  stoppedRunsQuery,
  type Delta,
} from './home-model'

/** Shared parts of the overview bento and its three compact cards.
 *
 *  The look lives in `home-look.ts` (ADR 0106 §5a). Row one is `<section>` +
 *  CARD_SHELL, row two is `GlassCard` + CHART_TILE; both wear a wash. Each card
 *  enters once; only links react to the pointer, and only marks move with the
 *  data. Heads do not print the period (the screen's header says it once); the
 *  open book carries a "now" line instead. The hero is `home-signed.tsx`. */

/** The KPI weekly chart's bar motion: only the measured mark moves, never the tile
 *  (the global reduced-motion rule in the token file switches both off).
 *  The width twin lives in `components/period-picker-style.ts`. */
export const GROW_HEIGHT = 'transition-[height] duration-(--motion-duration) ease-(--motion-ease)'

export const TILE = 'flex min-w-0 flex-col gap-3 p-4'
export const NOTE = 'text-muted-foreground text-[12px] leading-4'
/** The neutral mark. `surface-ink/28` measured 2.5:1 on the card; this hue is
 *  8.3:1 in Aurora and 7.9:1 in stone, over the 3:1 a graphic needs. */
export const NEUTRAL_MARK = 'bg-muted-foreground'
export const BIG = 'tnum font-num text-[34px] font-semibold leading-none tracking-[-1.2px]'
const TITLE = 'text-[13px] font-semibold leading-5'

/** A small pill link inside a card; the coarse floor keeps it a 48px target. */
export const PILL_LINK = cn(
  'bg-surface-ink/10 hover:bg-surface-ink/15 pointer-coarse:min-h-12 inline-flex items-center gap-2',
  'rounded-full px-3 py-1 text-[12px] font-semibold leading-4',
  'duration-(--motion-duration) ease-(--motion-ease) transition-colors',
  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
  'motion-reduce:transition-none',
)

/** Focus ring and the 48px coarse floor for a link that is not a pill. */
const TILE_LINK = cn(
  'pointer-coarse:min-h-12 pointer-coarse:min-w-12 inline-flex items-center justify-center',
  'motion-reduce:transition-none',
  'duration-(--motion-duration) ease-(--motion-ease) transition-colors',
  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
)

/* The card shell: a card is not clickable, so it enters once and never moves. */
export const CARD_SHELL = cn('bg-card flex min-w-0 p-5', CARD)
const CARD_TITLE = 'text-[14px] font-semibold leading-5'
const CARD_BIG =
  'tnum font-num text-[32px] font-bold leading-9 tracking-[-0.025em] whitespace-nowrap'
const RING_CIRCLE = 'fill-none'
const RING_R = 26
const RING_LENGTH = 2 * Math.PI * RING_R

/** Custom properties on an element: React's `style` type does not name them. */
const cssVars = (vars: Record<string, string>) => vars as CSSProperties

export function TileHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className={TITLE}>{title}</h3>
      {aside && <span className={NOTE}>{aside}</span>}
    </div>
  )
}

/** The square gradient tile that holds a card's icon. */
export function IconTile({
  icon,
  className,
  size = 'size-10 rounded-[14px]',
}: {
  icon: IconGlyph
  className: string
  size?: string
}) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center', size, className)}>
      <Icon icon={icon} size={18} />
    </span>
  )
}

const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus }
/* Up is good for every delta on this screen. */
const DELTA_TONE = {
  up: 'text-on-tint-success bg-success/10',
  down: 'text-on-tint-warning bg-warning/10',
  flat: 'text-muted-foreground bg-surface-ink/10',
}

/** The change against the compared span, as a pill; the words after it ride
 *  in the same pill. With no delta only the words print, as plain text. */
export function DeltaLine({ delta, children }: { delta: Delta | null; children?: ReactNode }) {
  if (!delta) return children ? <span className="text-muted-foreground">{children}</span> : null
  return (
    <span
      className={cn(
        'tnum font-num inline-flex items-center gap-1 self-start rounded-full px-2 py-1',
        'text-[12px] font-semibold leading-4',
        DELTA_TONE[delta.direction],
      )}
    >
      <Icon icon={DELTA_ICON[delta.direction]} size={14} />
      {delta.text}
      {children && ` ${children}`}
    </span>
  )
}

type Figures = { data: SalesPerformanceResponse; className?: string }

/** Closed = won + lost + terminated (ADR 0107): a broken contract is not a win. */
const closedOf = (f: SalesPerformanceResponse['current']) =>
  f.wonDeals + f.lostDeals + f.terminatedDeals

const winRate = (f: SalesPerformanceResponse['current']) => rateOf(f.wonDeals, closedOf(f))

/** The 80px ring: the arc draws in on first paint and eases when the rate moves. */
function WinRing({ rate }: { rate: number }) {
  const { t } = useI18n()
  return (
    <div className="relative size-20 shrink-0">
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={t(
          message(
            `Tỷ lệ chốt đơn ${percent(rate)}`,
            `Win rate ${percent(rate)}`,
            `수주율 ${percent(rate)}`,
          ),
        )}
      >
        <circle
          cx={32}
          cy={32}
          r={RING_R}
          strokeWidth={7}
          className={cn(RING_CIRCLE, 'stroke-surface-ink/10')}
        />
        <circle
          cx={32}
          cy={32}
          r={RING_R}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          transform="rotate(-90 32 32)"
          style={cssVars({ '--arc': `${RING_LENGTH * (1 - rate)}`, '--full': `${RING_LENGTH}` })}
          className={cn(
            RING_CIRCLE,
            'stroke-success starting:[stroke-dashoffset:var(--full)] [stroke-dashoffset:var(--arc)]',
            `transition-[stroke-dashoffset] ${MARK_EASE}`,
          )}
        />
      </svg>
      <span
        aria-hidden
        className="tnum font-num absolute inset-0 flex items-center justify-center text-[20px] font-bold leading-6 tracking-[-0.02em]"
      >
        {percent(rate)}
      </span>
    </div>
  )
}

/** Won over every deal closed in the period, by the day each closed
 *  (ADR 0088 §7, 0107) — the KPI definition. A dash when nothing closed. */
export function WinRateTile({ data, className }: Figures) {
  const { t } = useI18n()
  const { wonDeals } = data.current
  const canView = useCan('opportunity.view')
  const rate = winRate(data.current)
  const delta = deltaOf(rate, winRate(data.compare.figures), 'points')
  return (
    <section className={cn(CARD_SHELL, WASH, 'items-center justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <IconTile icon={Target} className={ICON_TONE.success} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-col gap-1">
            <h3 className={CARD_TITLE}>{t(message('Tỷ lệ chốt đơn', 'Win rate', '수주율'))}</h3>
            <span className={cn(NOTE, 'tnum font-num')}>
              {rate === null
                ? t(
                    message(
                      'Chưa có cơ hội đóng trong kỳ',
                      'No opportunities closed in this period',
                      '이번 기간에 종료된 기회가 없습니다',
                    ),
                  )
                : t(
                    message(
                      `Tỷ lệ ký hợp đồng / cơ hội (${num(wonDeals)}/${num(closedOf(data.current))})`,
                      `Contracts signed / opportunities (${num(wonDeals)}/${num(closedOf(data.current))})`,
                      `계약 체결 / 기회 (${num(wonDeals)}/${num(closedOf(data.current))})`,
                    ),
                  )}
            </span>
            {canView && wonDeals > 0 && (
              <Link to={dealsHref('won', data.span)} className={cn(PILL_LINK, 'self-start')}>
                {t(message('Xem hợp đồng đã ký', 'View signed contracts', '체결된 계약 보기'))}
                <Icon icon={ArrowRight} size={14} />
              </Link>
            )}
          </div>
          {delta && <DeltaLine delta={delta} />}
        </div>
      </div>
      {rate === null ? <span className={CARD_BIG}>—</span> : <WinRing rate={rate} />}
    </section>
  )
}

/** Journeys stopped in the period over journeys running in it. Both counts
 *  are the `total` of the book queries their links open, so the number always
 *  equals the list; the button opens the book whole. */
export function RunsTile({
  stopped,
  live,
  span,
  failed,
  onRetry,
  className,
}: {
  /** Undefined while loading, and after a failed read (`failed` tells which). */
  stopped: number | undefined
  live: number | undefined
  span: SalesDayRange
  failed: boolean
  onRetry: () => void
  className?: string
}) {
  const { t } = useI18n()
  if (stopped === undefined || live === undefined) {
    return (
      <GlassCard className={cn(TILE, 'rounded-3xl', className)}>
        <TileHead
          title={t(message('Hành trình đã dừng', 'Stopped workstreams', '중지된 영업 건'))}
        />
        {failed ? (
          <div className="mt-auto flex flex-col items-start gap-2">
            <span className={cn(NOTE, 'text-destructive-foreground')}>
              {t(message('Không tải được.', 'Could not load.', '불러오지 못했습니다.'))}
            </span>
            <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onRetry}>
              {t(message('Thử lại', 'Retry', '다시 시도'))}
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

  /* A warning tint says "look at this": only a stop earns it. */
  const warn = stopped > 0

  return (
    <section
      className={cn(
        CARD_SHELL,
        warn ? WASH_WARN : WASH,
        'w-full items-center justify-between gap-4',
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <IconTile icon={Route} className={warn ? ICON_TONE.warning : ICON_TONE.neutral} />
        <span className="flex min-w-0 flex-col gap-1">
          <h3 className={CARD_TITLE}>
            {t(message('Hành trình đã dừng', 'Stopped workstreams', '중지된 영업 건'))}
          </h3>
          <span className={cn(NOTE, 'tnum font-num flex flex-wrap items-center gap-x-1')}>
            {t(message('trên', 'out of', '중'))}
            <Link
              to={runsHref(liveRunsQuery(span))}
              className={cn(TILE_LINK, 'text-foreground gap-1 font-semibold underline')}
            >
              {t(
                message(
                  `${num(live)} hành trình đang chạy trong kỳ`,
                  `${num(live)} workstreams active in this period`,
                  `이번 기간 활성 영업 건 ${num(live)}개`,
                ),
              )}
            </Link>
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        {warn ? (
          <Link
            to={runsHref(stoppedRunsQuery(span))}
            aria-label={t(
              message(
                `${num(stopped)} hành trình đã dừng`,
                `${num(stopped)} stopped workstreams`,
                `중지된 영업 건 ${num(stopped)}개`,
              ),
            )}
            className={cn(TILE_LINK, 'underline-offset-4 hover:underline')}
          >
            <span className={cn(CARD_BIG, 'text-on-tint-warning')}>{num(stopped)}</span>
          </Link>
        ) : (
          <span className={CARD_BIG}>{num(stopped)}</span>
        )}
        <Link to={WORKSTREAM_BOOK_HREF} className={cn(PILL_LINK, 'whitespace-nowrap')}>
          {t(message('Xem tất cả hành trình', 'View all workstreams', '모든 영업 건 보기'))}
          <Icon icon={ArrowRight} size={14} />
        </Link>
      </span>
    </section>
  )
}

/** One cell of the bento while its figures load: same spans as the real tile. */
export function TileSkeleton({ className }: { className?: string }) {
  return (
    <GlassCard className={cn(TILE, 'rounded-3xl', className)}>
      <Skeleton width="40%" />
      <Skeleton height={32} width="60%" />
      <Skeleton />
    </GlassCard>
  )
}

/** The period figures did not load. One tile for the whole bento, with the
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
  const { t } = useI18n()
  return (
    <GlassCard className={cn(TILE, 'rounded-3xl', className)}>
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        message={`${t(message('Không tải được số liệu biểu đồ.', 'Could not load chart data.', '차트 데이터를 불러오지 못했습니다.'))} ${detail}`}
        action={{ label: t(message('Thử lại', 'Retry', '다시 시도')), onClick: onRetry }}
        className="py-12"
      />
    </GlassCard>
  )
}
