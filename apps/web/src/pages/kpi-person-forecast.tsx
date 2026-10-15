import { DataTable, GlassCard, cn, type TableColumn } from '@pv/ui'
import { KPI_METRIC_LABEL, type KpiForecastResponse } from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { forecastItems, type ForecastItem } from '@/data/kpi-forecast'
import { ROLE_LABEL } from '@/data/users'
import { NOTE } from './home-tiles'
import { FlagBadge, FlagRule } from './kpi-company-forecast'
import { DASH, printShort } from './kpi-model'

/** One person's end-of-month forecast, cut from the same everyone read the
 *  company screen uses, so the two screens cannot disagree on a flag.
 *
 *  Every paced metric is listed, flagged or not: on a person's own screen an
 *  unflagged line still says where the month is heading. The legend prints
 *  both thresholds from the response. */

/* Value and target are on the scoreboard above; this table adds only where the month heads. */
const COLUMNS: TableColumn[] = [
  { header: 'Chỉ số', width: 'minmax(0,1.6fr)' },
  { header: 'Dự báo cuối tháng', width: 'minmax(0,1.1fr)', align: 'right' },
  { header: 'Cảnh báo', width: 'minmax(0,1fr)' },
]

const FIGURE = 'tnum font-num'

function cellsOf({ def, forecast }: ForecastItem, withRole: boolean) {
  return [
    <span key="metric" className="flex min-w-0 flex-col gap-1">
      <span>{KPI_METRIC_LABEL[def.key]}</span>
      {withRole && <span className={NOTE}>{ROLE_LABEL[forecast.role]}</span>}
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
        <p className="px-5 text-[12.5px] leading-5">Chưa có chỉ số nào để dự báo.</p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            flush
            rowHeight="min-h-12 py-2"
            className="min-w-md"
            columns={COLUMNS}
            rows={items.map((item) => ({
              id: `${item.forecast.role}/${item.def.key}`,
              cells: cellsOf(item, withRole),
            }))}
          />
        </div>
      )}
    </GlassCard>
  )
}
