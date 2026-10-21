import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, FileCheck, Icon, cn } from '@pv/ui'
import { salesGrainOf, type SalesGrain, type SalesPerformanceResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { deltaOf, money, num } from './home-model'
import { bucketViews, periodLabel, type BucketView } from '@/data/period-pick'
import { CARD_SHELL, DeltaLine, IconTile, NOTE } from './home-tiles'

/** The hero tile of the overview: contracts signed in the period, and the same
 *  amount split into the buckets one grain finer, with the running total drawn
 *  over them. The card is dark in both themes, so it carries the `dark` class
 *  that re-declares the dark tokens for everything inside it. */

/** What one column of the chart covers, by the grain of the picked period. */
const BUCKET_UNIT: Record<SalesGrain, string> = {
  week: 'ngày',
  month: 'tuần',
  quarter: 'tháng',
  year: 'tháng',
}

/** Half the gap between two columns, by how many columns the grain draws: three
 *  months may breathe, twelve must not starve their bars. */
const COLUMN_PAD: Record<SalesGrain, string> = {
  week: 'px-2',
  month: 'px-2',
  quarter: 'px-4',
  year: 'px-1',
}

/** The line needs a shape to read; two points are only a slope. */
const MIN_LINE_POINTS = 3

const MILLION = 1_000_000
/** Tallest bar in px, and how much of the plot height the line may use. */
const BAR_MAX = 142
const LINE_SPAN = 92

/* Opaque stops mixed from tokens, and a softer top-left glow: the old ramp put
   the period line under the title at 2.2:1 in stone and 4.3:1 in Aurora. */
const HERO_GROUND =
  'bg-[linear-gradient(150deg,color-mix(in_srgb,var(--brand-blue)_50%,var(--card))_0%,var(--card)_52%,color-mix(in_srgb,var(--channel-meeting)_8%,var(--card))_100%)]'

const BAR_FILL = 'from-accent-foreground/80 via-primary to-primary-strong'
const BAR_NOW =
  'from-primary-foreground/80 via-accent-foreground to-primary [box-shadow:0_0_32px_color-mix(in_srgb,var(--accent-foreground)_55%,transparent)]'

/** A future bucket still counts when a contract carries a later signing day
 *  inside the running period: the hero total includes it, so the chart must. */
const hasData = ({ state, bucket }: BucketView) =>
  state !== 'future' || bucket.signedAmountVnd > 0 || bucket.signedCount > 0

/** Running total over the buckets that hold figures. The line is scaled to its
 *  own end, not to the bars: a sum always outgrows any one bucket. */
function cumulativeOf(views: BucketView[]) {
  let sum = 0
  return views.flatMap((view, index) => {
    if (!hasData(view)) return []
    sum += view.bucket.signedAmountVnd
    return [{ index, sum }]
  })
}

function Column({
  view,
  top,
  index,
  pad,
}: {
  view: BucketView
  top: number
  index: number
  pad: string
}) {
  const { state, bucket } = view
  const future = !hasData(view)
  const zero = !future && bucket.signedAmountVnd === 0
  const height = future
    ? BAR_MAX
    : Math.max(4, Math.round((bucket.signedAmountVnd / top) * BAR_MAX))
  return (
    <div
      className={cn(
        'group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1',
        pad,
      )}
    >
      {/* The halo keeps the figure readable where the running-total line crosses it. */}
      <span className="tnum font-num relative z-10 whitespace-nowrap text-[12px] font-semibold leading-4 [text-shadow:0_0_6px_var(--card),0_0_2px_var(--card)]">
        {future ? '' : num(Math.round(bucket.signedAmountVnd / MILLION))}
      </span>
      <span
        style={{
          ...({ '--bar': `${height}px` } as CSSProperties),
          transitionDelay: `${index * 60}ms`,
        }}
        className={cn(
          'h-(--bar) max-w-13 w-full rounded-b-md rounded-t-xl',
          'ease-(--motion-ease) starting:h-0 transition-[height] duration-700',
          'motion-reduce:transition-none',
          !future && 'group-hover:brightness-125',
          future &&
            'bg-surface-ink/3 outline-muted-foreground/25 outline-dashed outline-1 -outline-offset-1',
          zero && 'bg-muted-foreground',
          !future && !zero && 'bg-linear-to-b',
          !future && !zero && (state === 'now' ? BAR_NOW : BAR_FILL),
        )}
      />
    </div>
  )
}

function Plot({ views, pad }: { views: BucketView[]; pad: string }) {
  const top = Math.max(1, ...views.map((v) => v.bucket.signedAmountVnd))
  const points = cumulativeOf(views)
  const last = points[points.length - 1]
  const end = points.length >= MIN_LINE_POINTS && last && last.sum > 0 ? last : null
  const y = (sum: number) => 100 - (sum / (end?.sum ?? 1)) * LINE_SPAN
  const line = points.map((p) => `${p.index + 0.5},${y(p.sum)}`).join(' ')
  const first = points[0]

  return (
    <div className="h-43 relative">
      <span
        aria-hidden
        className="border-muted-foreground/15 absolute inset-x-0 top-[30px] border-t border-dashed"
      />
      <span
        aria-hidden
        className="border-muted-foreground/15 absolute inset-x-0 top-[101px] border-t border-dashed"
      />
      {end && first && (
        <svg
          aria-hidden
          viewBox={`0 0 ${views.length} 100`}
          preserveAspectRatio="none"
          style={{ height: BAR_MAX }}
          className="pointer-events-none absolute bottom-0 left-0 w-full overflow-visible"
        >
          <polygon
            points={`${first.index + 0.5},100 ${line} ${end.index + 0.5},100`}
            className="fill-channel-meeting/15"
          />
          <polyline
            points={line}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-channel-meeting"
          />
        </svg>
      )}
      <div className="relative flex h-full items-end">
        {views.map((view, index) => (
          <Column key={view.bucket.key} view={view} top={top} index={index} pad={pad} />
        ))}
        {end &&
          points.map((p) => (
            <span
              key={p.index}
              aria-hidden
              style={{
                left: `${((p.index + 0.5) / views.length) * 100}%`,
                bottom: `${((100 - y(p.sum)) / 100) * BAR_MAX}px`,
              }}
              className="bg-card ring-channel-meeting absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-inset"
            />
          ))}
      </div>
    </div>
  )
}

function Labels({ views }: { views: BucketView[] }) {
  return (
    <div className="flex">
      {views.map((view) => (
        <div
          key={view.bucket.key}
          className="flex min-w-0 flex-1 flex-col items-center text-center"
        >
          <span
            className={cn(
              'tnum font-num whitespace-nowrap text-[12px] leading-4',
              view.state === 'now'
                ? 'text-accent-foreground font-semibold'
                : view.state === 'future'
                  ? 'text-glass-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {view.label}
          </span>
          <span className="tnum font-num text-glass-foreground min-h-4 whitespace-nowrap text-[12px] leading-4">
            {view.sub}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The chart's numbers for a screen reader: the plot above it is drawn only. */
function FiguresTable({
  views,
  unit,
  showLine,
}: {
  views: BucketView[]
  unit: string
  showLine: boolean
}) {
  const sums = new Map(cumulativeOf(views).map((p) => [p.index, p.sum]))
  return (
    <table className="sr-only">
      <caption>Giá trị hợp đồng ký theo {unit}</caption>
      <thead>
        <tr>
          <th scope="col">Kỳ</th>
          <th scope="col">Giá trị ký (triệu đồng)</th>
          {showLine && <th scope="col">Cộng dồn (triệu đồng)</th>}
        </tr>
      </thead>
      <tbody>
        {views.map((view, index) => (
          <tr key={view.bucket.key}>
            <th scope="row">{view.sub ? `${view.label} ${view.sub}` : view.label}</th>
            <td>{num(Math.round(view.bucket.signedAmountVnd / MILLION))}</td>
            {showLine && <td>{num(Math.round((sums.get(index) ?? 0) / MILLION))}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Legend({ unit, total, future }: { unit: string; total: string | null; future: boolean }) {
  return (
    <div className={cn(NOTE, 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="from-accent-foreground to-primary-strong bg-linear-to-b size-2.5 rounded-[3px]"
        />
        Từng {unit}
      </span>
      {total && (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="bg-channel-meeting h-[3px] w-4 rounded-full" />
          Cộng dồn: <strong className="text-foreground font-semibold">{total}</strong>
        </span>
      )}
      {future && (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="bg-surface-ink/3 outline-muted-foreground/25 size-2.5 rounded-[3px] outline-dashed outline-1 -outline-offset-1"
          />
          Chưa tới
        </span>
      )}
    </div>
  )
}

/** Contracts by the day they were signed. One with no amount is missing from
 *  the sum, so it is counted beside it instead of passing as zero. */
export function SignedTile({
  data,
  className,
}: {
  data: SalesPerformanceResponse
  className?: string
}) {
  const canView = useCan('contract.view')
  const { current, compare } = data
  const views = bucketViews(data)
  const unit = BUCKET_UNIT[salesGrainOf(data.period)]
  const points = cumulativeOf(views)
  const showLine = points.length >= MIN_LINE_POINTS && (points[points.length - 1]?.sum ?? 0) > 0
  const delta = deltaOf(current.signedAmountVnd, compare.figures.signedAmountVnd, 'money')

  return (
    <section
      className={cn(
        CARD_SHELL,
        'text-foreground dark relative flex-col gap-5 overflow-hidden p-6',
        HERO_GROUND,
        '[box-shadow:0_24px_56px_color-mix(in_srgb,var(--brand-navy)_30%,transparent)]',
        className,
      )}
    >
      <span
        aria-hidden
        className="bg-primary/30 pointer-events-none absolute -left-20 -top-32 h-80 w-[420px] rounded-full blur-3xl"
      />
      <span
        aria-hidden
        className="bg-channel-meeting/30 pointer-events-none absolute -right-12 -top-32 h-72 w-96 rounded-full blur-3xl"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile
            icon={FileCheck}
            size="size-9 rounded-xl"
            className="from-primary/30 to-channel-meeting/15 text-accent-foreground bg-linear-to-br"
          />
          <div className="flex flex-col">
            <h3 className="text-[16px] font-semibold leading-6">Giá trị hợp đồng đã ký</h3>
            <span className={NOTE}>{periodLabel(data.period)}</span>
          </div>
        </div>
        {canView && (
          <Link
            to={`/sales/contracts?signedFrom=${data.span.first}&signedTo=${data.span.last}`}
            className="bg-surface-ink/10 hover:bg-surface-ink/15 pointer-coarse:min-h-12 focus-visible:outline-ring inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold leading-4 transition focus-visible:outline-2"
          >
            Xem hợp đồng
            <Icon icon={ArrowRight} size={14} />
          </Link>
        )}
      </div>

      <div className="relative flex flex-wrap items-end gap-4">
        <span className="tnum font-num leading-14 text-primary-foreground[text-shadow:0_0_32px_color-mix(in_srgb,var(--accent-foreground)_45%,transparent)] text-[52px] font-bold tracking-[-0.035em]">
          {money(current.signedAmountVnd)}
        </span>
        <div className="flex flex-col gap-1 pb-2">
          <DeltaLine delta={delta} />
          <span className="text-muted-foreground tnum font-num text-[13px] leading-[18px]">
            <strong className="text-foreground font-semibold">
              {num(current.signedCount)} hợp đồng
            </strong>
            {current.blankAmount > 0 && ` · ${num(current.blankAmount)} chưa nhập giá trị`}
          </span>
        </div>
      </div>

      <div className="relative mt-auto flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={NOTE}>Theo {unit} · triệu đồng</span>
          <Legend
            unit={unit}
            total={showLine ? money(points[points.length - 1]?.sum ?? 0) : null}
            future={views.some((v) => !hasData(v))}
          />
        </div>
        <div aria-hidden className="flex flex-col gap-3">
          <Plot views={views} pad={COLUMN_PAD[salesGrainOf(data.period)]} />
          <div className="bg-muted-foreground/20 h-px" />
          <Labels views={views} />
        </div>
        <FiguresTable views={views} unit={unit} showLine={showLine} />
      </div>
    </section>
  )
}
