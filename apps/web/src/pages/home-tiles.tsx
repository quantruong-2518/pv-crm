import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowDown,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  Minus,
  Skeleton,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
  cn,
  percent,
  type IconGlyph,
} from '@pv/ui'
import type { SalesPerformanceResponse, WorkstreamScorecard } from '@pv/contracts'
import { deltaOf, money, num, rateOf, type Delta } from './home-model'

/** Shared parts of the overview bento and its three compact cards.
 *
 *  The cards follow the canvas design, not the flat Aurora card: this screen
 *  has the owner's waiver for radius, gradient and entry motion. They are plain
 *  elements rather than `GlassCard`, whose panel paint would replace the
 *  gradient. Heads do not print the period (the screen's header says it once);
 *  the open book carries a "now" line instead. The hero is `home-signed.tsx`. */

/** Shared with the chart tiles: only the measured mark moves, never the tile
 *  (the global reduced-motion rule in the token file switches both off). */
export const GROW_WIDTH = 'transition-[width] duration-(--motion-duration) ease-(--motion-ease)'
export const GROW_HEIGHT = 'transition-[height] duration-(--motion-duration) ease-(--motion-ease)'

export const TILE = 'flex min-w-0 flex-col gap-3 p-4'
export const NOTE = 'text-muted-foreground text-[12px] leading-4'
/** The neutral mark. `surface-ink/28` measured 2.5:1 on the card; this hue is
 *  8.3:1 in Aurora and 7.9:1 in stone, over the 3:1 a graphic needs. */
export const NEUTRAL_MARK = 'bg-muted-foreground'
export const BIG = 'tnum font-num text-[34px] font-semibold leading-none tracking-[-1.2px]'
const TITLE = 'text-[13px] font-semibold leading-5'

/* The card shell: lifts on hover and rises in on first paint (`starting:`). */
export const CARD_SHELL = cn(
  'bg-card flex min-w-0 rounded-3xl p-5 [box-shadow:var(--shadow-panel)]',
  'starting:translate-y-3 starting:opacity-0 transition duration-500 hover:-translate-y-0.5',
  'motion-reduce:transition-none',
)
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
  up: 'text-success bg-success/15',
  down: 'text-warning bg-warning/15',
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

/** The open book as it stands now: it keeps no history, so the picker does
 *  not move this tile and it has nothing to compare with. A deal with no
 *  amount is missing from the sum, so the strip shows how much of the book the
 *  sum covers, in proportion rather than a mark per deal. */
export function OpenValueTile({ data, className }: Figures) {
  const { count, amountVnd, blank } = data.open
  const valued = count - blank
  return (
    <section
      className={cn(
        CARD_SHELL,
        'bg-linear-to-br from-card to-primary/10 flex-col gap-3 from-55%',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile
            icon={Wallet}
            className="from-primary/30 to-primary/10 text-accent-foreground bg-linear-to-br"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className={CARD_TITLE}>Giá trị cơ hội đang mở</h3>
            <span className={cn(NOTE, 'tnum font-num')}>
              <strong className="text-foreground font-semibold">{num(count)} cơ hội</strong>, tính
              đến hôm nay
            </span>
          </div>
        </div>
        <span className={CARD_BIG}>{money(amountVnd)}</span>
      </div>
      {count > 0 && (
        <div className="flex flex-col gap-2">
          <div aria-hidden className="flex h-2.5 gap-1">
            <span
              style={cssVars({ '--w': `${(valued / count) * 100}%` })}
              className="from-primary-strong to-primary w-(--w) bg-linear-to-r ease-(--motion-ease) starting:w-0 rounded-full transition-[width] duration-1000"
            />
            {blank > 0 && (
              <span
                style={cssVars({ '--w': `${(blank / count) * 100}%` })}
                className="bg-warning/20 w-(--w) ease-(--motion-ease) starting:w-0 min-w-1 rounded-full bg-[repeating-linear-gradient(45deg,var(--warning)_0_3px,transparent_3px_6px)] transition-[width] duration-1000"
              />
            )}
          </div>
          <span className={cn(NOTE, 'tnum font-num')}>
            {blank > 0 ? (
              <>
                <strong className="text-foreground font-semibold">{num(valued)}</strong> có giá trị
                · <strong className="text-warning font-semibold">{num(blank)}</strong> chưa nhập giá
                trị, chưa tính vào tổng
              </>
            ) : (
              'Tất cả đã có giá trị'
            )}
          </span>
        </div>
      )}
    </section>
  )
}

const winRate = ({ wonDeals, lostDeals }: SalesPerformanceResponse['current']) =>
  rateOf(wonDeals, wonDeals + lostDeals)

/** The 80px ring: the arc draws in on first paint and eases when the rate moves. */
function WinRing({ rate }: { rate: number }) {
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 64 64" role="img" aria-label={`Tỷ lệ thắng ${percent(rate)}`}>
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
            'ease-(--motion-ease) transition-[stroke-dashoffset] duration-1000',
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

/** Won over won plus lost, by the day each deal closed in the period
 *  (ADR 0088 §7) — the KPI definition. A dash when nothing closed. */
export function WinRateTile({ data, className }: Figures) {
  const { wonDeals, lostDeals } = data.current
  const rate = winRate(data.current)
  const delta = deltaOf(rate, winRate(data.compare.figures), 'points')
  return (
    <section
      className={cn(
        CARD_SHELL,
        'bg-linear-to-br from-card to-success/10 items-center justify-between gap-4 from-55%',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconTile
          icon={Target}
          className="from-success/30 to-success/10 text-success bg-linear-to-br"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-col gap-1">
            <h3 className={CARD_TITLE}>Tỷ lệ thắng</h3>
            <span className={cn(NOTE, 'tnum font-num')}>
              {rate === null ? (
                'Chưa có cơ hội đóng trong kỳ'
              ) : (
                <>
                  <strong className="text-foreground font-semibold">{num(wonDeals)} thắng</strong>{' '}
                  trên {num(wonDeals + lostDeals)} cơ hội đã đóng
                </>
              )}
            </span>
          </div>
          {rate !== null &&
            (delta ? (
              <DeltaLine delta={delta} />
            ) : (
              <span className={NOTE}>Kỳ trước chưa có cơ hội đóng</span>
            ))}
        </div>
      </div>
      {rate === null ? <span className={CARD_BIG}>—</span> : <WinRing rate={rate} />}
    </section>
  )
}

/** The live count of exactly the set its press opens in the list below, so
 *  the number and the rows cannot disagree. */
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
      <GlassCard className={cn(TILE, 'rounded-3xl', className)}>
        <TileHead title="Hành trình quá hạn" aside="hiện tại" />
        {failed ? (
          <div className="mt-auto flex flex-col items-start gap-2">
            <span className={cn(NOTE, 'text-destructive-foreground')}>Không tải được.</span>
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
        CARD_SHELL,
        'pointer-coarse:min-h-12 w-full cursor-pointer items-center justify-between gap-4 text-left',
        'bg-linear-to-br from-warning/10 via-warning/20 to-warning/30',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        active && '[box-shadow:0_0_0_2px_var(--ring),var(--shadow-panel)]',
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <IconTile icon={Timer} className="text-warning bg-card/75" />
        <span className="flex min-w-0 flex-col gap-1">
          {/* Spans, not `TileHead`: a heading may not sit inside a button. */}
          <span className="flex items-center gap-2">
            <span className={CARD_TITLE}>Hành trình quá hạn</span>
            <span aria-hidden className="relative flex size-2">
              <span className="bg-destructive absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none" />
              <span className="bg-destructive relative size-2 rounded-full" />
            </span>
          </span>
          <span className={cn(NOTE, 'tnum font-num')}>
            Trên <strong className="text-foreground font-semibold">{num(open)}</strong> hành trình
            đang chạy{scoped && ' trong phạm vi của bạn'}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <span className={cn(CARD_BIG, late > 0 && 'text-warning')}>{num(late)}</span>
        <span className="bg-card/80 text-warning inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold leading-4">
          {active ? 'Bỏ lọc' : `Xem ${num(late)} hành trình`}
          <Icon icon={ArrowDown} size={14} />
        </span>
      </span>
    </button>
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
  return (
    <GlassCard className={cn(TILE, 'rounded-3xl', className)}>
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        message={`Không tải được số liệu biểu đồ. ${detail}`}
        action={{ label: 'Thử lại', onClick: onRetry }}
        className="py-12"
      />
    </GlassCard>
  )
}
