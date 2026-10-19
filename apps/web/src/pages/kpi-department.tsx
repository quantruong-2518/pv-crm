import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell, Button, ScreenHeader, ScreenLayout, SectionTitle, cn } from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { kpiPeopleQuery } from '@/data/kpi'
import { kpiCountersQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog } from '@/data/kpi-catalog'
import { kpiForecastQuery } from '@/data/kpi-forecast'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { keyOf, num } from './home-model'
import { NOTE } from './home-tiles'
import { PROPOSALS_PATH, monthQuery } from './kpi-allocate-model'
import { KpiForecastBlock } from './kpi-company-forecast'
import { AttentionBlock, type TeamOf } from './kpi-company-people'
import { openCounters, roomForecast, roomPeople } from './kpi-department-model'
import { RankedHeatmap, RoomStrip } from './kpi-department-parts'
import { MONTH_PARAM, dayOfMonth, pickFromUrl } from './kpi-model'
import { MonthCloseBar } from './kpi-month-close'
import { MonthPicker, QueryBlock } from './kpi-parts'

/** The head of sales' view of the room: who needs coaching this month. Read
 *  live from `/sales/kpi/:period/people | forecast | counters`. No fixture,
 *  no scenario.
 *
 *  Unlike the company screen there is no room scorecard strip and no
 *  director role: the strip counts people, and every block lists people
 *  heaviest first (see `kpi-department-model.ts`). The route asks for
 *  `kpi.view-all`, which all three reads need.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens). */

export function KpiDepartmentPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const pick = pickFromUrl(params.get(MONTH_PARAM))
  const period = keyOf(pick)
  const day = dayOfMonth(period)

  const catalog = useQuery(kpiCatalogQuery)
  const people = useQuery(kpiPeopleQuery(period))
  const forecast = useQuery(kpiForecastQuery(period))
  const counters = useQuery(kpiCountersQuery(period))
  /* Optional: without the roster the tables still read, only the team line goes. */
  const roster = useQuery(kpiTeamRosterQuery(period))
  const teamByActor = new Map(
    (roster.data?.teams ?? []).flatMap((t) => t.members.map((m) => [m.actorId, t] as const)),
  )
  const teamOf: TeamOf = (actorId) => teamByActor.get(actorId)
  const waiting = counters.data ? openCounters(counters.data.counters) : 0
  /* Nobody holds a KPI role: the strip's zero says so once. */
  const nobody = people.data !== undefined && roomPeople(people.data.people).length === 0

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Thống kê phòng"
          description={day && <span className="tnum font-num">{day}</span>}
          actions={
            <MonthPicker
              pick={pick}
              onPick={(p) => setParams({ [MONTH_PARAM]: keyOf(p) }, { replace: true })}
            />
          }
        />

        <MonthCloseBar period={period} monthClose={people.data?.monthClose} />

        <QueryBlock query={people} what="KPI của phòng">
          {(data) => <RoomStrip people={roomPeople(data.people)} />}
        </QueryBlock>

        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">Dự báo cuối tháng</SectionTitle>
          <QueryBlock query={withCatalog(forecast, catalog)} what="dự báo cuối tháng" variant="b">
            {([data, defs]) => <KpiForecastBlock catalog={defs} data={roomForecast(data)} />}
          </QueryBlock>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle
            size="lg"
            actions={
              <>
                {waiting > 0 && (
                  <span className={cn(NOTE, 'tnum font-num')}>
                    {num(waiting)} đề xuất chờ xử lý
                  </span>
                )}
                <Button
                  variant="secondary"
                  className="pointer-coarse:h-12"
                  onClick={() => navigate(`${PROPOSALS_PATH}${monthQuery(period)}`)}
                >
                  Xử lý đề xuất
                </Button>
              </>
            }
          >
            Cần xử lý
          </SectionTitle>
          {nobody && <p className={NOTE}>Chưa có ai giữ vai trò có KPI.</p>}
          {!nobody && (
            <QueryBlock
              query={withCatalog(people, catalog)}
              what="danh sách cần xử lý"
              variant="b"
              quiet
            >
              {([data, defs]) => (
                <AttentionBlock
                  catalog={defs}
                  people={roomPeople(data.people)}
                  period={data.period}
                  teamOf={teamOf}
                />
              )}
            </QueryBlock>
          )}
        </section>

        {!nobody && (
          <section className="flex flex-col gap-3">
            <SectionTitle size="lg">Chi tiết từng người</SectionTitle>
            <QueryBlock
              query={withCatalog(people, catalog)}
              what="KPI từng người"
              variant="b"
              quiet
            >
              {([data, defs]) => (
                <RankedHeatmap
                  catalog={defs}
                  people={roomPeople(data.people)}
                  period={data.period}
                  teamOf={teamOf}
                />
              )}
            </QueryBlock>
          </section>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiDepartmentPage
