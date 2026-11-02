import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, Filter, GlassCard, Icon, cn, percent, type IconGlyph } from '@pv/ui'
import type { SalesPerformanceResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { enteredLeadsHref, funnelOf, num, rateOf } from './home-model'
import { rangeLabel } from '@/data/period-pick'
import { IconTile } from './home-tiles'
import { CARD, ICON_TONE, MARK_EASE, WASH, staggerMs, type IconTone } from './home-look'

/** The funnel of row two: the leads that entered the book in the period, and
 *  how many of them reached each step by now. Every step counts leads of the
 *  same cohort, so no bar is wider than the first.
 *
 *  It carries no delta: a young cohort always loses to a mature one, so the
 *  comparison would punish the running period. How many leads with a deal
 *  reach a contract is the last connector's share, so no cell repeats it.
 *  Which step holds the most items right now is a snapshot, not a period
 *  figure, so it has its own tile (`home-fullest.tsx`). */

/** Shell of the three chart tiles: the bento card and its wash. The card does
 *  not move on hover: only what is clickable inside it reacts. */
export const CHART_TILE = `${CARD} ${WASH} p-6 gap-5`

/** The stat cards' icon tile at the chart tiles' size. */
export function ToneTile({ icon, tone }: { icon: IconGlyph; tone: IconTone }) {
  return <IconTile icon={icon} size="size-9 rounded-xl" className={ICON_TONE[tone]} />
}

type Step = ReturnType<typeof funnelOf>[number]

function stepText(key: Step['key'], t: ReturnType<typeof useI18n>['t']) {
  const copy = {
    leads: message('Lead vào sổ', 'Leads added', '등록된 리드'),
    firstContacts: message('Đã liên hệ lần đầu', 'First contact made', '첫 접점 완료'),
    opportunities: message('Thành cơ hội', 'Converted to opportunity', '기회로 전환'),
    contracts: message('Đã ký hợp đồng', 'Contract signed', '계약 체결'),
  } as const
  return t(copy[key])
}

/* Chip and bar per step: blue to teal to green, so the last step reads as the win. The end
   bars are flat, full-strength tokens: Aurora's primary-strong and porcelain's success/70 fell
   under 3:1 on the track. Chips 1-2 share primary-strong (white on Aurora's primary is 4.46:1). */
const STEP_LOOK = [
  { chip: 'bg-primary-strong text-primary-foreground', bar: 'bg-primary' },
  {
    chip: 'bg-primary-strong text-primary-foreground',
    bar: 'bg-linear-to-r from-primary to-channel-meeting',
  },
  {
    chip: 'bg-channel-meeting text-background',
    bar: 'bg-linear-to-r from-channel-meeting to-success',
  },
  { chip: 'bg-success text-background', bar: 'bg-success' },
]

const ROW =
  'grid grid-cols-[96px_minmax(0,1fr)_56px] sm:grid-cols-[172px_minmax(0,1fr)_72px] items-center gap-4'
export const SUB = 'text-muted-foreground text-[12px] leading-4'

function StepRow({
  step,
  index,
  count,
  first,
  to,
}: {
  step: Step
  index: number
  /** How many steps the funnel has, to spread the bars' stagger. */
  count: number
  first: number
  /** Makes the step's name a link to the list it counts. */
  to?: string
}) {
  const { t } = useI18n()
  const look = STEP_LOOK[index]!
  const chip = (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
        look.chip,
      )}
    >
      {index + 1}
    </span>
  )
  return (
    <div className={ROW}>
      {to === undefined ? (
        <span className="flex items-center gap-3 text-[13px] font-medium leading-[18px]">
          {chip}
          {stepText(step.key, t)}
        </span>
      ) : (
        <Link
          to={to}
          className={cn(
            'flex items-center gap-3 text-[13px] font-medium leading-[18px] hover:underline',
            'pointer-coarse:min-h-12 underline-offset-4 motion-reduce:transition-none',
            'focus-visible:outline-ring rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
        >
          {chip}
          {stepText(step.key, t)}
          <Icon icon={ArrowRight} size={14} />
        </Link>
      )}
      <span aria-hidden className="bg-surface-ink/5 flex h-9 justify-center rounded-xl">
        {/* Width rides a custom property so the bar grows on mount and slides
            on a period change; an inline width would do neither. */}
        <span
          className={cn(
            'w-(--w) starting:w-0 block h-9 rounded-xl',
            `transition-[width] ${MARK_EASE}`,
            look.bar,
          )}
          style={
            {
              '--w': `${first > 0 ? (step.count / first) * 100 : 0}%`,
              minWidth: step.count > 0 ? 18 : 0,
              transitionDelay: `${staggerMs(index, count)}ms`,
            } as CSSProperties
          }
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
  const { t } = useI18n()
  const gap = before.count - step.count
  return (
    <div className={cn(ROW, 'min-h-8')}>
      <span
        aria-hidden
        className="bg-linear-to-b from-primary/40 to-surface-ink/10 ml-3 w-0.5 self-stretch justify-self-start"
      />
      <span className="tnum font-num flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] leading-4">
        {before.count === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : gap < 0 ? (
          <span className="text-muted-foreground">
            {t(
              message(
                `${num(-gap)} lead vào thẳng`,
                `${num(-gap)} leads entered directly`,
                `${num(-gap)}개 리드 직접 진입`,
              ),
            )}
          </span>
        ) : (
          <>
            <span className="bg-primary/15 text-on-tint-primary inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold">
              <Icon icon={ArrowDown} size={14} />
              {t(
                message(
                  `${percent(step.ratio ?? 0)} đi tiếp`,
                  `${percent(step.ratio ?? 0)} progressed`,
                  `${percent(step.ratio ?? 0)} 진행`,
                ),
              )}
            </span>
            <span className="text-muted-foreground">
              {t(
                message(
                  `${num(gap)} chưa đi tiếp`,
                  `${num(gap)} have not progressed`,
                  `${num(gap)}개 미진행`,
                ),
              )}
            </span>
          </>
        )}
      </span>
    </div>
  )
}

export function InsightCell({
  icon,
  title,
  tint,
  to,
  children,
}: {
  icon: IconGlyph
  title: string
  tint: string
  /** Makes the whole cell a link to this address. */
  to?: string
  children: ReactNode
}) {
  const { t } = useI18n()
  const className = cn('bg-linear-to-br flex flex-col gap-3 rounded-2xl p-4', tint)
  const head = (
    <div className="flex items-center gap-2 text-[12px] font-semibold leading-4">
      <Icon icon={icon} size={14} />
      {title}
    </div>
  )
  if (to === undefined) {
    return (
      <div className={className}>
        {head}
        {children}
      </div>
    )
  }
  return (
    <Link
      to={to}
      className={cn(
        className,
        'focus-visible:outline-ring duration-(--motion-duration) ease-(--motion-ease) group transition-[translate] hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      )}
    >
      {head}
      {children}
      <span className="flex items-center gap-1 text-[12px] font-semibold leading-4">
        {t(message('Xem danh sách', 'View list', '목록 보기'))}
        <span className="duration-(--motion-duration) ease-(--motion-ease) transition-[translate] group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-focus-visible:translate-x-0">
          <Icon icon={ArrowRight} size={14} />
        </span>
      </span>
    </Link>
  )
}

export const FIGURE = 'tnum font-num text-[28px] font-bold leading-8 tracking-[-0.02em]'

export function FunnelTile({
  data,
  className,
}: {
  data: SalesPerformanceResponse
  className?: string
}) {
  const { t } = useI18n()
  const { cohort } = data.current
  const steps = funnelOf(cohort)
  const rate = rateOf(cohort.contracts, cohort.leads)
  const canLeads = useCan('lead.view')

  return (
    <GlassCard className={cn('flex min-w-0 flex-col', CHART_TILE, className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ToneTile icon={Filter} tone="primary" />
          <div className="flex flex-col">
            <h3 className="text-[16px] font-semibold leading-6">
              {t(message('Từ lead tới hợp đồng', 'From lead to contract', '리드에서 계약까지'))}
            </h3>
            <span className={cn(SUB, 'tnum font-num')}>
              {t(
                message(
                  `Lead vào sổ ${rangeLabel(data.span)}`,
                  `Leads added ${rangeLabel(data.span)}`,
                  `${rangeLabel(data.span)} 등록 리드`,
                ),
              )}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="tnum font-num text-on-tint-primary text-[32px] font-bold leading-9 tracking-[-0.03em]">
            {rate === null ? '—' : percent(rate, 1)}
          </span>
          <span className={cn(SUB, 'tnum font-num')}>
            {t(message('đã ký hợp đồng', 'contracts signed', '계약 체결'))} (
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
              <StepRow
                step={step}
                index={i}
                count={steps.length}
                first={cohort.leads}
                to={i === 0 && canLeads ? enteredLeadsHref(data.span) : undefined}
              />
            </div>
          )
        })}
      </div>

      {cohort.leads === 0 && (
        <span className={SUB}>
          {t(
            message(
              'Kỳ này chưa có lead vào sổ.',
              'No leads were added in this period.',
              '이번 기간에 등록된 리드가 없습니다.',
            ),
          )}
        </span>
      )}
    </GlassCard>
  )
}
