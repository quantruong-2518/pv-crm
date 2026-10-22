import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell, GlassCard, Icon, Lock, ScreenHeader, ScreenLayout, SectionTitle } from '@pv/ui'
import type { KpiForecastResponse, KpiPerson } from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiPersonQuery } from '@/data/kpi'
import { kpiCatalogQuery, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiPersonForecastQuery } from '@/data/kpi-forecast'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { TILE } from './home-tiles'
import { monthQuery, teamPath } from './kpi-allocate-model'
import { ContributionsPanel } from './kpi-contributions'
import { COMPANY_PATH, ME_PATH, acknowledgementOf, dayOfMonth, useMonthParam } from './kpi-model'
import { MonthPicker, QueryBlock, Scoreboard } from './kpi-parts'
import { PersonForecast } from './kpi-person-forecast'

/** One person's KPI — `/sales/kpi/company/:actorId`, opened from a name on the
 *  company screen. Read live from `GET /sales/kpi/:period/people/:actorId` and
 *  its forecast twin; no fixture. The server decides who may read: that
 *  person, a `kpi.view-all` holder, or the lead of the person's team.
 *
 *  The records behind each figure come from the contributions read, which
 *  runs the scorecard's own rule; never rebuilt here from the books.
 *  The team name comes from the roster of the month; it is a label, so a
 *  failed roster read leaves it out rather than blocking the page.
 *
 *  No ContextRail (law 10 debt, as on the company screen): a scorecard is a
 *  sum over many records and opens no single object. */

function PersonBody({
  catalog,
  period,
  person,
  forecast,
}: {
  catalog: KpiCatalog
  period: string
  person: KpiPerson
  forecast: UseQueryResult<KpiForecastResponse>
}) {
  if (person.scorecards.length === 0) {
    return (
      <GlassCard className={TILE}>
        <p className="text-[12.5px] leading-5">Người này không giữ vai trò có KPI.</p>
      </GlassCard>
    )
  }
  return (
    <>
      {person.scorecards.map((card) => (
        <section key={card.role} className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            hint={<span className="tnum font-num">{acknowledgementOf(card).text}</span>}
          >
            {ROLE_LABEL[card.role]}
          </SectionTitle>
          <Scoreboard catalog={catalog} role={card.role} readings={card.readings} />
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <SectionTitle size="lg">Dự báo cuối tháng</SectionTitle>
        <QueryBlock query={forecast} what="dự báo cuối tháng" variant="b">
          {(data) => <PersonForecast catalog={catalog} data={data} actorId={person.actorId} />}
        </QueryBlock>
      </section>
      <ContributionsPanel catalog={catalog} period={period} actorId={person.actorId} />
    </>
  )
}

/** A refusal or a missing person is said in words, not as a failed read. */
function Refusal({ text, locked }: { text: string; locked: boolean }) {
  return (
    <GlassCard className={TILE}>
      <p className="flex items-center gap-2 text-[12.5px] leading-5">
        {locked && <Icon icon={Lock} size={16} className="shrink-0" />}
        {text}
      </p>
    </GlassCard>
  )
}

export function KpiPersonPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const seesAll = useCan('kpi.view-all')
  const { actorId = '' } = useParams()
  const [pick, setPick] = useMonthParam()
  const period = keyOf(pick)

  const person = useQuery(kpiPersonQuery(period, actorId))
  const catalog = useQuery(kpiCatalogQuery)
  const forecast = useQuery(kpiPersonForecastQuery(period, actorId))
  const roster = useQuery(kpiTeamRosterQuery(period))
  const team = roster.data?.teams.find((t) => t.members.some((m) => m.actorId === actorId))
  const led = roster.data?.iLead
    ? roster.data.teams.find((t) => t.id === roster.data.myTeamId)
    : undefined
  const back = seesAll
    ? { label: 'KPI công ty', path: `${COMPANY_PATH}${monthQuery(period)}` }
    : led
      ? { label: `KPI nhóm ${led.name}`, path: teamPath(led.id, period) }
      : { label: 'KPI của tôi', path: `${ME_PATH}${monthQuery(period)}` }
  /* As on the team page: an index above 0 means the reader came from inside the app. */
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(back.path))
  /* Roles are left out: each section below is titled with one. */
  const about = [team && `Nhóm ${team.name}`, dayOfMonth(period)].filter(Boolean)
  const failed = isApiError(person.error) ? person.error.kind : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          back={{ label: back.label, onClick: goBack }}
          title={person.data?.person.name ?? 'KPI nhân sự'}
          description={
            about.length > 0 && <span className="tnum font-num">{about.join(' · ')}</span>
          }
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        {failed === 'forbidden' ? (
          <Refusal locked text="Bạn không có quyền xem KPI của người này." />
        ) : failed === 'not-found' ? (
          <Refusal locked={false} text="Không tìm thấy người này trong phòng Kinh doanh." />
        ) : (
          <QueryBlock query={withCatalog(person, catalog)} what="KPI của người này">
            {([data, defs]) => (
              <PersonBody
                catalog={defs}
                period={data.period}
                person={data.person}
                forecast={forecast}
              />
            )}
          </QueryBlock>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiPersonPage
