import { Link } from 'react-router-dom'
import { GlassCard, cn } from '@pv/ui'
import { type KpiMetricDef, type KpiPerson, type KpiTeamReading, type RoleId } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { NOTE } from './home-tiles'
import { NAME_LINK } from './kpi-company-forecast'
import { DASH, acknowledgementOf, personHref, printCell, roleGroups } from './kpi-model'
import { AdjustmentNote, VerdictBadge } from './kpi-parts'

/** The team's figures and its members' scorecards (ADR 0101 D5, rule 8).
 *
 *  A ratio, hours or days metric does not add up across people, so the server
 *  sends it with no team value and no share, and its row points at the members.
 *  A member's name opens their KPI page, which lets their lead in. Every figure
 *  and verdict is the server's. */

const FIGURE = 'tnum font-num'
const TWO_LINES = 'flex min-w-0 flex-col items-start gap-1'

const readingColumns = (t: (copy: Message) => string): StackColumn[] => [
  { header: t(message('Chỉ số', 'Metric', '지표')), width: 'minmax(0,1.6fr)' },
  {
    header: t(message('Nhóm đạt', 'Team actual', '팀 실적')),
    width: 'minmax(0,1fr)',
    align: 'right',
  },
  {
    header: t(message('Phần của nhóm', 'Team share', '팀 몫')),
    width: 'minmax(0,1fr)',
    align: 'right',
  },
  {
    header: t(message('Cần đạt đến hôm nay', 'Needed by today', '오늘까지 필요한 값')),
    width: 'minmax(0,1.2fr)',
    align: 'right',
  },
  { header: t(message('Trạng thái', 'Status', '상태')), width: 'minmax(0,1.2fr)' },
]

function readingCells(r: KpiTeamReading, def: KpiMetricDef, t: (copy: Message) => string) {
  const additive = r.value !== null
  return [
    <span key="metric" className={TWO_LINES}>
      <span className="font-semibold">{kpiMetricText(r.metricKey)}</span>
      {!additive && (
        <span className={NOTE}>
          {t(message('Xem theo từng thành viên.', 'See each member.', '팀원별로 확인하세요.'))}
        </span>
      )}
    </span>,
    <span key="value" className={TWO_LINES}>
      <span className={cn(FIGURE, 'font-semibold')}>{printCell(def.unit, r.value)}</span>
      <AdjustmentNote unit={def.unit} reading={r} form="cell" />
    </span>,
    <span key="share" className={FIGURE}>
      {printCell(def.unit, r.share)}
    </span>,
    <span key="expected" className={FIGURE}>
      {printCell(def.unit, r.expected)}
    </span>,
    additive ? <VerdictBadge key="state" verdict={r.verdict} /> : DASH,
  ]
}

/** The team's readings against its share, one table per role the team has a share of. */
export function TeamReadings({
  catalog,
  readings,
}: {
  catalog: KpiCatalog
  readings: readonly KpiTeamReading[]
}) {
  const { t } = useI18n()
  const roles = [...new Set(readings.map((r) => r.role))]
  return (
    <div className="flex flex-col gap-4">
      {roles.map((role) => {
        const rows = readings.flatMap((r) => {
          const def = catalog[role].find((d) => d.key === r.metricKey)
          return r.role === role && def ? [{ id: r.metricKey, cells: readingCells(r, def, t) }] : []
        })
        return (
          <GlassCard key={role} variant="b" className="flex flex-col gap-3 py-4">
            <h3 className="font-display px-5 text-[14px] font-semibold">{kpiRoleText(role)}</h3>
            <StackTable
              from="lg"
              flush
              rowHeight="min-h-14 py-2"
              tableClassName="min-w-3xl"
              columns={readingColumns(t)}
              rows={rows}
            />
          </GlassCard>
        )
      })}
    </div>
  )
}

function memberCell(
  def: KpiMetricDef,
  reading: KpiPerson['scorecards'][number]['readings'][number],
) {
  return (
    <span key={def.key} className={TWO_LINES}>
      <span className={cn(FIGURE, 'font-semibold')}>{printCell(def.unit, reading.value)}</span>
      <AdjustmentNote unit={def.unit} reading={reading} form="cell" />
      <VerdictBadge verdict={reading.verdict} />
    </span>
  )
}

function RoleMembers({
  period,
  defs,
  role,
  holders,
}: {
  period: string
  defs: readonly KpiMetricDef[]
  role: RoleId
  holders: ReturnType<typeof roleGroups>[number]['holders']
}) {
  const { t } = useI18n()
  const columns: StackColumn[] = [
    { header: t(message('Thành viên', 'Member', '팀원')), width: 'minmax(160px,1.2fr)' },
    ...defs.map((def) => ({ header: kpiMetricText(def.key), width: 'minmax(144px,1fr)' })),
  ]
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      <h3 className="font-display px-5 text-[14px] font-semibold">{kpiRoleText(role)}</h3>
      <StackTable
        from="lg"
        flush
        rowHeight="min-h-16 py-2"
        tableClassName={defs.length > 3 ? 'min-w-5xl' : 'min-w-3xl'}
        columns={columns}
        rows={holders.map(({ person, card }) => ({
          id: `${person.actorId}/${role}`,
          cells: [
            <span key="who" className={TWO_LINES}>
              <Link to={personHref(person.actorId, period)} className={cn(NAME_LINK, 'max-w-full')}>
                <span className="truncate">{person.name}</span>
              </Link>
              <span className={NOTE}>{acknowledgementOf(card).text}</span>
            </span>,
            ...defs.map((def) => {
              const reading = card.readings.find((r) => r.key === def.key)
              return reading ? memberCell(def, reading) : DASH
            }),
          ],
        }))}
      />
    </GlassCard>
  )
}

/** Every member's readings, one table per role since roles carry different metrics. */
export function TeamMembers({
  period,
  catalog,
  people,
}: {
  period: string
  catalog: KpiCatalog
  people: readonly KpiPerson[]
}) {
  const { t } = useI18n()
  const groups = roleGroups(people)
  if (groups.length === 0) {
    return (
      <p className={NOTE}>
        {t(
          message(
            'Nhóm chưa có ai giữ vai trò có KPI.',
            'No one in the team holds a role with KPIs.',
            '팀에 KPI가 있는 역할을 맡은 사람이 없습니다.',
          ),
        )}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <RoleMembers
          key={g.role}
          period={period}
          defs={catalog[g.role]}
          role={g.role}
          holders={g.holders}
        />
      ))}
    </div>
  )
}
