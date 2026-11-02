import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, CircleCheck, GlassCard, Icon, cn } from '@pv/ui'
import { type KpiMetricDef, type KpiPerson, type KpiReading, type KpiTeamRef } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { kpiMetricText, kpiRoleText, kpiVerdictText } from '@/data/kpi-i18n'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { teamPath } from './kpi-allocate-model'
import { NAME_LINK } from './kpi-company-forecast'
import {
  DASH,
  exceptionRows,
  heavierFirst,
  personHref,
  printCell,
  roleGroups,
  shareOf,
  shortfallOf,
  unjudgedRoles,
  VERDICT_TINT,
  weightOf,
  type PersonRow,
  type RoleGroup,
} from './kpi-model'
import { AdjustmentNote, ByDefaultMark, VerdictBadge } from './kpi-parts'

/** The two blocks a `kpi.view-all` holder sees under the role table, both fed
 *  by `GET /sales/kpi/:period/people`: what needs handling, and a heat map of
 *  every person's readings.
 *
 *  The heat map is one table per role because roles carry different metrics;
 *  one shared column set would leave most cells empty. Each cell prints its
 *  verdict in words under the figure, so the tint is never the only signal;
 *  below `lg` each person is a card listing those cells. A person's name
 *  opens their own KPI screen on the same month. */

type Say = (copy: Message) => string

const attentionColumns = (t: Say): StackColumn[] => [
  { header: t(message('Người', 'Person', '담당자')), width: 'minmax(0,1.2fr)' },
  { header: t(message('Vai trò', 'Role', '역할')), width: 'minmax(0,1.2fr)' },
  { header: t(message('Chỉ số', 'Metric', '지표')), width: 'minmax(0,1.8fr)' },
  { header: t(message('Thực tế', 'Actual', '실적')), width: 'minmax(0,1fr)', align: 'right' },
  { header: t(message('Chỉ tiêu', 'Target', '목표')), width: 'minmax(0,1fr)', align: 'right' },
  { header: t(message('Trạng thái', 'Status', '상태')), width: 'minmax(0,1.3fr)' },
]

/* The heat map's floor follows its column count: DataTable clips sideways, so
   a floor narrower than the columns would cut the last one off unscrollably. */
const HEAT_CELL = 144
const HEAT_GAP = 12
const HEAT_PAD = 40
const heatWidth = (metrics: number) => HEAT_PAD + (metrics + 1) * HEAT_CELL + metrics * HEAT_GAP

const TWO_LINES = 'flex min-w-0 flex-col items-start gap-1'
const FIGURE = 'tnum font-num'
const LINE = 'text-[12.5px] leading-5'

/** A person's team in the roster of the month; absent when the roster read failed. */
export type TeamOf = (actorId: string) => KpiTeamRef | undefined

const TEAM_LINK = cn(
  NOTE,
  'pointer-coarse:min-h-12 inline-flex items-center underline underline-offset-2',
)

/** The name opens the person's KPI; the team line under it opens the team page,
 *  the head's way in there from this screen. */
function NameCell({
  person,
  period,
  teamOf,
}: {
  person: Pick<KpiPerson, 'actorId' | 'name'>
  period: string
  teamOf?: TeamOf
}) {
  const { t } = useI18n()
  const link = (
    <Link to={personHref(person.actorId, period)} className={NAME_LINK}>
      {person.name}
    </Link>
  )
  const team = teamOf?.(person.actorId)
  if (!team) return link
  return (
    <span className={TWO_LINES}>
      {link}
      <Link to={teamPath(team.id, period)} className={TEAM_LINK}>
        {t(message(`Nhóm ${team.name}`, `Team ${team.name}`, `${team.name} 팀`))}
      </Link>
    </span>
  )
}

function attentionCells(row: PersonRow, period: string, t: Say, teamOf?: TeamOf): ReactNode[] {
  const { item, acknowledgement: ack } = row
  const head = [
    <NameCell key="person" person={row.person} period={period} teamOf={teamOf} />,
    kpiRoleText(row.role),
  ]
  if (item === null) {
    return [
      ...head,
      DASH,
      DASH,
      DASH,
      <Badge key="state" tone="warning" className="whitespace-normal">
        {t(
          ack.state === 'stale'
            ? message(
                'Cần nhận lại chỉ tiêu',
                'Target must be received again',
                '목표를 다시 수령해야 함',
              )
            : message('Chưa nhận chỉ tiêu', 'Target not received', '목표 미수령'),
        )}
      </Badge>,
    ]
  }
  const { def, reading } = item
  const shortfall = shortfallOf(item)
  return [
    ...head,
    <span key="metric" className={TWO_LINES}>
      <span>{kpiMetricText(def.key)}</span>
      {shortfall && <span className={cn(NOTE, FIGURE)}>{shortfall}</span>}
    </span>,
    <span key="value" className={cn(FIGURE, 'font-semibold')}>
      {printCell(def.unit, reading.value)}
    </span>,
    <span key="target" className="flex min-w-0 flex-col items-end gap-1">
      <span className={FIGURE}>{printCell(def.unit, reading.target)}</span>
      <ByDefaultMark reading={reading} />
    </span>,
    <VerdictBadge key="state" verdict={reading.verdict} />,
  ]
}

/** Readings behind or missed, then targets nobody has received. With no
 *  approved target nothing can be judged, so that is said instead of an all-clear. */
export function AttentionBlock({
  catalog,
  people,
  period,
  teamOf,
}: {
  catalog: KpiCatalog
  people: readonly KpiPerson[]
  period: string
  teamOf?: TeamOf
}) {
  const { t } = useI18n()
  const rows = exceptionRows(catalog, people)
  const unjudged = unjudgedRoles(people)
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      {unjudged > 0 && (
        <p className={cn(LINE, 'px-5')}>
          <span className={FIGURE}>{num(unjudged)}</span>{' '}
          {t(
            message(
              'vai trò chưa có chỉ tiêu được duyệt.',
              unjudged === 1 ? 'role has no approved target.' : 'roles have no approved target.',
              '개 역할에 승인된 목표가 없습니다.',
            ),
          )}
        </p>
      )}
      {rows.length > 0 && (
        <StackTable
          from="lg"
          flush
          rowHeight="min-h-12 py-2"
          tableClassName="min-w-3xl"
          columns={attentionColumns(t)}
          rows={rows.map((row) => ({ id: row.id, cells: attentionCells(row, period, t, teamOf) }))}
        />
      )}
      {rows.length === 0 && unjudged === 0 && (
        <p className={cn(LINE, 'flex items-center gap-2 px-5')}>
          <Icon icon={CircleCheck} size={16} className="text-success shrink-0" />
          {t(
            message(
              'Không ai đang hụt chỉ tiêu.',
              'No one is behind target.',
              '목표에 미달한 사람이 없습니다.',
            ),
          )}
        </p>
      )}
    </GlassCard>
  )
}

/** Figure, then "% · verdict". The share is left out where `shareOf` says it
 *  means nothing. */
function heatCell(def: KpiMetricDef, reading: KpiReading | undefined) {
  if (reading === undefined) return DASH
  const share = shareOf({ def, reading })
  const { tint, text } = VERDICT_TINT[reading.verdict]
  return (
    <span className={cn('flex flex-col gap-1 rounded-sm px-2 py-1', tint)}>
      <span className={cn(FIGURE, 'font-semibold')}>{printCell(def.unit, reading.value)}</span>
      <span className={cn(FIGURE, text, 'text-[11px] font-semibold leading-4')}>
        {share !== null && `${num(Math.round(share * 100))}% · `}
        {kpiVerdictText(reading.verdict)}
      </span>
      <AdjustmentNote unit={def.unit} reading={reading} form="heat" />
    </span>
  )
}

function RoleHeat({
  defs,
  group,
  period,
  teamOf,
}: {
  /** The role's metrics in force, in catalog order. */
  defs: readonly KpiMetricDef[]
  group: RoleGroup
  period: string
  teamOf?: TeamOf
}) {
  const { t } = useI18n()
  const columns: StackColumn[] = [
    { header: t(message('Người', 'Person', '담당자')), width: `minmax(${HEAT_CELL}px,1.2fr)` },
    ...defs.map((def) => ({
      header: kpiMetricText(def.key),
      width: `minmax(${HEAT_CELL}px,1fr)`,
    })),
  ]
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      <h3 className="font-display px-5 text-[14px] font-semibold">
        {kpiRoleText(group.role)}{' '}
        <span className={cn(NOTE, FIGURE, 'font-normal')}>
          ·{' '}
          {t(
            message(
              `${num(group.holders.length)} người`,
              `${num(group.holders.length)} ${group.holders.length === 1 ? 'person' : 'people'}`,
              `${num(group.holders.length)}명`,
            ),
          )}
        </span>
      </h3>
      <StackTable
        from="lg"
        flush
        rowHeight="min-h-14 py-2"
        tableStyle={{ minWidth: heatWidth(defs.length) }}
        columns={columns}
        rows={group.holders.map(({ person, card }) => ({
          id: `${person.actorId}/${card.role}`,
          cells: [
            <NameCell key="person" person={person} period={period} teamOf={teamOf} />,
            ...defs.map((def) =>
              heatCell(
                def,
                card.readings.find((r) => r.key === def.key),
              ),
            ),
          ],
        }))}
      />
    </GlassCard>
  )
}

/** Every person's readings, one heat map per role, each table ordered by that
 *  role's own card rather than by the person's whole load. The page leaves this
 *  out when nobody holds a role, so the role table carries the one empty line. */
export function RankedHeatmap({
  catalog,
  people,
  period,
  teamOf,
}: {
  catalog: KpiCatalog
  people: readonly KpiPerson[]
  period: string
  teamOf?: TeamOf
}) {
  return (
    <div className="flex flex-col gap-4">
      {roleGroups(people).map(({ role, holders }) => (
        <RoleHeat
          key={role}
          defs={catalog[role]}
          group={{
            role,
            holders: [...holders].sort((a, b) =>
              heavierFirst(weightOf([a.card]), weightOf([b.card])),
            ),
          }}
          period={period}
          teamOf={teamOf}
        />
      ))}
    </div>
  )
}
