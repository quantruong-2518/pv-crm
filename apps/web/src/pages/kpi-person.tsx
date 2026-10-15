import { useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell, GlassCard, ScreenHeader, ScreenLayout, SectionTitle } from '@pv/ui'
import type { KpiForecastResponse, KpiPerson } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { kpiPeopleQuery } from '@/data/kpi'
import { kpiCatalogQuery, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiForecastQuery } from '@/data/kpi-forecast'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { ContributionsPanel } from './kpi-contributions'
import { TILE } from './home-tiles'
import { MONTH_PARAM, acknowledgementOf, dayOfMonth, pickFromUrl } from './kpi-model'
import { MonthPicker, QueryBlock, Scoreboard } from './kpi-parts'
import { PersonForecast } from './kpi-person-forecast'

/** One person's KPI — `/sales/kpi/person/:actorId`, opened from a name on the
 *  company screen. Read live from the same two reads that screen uses
 *  (`people`, `forecast`), filtered here to one actor; no fixture.
 *
 *  The records behind each figure come from the contributions read, which
 *  runs the scorecard's own rule; never rebuilt here from the books.
 *
 *  No ContextRail (law 10 debt, as on the company screen): a scorecard is a
 *  sum over many records and opens no single object. */

function PersonBody({
  catalog,
  person,
  forecast,
}: {
  catalog: KpiCatalog
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
    </>
  )
}

export function KpiPersonPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { actorId = '' } = useParams()
  const [search] = useSearchParams()
  const [pick, setPick] = useState(() => pickFromUrl(search.get(MONTH_PARAM)))
  const period = keyOf(pick)

  const people = useQuery(kpiPeopleQuery(period))
  const catalog = useQuery(kpiCatalogQuery)
  const forecast = useQuery(kpiForecastQuery(period))
  const person = people.data?.people.find((p) => p.actorId === actorId)
  const about = [
    ...(person?.roleIds.map((role) => ROLE_LABEL[role]) ?? []),
    dayOfMonth(period),
  ].filter(Boolean)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          back={{ label: 'Về KPI công ty', onClick: () => navigate('/sales/kpi/company') }}
          title={person?.name ?? 'KPI nhân sự'}
          description={
            about.length > 0 && <span className="tnum font-num">{about.join(' · ')}</span>
          }
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        <QueryBlock query={withCatalog(people, catalog)} what="KPI của người này">
          {([data, defs]) => {
            const found = data.people.find((p) => p.actorId === actorId)
            return found ? (
              <>
                <PersonBody catalog={defs} person={found} forecast={forecast} />
                {found.scorecards.length > 0 && (
                  <ContributionsPanel catalog={defs} period={data.period} actorId={found.actorId} />
                )}
              </>
            ) : (
              <GlassCard className={TILE}>
                <p className="text-[12.5px] leading-5">
                  Không tìm thấy người này trong phòng Kinh doanh.
                </p>
              </GlassCard>
            )
          }}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiPersonPage
