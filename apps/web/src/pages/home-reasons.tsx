import { GlassCard, Ban, Icon, Lightbulb, cn, percent } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  type SalesExitReason,
  type SalesExitsResponse,
  type SalesStopReason,
} from '@pv/contracts'
import { LIFT, ToneTile } from './home-funnel'
import { num, rateOf } from './home-model'
import { periodLabel } from './home-period'

/** Why leads and deals left in the picked period: one panel per group, each a
 *  donut and a legend of reasons, most frequent first, with the top reason
 *  named in one line underneath. Deal stops keep the column the deal stood in,
 *  because the same reason means something different at a different step.
 *
 *  A reason is neither good nor bad, so a group uses one hue at falling
 *  strength rather than a rainbow. The count and share beside every legend row
 *  carry the number, so no segment is read by colour alone. */

/** Rows a group prints before folding the rest: the card shares a row with two others. */
const REASON_ROWS = 3
/** Circumference of the donut's circle (r = 30 in an 80-unit box). */
const RING = 188.5

type Row = SalesExitReason & { stage?: SalesStopReason['stage'] }
type Slice = { key: string; label: string; stage?: SalesStopReason['stage']; count: number }

/* One hue per group at four strengths; the fourth, faintest one holds the folded rest. */
const LOOK = {
  lead: {
    panel: 'from-primary/10 to-primary/5',
    bulb: 'text-on-tint-primary',
    stroke: ['stroke-primary', 'stroke-primary/70', 'stroke-primary/45', 'stroke-primary/25'],
    fill: ['bg-primary', 'bg-primary/70', 'bg-primary/45', 'bg-primary/25'],
  },
  deal: {
    panel: 'from-destructive/10 to-destructive/5',
    bulb: 'text-on-tint-destructive',
    stroke: [
      'stroke-destructive',
      'stroke-destructive/70',
      'stroke-destructive/45',
      'stroke-destructive/25',
    ],
    fill: ['bg-destructive', 'bg-destructive/70', 'bg-destructive/45', 'bg-destructive/25'],
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

/** Top rows as slices, then one slice for everything folded away. */
function slicesOf(rows: readonly Row[]): { shown: Slice[]; rest: { n: number; count: number } } {
  const hidden = rows.slice(REASON_ROWS)
  return { shown: rows.slice(0, REASON_ROWS), rest: { n: hidden.length, count: sumOf(hidden) } }
}

function Donut({
  slices,
  rest,
  total,
  look,
  unit,
  delay,
}: {
  slices: readonly Slice[]
  rest: number
  total: number
  look: (typeof LOOK)['lead']
  unit: string
  delay: number
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
        strokeDasharray={`${drawn} ${RING - drawn}`}
        strokeDashoffset={-used}
        transform="rotate(-90 40 40)"
        className={stroke}
      />
    )
    used += length
    return circle
  }

  return (
    <div className="size-26 relative shrink-0">
      <svg
        viewBox="0 0 80 80"
        role="img"
        aria-label={`${num(total)} ${unit}`}
        className="starting:-rotate-120 starting:scale-90 starting:opacity-0 size-full transition-[rotate,scale,opacity] duration-1000 ease-out motion-reduce:transition-none"
        style={{ transitionDelay: `${delay}ms` }}
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
}: {
  swatch: string
  label: string
  tag?: string
  count: number
  share: number | null
}) {
  return (
    <div className="hover:bg-card grid grid-cols-[10px_minmax(0,1fr)_auto_40px] items-center gap-2 rounded-xl px-2 py-1 transition-colors duration-150 motion-reduce:transition-none">
      <span aria-hidden className={cn('size-2.5 rounded-sm', swatch)} />
      <span className="min-w-0 text-[13px] leading-[18px]" title={label}>
        {label}
        {tag && <span className="text-muted-foreground text-[12px]"> {tag}</span>}
      </span>
      <span className="tnum font-num text-[13px] font-bold leading-[18px]">{num(count)}</span>
      <span className="tnum font-num text-muted-foreground text-right text-[12px] leading-4">
        {share === null ? '' : percent(share)}
      </span>
    </div>
  )
}

function ReasonGroup({
  kind,
  title,
  unit,
  rows,
  delay,
}: {
  kind: keyof typeof LOOK
  title: string
  unit: string
  rows: readonly Row[]
  delay: number
}) {
  const look = LOOK[kind]
  const total = sumOf(rows)
  const { shown, rest } = slicesOf(rows)
  const { first, distinct } = topReason(rows)
  const share = rateOf(first?.count ?? 0, total)

  return (
    <section className={cn('bg-linear-to-br flex flex-col gap-3 rounded-[20px] p-4', look.panel)}>
      <div className="flex flex-col gap-1">
        <h4 className="text-[13px] font-semibold leading-[18px]">{title}</h4>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Donut
          slices={shown}
          rest={rest.count}
          total={total}
          look={look}
          unit={unit}
          delay={delay}
        />
        <div className="flex min-w-0 flex-1 basis-44 flex-col gap-1">
          {shown.map((r, i) => (
            <LegendRow
              key={`${r.stage ?? ''}-${r.key}`}
              swatch={look.fill[i]!}
              label={r.label}
              tag={r.stage ? `ở ${OPPORTUNITY_STAGE_LABEL[r.stage]}` : undefined}
              count={r.count}
              share={rateOf(r.count, total)}
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
        </div>
      </div>
      {first && share !== null && (
        <div className="bg-card/75 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] leading-4">
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
      )}
    </section>
  )
}

export function ReasonsTile({ data, className }: { data: SalesExitsResponse; className?: string }) {
  const leadTotal = sumOf(data.leadExits)
  const dealTotal = sumOf(data.dealStops)

  return (
    <GlassCard className={cn('flex min-w-0 flex-col', LIFT, 'gap-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ToneTile icon={Ban} tone="destructive" />
          <div className="flex min-w-0 flex-col">
            <h3 className="text-[16px] font-semibold leading-6">Lý do dừng</h3>
            {leadTotal + dealTotal > 0 && (
              <span className="text-muted-foreground tnum font-num text-[12px] leading-4">
                <strong className="text-foreground font-semibold">{num(leadTotal)} lead</strong>{' '}
                ngừng chăm sóc ·{' '}
                <strong className="text-foreground font-semibold">{num(dealTotal)} cơ hội</strong>{' '}
                đã dừng
              </span>
            )}
          </div>
        </div>
        <span className="text-muted-foreground tnum font-num shrink-0 text-[12px] leading-4">
          {periodLabel(data.period)}
        </span>
      </div>
      {leadTotal + dealTotal === 0 ? (
        <p className="text-muted-foreground my-auto py-8 text-center text-[12px] leading-4">
          Kỳ này chưa có lead ngừng chăm sóc hay cơ hội dừng.
        </p>
      ) : (
        <>
          {data.leadExits.length > 0 && (
            <ReasonGroup
              kind="lead"
              title="Lead ngừng chăm sóc"
              unit="lead"
              rows={data.leadExits}
              delay={460}
            />
          )}
          {data.dealStops.length > 0 && (
            <ReasonGroup
              kind="deal"
              title="Cơ hội đã dừng"
              unit="cơ hội"
              rows={data.dealStops}
              delay={600}
            />
          )}
        </>
      )}
    </GlassCard>
  )
}
