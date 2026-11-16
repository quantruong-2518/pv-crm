import { GlassCard, cn } from '@pv/ui'
import type { KpiMetricDef, KpiTrendResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { NOTE, TILE } from './home-tiles'
import { DASH, monthEnded, printShort } from './kpi-model'
import { TREND_GAP, TREND_TODAY } from './kpi-me-role-i18n'
import { monthFoot, trendOf, type TrendSeries } from './kpi-me-role-model'

/** Six months of the headline metric as bars and of its rate as a line. A month
 *  with no figure leaves its bar out and breaks the line, so a missing month is
 *  never read as a zero. Heights are in pixels: a percent height inside a flex
 *  item resolves to nothing and the bars would vanish. The rate rides in a band
 *  of its own above the bars, so its dot and label never sit on a bar. */

const BARS = 92
/** Label row, then the band the rate dots travel in, then a gap above the bars. */
const LABEL = 20
const BAND = 24
const GAP = 10
const WIDTH = 600

const centre = (i: number) => (i + 0.5) / 6

/** Runs of consecutive months that have a figure, one polyline each. */
function runsOf(line: TrendSeries): string[] {
  const runs: string[] = []
  let cur: string[] = []
  line.values.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) runs.push(cur.join(' '))
      cur = []
      return
    }
    const y = 100 - (line.top > 0 ? (v / line.top) * 100 : 0)
    cur.push(`${(centre(i) * WIDTH).toFixed(1)},${y.toFixed(1)}`)
  })
  if (cur.length > 1) runs.push(cur.join(' '))
  return runs
}

function Legend({ bars, line }: { bars: KpiMetricDef; line: KpiMetricDef | null }) {
  const { lang } = useI18n()
  return (
    <span className={cn(NOTE, 'flex flex-wrap gap-x-3 gap-y-1')}>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="bg-primary rounded-xs size-2" />
        {kpiMetricText(bars.key, lang)}
      </span>
      {line && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="bg-foreground h-0.5 w-3 rounded-sm" />
          {kpiMetricText(line.key, lang)}
        </span>
      )}
    </span>
  )
}

export function TrendCard({
  period,
  defs,
  trend,
}: {
  period: string
  defs: readonly KpiMetricDef[]
  trend: KpiTrendResponse
}) {
  const { t, lang } = useI18n()
  const view = trendOf(defs, trend)
  if (!view) return null
  const { bars, line, months } = view
  const gap = [...bars.values, ...(line?.values ?? [])].some((v) => v === null)
  const name = kpiMetricText(bars.def.key, lang)
  const figures = bars.values.map(
    (v, i) => `${monthFoot(months[i]!)} ${v === null ? DASH : printShort(bars.def.unit, v)}`,
  )
  const summary = `${name}: ${figures.join(', ')}`
  return (
    <GlassCard className={TILE}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-5">
          {t(message(`${name}, 6 tháng`, `${name}, 6 months`, `${name}, 6개월`))}
        </h3>
        <Legend bars={bars.def} line={line?.def ?? null} />
      </div>
      <div
        role="img"
        aria-label={summary}
        className="relative"
        style={{ height: BARS + (line ? LABEL + BAND + GAP : 0) }}
      >
        <div
          className="absolute inset-x-0 bottom-0 grid grid-cols-6 items-end"
          style={{ height: BARS }}
        >
          {bars.values.map((v, i) => (
            <span key={months[i]} className="flex justify-center">
              {v !== null && (
                <span
                  className="bg-primary w-8 rounded-sm"
                  style={{ height: Math.max(Math.round((v / Math.max(bars.top, 1)) * BARS), 3) }}
                />
              )}
            </span>
          ))}
        </div>
        {line && (
          <div
            className="absolute inset-x-0 top-0"
            style={{ paddingTop: LABEL, height: LABEL + BAND }}
          >
            <div className="relative size-full">
              <svg
                viewBox={`0 0 ${WIDTH} 100`}
                preserveAspectRatio="none"
                aria-hidden
                className="absolute inset-0 size-full overflow-visible"
              >
                {runsOf(line).map((points) => (
                  <polyline
                    key={points}
                    points={points}
                    fill="none"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    className="stroke-foreground"
                  />
                ))}
              </svg>
              {line.values.map((v, i) =>
                v === null ? null : (
                  <span
                    key={months[i]}
                    className="absolute -translate-x-1/2 translate-y-1/2"
                    style={{
                      left: `${centre(i) * 100}%`,
                      bottom: `${(line.top > 0 ? v / line.top : 0) * 100}%`,
                    }}
                  >
                    <span aria-hidden className="bg-foreground block size-2 rounded-full" />
                    <span className="tnum font-num bg-card/70 absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-sm px-1 text-[12px]">
                      {printShort(line.def.unit, v)}
                    </span>
                  </span>
                ),
              )}
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-6 text-center">
        {months.map((m, i) => {
          const v = bars.values[i] ?? null
          return (
            <span key={m} className="flex flex-col gap-1" title={m}>
              <span className="text-muted-foreground text-[11px]">{monthFoot(m)}</span>
              <span className="tnum font-num text-[12px] font-semibold">
                {v === null ? DASH : printShort(bars.def.unit, v)}
              </span>
            </span>
          )
        })}
      </div>
      {(gap || !monthEnded(period)) && (
        <span className={NOTE}>
          {!monthEnded(period) && `${t(TREND_TODAY)} `}
          {gap && t(TREND_GAP)}
        </span>
      )}
    </GlassCard>
  )
}
