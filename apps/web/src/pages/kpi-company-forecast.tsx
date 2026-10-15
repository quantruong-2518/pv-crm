import { Link } from 'react-router-dom'
import {
  Badge,
  DataTable,
  GlassCard,
  Icon,
  TrendingDown,
  TrendingUp,
  cn,
  percent,
  type TableColumn,
} from '@pv/ui'
import { KPI_METRIC_LABEL, type KpiForecastResponse } from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import {
  flagged,
  forecastItems,
  reachedOf,
  type ForecastFlag,
  type ForecastItem,
} from '@/data/kpi-forecast'
import { ROLE_LABEL } from '@/data/users'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { DASH, personHref, printShort } from './kpi-model'

/** "About to miss" and "about to hit" on the company screen, both cut from one
 *  `GET /sales/kpi/:period/forecast` read (ADR 0098 §6).
 *
 *  The flag is the server's and its thresholds are config, so the rule under
 *  each heading is printed from `thresholds`, never typed. Each column is
 *  named in words beside its icon, so no row is told by colour alone. */

/** A person's name that opens their KPI screen; tall enough to tap on a tablet. */
export const NAME_LINK =
  'text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center font-semibold underline underline-offset-2'

const FIGURE = 'tnum font-num'
const TWO_LINES = 'flex min-w-0 flex-col gap-1'

type Flag = ForecastFlag

const FACE: Record<Flag, { title: string; icon: typeof TrendingUp; tone: string; empty: string }> =
  {
    slip: {
      title: 'Sắp trượt',
      icon: TrendingDown,
      tone: 'text-warning',
      empty: 'Không ai sắp trượt chỉ tiêu.',
    },
    hit: {
      title: 'Sắp đạt',
      icon: TrendingUp,
      tone: 'text-success',
      empty: 'Chưa ai sắp đạt chỉ tiêu.',
    },
  }

/** The rule behind a flag, in the config's own numbers. */
export function FlagRule({
  flag,
  thresholds,
}: {
  flag: Flag
  thresholds: KpiForecastResponse['thresholds']
}) {
  return flag === 'slip'
    ? `Dự báo cuối tháng dưới ${percent(thresholds.slipRatio)} chỉ tiêu.`
    : `Đã đạt từ ${percent(thresholds.hitRatio)} chỉ tiêu.`
}

export function FlagBadge({ flag }: { flag: Flag }) {
  return <Badge tone={flag === 'slip' ? 'warning' : 'success'}>{FACE[flag].title}</Badge>
}

function columnsOf(flag: Flag): TableColumn[] {
  return [
    { header: 'Người', width: 'minmax(0,1.3fr)' },
    { header: 'Chỉ số', width: 'minmax(0,1.4fr)' },
    { header: 'Hiện có', width: 'minmax(0,.9fr)', align: 'right' },
    { header: flag === 'slip' ? 'Dự báo' : 'Đã đạt', width: 'minmax(0,1fr)', align: 'right' },
  ]
}

function cellsOf(flag: Flag, { def, forecast }: ForecastItem, period: string) {
  const reached = reachedOf(forecast)
  const outcome =
    flag === 'slip'
      ? printShort(def.unit, forecast.projected)
      : reached === null
        ? DASH
        : percent(reached)
  return [
    <span key="person" className={TWO_LINES}>
      <Link to={personHref(forecast.actorId, period)} className={NAME_LINK}>
        {forecast.name}
      </Link>
      <span className={NOTE}>{ROLE_LABEL[forecast.role]}</span>
    </span>,
    KPI_METRIC_LABEL[def.key],
    <span key="value" className={FIGURE}>
      {printShort(def.unit, forecast.value)}
    </span>,
    <span key="outcome" className={cn(TWO_LINES, 'items-end')}>
      <span className={cn(FIGURE, 'font-semibold')}>{outcome}</span>
      <span className={cn(NOTE, FIGURE)}>Chỉ tiêu {printShort(def.unit, forecast.target)}</span>
    </span>,
  ]
}

function FlagCard({
  flag,
  items,
  data,
}: {
  flag: Flag
  items: ForecastItem[]
  data: KpiForecastResponse
}) {
  const face = FACE[flag]
  const rows = flagged(items, flag)
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 py-4">
      <div className="flex flex-col gap-1 px-5">
        <h3 className="font-display flex items-center gap-2 text-[14px] font-semibold">
          <Icon icon={face.icon} size={16} className={cn('shrink-0', face.tone)} />
          {face.title}
          {rows.length > 0 && (
            <span className={cn(NOTE, FIGURE, 'font-normal')}>· {num(rows.length)}</span>
          )}
        </h3>
        <p className={NOTE}>
          <FlagRule flag={flag} thresholds={data.thresholds} />
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 text-[12.5px] leading-5">{face.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            flush
            rowHeight="min-h-12 py-2"
            className="min-w-lg"
            columns={columnsOf(flag)}
            rows={rows.map((item) => ({
              id: `${item.forecast.actorId}/${item.forecast.role}/${item.def.key}`,
              cells: cellsOf(flag, item, data.period),
            }))}
          />
        </div>
      )}
    </GlassCard>
  )
}

export function KpiForecastBlock({
  catalog,
  data,
}: {
  catalog: KpiCatalog
  data: KpiForecastResponse
}) {
  const items = forecastItems(catalog, data.items)
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <FlagCard flag="slip" items={items} data={data} />
      <FlagCard flag="hit" items={items} data={data} />
    </div>
  )
}
