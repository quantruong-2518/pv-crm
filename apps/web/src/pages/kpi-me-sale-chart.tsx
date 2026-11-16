import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GlassCard, Skeleton, cn, percent } from '@pv/ui'
import type { KpiSignedByDayResponse } from '@pv/contracts'
import { KpiCardError } from '@/components/kpi-tabs'
import { useI18n } from '@/app/i18n'
import { kpiSignedByDayQuery } from '@/data/kpi-signed-by-day'
import { dm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { printShort, printValue } from './kpi-model'
import * as copy from './kpi-me-sale-i18n'
import {
  LABEL_H,
  PLOT_H,
  chartOf,
  labelWidth,
  placeLabels,
  type Chart,
  type Rect,
} from './kpi-me-sale-model'

/** Cumulative signed value by day (ADR 0160 §9): the signed line, the dashed line
 *  of the weekly pick, the pace line and the target. The sentence under it is a
 *  template over the same figures.
 *
 *  The lines are one stretched SVG; marks and labels are boxes over it, so a
 *  stretch never squashes a dot or a letter; labels are placed in px, clear of
 *  every line. The figures are in the sentence,
 *  so the drawing is `aria-hidden` and the box carries one label. */

const LINE = '[vector-effect:non-scaling-stroke] fill-none stroke-2'

function Legend({ target, forecast }: { target: string | null; forecast: boolean }) {
  const { t } = useI18n()
  const swatch = 'inline-block h-0.5 w-4 rounded-sm'
  return (
    <span className={cn(NOTE, 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      <span className="inline-flex items-center gap-2">
        <i className={cn(swatch, 'bg-primary h-1')} />
        {t(copy.LEGEND_SIGNED)}
      </span>
      {forecast && (
        <span className="inline-flex items-center gap-2">
          <i className={cn(swatch, 'border-primary border-t-2 border-dashed bg-transparent')} />
          {t(copy.LEGEND_FORECAST)}
        </span>
      )}
      {target !== null && (
        <>
          <span className="inline-flex items-center gap-2">
            <i className={cn(swatch, 'bg-muted-foreground')} />
            {t(copy.LEGEND_PACE)}
          </span>
          <span className="inline-flex items-center gap-2">
            <i className={cn(swatch, 'bg-foreground')} />
            {t(copy.targetOf(target))}
          </span>
        </>
      )}
    </span>
  )
}

function Sentence({ chart, target }: { chart: Chart; target: number | null }) {
  const { t } = useI18n()
  const show = (v: number) => printShort('money', v)
  const reach = (v: number) => (target !== null && target > 0 ? percent(v / target) : null)
  if (chart.forecastEnd === null) {
    const share = reach(chart.signedTotal)
    return (
      <>
        {t(copy.signedOnly(show(chart.signedTotal)))}
        {share ? t(copy.signedShare(share)) : '.'}
        {chart.through < chart.days && t(copy.NO_PICK)}
      </>
    )
  }
  const share = reach(chart.forecastEnd)
  const left = target === null ? 0 : target - chart.forecastEnd
  return (
    <>
      {t(copy.ifAllSigned(show(chart.forecastEnd)))}
      {share ? t(copy.andShare(share)) : '.'}
      {target !== null && left > 0 && t(copy.gap(show(left)))}
      {target !== null && left < 0 && t(copy.over(show(-left)))}
    </>
  )
}

/** Dots that carry a visible label; the rest stay dots, so a busy month does not turn into text. */
const NAMED_DOTS = 3
/** Space kept between the target line and its label. */
const TARGET_GAP = 4

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const watch = new ResizeObserver(() => setWidth(el.clientWidth))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return [ref, width] as const
}

/** The target's label sits above its line at the left edge, below when there is no room above. */
function targetBox(chart: Chart, text: string): Rect | null {
  if (chart.targetY === null) return null
  const line = (chart.targetY / 100) * PLOT_H
  const above = line >= LABEL_H + TARGET_GAP
  return {
    left: 0,
    top: above ? line - TARGET_GAP - LABEL_H : line + TARGET_GAP,
    width: labelWidth(text),
    height: LABEL_H,
  }
}

function Plot({ chart, period, target }: { chart: Chart; period: string; target: string | null }) {
  const { t } = useI18n()
  const [box, width] = useWidth()
  const at = (day: number) => dm(`${period}-${String(day).padStart(2, '0')}`)
  const labelDays = [1, 8, 15, 22, chart.days]
  const targetText = target === null ? '' : t(copy.targetOf(target))
  const targetRect = targetBox(chart, targetText)
  const named = [...chart.dots].sort((a, b) => b.amount - a.amount).slice(0, NAMED_DOTS)
  const texts = new Map(named.map((d) => [d, `${d.code} · ${printShort('money', d.amount)}`]))
  const places =
    width > 0
      ? placeLabels(chart, { width, height: PLOT_H }, named, texts, targetRect ? [targetRect] : [])
      : new Map<(typeof named)[number], Rect>()
  return (
    <div className="flex flex-col gap-2 pl-12 pt-4">
      <div ref={box} className="relative" style={{ height: PLOT_H }}>
        {chart.ticks.map((tick) => (
          <div
            key={tick}
            className="absolute inset-x-0"
            style={{ bottom: `${(tick / chart.top) * 100}%` }}
          >
            {tick > 0 && <div className="bg-surface-ink/10 h-px w-full" />}
            <span className={cn(NOTE, 'tnum font-num absolute -bottom-2 -left-12 w-11 text-right')}>
              {tick === 0 ? '0' : printShort('money', tick)}
            </span>
          </div>
        ))}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
          className="absolute inset-0 size-full overflow-visible"
        >
          <polygon points={chart.signedArea} className="fill-primary/15" />
          {chart.pace && (
            <polyline points={chart.pace} className={cn(LINE, 'stroke-muted-foreground')} />
          )}
          {chart.targetY !== null && (
            <line
              x1="0"
              x2="100"
              y1={chart.targetY}
              y2={chart.targetY}
              className={cn(LINE, 'stroke-foreground')}
            />
          )}
          {chart.forecast && (
            <polyline
              points={chart.forecast}
              className={cn(LINE, 'stroke-primary [stroke-dasharray:6_4]')}
            />
          )}
          <polyline points={chart.signed} className={cn(LINE, 'stroke-primary')} />
        </svg>
        {chart.todayX !== null && (
          <div
            className="bg-surface-ink/30 absolute inset-y-0 w-px"
            style={{ left: `${chart.todayX}%` }}
          >
            <span
              className={cn(
                NOTE,
                'tnum font-num absolute -top-4 -translate-x-1/2 whitespace-nowrap',
              )}
            >
              {t(copy.todayMark(at(chart.through)))}
            </span>
          </div>
        )}
        {targetRect && (
          <span
            className={cn(
              NOTE,
              'tnum font-num bg-card absolute whitespace-nowrap rounded-sm px-1 leading-[18px]',
            )}
            style={{ left: targetRect.left, top: targetRect.top }}
          >
            {targetText}
          </span>
        )}
        {chart.dots.map((dot) => (
          <Fragment key={`${dot.code}/${dot.x}/${dot.y}`}>
            <span
              title={`${dot.code} · ${printShort('money', dot.amount)}`}
              className="bg-primary absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full shadow-[0_0_0_2px_var(--card)]"
              style={{ left: `${dot.x}%`, bottom: `${100 - dot.y}%` }}
            />
            {places.has(dot) && (
              <span
                className={cn(
                  NOTE,
                  'tnum font-num bg-card absolute whitespace-nowrap rounded-sm px-1 leading-[18px]',
                )}
                style={{ left: places.get(dot)!.left, top: places.get(dot)!.top }}
              >
                {texts.get(dot)}
              </span>
            )}
          </Fragment>
        ))}
      </div>
      <div className="relative h-4">
        {labelDays.map((day, i) => (
          <span
            key={day}
            className={cn(
              NOTE,
              'tnum font-num absolute whitespace-nowrap',
              i === labelDays.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
            )}
            style={{ left: `${(day / chart.days) * 100}%` }}
          >
            {at(day)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Body({ period, data }: { period: string; data: KpiSignedByDayResponse }) {
  const { t } = useI18n()
  const chart = chartOf(data, period)
  const target = data.target === null ? null : printShort('money', data.target)
  return (
    <>
      <div
        role="img"
        aria-label={t(copy.chartLabel(printValue('money', chart.signedTotal, true), target ?? '—'))}
      >
        <Plot chart={chart} period={period} target={target} />
      </div>
      <p className="tnum font-num m-0 text-[12.5px] leading-5">
        <Sentence chart={chart} target={data.target} />
      </p>
      <Legend target={target} forecast={chart.forecast !== null} />
    </>
  )
}

export function SignedByDayChart({ period, actorId }: { period: string; actorId: string }) {
  const { t } = useI18n()
  const read = useQuery(kpiSignedByDayQuery(period, actorId))
  return (
    <GlassCard className={cn(TILE, 'gap-4 p-5')}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold leading-5">{t(copy.CHART_TITLE)}</h3>
        <span className={NOTE}>{t(copy.CHART_HINT)}</span>
      </div>
      {read.error && !read.data && (
        <KpiCardError error={read.error} onRetry={() => void read.refetch()} />
      )}
      {!read.data && !read.error && <Skeleton className="h-64 w-full" />}
      {read.data && <Body period={period} data={read.data} />}
    </GlassCard>
  )
}
