import type { ReactNode } from 'react'
import {
  ArrowDown,
  Check,
  Filter,
  GlassCard,
  Icon,
  TrendingDown,
  cn,
  percent,
  type IconGlyph,
} from '@pv/ui'
import type { SalesPerformanceResponse } from '@pv/contracts'
import { funnelOf, num, rateOf } from './home-model'
import { rangeLabel } from './home-period'
import { IconTile } from './home-tiles'

/** The funnel of row two: the leads that entered the book in the period, and
 *  how many of them reached each step by now. Every step counts leads of the
 *  same cohort, so no bar is wider than the first.
 *
 *  It carries no delta: a young cohort always loses to a mature one, so the
 *  comparison would punish the running period. The two cells under the steps
 *  say instead where the cohort thins out and how well a deal closes. They
 *  carry no button: neither book can open "the leads that stopped between two
 *  steps" from an address. */

/** Card motion shared by the three chart tiles: a rise on mount and a lift on
 *  hover. Only transform and opacity move; reduced motion switches both off. */
export const LIFT =
  'rounded-3xl p-6 gap-5 transition-[opacity,translate] duration-500 ease-out starting:translate-y-3 starting:opacity-0 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0'

const TONE = {
  primary: 'from-primary/25 to-primary/10 text-on-tint-primary',
  success: 'from-success/25 to-success/10 text-on-tint-success',
  destructive: 'from-destructive/25 to-destructive/10 text-on-tint-destructive',
}

/** The stat cards' icon tile at the chart tiles' size, in one of three tones. */
export function ToneTile({ icon, tone }: { icon: IconGlyph; tone: keyof typeof TONE }) {
  return (
    <IconTile icon={icon} size="size-9 rounded-xl" className={cn('bg-linear-to-br', TONE[tone])} />
  )
}

type Step = ReturnType<typeof funnelOf>[number]
type Drop = { from: Step; to: Step; lost: number }

/* Chip, bar and glow per step: blue to teal to green, so the last step reads as the win. The
   first step starts at primary-strong, the darkest blue that still reads on the dark card. */
const STEP_LOOK = [
  {
    chip: 'bg-primary-strong text-primary-foreground',
    bar: 'from-primary-strong to-primary',
    glow: 'shadow-[0_6px_16px_color-mix(in_oklab,var(--primary)_20%,transparent)]',
  },
  {
    chip: 'bg-primary text-primary-foreground',
    bar: 'from-primary to-channel-meeting',
    glow: 'shadow-[0_6px_16px_color-mix(in_oklab,var(--primary)_20%,transparent)]',
  },
  {
    chip: 'bg-channel-meeting text-background',
    bar: 'from-channel-meeting to-success',
    glow: 'shadow-[0_6px_16px_color-mix(in_oklab,var(--primary)_20%,transparent)]',
  },
  {
    chip: 'bg-success text-background',
    bar: 'from-success to-success/70',
    glow: 'shadow-[0_6px_16px_color-mix(in_oklab,var(--success)_28%,transparent)]',
  },
]

const ROW = 'grid grid-cols-[172px_minmax(0,1fr)_72px] items-center gap-4'
const SUB = 'text-muted-foreground text-[12px] leading-4'

/** The adjacent pair that lost the most leads in absolute count, or null when none lost any. */
function biggestDrop(steps: readonly Step[]): Drop | null {
  let best: Drop | null = null
  for (let i = 1; i < steps.length; i += 1) {
    const from = steps[i - 1]!
    const to = steps[i]!
    const lost = from.count - to.count
    if (lost > 0 && (best === null || lost > best.lost)) best = { from, to, lost }
  }
  return best
}

function StepRow({ step, index, first }: { step: Step; index: number; first: number }) {
  const look = STEP_LOOK[index]!
  return (
    <div className={ROW}>
      <span className="flex items-center gap-3 text-[13px] font-medium leading-[18px]">
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            look.chip,
          )}
        >
          {index + 1}
        </span>
        {step.label}
      </span>
      <span aria-hidden className="bg-surface-ink/5 flex h-9 justify-center rounded-xl">
        <span
          className={cn(
            'bg-linear-to-r block h-9 origin-center scale-x-100 rounded-xl',
            'starting:scale-x-0 transition-transform duration-1000 ease-out motion-reduce:transition-none',
            look.bar,
            look.glow,
          )}
          style={{
            width: `${first > 0 ? (step.count / first) * 100 : 0}%`,
            minWidth: step.count > 0 ? 18 : 0,
            transitionDelay: `${380 + index * 110}ms`,
          }}
        />
      </span>
      <span className="tnum font-num flex flex-col items-end">
        <span className="text-[16px] font-bold leading-5">{num(step.count)}</span>
        <span className={SUB}>
          {first === 0 ? '—' : index === 0 ? '100%' : percent(rateOf(step.count, first) ?? 0)}
        </span>
      </span>
    </div>
  )
}

/** What happens between two steps. Deals can open before any exchange is
 *  logged, so a step may exceed the one before it; that surplus is told apart
 *  from a loss instead of going negative. */
function Connector({ before, step }: { before: Step; step: Step }) {
  const gap = before.count - step.count
  return (
    <div className={cn(ROW, 'h-8')}>
      <span
        aria-hidden
        className="bg-linear-to-b from-primary/40 to-surface-ink/10 ml-3 h-8 w-0.5 justify-self-start"
      />
      <span className="tnum font-num flex items-center justify-center gap-2 text-[12px] leading-4">
        {before.count === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : gap < 0 ? (
          <span className="text-muted-foreground">{num(-gap)} lead vào thẳng</span>
        ) : (
          <>
            <span className="bg-primary/15 text-on-tint-primary inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold">
              <Icon icon={ArrowDown} size={14} />
              {percent(step.ratio ?? 0)} đi tiếp
            </span>
            <span className="text-muted-foreground">
              <strong className="text-foreground font-semibold">{num(gap)}</strong> chưa đi tiếp
            </span>
          </>
        )}
      </span>
    </div>
  )
}

function InsightCell({
  icon,
  title,
  tint,
  children,
}: {
  icon: IconGlyph
  title: string
  tint: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'bg-linear-to-br flex flex-col gap-3 rounded-2xl p-4 transition-[translate] duration-300 hover:-translate-y-1 motion-reduce:transition-none',
        tint,
      )}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold leading-4">
        <Icon icon={icon} size={14} />
        {title}
      </div>
      {children}
    </div>
  )
}

const FIGURE = 'tnum font-num text-[28px] font-bold leading-8 tracking-[-0.02em]'

function Insights({ steps, drop }: { steps: readonly Step[]; drop: Drop | null }) {
  const opportunities = steps[2]!.count
  const contracts = steps[3]!.count
  const close = rateOf(contracts, opportunities)
  const share = drop ? rateOf(drop.lost, drop.from.count) : null

  return (
    <div className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
      <InsightCell
        icon={TrendingDown}
        title="Bước mất nhiều lead nhất"
        tint="from-warning/20 to-warning/5 text-on-tint-warning"
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={cn(FIGURE, 'text-foreground')}>
            {drop ? `${num(drop.lost)} lead` : '—'}
          </span>
          {share !== null && (
            <span className={cn(SUB, 'tnum font-num')}>· {percent(share)} chưa đi tiếp</span>
          )}
        </div>
        <span className={SUB}>
          {drop ? `Từ “${drop.from.label}” sang “${drop.to.label}”` : 'Chưa bước nào mất lead.'}
        </span>
      </InsightCell>
      <InsightCell
        icon={Check}
        title="Từ cơ hội tới hợp đồng"
        tint="from-success/20 to-success/5 text-on-tint-success"
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={cn(FIGURE, 'text-foreground')}>
            {close === null ? '—' : percent(close)}
          </span>
          <span className={cn(SUB, 'tnum font-num')}>
            {num(contracts)}/{num(opportunities)} lead đã ký hợp đồng
          </span>
        </div>
      </InsightCell>
    </div>
  )
}

export function FunnelTile({
  data,
  className,
}: {
  data: SalesPerformanceResponse
  className?: string
}) {
  const { cohort } = data.current
  const steps = funnelOf(cohort)
  const rate = rateOf(cohort.contracts, cohort.leads)

  return (
    <GlassCard className={cn('flex min-w-0 flex-col', LIFT, className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ToneTile icon={Filter} tone="primary" />
          <div className="flex flex-col">
            <h3 className="text-[16px] font-semibold leading-6">Từ lead tới hợp đồng</h3>
            <span className={cn(SUB, 'tnum font-num')}>Lead vào sổ {rangeLabel(data.span)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="tnum font-num text-on-tint-primary text-[32px] font-bold leading-9 tracking-[-0.03em]">
            {rate === null ? '—' : percent(rate, 1)}
          </span>
          <span className={cn(SUB, 'tnum font-num')}>
            đã ký hợp đồng (
            <strong className="text-foreground font-semibold">
              {num(cohort.contracts)}/{num(cohort.leads)}
            </strong>
            )
          </span>
        </div>
      </div>

      <div className="flex flex-col">
        {steps.map((step, i) => {
          const before = steps[i - 1]
          return (
            <div key={step.key} className="flex flex-col">
              {before && <Connector before={before} step={step} />}
              <StepRow step={step} index={i} first={cohort.leads} />
            </div>
          )
        })}
      </div>

      {cohort.leads === 0 && <span className={SUB}>Kỳ này chưa có lead vào sổ.</span>}
      <Insights steps={steps} drop={biggestDrop(steps)} />
    </GlassCard>
  )
}
