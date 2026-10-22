import { useState } from 'react'
import {
  Activity,
  GlassCard,
  Icon,
  Minus,
  TrendingDown,
  TrendingUp,
  cn,
  type IconGlyph,
} from '@pv/ui'
import type { SalesPerformanceResponse } from '@pv/contracts'
import { deltaOf, num, type Delta } from './home-model'
import { bucketViews, type BucketView } from '@/data/period-pick'
import { CHART_TILE, ToneTile } from './home-funnel'
import { MARK_FADE } from './home-look'

/** The week view of row two: three counts per day on one shared axis, so a
 *  reader sees whether contact and deals follow the leads that came in.
 *  Each count is by the day it happened (`reached`), whatever day the lead
 *  entered the book. Days still ahead keep their slot and label but no point.
 *
 *  Series differ by colour, dash and marker shape together, so none is read by
 *  hue alone. The y scale is fixed by all three series: hiding one never
 *  rescales the others. Lines and markers fade in as one layer, again on a
 *  new period, so no dot sits ahead of or behind its line. */

type SeriesKey = 'leads' | 'firstContacts' | 'opportunities'
type Figures = SalesPerformanceResponse['current']

type Series = {
  key: SeriesKey
  label: string
  of: (f: Figures) => number
  stroke: string
  fill: string
  ring: string
  text: string
  tint: string
  dash: string | undefined
  shape: string
}

const SERIES: readonly Series[] = [
  {
    key: 'leads',
    label: 'Lead vào sổ',
    of: (f) => f.cohort.leads,
    stroke: 'stroke-primary',
    fill: 'bg-primary',
    ring: 'ring-primary',
    text: 'text-on-tint-primary',
    tint: 'bg-primary/10 shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--primary)_25%,transparent)]',
    dash: undefined,
    shape: 'rounded-full',
  },
  {
    key: 'firstContacts',
    label: 'Đã liên hệ lần đầu',
    of: (f) => f.reached.firstContacts,
    stroke: 'stroke-channel-meeting',
    fill: 'bg-channel-meeting',
    ring: 'ring-channel-meeting',
    text: 'text-channel-meeting',
    tint: 'bg-channel-meeting/10 shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--channel-meeting)_25%,transparent)]',
    dash: '6 4',
    shape: 'rounded-sm',
  },
  {
    key: 'opportunities',
    label: 'Thành cơ hội',
    of: (f) => f.reached.opportunities,
    stroke: 'stroke-warning',
    fill: 'bg-warning',
    ring: 'ring-warning',
    text: 'text-on-tint-warning',
    tint: 'bg-warning/10 shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--warning)_25%,transparent)]',
    dash: '2 4',
    shape: 'rotate-45 rounded-sm',
  },
]

/* An opaque card ground: the pill sits on the toggle's tint, and stone's on-tint-success
   equals its success, so a tint under it fell below 4.5:1. */
const DELTA_LOOK = {
  up: { icon: TrendingUp, tone: 'bg-card text-on-tint-success' },
  down: { icon: TrendingDown, tone: 'bg-card text-on-tint-warning' },
  flat: { icon: Minus, tone: 'bg-card text-muted-foreground' },
} satisfies Record<Delta['direction'], { icon: IconGlyph; tone: string }>

/* Dots sit 6% above the floor and the peak 14% below the top, so a marker never clips. */
const yOf = (value: number, top: number) => 6 + (value / top) * 80
const xOf = (i: number, n: number) => ((i + 0.5) / n) * 100

/** Four integer ticks, 0 to three steps: a round axis for any peak. */
function axisOf(views: readonly BucketView[]) {
  const peak = Math.max(1, ...views.flatMap((v) => SERIES.map((s) => s.of(v.bucket))))
  const step = Math.ceil(peak / 3)
  return { top: step * 3, ticks: [0, step, step * 2, step * 3] }
}

function DeltaPill({ delta }: { delta: Delta | null }) {
  if (!delta) return null
  const look = DELTA_LOOK[delta.direction]
  return (
    <span
      className={cn(
        'tnum font-num inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold leading-4',
        look.tone,
      )}
    >
      <Icon icon={look.icon} size={14} />
      {delta.text}
    </span>
  )
}

function SeriesToggle({
  series,
  data,
  on,
  locked,
  onToggle,
}: {
  series: Series
  data: SalesPerformanceResponse
  on: boolean
  locked: boolean
  onToggle: () => void
}) {
  const total = series.of(data.current)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={locked || undefined}
      onClick={() => !locked && onToggle()}
      className={cn(
        'pointer-coarse:min-h-12 flex cursor-pointer flex-col gap-2 rounded-2xl px-4 py-3 text-left',
        'duration-(--motion-duration) ease-(--motion-ease) transition-[translate,scale,background-color] hover:-translate-y-0.5 active:scale-95 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'aria-disabled:cursor-default aria-disabled:hover:translate-y-0 aria-disabled:active:scale-100',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        on ? series.tint : 'bg-surface-ink/5',
      )}
    >
      <span className="text-muted-foreground flex items-center gap-2 text-[12px] font-semibold leading-4">
        <span aria-hidden className={cn('flex items-center gap-1', !on && 'opacity-40')}>
          <svg width={16} height={4} className="shrink-0">
            <line
              x1={0}
              x2={16}
              y1={2}
              y2={2}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={series.dash}
              className={series.stroke}
            />
          </svg>
        </span>
        {series.label}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="tnum font-num text-[28px] font-bold leading-8 tracking-[-0.02em]">
          {num(total)}
        </span>
        <DeltaPill delta={deltaOf(total, series.of(data.compare.figures), 'count')} />
      </span>
    </button>
  )
}

/** Hollow marker with a coloured ring; dots that share a value on one day are
 *  spread sideways so none hides another. */
function Marker({
  series,
  value,
  left,
  bottom,
  shift,
}: {
  series: Series
  value: number
  left: number
  bottom: number
  shift: number
}) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'bg-card ring-3 absolute size-3 translate-y-1/2 shadow-md ring-inset',
          series.ring,
          series.shape,
        )}
        style={{
          left: `${left}%`,
          bottom: `${bottom}%`,
          marginLeft: shift - 6,
        }}
      />
      <span
        aria-hidden
        className={cn(
          'tnum font-num absolute -translate-x-1/2 text-[11px] font-bold leading-[14px]',
          series.text,
        )}
        style={{ left: `${left}%`, bottom: `calc(${bottom}% + 12px)`, marginLeft: shift }}
      >
        {num(value)}
      </span>
    </>
  )
}

const HATCH =
  'bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--surface-ink)_5%,transparent)_0,color-mix(in_oklab,var(--surface-ink)_5%,transparent)_6px,transparent_6px,transparent_12px)]'

/** The chart as a table for screen readers: the plot itself is drawn, not read. */
function PlotTable({ views }: { views: readonly BucketView[] }) {
  return (
    <table className="sr-only">
      <caption>Hoạt động trong tuần theo ngày</caption>
      <thead>
        <tr>
          <th scope="col">Ngày</th>
          {SERIES.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {views.map((v) => (
          <tr key={v.bucket.key}>
            <th scope="row">
              {v.label} {v.sub}
            </th>
            {SERIES.map((s) => (
              <td key={s.key}>{v.state === 'future' ? 'chưa tới' : num(s.of(v.bucket))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Plot({
  views,
  shown,
  period,
}: {
  views: readonly BucketView[]
  shown: readonly Series[]
  /** Keys the marks layer, so it fades in again when the period changes. */
  period: SalesPerformanceResponse['period']
}) {
  const { top, ticks } = axisOf(views)
  const n = views.length
  const seen = views.filter((v) => v.state !== 'future').length
  const nowAt = views.findIndex((v) => v.state === 'now')

  return (
    <div className="flex flex-1 flex-col pt-4">
      <PlotTable views={views} />
      <div aria-hidden className="flex flex-1 flex-col gap-2">
        {/* Grows with the card, so a taller row never leaves a blank band
            under the day labels. */}
        <div className="flex min-h-52 flex-1 gap-2">
          <div aria-hidden className="relative w-4 shrink-0">
            {ticks.map((t) => (
              <span
                key={t}
                className="tnum font-num text-muted-foreground absolute right-0 translate-y-1/2 text-[11px] leading-[14px]"
                style={{ bottom: `${yOf(t, top)}%` }}
              >
                {num(t)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden
                className={cn(
                  'border-surface-ink/10 absolute inset-x-0 border-t',
                  t > 0 && 'border-dashed',
                )}
                style={{ bottom: `${yOf(t, top)}%` }}
              />
            ))}
            {seen < n && (
              <>
                <span
                  aria-hidden
                  className={cn('absolute inset-y-0 right-0 rounded-2xl', HATCH)}
                  style={{ left: `${(seen / n) * 100}%` }}
                />
                <span
                  aria-hidden
                  className="text-muted-foreground absolute right-0 top-2 text-center text-[11px] font-semibold leading-[14px]"
                  style={{ left: `${(seen / n) * 100}%` }}
                >
                  Chưa tới
                </span>
              </>
            )}
            {nowAt >= 0 && (
              <>
                <span
                  aria-hidden
                  className="border-primary/45 absolute inset-y-0 border-l border-dashed"
                  style={{ left: `${xOf(nowAt, n)}%` }}
                />
                <span
                  aria-hidden
                  className="bg-primary/15 text-on-tint-primary absolute -top-5 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold leading-[14px]"
                  style={{ left: `${xOf(nowAt, n)}%` }}
                >
                  Hôm nay
                </span>
              </>
            )}
            <div key={period} className={cn('absolute inset-0', MARK_FADE)}>
              <svg
                viewBox={`0 0 ${n} 100`}
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
                fill="none"
                aria-hidden
              >
                {shown.map((s) => (
                  <polyline
                    key={s.key}
                    points={views
                      .flatMap((v, i) =>
                        v.state === 'future'
                          ? []
                          : [`${i + 0.5},${100 - yOf(s.of(v.bucket), top)}`],
                      )
                      .join(' ')}
                    strokeWidth={3}
                    strokeDasharray={s.dash}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className={s.stroke}
                  />
                ))}
              </svg>
              {views.flatMap((v, i) => {
                if (v.state === 'future') return []
                const same = shown.map((s) => ({ s, value: s.of(v.bucket) }))
                return same.map(({ s, value }) => {
                  const mates = same.filter((o) => o.value === value)
                  const k = mates.findIndex((o) => o.s === s)
                  return (
                    <Marker
                      key={`${s.key}-${v.bucket.key}`}
                      series={s}
                      value={value}
                      left={xOf(i, n)}
                      bottom={yOf(value, top)}
                      shift={(k - (mates.length - 1) / 2) * 16}
                    />
                  )
                })
              })}
            </div>
          </div>
        </div>
        <div className="grid pl-6" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {views.map((v) => (
            <div key={v.bucket.key} className="flex flex-col items-center">
              <span
                className={cn(
                  'tnum font-num text-[12px] leading-4',
                  v.state === 'now' ? 'text-on-tint-primary font-bold' : 'text-muted-foreground',
                )}
              >
                {v.label}
              </span>
              <span className="text-muted-foreground tnum font-num text-[12px] leading-4">
                {v.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ActivityTile({
  data,
  className,
}: {
  data: SalesPerformanceResponse
  className?: string
}) {
  const [hidden, setHidden] = useState<readonly SeriesKey[]>([])
  const shown = SERIES.filter((s) => !hidden.includes(s.key))
  const toggle = (key: SeriesKey) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))

  return (
    <GlassCard className={cn('flex min-w-0 flex-col', CHART_TILE, className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ToneTile icon={Activity} tone="primary" />
          <div className="flex flex-col">
            <h3 className="text-[16px] font-semibold leading-6">Hoạt động trong tuần</h3>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
        {SERIES.map((s) => (
          <SeriesToggle
            key={s.key}
            series={s}
            data={data}
            on={shown.includes(s)}
            locked={shown.length === 1 && shown.includes(s)}
            onToggle={() => toggle(s.key)}
          />
        ))}
      </div>
      <Plot views={bucketViews(data)} shown={shown} period={data.period} />
    </GlassCard>
  )
}
