import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AppShell,
  GlassCard,
  Icon,
  Lock,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  cn,
} from '@pv/ui'
import type { KpiTeamViewResponse, RoleId } from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiCatalogQuery, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiTeamViewQuery } from '@/data/kpi-team-view'
import { dm } from '@/lib/date'
import { keyOf } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { monthQuery } from './kpi-allocate-model'
import { MONTH_PARAM, dayOfMonth, pickFromUrl } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'
import { TeamCounters } from './kpi-team-counters'
import { holdersOf, isClosed, packageOf, sharedRoles } from './kpi-team-model'
import { TeamSplit } from './kpi-team-split'
import { TeamMembers, TeamReadings } from './kpi-team-stats'

/** A team's page — `/sales/kpi/team/:teamId` (ADR 0101): the team's figures
 *  against its share, the lead's split of that share across members, and the
 *  members' counter-proposals. Read live from `GET /sales/kpi/:period/teams/:teamId`;
 *  no fixture, no scenario.
 *
 *  Only the team's lead or a `kpi.view-all` holder is let in; the head reads and
 *  never edits here. The split is the lead's alone, judged by the roster, so a
 *  lead who also holds `kpi.set-target` still splits from this page.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens): a team's month is
 *  a sum over many records and opens no single object a chain could anchor on. */

const NOT_YOURS = 'Bạn không phụ trách nhóm này.'

function Body({
  catalog,
  view,
  me,
}: {
  catalog: KpiCatalog
  view: KpiTeamViewResponse
  me: string | undefined
}) {
  const closed = isClosed(view)
  const roles = sharedRoles(view.shares)
  const canEdit = view.iLead && !closed
  const statusOf = (role: RoleId) => packageOf(view.allocations, role)?.status

  return (
    <>
      {view.monthClose ? (
        <p className={cn(NOTE, 'tnum font-num')}>
          Đã chốt {dm(view.monthClose.closedAt)} · {view.monthClose.closedBy.name}
        </p>
      ) : (
        closed && <p className={NOTE}>Tháng đã kết thúc, chỉ tiêu không đổi được nữa.</p>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle size="lg">Thống kê nhóm</SectionTitle>
        {view.readings.length > 0 && <TeamReadings catalog={catalog} readings={view.readings} />}
        <TeamMembers catalog={catalog} people={view.people} />
      </section>

      {roles.length === 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">Chia cho thành viên</SectionTitle>
          <p className={NOTE}>Phòng chưa giao phần cho nhóm.</p>
        </section>
      )}
      {roles.map((role) => {
        const pkg = packageOf(view.allocations, role)
        const shares = new Map(
          view.shares.filter((s) => s.role === role).map((s) => [s.metricKey, s.value]),
        )
        return (
          <TeamSplit
            key={`${view.period}/${role}/${pkg?.version ?? 0}/${pkg?.status ?? ''}`}
            period={view.period}
            teamId={view.team.id}
            role={role}
            defs={catalog[role]}
            shares={shares}
            holders={holdersOf(view.team, role, pkg)}
            pkg={pkg}
            canEdit={canEdit}
          />
        )
      })}

      <section className="flex flex-col gap-3">
        <SectionTitle size="lg">Đề xuất</SectionTitle>
        <TeamCounters
          period={view.period}
          teamId={view.team.id}
          counters={view.counters}
          statusOf={statusOf}
          may={view.iLead}
          closed={closed}
          me={me}
        />
      </section>
    </>
  )
}

export function KpiTeamPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { teamId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const pick = pickFromUrl(params.get(MONTH_PARAM))
  const period = keyOf(pick)
  const seesAll = useCan('kpi.view-all')
  const me = useSession((s) => s.actor?.id)

  const view = useQuery(kpiTeamViewQuery(period, teamId))
  const catalog = useQuery(kpiCatalogQuery)
  const day = dayOfMonth(period)
  /* An index above 0 means this page was reached from another one inside the app. */
  const from = seesAll
    ? { label: 'Thống kê phòng', path: '/sales/kpi/department' }
    : { label: 'KPI của tôi', path: '/sales/kpi/me' }
  const goBack = () =>
    window.history.state?.idx > 0 ? navigate(-1) : navigate(`${from.path}${monthQuery(period)}`)
  const refused = isApiError(view.error) && view.error.kind === 'forbidden'

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          back={{ label: from.label, onClick: goBack }}
          title={view.data ? `KPI nhóm ${view.data.team.name}` : 'KPI nhóm'}
          description={day && <span className="tnum font-num">{day}</span>}
          actions={
            <MonthPicker
              pick={pick}
              onPick={(p) => setParams({ [MONTH_PARAM]: keyOf(p) }, { replace: true })}
            />
          }
        />

        {refused ? (
          <GlassCard className={TILE}>
            <p className="flex items-center gap-2 text-[12.5px] leading-5">
              <Icon icon={Lock} size={16} className="shrink-0" />
              {NOT_YOURS}
            </p>
          </GlassCard>
        ) : (
          <QueryBlock query={withCatalog(view, catalog)} what="KPI của nhóm" variant="b">
            {([data, defs]) => <Body catalog={defs} view={data} me={me} />}
          </QueryBlock>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiTeamPage
