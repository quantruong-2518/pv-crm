import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, FileCheck, Icon, cn } from '@pv/ui'
import { salesGrainOf, type SalesGrain, type SalesPerformanceResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dealsHref, deltaOf, money, num } from './home-model'
import { bucketViews, periodLabel, type BucketView } from '@/data/period-pick'
import { CARD_SHELL, DeltaLine, IconTile, NOTE, PILL_LINK } from './home-tiles'
import { ICON_TONE, MARK_EASE, WASH_HERO, staggerMs } from './home-look'
import { BUCKET_UNIT } from './home-revenue-model'

/** The hero tile of the overview: contracts signed in the period beside the
 *  open book, in one chart. Each column is the open deals expected to close in
 *  that slice plus what was signed in it; the signed part fills from the foot.
 *  The open book keeps no history, so its columns are today's deals placed by
 *  their expected close day, never a past reading. */

/** Half the gap between two columns, by how many columns the grain draws: three
 *  months may breathe, twelve must not starve their bars. */
const COLUMN_PAD: Record<SalesGrain, string> = {
  week: 'px-2',
  month: 'px-2',
  quarter: 'px-4',
  year: 'px-1',
}

const MILLION = 1_000_000
/** Tallest column in px; the two-line figure above it takes the rest of the plot. */
const BAR_MAX = 118

/** The signed part: one hue, fading up from the foot so it reads as filling. The
 *  open part is the same hue washed out; the running bucket is ringed, solid,
 *  because the legend's dashed swatch means a bucket not reached yet. */
const SIGNED_FILL =
  'bg-[linear-gradient(0deg,var(--primary),color-mix(in_srgb,var(--primary)_62%,var(--card)))]'
const OPEN_TRACK = 'bg-primary/15'
const BAR_NOW = 'outline-2 outline-offset-2 outline-primary'

/** A future bucket still counts when a contract carries a later signing day or an
 *  open deal expects to close in it: the totals include them, so the chart must. */
const hasData = ({ state, bucket }: BucketView) =>
  state !== 'future' ||
  bucket.signedAmountVnd > 0 ||
  bucket.signedCount > 0 ||
  bucket.open.count > 0

const totalOf = ({ bucket }: BucketView) => bucket.signedAmountVnd + bucket.open.amountVnd

const millions = (vnd: number) => num(Math.round(vnd / MILLION))

function Column({
  view,
  top,
  index,
  count,
  pad,
}: {
  view: BucketView
  top: number
  index: number
  count: number
  pad: string
}) {
  const { state, bucket } = view
  const future = !hasData(view)
  const empty = !future && totalOf(view) === 0
  const height = future ? BAR_MAX : Math.max(4, Math.round((totalOf(view) / top) * BAR_MAX))
  const fill =
    bucket.signedAmountVnd > 0
      ? Math.max(4, Math.round((bucket.signedAmountVnd / totalOf(view)) * height))
      : 0
  return (
    <div
      className={cn('relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1', pad)}
    >
      <span className="tnum font-num flex h-8 flex-col items-center justify-end whitespace-nowrap text-[12px] leading-4">
        <span className="font-semibold">
          {future || bucket.open.amountVnd === 0 ? '' : millions(bucket.open.amountVnd)}
        </span>
        <span className="text-accent-foreground">
          {future || fill === 0 ? '' : millions(bucket.signedAmountVnd)}
        </span>
      </span>
      <span
        style={{
          ...({ '--bar': `${height}px`, '--fill': `${fill}px` } as CSSProperties),
          transitionDelay: `${staggerMs(index, count)}ms`,
        }}
        className={cn(
          'h-(--bar) max-w-13 relative w-full overflow-hidden rounded-b-md rounded-t-xl',
          !future && `starting:h-0 transition-[height] ${MARK_EASE}`,
          future &&
            'bg-surface-ink/3 outline-muted-foreground/25 outline-dashed outline-1 -outline-offset-1',
          empty && 'bg-muted-foreground',
          !future && !empty && OPEN_TRACK,
          !future && state === 'now' && BAR_NOW,
        )}
      >
        {fill > 0 && (
          <span
            className={cn(
              'h-(--fill) starting:h-0 absolute inset-x-0 bottom-0',
              SIGNED_FILL,
              `transition-[height] ${MARK_EASE}`,
            )}
          />
        )}
      </span>
    </div>
  )
}

/** What a bar shows: a value, a zero, or the frame of a bucket not reached yet.
 *  Bars are keyed by position and kind: a value slides to the next value, while a
 *  frame or a zero is remounted rather than sliding as if it were data. */
const kindOf = (view: BucketView) =>
  !hasData(view) ? 'future' : totalOf(view) === 0 ? 'zero' : 'value'

function Plot({ views, pad }: { views: BucketView[]; pad: string }) {
  const top = Math.max(1, ...views.map(totalOf))
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
      <div className="relative flex h-full items-end">
        {views.map((view, index) => (
          <Column
            key={`${index}-${kindOf(view)}`}
            view={view}
            top={top}
            index={index}
            count={views.length}
            pad={pad}
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
function FiguresTable({ views, unit }: { views: BucketView[]; unit: string }) {
  return (
    <table className="sr-only">
      <caption>Giá trị hợp đồng ký và cơ hội đang mở theo {unit}</caption>
      <thead>
        <tr>
          <th scope="col">Kỳ</th>
          <th scope="col">Giá trị ký (triệu đồng)</th>
          <th scope="col">Cơ hội mở dự kiến chốt (triệu đồng)</th>
        </tr>
      </thead>
      <tbody>
        {views.map((view) => (
          <tr key={view.bucket.key}>
            <th scope="row">{view.sub ? `${view.label} ${view.sub}` : view.label}</th>
            <td>{millions(view.bucket.signedAmountVnd)}</td>
            <td>{millions(view.bucket.open.amountVnd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn('size-2.5 rounded-[3px]', className)} />
      {label}
    </span>
  )
}

function Legend({ future }: { future: boolean }) {
  return (
    <div className={cn(NOTE, 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      <Swatch className={SIGNED_FILL} label="Đã ký" />
      <Swatch className={OPEN_TRACK} label="Cơ hội mở, dự kiến chốt" />
      {future && (
        <Swatch
          className="bg-surface-ink/3 outline-muted-foreground/25 outline-dashed outline-1 -outline-offset-1"
          label="Chưa tới"
        />
      )}
    </div>
  )
}

/** One headline figure of the card: a label, the sum, and what it counts. */
function Figure({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={NOTE}>{label}</span>
      <span className="tnum font-num leading-14 text-[44px] font-bold tracking-[-0.035em]">
        {value}
      </span>
      {children}
    </div>
  )
}

/** Contracts by the day they were signed, and the open book by its expected
 *  close day. A contract or deal with no amount is missing from its sum, so it
 *  is counted beside it instead of passing as zero. */
export function SignedTile({
  data,
  className,
}: {
  data: SalesPerformanceResponse
  className?: string
}) {
  const canViewContracts = useCan('contract.view')
  const canViewDeals = useCan('opportunity.view')
  const { current, compare, open } = data
  const views = bucketViews(data)
  const unit = BUCKET_UNIT[salesGrainOf(data.period)]
  const delta = deltaOf(current.signedAmountVnd, compare.figures.signedAmountVnd, 'money')

  return (
    <section className={cn(CARD_SHELL, 'flex-col gap-5 p-6', WASH_HERO, className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile icon={FileCheck} size="size-9 rounded-xl" className={ICON_TONE.primary} />
          <div className="flex flex-col">
            <h3 className="text-[16px] font-semibold leading-6">
              Hợp đồng đã ký và cơ hội đang mở
            </h3>
            <span className={NOTE}>{periodLabel(data.period)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canViewContracts && (
            <Link
              to={`/sales/contracts?signedFrom=${data.span.first}&signedTo=${data.span.last}`}
              className={PILL_LINK}
            >
              Xem hợp đồng
              <Icon icon={ArrowRight} size={14} />
            </Link>
          )}
          {canViewDeals && open.count > 0 && (
            <Link to={dealsHref('open')} className={PILL_LINK}>
              Xem cơ hội
              <Icon icon={ArrowRight} size={14} />
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-12 gap-y-4">
        <Figure label="Đã ký trong kỳ" value={money(current.signedAmountVnd)}>
          <div className="flex flex-wrap items-center gap-2">
            <DeltaLine delta={delta} />
            <span className="text-muted-foreground tnum font-num text-[13px] leading-[18px]">
              <strong className="text-foreground font-semibold">
                {num(current.signedCount)} hợp đồng
              </strong>
              {current.blankAmount > 0 && ` · ${num(current.blankAmount)} chưa nhập giá trị`}
            </span>
          </div>
        </Figure>
        <Figure label="Cơ hội đang mở, tính đến hôm nay" value={money(open.amountVnd)}>
          <span className="text-muted-foreground tnum font-num text-[13px] leading-[18px]">
            <strong className="text-foreground font-semibold">{num(open.count)} cơ hội</strong>
            {open.blank > 0 && ` · ${num(open.blank)} chưa nhập giá trị`}
          </span>
        </Figure>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={NOTE}>Theo {unit} · triệu đồng · trên: mở, dưới: ký</span>
          <Legend future={views.some((v) => !hasData(v))} />
        </div>
        <div aria-hidden className="flex flex-col gap-3">
          <Plot views={views} pad={COLUMN_PAD[salesGrainOf(data.period)]} />
          <div className="bg-muted-foreground/20 h-px" />
          <Labels views={views} />
        </div>
        {open.unplaced.count > 0 && (
          <span className={cn(NOTE, 'tnum font-num')}>
            <strong className="text-foreground font-semibold">
              {num(open.unplaced.count)} cơ hội
            </strong>
            {open.unplaced.amountVnd > 0 && ` (${money(open.unplaced.amountVnd)})`} chưa có trong
            cột: không có ngày dự kiến chốt, hoặc chốt ngoài kỳ này.
          </span>
        )}
        <FiguresTable views={views} unit={unit} />
      </div>
    </section>
  )
}
