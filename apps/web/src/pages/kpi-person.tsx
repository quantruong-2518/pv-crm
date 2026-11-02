import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell, GlassCard, Icon, Lock, ScreenHeader, ScreenLayout, SectionTitle } from '@pv/ui'
import type { KpiForecastResponse, KpiPerson } from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import { kpiPersonQuery } from '@/data/kpi'
import { kpiCatalogQuery, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiPersonForecastQuery } from '@/data/kpi-forecast'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { kpiRoleText } from '@/data/kpi-i18n'
import { keyOf } from './home-model'
import { TILE } from './home-tiles'
import { monthQuery, teamPath } from './kpi-allocate-model'
import { ContributionsPanel, FrozenNote } from './kpi-contributions'
import { COMPANY_PATH, ME_PATH, acknowledgementOf, dayOfMonth, useMonthParam } from './kpi-model'
import { MonthPicker, QueryBlock, Scoreboard } from './kpi-parts'
import { PersonForecast } from './kpi-person-forecast'
import { teamsActedFor } from './kpi-team-model'
import { AbsenceBlock } from './kpi-absence'

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
  const { t } = useI18n()
  if (person.scorecards.length === 0) {
    return (
      <GlassCard className={TILE}>
        <p className="text-[12.5px] leading-5">
          {t(
            message(
              'Người này không giữ vai trò có KPI.',
              'This person holds no role with KPIs.',
              '이 사람은 KPI가 있는 역할을 맡고 있지 않습니다.',
            ),
          )}
        </p>
      </GlassCard>
    )
  }
  return (
    <>
      <FrozenNote period={period} actorId={person.actorId} />
      {person.scorecards.map((card) => (
        <section key={card.role} className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            hint={<span className="tnum font-num">{acknowledgementOf(card).text}</span>}
          >
            {kpiRoleText(card.role)}
          </SectionTitle>
          <Scoreboard catalog={catalog} role={card.role} readings={card.readings} />
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <SectionTitle size="lg">
          {t(message('Dự báo cuối tháng', 'Month-end forecast', '월말 예상'))}
        </SectionTitle>
        <QueryBlock
          query={forecast}
          what={message('dự báo cuối tháng', 'month-end forecast', '월말 예상')}
          variant="b"
        >
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
  const { t } = useI18n()
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
  const me = useSession((s) => s.actor?.id)
  const canSet = useCan('kpi.set-target')
  const team = roster.data?.teams.find((t) => t.members.some((m) => m.actorId === actorId))
  const led = teamsActedFor(roster.data?.teams ?? [], me)[0]
  const back = seesAll
    ? {
        label: t(message('KPI công ty', 'Company KPIs', '회사 KPI')),
        path: `${COMPANY_PATH}${monthQuery(period)}`,
      }
    : led
      ? {
          label: t(message(`KPI nhóm ${led.name}`, `${led.name} team KPIs`, `${led.name} 팀 KPI`)),
          path: teamPath(led.id, period),
        }
      : {
          label: t(message('KPI của tôi', 'My KPIs', '내 KPI')),
          path: `${ME_PATH}${monthQuery(period)}`,
        }
  /* As on the team page: an index above 0 means the reader came from inside the app. */
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(back.path))
  /* Roles are left out: each section below is titled with one. */
  const about = [
    team && t(message(`Nhóm ${team.name}`, `Team ${team.name}`, `${team.name} 팀`)),
    dayOfMonth(period),
  ].filter(Boolean)
  const failed = isApiError(person.error) ? person.error.kind : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          back={{ label: back.label, onClick: goBack }}
          title={person.data?.person.name ?? t(message('KPI nhân sự', 'Staff KPIs', '직원 KPI'))}
          description={
            about.length > 0 && <span className="tnum font-num">{about.join(' · ')}</span>
          }
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        {canSet && me && person.data && (
          <AbsenceBlock me={me} actorId={actorId} who={person.data.person.name} />
        )}

        {failed === 'forbidden' ? (
          <Refusal
            locked
            text={t(
              message(
                'Bạn không có quyền xem KPI của người này.',
                'You do not have permission to view this person’s KPIs.',
                '이 사람의 KPI를 볼 권한이 없습니다.',
              ),
            )}
          />
        ) : failed === 'not-found' ? (
          <Refusal
            locked={false}
            text={t(
              message(
                'Không tìm thấy người này trong phòng Kinh doanh.',
                'This person was not found in the Sales department.',
                '영업 부서에서 이 사람을 찾을 수 없습니다.',
              ),
            )}
          />
        ) : (
          <QueryBlock
            query={withCatalog(person, catalog)}
            what={message('KPI của người này', 'this person’s KPIs', '이 사람의 KPI')}
          >
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
