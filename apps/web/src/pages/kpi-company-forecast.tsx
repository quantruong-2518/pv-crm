import { Link } from 'react-router-dom'
import { Badge, GlassCard, Icon, TrendingDown, TrendingUp, cn, percent } from '@pv/ui'
import { type KpiForecastResponse } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import {
  flagged,
  forecastItems,
  reachedOf,
  type ForecastFlag,
  type ForecastItem,
} from '@/data/kpi-forecast'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
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

const FACE: Record<
  Flag,
  { title: Message; icon: typeof TrendingUp; tone: string; empty: Message }
> = {
  slip: {
    title: message('Sắp trượt', 'About to miss', '미달 임박'),
    icon: TrendingDown,
    tone: 'text-warning',
    empty: message(
      'Không ai sắp trượt chỉ tiêu.',
      'No one is about to miss their target.',
      '목표 미달이 임박한 사람이 없습니다.',
    ),
  },
  hit: {
    title: message('Sắp đạt', 'About to hit', '달성 임박'),
    icon: TrendingUp,
    tone: 'text-success',
    empty: message(
      'Chưa ai sắp đạt chỉ tiêu.',
      'No one is about to hit their target yet.',
      '목표 달성이 임박한 사람이 아직 없습니다.',
    ),
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
  const { t } = useI18n()
  const slip = percent(thresholds.slipRatio)
  const hit = percent(thresholds.hitRatio)
  return t(
    flag === 'slip'
      ? message(
          `Dự báo cuối tháng dưới ${slip} chỉ tiêu.`,
          `Month-end forecast below ${slip} of target.`,
          `월말 예상치가 목표의 ${slip} 미만입니다.`,
        )
      : message(
          `Đã đạt từ ${hit} chỉ tiêu.`,
          `${hit} of target already reached.`,
          `목표의 ${hit} 이상 달성했습니다.`,
        ),
  )
}

export function FlagBadge({ flag }: { flag: Flag }) {
  const { t } = useI18n()
  return <Badge tone={flag === 'slip' ? 'warning' : 'success'}>{t(FACE[flag].title)}</Badge>
}

function columnsOf(flag: Flag, t: (copy: Message) => string): StackColumn[] {
  return [
    { header: t(message('Người', 'Person', '담당자')), width: 'minmax(0,1.3fr)' },
    { header: t(message('Chỉ số', 'Metric', '지표')), width: 'minmax(0,1.4fr)' },
    { header: t(message('Hiện có', 'Current', '현재')), width: 'minmax(0,.9fr)', align: 'right' },
    {
      header: t(
        flag === 'slip'
          ? message('Dự báo', 'Forecast', '예상')
          : message('Đã đạt', 'Reached', '달성'),
      ),
      width: 'minmax(0,1fr)',
      align: 'right',
    },
  ]
}

function cellsOf(
  flag: Flag,
  { def, forecast }: ForecastItem,
  period: string,
  t: (copy: Message) => string,
) {
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
      <span className={NOTE}>{kpiRoleText(forecast.role)}</span>
    </span>,
    kpiMetricText(def.key),
    <span key="value" className={FIGURE}>
      {printShort(def.unit, forecast.value)}
    </span>,
    <span key="outcome" className={cn(TWO_LINES, 'items-end')}>
      <span className={cn(FIGURE, 'font-semibold')}>{outcome}</span>
      <span className={cn(NOTE, FIGURE)}>
        {t(
          message(
            `Chỉ tiêu ${printShort(def.unit, forecast.target)}`,
            `Target ${printShort(def.unit, forecast.target)}`,
            `목표 ${printShort(def.unit, forecast.target)}`,
          ),
        )}
      </span>
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
  const { t } = useI18n()
  const face = FACE[flag]
  const rows = flagged(items, flag)
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 py-4">
      <div className="flex flex-col gap-1 px-5">
        <h3 className="font-display flex items-center gap-2 text-[14px] font-semibold">
          <Icon icon={face.icon} size={16} className={cn('shrink-0', face.tone)} />
          {t(face.title)}
          {rows.length > 0 && (
            <span className={cn(NOTE, FIGURE, 'font-normal')}>· {num(rows.length)}</span>
          )}
        </h3>
        <p className={NOTE}>
          <FlagRule flag={flag} thresholds={data.thresholds} />
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 text-[12.5px] leading-5">{t(face.empty)}</p>
      ) : (
        <StackTable
          from="md"
          flush
          rowHeight="min-h-12 py-2"
          tableClassName="min-w-lg"
          columns={columnsOf(flag, t)}
          rows={rows.map((item) => ({
            id: `${item.forecast.actorId}/${item.forecast.role}/${item.def.key}`,
            cells: cellsOf(flag, item, data.period, t),
          }))}
        />
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
