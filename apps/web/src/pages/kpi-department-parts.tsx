import { StatStrip } from '@pv/ui'
import type { KpiPerson, KpiVerdict } from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { num } from './home-model'
import { PeopleHeatmap, type TeamOf } from './kpi-company-people'
import { heavierFirst, weightOf } from './kpi-department-model'
import { acknowledgementOf, needsAcknowledgement, roleGroups } from './kpi-model'

/** The two blocks the department screen draws itself; the rest it borrows
 *  from the company screen. Both take people already cut by `roomPeople`. */

/** People per state. The cells overlap on purpose: one person can have a
 *  missed reading and a behind one, and each cell names a "has" fact. */
export function RoomStrip({ people }: { people: readonly KpiPerson[] }) {
  const has = (v: KpiVerdict) =>
    people.filter((p) => p.scorecards.some((c) => c.readings.some((r) => r.verdict === v))).length
  const missed = has('missed')
  const behind = has('behind')
  const unreceived = people.filter((p) =>
    p.scorecards.some((c) => needsAcknowledgement(acknowledgementOf(c))),
  ).length
  return (
    <StatStrip
      label="Tóm tắt phòng"
      items={[
        { label: 'Số người', value: num(people.length) },
        {
          label: 'Có chỉ số không đạt',
          value: num(missed),
          tone: missed > 0 ? 'warning' : 'default',
        },
        {
          label: 'Có chỉ số chậm tiến độ',
          value: num(behind),
          tone: behind > 0 ? 'warning' : 'default',
        },
        { label: 'Chưa nhận chỉ tiêu', value: num(unreceived) },
      ]}
    />
  )
}

/** The company heat map, one role at a time so each table is ordered by that
 *  role's own card rather than by the person's whole load. */
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
      {roleGroups(people).map(({ role, holders }) => {
        const ranked = [...holders]
          .sort((a, b) => heavierFirst(weightOf([a.card]), weightOf([b.card])))
          .map(({ person, card }) => ({ ...person, scorecards: [card] }))
        return (
          <PeopleHeatmap
            key={role}
            catalog={catalog}
            people={ranked}
            period={period}
            teamOf={teamOf}
          />
        )
      })}
    </div>
  )
}
