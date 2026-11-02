import { GlassCard, cn } from '@pv/ui'
import { type KpiForecastResponse } from '@pv/contracts'
import { StackTable, type StackColumn } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { forecastItems, type ForecastItem } from '@/data/kpi-forecast'
import { NOTE } from './home-tiles'
import { useI18n, message, type Message } from '@/app/i18n'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { FlagBadge, FlagRule } from './kpi-company-forecast'
import { DASH, printShort } from './kpi-model'

/** One person's end-of-month forecast, cut from the same everyone read the
 *  company screen uses, so the two screens cannot disagree on a flag.
 *
 *  Every paced metric is listed, flagged or not: on a person's own screen an
 *  unflagged line still says where the month is heading. The legend prints
 *  both thresholds from the response. */

/* Value and target are on the scoreboard above; this table adds only where the month heads. */
const columnsOf = (t: (copy: Message) => string): StackColumn[] => [
  { header: t(message('Chỉ số', 'Metric', '지표')), width: 'minmax(0,1.6fr)' },
  {
    header: t(message('Dự báo cuối tháng', 'Month-end forecast', '월말 예상')),
    width: 'minmax(0,1.1fr)',
    align: 'right',
  },
  { header: t(message('Cảnh báo', 'Alert', '경고')), width: 'minmax(0,1fr)' },
]

const FIGURE = 'tnum font-num'

function cellsOf({ def, forecast }: ForecastItem, withRole: boolean, lang: 'vi' | 'en' | 'ko') {
  return [
    <span key="metric" className="flex min-w-0 flex-col gap-1">
      <span>{kpiMetricText(def.key, lang)}</span>
      {withRole && <span className={NOTE}>{kpiRoleText(forecast.role, lang)}</span>}
    </span>,
    <span key="projected" className={cn(FIGURE, 'font-semibold')}>
      {printShort(def.unit, forecast.projected)}
    </span>,
    forecast.flag ? <FlagBadge key="flag" flag={forecast.flag} /> : DASH,
  ]
}

export function PersonForecast({
  catalog,
  data,
  actorId,
}: {
  catalog: KpiCatalog
  data: KpiForecastResponse
  actorId: string
}) {
  const { t, lang } = useI18n()
  const items = forecastItems(
    catalog,
    data.items.filter((i) => i.actorId === actorId),
  )
  const withRole = new Set(items.map((i) => i.forecast.role)).size > 1
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      <ul className={cn(NOTE, 'flex flex-col gap-2 px-5')}>
        {(['slip', 'hit'] as const).map((flag) => (
          <li key={flag} className="flex flex-wrap items-center gap-2">
            <FlagBadge flag={flag} />
            <FlagRule flag={flag} thresholds={data.thresholds} />
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="px-5 text-[12.5px] leading-5">
          {t(
            message(
              'Chưa có chỉ số nào để dự báo.',
              'No metrics to forecast yet.',
              '아직 예측할 지표가 없습니다.',
            ),
          )}
        </p>
      ) : (
        <StackTable
          from="md"
          flush
          rowHeight="min-h-12 py-2"
          tableClassName="min-w-md"
          columns={columnsOf(t)}
          rows={items.map((item) => ({
            id: `${item.forecast.role}/${item.def.key}`,
            cells: cellsOf(item, withRole, lang),
          }))}
        />
      )}
    </GlassCard>
  )
}
