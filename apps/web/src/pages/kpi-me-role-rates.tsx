import { Badge, GlassCard, cn } from '@pv/ui'
import type { KpiMetricDef, KpiTrendResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { NOTE, TILE } from './home-tiles'
import { printShort } from './kpi-model'
import { RATES_LEGEND, RATES_TITLE, RATE_STATUS } from './kpi-me-role-i18n'
import { rateBars, type RateBar } from './kpi-me-role-model'

/** Each rate of the role against its own target or limit: the bar is the figure,
 *  the tick is the target (a limit for a lower-is-better metric). The scale is
 *  printed so a short bar is not read as a long one. Metrics with a pace belong
 *  to the headline above and are not repeated. */

function statusOf(bar: RateBar) {
  const higher = bar.def.higherIsBetter
  if (bar.verdict === 'met') return { tone: 'success', text: higher ? 'met' : 'within' } as const
  if (bar.verdict === 'under') return { tone: 'warning', text: higher ? 'under' : 'over' } as const
  return { tone: 'draft', text: bar.verdict } as const
}

function Row({ bar }: { bar: RateBar }) {
  const { t, lang } = useI18n()
  const { def, value, target } = bar
  const status = statusOf(bar)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">{kpiMetricText(def.key, lang)}</span>
        <span className="flex items-center gap-2">
          <b className="tnum font-num text-[15px]">
            {value === null ? '—' : printShort(def.unit, value)}
          </b>
          <Badge tone={status.tone}>{t(RATE_STATUS[status.text])}</Badge>
        </span>
      </div>
      <div aria-hidden className="bg-surface-ink/10 relative h-3 rounded-sm">
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-sm',
            status.tone === 'warning' ? 'bg-warning' : 'bg-primary',
          )}
          style={{ width: `${bar.fill * 100}%` }}
        />
        {bar.tick !== null && (
          <span
            className="bg-foreground absolute -inset-y-1 w-0.5 rounded-sm"
            style={{ left: `${bar.tick * 100}%` }}
          />
        )}
      </div>
      <span className={cn(NOTE, 'tnum font-num')}>
        {t(
          message(
            `Thang 0–${printShort(def.unit, bar.top)}.`,
            `Scale 0–${printShort(def.unit, bar.top)}.`,
            `눈금 0–${printShort(def.unit, bar.top)}.`,
          ),
        )}
        {target !== null &&
          ` ${t(
            def.higherIsBetter
              ? message(
                  `Mục tiêu ${printShort(def.unit, target)}.`,
                  `Target ${printShort(def.unit, target)}.`,
                  `목표 ${printShort(def.unit, target)}.`,
                )
              : message(
                  `Giới hạn ${printShort(def.unit, target)}.`,
                  `Limit ${printShort(def.unit, target)}.`,
                  `한도 ${printShort(def.unit, target)}.`,
                ),
          )}`}
      </span>
    </div>
  )
}

export function RatesCard({
  defs,
  trend,
}: {
  defs: readonly KpiMetricDef[]
  trend: KpiTrendResponse
}) {
  const { t } = useI18n()
  const bars = rateBars(defs, trend)
  if (bars.length === 0) return null
  return (
    <GlassCard className={TILE}>
      <h3 className="text-[13px] font-semibold leading-5">{t(RATES_TITLE)}</h3>
      <span className={cn(NOTE, 'flex flex-wrap gap-x-3 gap-y-1')}>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="bg-primary rounded-xs size-2" />
          {t(RATES_LEGEND.actual)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="bg-foreground h-3 w-0.5 rounded-sm" />
          {t(RATES_LEGEND.mark)}
        </span>
      </span>
      {bars.map((bar) => (
        <Row key={bar.def.key} bar={bar} />
      ))}
    </GlassCard>
  )
}
