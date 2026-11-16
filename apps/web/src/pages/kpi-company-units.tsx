import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, GlassCard, cn } from '@pv/ui'
import type { KpiCompanyDeskResponse, KpiMetricDef, KpiMetricKey } from '@pv/contracts'
import { formatNumber, message, useI18n } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { NOTE } from './home-tiles'
import { NAME_LINK } from './kpi-company-forecast'
import { UNIT_PATH, MONTH_PARAM } from '@/lib/kpi-paths'
import { DASH, personHref, printShort } from './kpi-model'
import { VerdictBadge } from './kpi-parts'
import { CoverageLowBadge } from './kpi-unit-parts'

/** The two tables of the company tab, both from `GET …/company/desk` (ADR 0159 §2):
 *  one row per unit, opening the unit as its head sees it, and the people who
 *  are behind on their main metric. The per-person table lives on the unit tab. */

const FIGURE = 'tnum font-num'

const defOfKey = (catalog: KpiCatalog, key: KpiMetricKey): KpiMetricDef | undefined =>
  Object.values(catalog)
    .flat()
    .find((d) => d.key === key)

const oneDecimal = (value: number) =>
  formatNumber(value, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const whole = (value: number) => formatNumber(value, undefined, { maximumFractionDigits: 0 })

export function UnitsTable({
  catalog,
  period,
  units,
}: {
  catalog: KpiCatalog
  period: string
  units: KpiCompanyDeskResponse['units']
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const columns: StackColumn[] = [
    { header: t(message('Đơn vị', 'Unit', '조직')), width: 'minmax(0,1.4fr)' },
    { header: t(message('Trưởng', 'Head', '책임자')), width: 'minmax(0,1.2fr)' },
    {
      header: t(message('Giá trị ký', 'Signed value', '계약 금액')),
      width: 'minmax(0,1.3fr)',
      align: 'right',
    },
    { header: t(message('Nhịp', 'Pace', '진행')), width: 'minmax(0,1fr)' },
    {
      header: t(message('Độ phủ', 'Coverage', '커버리지')),
      width: 'minmax(0,.7fr)',
      align: 'right',
    },
    {
      header: t(
        message('Điểm trung bình tháng trước', 'Average score, last month', '지난달 평균 점수'),
      ),
      width: 'minmax(0,.9fr)',
      align: 'right',
    },
    { header: t(message('Dự báo tuần', 'Weekly forecast', '주간 예상')), width: 'minmax(0,.9fr)' },
  ]
  return (
    <StackTable
      from="lg"
      flush
      rowHeight="min-h-14 py-2"
      tableClassName="min-w-3xl"
      columns={columns}
      rows={units.map((u) => {
        const def = u.primary ? defOfKey(catalog, u.primary.key) : undefined
        const head = u.standInName
          ? t(
              message(
                `${u.standInName} (thay ${u.headName ?? DASH})`,
                `${u.standInName} (for ${u.headName ?? DASH})`,
                `${u.standInName} (${u.headName ?? DASH} 대리)`,
              ),
            )
          : (u.headName ?? DASH)
        return {
          id: u.unitId,
          onOpen: () => void navigate(`${UNIT_PATH}?${MONTH_PARAM}=${period}&unit=${u.unitId}`),
          cells: [
            <span key="unit" className="font-semibold">
              {u.name}
            </span>,
            head,
            <span key="value" className={FIGURE}>
              {u.primary && def
                ? `${printShort(def.unit, u.primary.value)} / ${printShort(def.unit, u.primary.target)}`
                : DASH}
            </span>,
            u.primary ? <VerdictBadge key="verdict" verdict={u.primary.verdict} /> : DASH,
            u.coverage === null && u.coverageLow ? (
              <CoverageLowBadge key="cover" />
            ) : (
              <span key="cover" className={FIGURE}>
                {u.coverage === null ? DASH : oneDecimal(u.coverage)}
              </span>
            ),
            <span key="score" className={FIGURE}>
              {u.averageScore === null ? DASH : whole(u.averageScore)}
            </span>,
            u.forecastCommitted === null ? (
              DASH
            ) : (
              <Badge key="commit" tone={u.forecastCommitted ? 'success' : 'draft'}>
                {u.forecastCommitted
                  ? t(message('Đã chốt', 'Committed', '확정'))
                  : t(message('Chưa chốt', 'Not committed', '미확정'))}
              </Badge>
            ),
          ],
        }
      })}
    />
  )
}

export function SlippingTable({
  period,
  slipping,
}: {
  period: string
  slipping: KpiCompanyDeskResponse['slipping']
}) {
  const { t } = useI18n()
  const columns: StackColumn[] = [
    { header: t(message('Người', 'Person', '담당자')), width: 'minmax(0,1.4fr)' },
    { header: t(message('Đơn vị', 'Unit', '조직')), width: 'minmax(0,1.2fr)' },
    {
      header: t(message('Thiếu so với nhịp', 'Short of pace', '목표 대비 부족')),
      width: 'minmax(0,1fr)',
      align: 'right',
    },
  ]
  return (
    <StackTable
      from="md"
      flush
      rowHeight="min-h-12 py-2"
      tableClassName="min-w-lg"
      columns={columns}
      rows={slipping.map((s) => ({
        id: s.actorId,
        cells: [
          <Link key="name" to={personHref(s.actorId, period)} className={NAME_LINK}>
            {s.name}
          </Link>,
          s.unitName,
          <span key="gap" className={cn(FIGURE, 'font-semibold')}>
            {printShort('money', s.gap)}
          </span>,
        ],
      }))}
    />
  )
}

/** A table block: a heading line, one quiet sentence, then the table on glass B (law 8). */
export function TableCard({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: ReactNode
}) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 py-4">
      <div className="flex flex-col gap-1 px-5">
        <h3 className="font-display text-[14px] font-semibold">{title}</h3>
        <p className={NOTE}>{note}</p>
      </div>
      {children}
    </GlassCard>
  )
}
