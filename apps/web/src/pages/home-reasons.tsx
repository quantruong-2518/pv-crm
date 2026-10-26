import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { GlassCard, Ban, Icon, Lightbulb, cn, percent } from '@pv/ui'
import {
  LEAD_STATE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  type SalesExitReason,
  type SalesExitsResponse,
  type SalesStopReason,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { CHART_TILE, ToneTile } from './home-funnel'
import { MARK_EASE } from './home-look'
import { daysOfPeriod, num, rateOf, stopLogHref, stoppedDealsHref } from './home-model'
import { periodLabel } from '@/data/period-pick'

/** Why leads, deals and signed contracts left in the picked period: one panel
 *  per group, each a donut and a legend of reasons, most frequent first, with
 *  the top reason named in one line underneath. Deal stops keep the column the
 *  deal stood in, because the same reason means something different at a
 *  different step. Terminations count on the day they were made (ADR 0107).
 *
 *  A reason is neither good nor bad, so a group uses one hue at falling
 *  strength rather than a rainbow. The count and share beside every legend row
 *  carry the number, so no segment is read by colour alone. On a full row the
 *  groups sit side by side, each at most a column wide; beside the hero
 *  (`layout="side"`) they stack, with a smaller donut and the top reason
 *  inside the legend column. */

/** Rows a group prints before folding the rest: groups share a row side by
 *  side, so each stays short and none outgrows its neighbours. */
const REASON_ROWS = 3
/** Circumference of the donut's circle (r = 30 in an 80-unit box). */
const RING = 188.5

/* Dash values ride custom properties read by classes, so a segment draws in from
   zero on mount and slides on a period change; an inline dash would beat the
   starting style. */
const ARC =
  '[stroke-dasharray:var(--dash)] [stroke-dashoffset:var(--off)] starting:[stroke-dasharray:0_var(--ring)]'

type Row = SalesExitReason & { stage?: SalesStopReason['stage'] }
type Slice = { key: string; label: string; stage?: SalesStopReason['stage']; count: number }

/* One hue per group at four strengths; the fourth, faintest one holds the folded rest. */
const LOOK = {
  lead: {
    panel: 'from-primary/8 to-primary/3',
    bulb: 'text-on-tint-primary',
    stroke: ['stroke-primary', 'stroke-primary/70', 'stroke-primary/45', 'stroke-primary/25'],
    fill: ['bg-primary', 'bg-primary/70', 'bg-primary/45', 'bg-primary/25'],
  },
  deal: {
    panel: 'from-destructive/8 to-destructive/3',
    bulb: 'text-on-tint-destructive',
    stroke: [
      'stroke-destructive',
      'stroke-destructive/70',
      'stroke-destructive/45',
      'stroke-destructive/25',
    ],
    fill: ['bg-destructive', 'bg-destructive/70', 'bg-destructive/45', 'bg-destructive/25'],
  },
  /* Grey, as the terminated badge's ink: warning already means "late" on this screen.
     The muted ink rather than brand slate, which is one value in every theme and
     fell under 3:1 on Aurora's panel. */
  contract: {
    panel: 'from-surface-ink/8 to-surface-ink/3',
    bulb: 'text-muted-foreground',
    stroke: [
      'stroke-muted-foreground',
      'stroke-muted-foreground/70',
      'stroke-muted-foreground/45',
      'stroke-muted-foreground/25',
    ],
    fill: [
      'bg-muted-foreground',
      'bg-muted-foreground/70',
      'bg-muted-foreground/45',
      'bg-muted-foreground/25',
    ],
  },
}

const sumOf = (rows: readonly { count: number }[]) => rows.reduce((n, r) => n + r.count, 0)

/** The most frequent reason once a deal stop's stages are added up: the same reason
 *  at two columns is one reason, so the line cannot name a single column's row. */
function topReason(rows: readonly Row[]) {
  const byKey = new Map<string, { label: string; count: number }>()
  for (const r of rows) {
    const seen = byKey.get(r.key)
    byKey.set(r.key, { label: r.label, count: (seen?.count ?? 0) + r.count })
  }
  const all = [...byKey.values()].sort((a, b) => b.count - a.count)
  return { first: all[0], distinct: all.length }
}

/** Beside the hero on a short viewport (1280×800) a group folds one row earlier,
 *  so the stacked groups still end at the fold. */
const SHORT_ROWS = 2
/* Both folds are drawn and CSS shows one, so nothing in JS reads the viewport. */
const SHORT = {
  tall: '[@media(max-height:860px)]:hidden',
  short: 'hidden [@media(max-height:860px)]:flex',
}

/** Top rows as slices, then one slice for everything folded away. */
function slicesOf(
  rows: readonly Row[],
  limit = REASON_ROWS,
): { shown: Slice[]; rest: { n: number; count: number } } {
  const hidden = rows.slice(limit)
  return { shown: rows.slice(0, limit), rest: { n: hidden.length, count: sumOf(hidden) } }
}

function Donut({
  slices,
  rest,
  total,
  look,
  unit,
  size,
}: {
  slices: readonly Slice[]
  rest: number
  total: number
  look: (typeof LOOK)['lead']
  unit: string
  size: string
}) {
  let used = 0
  const arc = (count: number, stroke: string, key: string) => {
    const length = (count / total) * RING
    const drawn = slices.length + (rest > 0 ? 1 : 0) > 1 ? Math.max(0.6, length - 1.6) : length
    const circle = (
      <circle
        key={key}
        cx={40}
        cy={40}
        r={30}
        fill="none"
        strokeWidth={12}
        transform="rotate(-90 40 40)"
        style={
          {
            '--dash': `${drawn} ${RING - drawn}`,
            '--off': `${-used}`,
            '--ring': String(RING),
          } as CSSProperties
        }
        className={cn(ARC, `transition-[stroke-dasharray,stroke-dashoffset] ${MARK_EASE}`, stroke)}
      />
    )
    used += length
    return circle
  }

  return (
    <div className={cn('relative shrink-0', size)}>
      <svg
        viewBox="0 0 80 80"
        role="img"
        aria-label={`${num(total)} ${unit}`}
        className="size-full"
      >
        <circle
          cx={40}
          cy={40}
          r={30}
          fill="none"
          strokeWidth={12}
          className="stroke-surface-ink/10"
        />
        {slices.map((s, i) => arc(s.count, look.stroke[i]!, `${s.stage ?? ''}-${s.key}`))}
        {rest > 0 && arc(rest, look.stroke[3]!, 'rest')}
      </svg>
      <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-num text-[22px] font-bold leading-[26px] tracking-[-0.02em]">
          {num(total)}
        </span>
        <span className="text-muted-foreground text-[12px] leading-4">{unit}</span>
      </span>
    </div>
  )
}

function LegendRow({
  swatch,
  label,
  tag,
  count,
  share,
  to,
}: {
  swatch: string
  label: string
  tag?: string
  count: number
  share: number | null
  /** Makes the whole row a link to the list it counts. */
  to?: string
}) {
  const className = cn(
    'grid grid-cols-[10px_minmax(0,1fr)_auto_40px] items-center gap-2 rounded-xl px-2 py-1',
    to !== undefined &&
      'hover:bg-surface-ink/8 focus-visible:outline-ring pointer-coarse:min-h-12 duration-(--motion-duration) ease-(--motion-ease) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none',
  )
  const cells = (
    <>
      <span aria-hidden className={cn('size-2.5 rounded-sm', swatch)} />
      <span className="min-w-0 text-[13px] leading-[18px]" title={label}>
        {label}
        {tag && <span className="text-muted-foreground text-[12px]"> {tag}</span>}
      </span>
      <span className="tnum font-num text-[13px] font-bold leading-[18px]">{num(count)}</span>
      <span className="tnum font-num text-muted-foreground text-right text-[12px] leading-4">
        {share === null ? '' : percent(share)}
      </span>
    </>
  )
  return to === undefined ? (
    <div className={className}>{cells}</div>
  ) : (
    <Link to={to} className={className}>
      {cells}
    </Link>
  )
}

function ReasonGroup({
  kind,
  title,
  unit,
  rows,
  hrefOf,
  side,
}: {
  kind: keyof typeof LOOK
  title: string
  unit: string
  rows: readonly Row[]
  /** The list a row opens; undefined leaves the row unlinked. */
  hrefOf: (row: Row) => string | undefined
  side: boolean
}) {
  const look = LOOK[kind]
  const total = sumOf(rows)
  const { first, distinct } = topReason(rows)
  const share = rateOf(first?.count ?? 0, total)
  const top = first && share !== null && (
    <div
      className={cn(
        'flex items-center gap-2 text-[12px] leading-4',
        side ? 'px-2 py-1' : 'bg-card/75 rounded-xl px-3 py-2',
      )}
    >
      <Icon icon={Lightbulb} size={14} className={look.bulb} />
      <span className="tnum font-num">
        {distinct === 1 ? (
          <>
            Chỉ có một lý do: <strong className="font-semibold">{first.label}</strong>.
          </>
        ) : (
          <>
            Nhiều nhất: <strong className="font-semibold">{first.label}</strong> ·{' '}
            <strong className="font-semibold">{percent(share)}</strong>
          </>
        )}
      </span>
    </div>
  )

  const fold = (limit: number, donut: string, className?: string) => {
    const { shown, rest } = slicesOf(rows, limit)
    return (
      <div className={cn('flex flex-wrap items-center gap-4', className)}>
        <Donut
          slices={shown}
          rest={rest.count}
          total={total}
          look={look}
          unit={unit}
          size={donut}
        />
        {/* Capped so a lone group spanning the row keeps each count next to its reason. */}
        <div className="flex min-w-0 max-w-md flex-1 basis-44 flex-col gap-1">
          {shown.map((r, i) => (
            <LegendRow
              key={`${r.stage ?? ''}-${r.key}`}
              swatch={look.fill[i]!}
              label={r.label}
              tag={r.stage ? `ở ${OPPORTUNITY_STAGE_LABEL[r.stage]}` : undefined}
              count={r.count}
              share={rateOf(r.count, total)}
              to={hrefOf(r)}
            />
          ))}
          {rest.n > 0 && (
            <LegendRow
              swatch={look.fill[3]!}
              label={`${num(rest.n)} lý do khác`}
              count={rest.count}
              share={rateOf(rest.count, total)}
            />
          )}
          {side && top}
        </div>
      </div>
    )
  }

  return (
    <section
      className={cn(
        'bg-linear-to-br flex flex-col rounded-[20px] p-4',
        side ? 'gap-2 [@media(max-height:860px)]:gap-1 [@media(max-height:860px)]:p-3' : 'gap-3',
        look.panel,
      )}
    >
      <div className="flex flex-col gap-1">
        <h4 className="text-[13px] font-semibold leading-[18px]">{title}</h4>
      </div>
      {!side ? (
        fold(REASON_ROWS, 'size-32')
      ) : rows.length > SHORT_ROWS ? (
        <>
          {fold(REASON_ROWS, 'size-28', SHORT.tall)}
          {fold(SHORT_ROWS, 'size-22', SHORT.short)}
        </>
      ) : (
        fold(REASON_ROWS, 'size-28 [@media(max-height:860px)]:size-22')
      )}
      {!side && top}
    </section>
  )
}

export function ReasonsTile({
  data,
  layout = 'row',
  className,
}: {
  data: SalesExitsResponse
  /** `side`: beside the hero, the groups stacked. */
  layout?: 'row' | 'side'
  className?: string
}) {
  const side = layout === 'side'
  const leadTotal = sumOf(data.leadExits)
  const dealTotal = sumOf(data.dealStops)
  const canLeads = useCan('lead.view')
  const canDeals = useCan('opportunity.view')
  const canContracts = useCan('contract.view')
  const days = daysOfPeriod(data.period)
  const endedTotal = sumOf(data.contractTerminations)
  const total = leadTotal + dealTotal + endedTotal

  return (
    <GlassCard
      className={cn(
        'flex min-w-0 flex-col',
        CHART_TILE,
        'gap-4',
        side && '[@media(max-height:860px)]:gap-3 [@media(max-height:860px)]:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ToneTile icon={Ban} tone="destructive" />
          <div className="flex min-w-0 flex-col">
            <h3 className="text-[16px] font-semibold leading-6">Lý do dừng</h3>
            {total > 0 && (
              <span className="text-muted-foreground tnum font-num text-[12px] leading-4">
                <strong className="text-foreground font-semibold">{num(leadTotal)} lead</strong> vào{' '}
                {LEAD_STATE_LABEL.nurturing} ·{' '}
                <strong className="text-foreground font-semibold">{num(dealTotal)} cơ hội</strong>{' '}
                đã dừng
                {endedTotal > 0 && (
                  <>
                    {' · '}
                    <strong className="text-foreground font-semibold">
                      {num(endedTotal)} hợp đồng
                    </strong>{' '}
                    đã chấm dứt
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        <span className="text-muted-foreground tnum font-num shrink-0 text-[12px] leading-4">
          {periodLabel(data.period)}
        </span>
      </div>
      {total === 0 ? (
        <p className="text-muted-foreground my-auto py-8 text-center text-[12px] leading-4">
          Kỳ này chưa có lead vào {LEAD_STATE_LABEL.nurturing}, cơ hội dừng hay hợp đồng chấm dứt.
        </p>
      ) : (
        // At most three columns, each at least 320px; auto-fit drops the tracks no
        // group fills, so two groups share the row instead of leaving a blank third.
        <div
          className={
            side
              ? 'flex flex-col gap-3 [@media(max-height:860px)]:gap-2'
              : 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(320px,calc((100%_-_2rem)/3))),1fr))] gap-4'
          }
        >
          {data.leadExits.length > 0 && (
            <ReasonGroup
              kind="lead"
              side={side}
              title={`Lead vào ${LEAD_STATE_LABEL.nurturing}`}
              unit="lead"
              rows={data.leadExits}
              hrefOf={() => (canLeads ? stopLogHref('lead', days) : undefined)}
            />
          )}
          {data.dealStops.length > 0 && (
            <ReasonGroup
              kind="deal"
              side={side}
              title="Cơ hội đã dừng"
              unit="cơ hội"
              rows={data.dealStops}
              hrefOf={(r) =>
                canDeals && r.stage ? stoppedDealsHref(r.key, r.stage, days) : undefined
              }
            />
          )}
          {data.contractTerminations.length > 0 && (
            <ReasonGroup
              kind="contract"
              side={side}
              title="Hợp đồng đã chấm dứt"
              unit="hợp đồng"
              rows={data.contractTerminations}
              hrefOf={() => (canLeads && canContracts ? stopLogHref('contract', days) : undefined)}
            />
          )}
        </div>
      )}
    </GlassCard>
  )
}
