import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AppShell,
  ArrowRight,
  Button,
  ClipboardList,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  cn,
} from '@pv/ui'
import { isTieredPeriod } from '@pv/contracts'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiCompanyQuery, kpiPeopleQuery, kpiTargetsQuery } from '@/data/kpi'
import { kpiAllocationsQuery, kpiCountersQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog } from '@/data/kpi-catalog'
import { waitingReasonsQuery } from '@/data/kpi-close'
import { kpiForecastQuery } from '@/data/kpi-forecast'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { keyOf, num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { TARGETS_PATH, monthQuery } from './kpi-allocate-model'
import { TieredNote } from './kpi-assign-confirm'
import { statusHref } from './kpi-assign-model'
import { KpiForecastBlock } from './kpi-company-forecast'
import { AttentionBlock, RankedHeatmap, type TeamOf } from './kpi-company-people'
import { RolesBlock } from './kpi-company-roles'
import { MonthCloseBar } from './kpi-month-close'
import { dayOfMonth, monthPick, roomPeople, useMonthParam } from './kpi-model'
import { CompanyStrip, MonthPicker, QueryBlock } from './kpi-parts'
import { closingOf, waitingCount, waitingOf } from './kpi-targets-model'
import { NOTHING_WAITING } from './kpi-targets-queue'

/** The company KPI screen, read live from `/sales/kpi/:period/…`. No fixture
 *  and no scenario. It answers "how is the room doing, who needs coaching".
 *
 *  Figures before words: the month close, the room's strip, who is about to miss
 *  or hit, the roles, who is behind target, every person as a heat map heaviest
 *  first, then the door to the targets desk. The people lists leave the director's
 *  card out (`roomPeople`): it is the room's own card, already on the strip.
 *  The route asks for `performance.view` only, so each block that needs more is
 *  gated on its own permission and a block the reader may not open is dropped
 *  and named, never drawn as a failure. The month lives in the address.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

/** The door to the targets desk. Its count is `waitingOf` over the desk's own
 *  reads, so it is the length of the desk's waiting list; no count until
 *  they land, and none for a reader with nothing to decide there. */
function TargetsDoor({ period, waiting }: { period: string; waiting: number | undefined }) {
  const navigate = useNavigate()
  return (
    <GlassCard className={cn(TILE, 'sm:flex-row sm:items-center')}>
      <Icon icon={ClipboardList} size={20} className="text-accent-foreground shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-[13px] font-semibold leading-5">Chỉ tiêu tháng</h2>
        {waiting !== undefined && (
          <p className={cn(NOTE, 'tnum font-num')}>
            {waiting > 0 ? `${num(waiting)} mục chờ bạn xử lý.` : NOTHING_WAITING}
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
        onClick={() => navigate(`${TARGETS_PATH}${monthQuery(period)}`)}
      >
        Mở Chỉ tiêu tháng
        <Icon icon={ArrowRight} size={16} />
      </Button>
    </GlassCard>
  )
}

export function KpiCompanyPage() {
  const chrome = useAppChrome()
  const canTargets = useCan('kpi.view')
  const canAll = useCan('kpi.view-all')
  const canSet = useCan('kpi.set-target')
  const canApprove = useCan('contract.approve-overdue-reason')
  const me = useSession((s) => s.actor?.id)

  const [pick, setPick] = useMonthParam()
  const period = keyOf(pick)
  const day = dayOfMonth(period)

  const catalog = useQuery(kpiCatalogQuery)
  const company = useQuery(kpiCompanyQuery(period))
  const targets = useQuery({ ...kpiTargetsQuery(period), enabled: canAll && canTargets })
  const people = useQuery({ ...kpiPeopleQuery(period), enabled: canAll })
  const forecast = useQuery({ ...kpiForecastQuery(period), enabled: canAll })
  const allocations = useQuery({ ...kpiAllocationsQuery(period), enabled: canAll })
  const counters = useQuery({ ...kpiCountersQuery(period), enabled: canAll })
  /* Optional: without the roster the tables still read, only the team line goes. */
  const roster = useQuery({ ...kpiTeamRosterQuery(period), enabled: canAll })
  const closing = closingOf(period)
  const reasons = useQuery(waitingReasonsQuery(monthPick().month, canAll && canApprove))
  const toClose = useQuery({ ...kpiAllocationsQuery(closing), enabled: canAll && canSet })
  const teams = roster.data?.teams ?? []
  const teamByActor = new Map(teams.flatMap((t) => t.members.map((m) => [m.actorId, t] as const)))
  const teamOf: TeamOf = (actorId) => teamByActor.get(actorId)
  /* Nobody holds a KPI role: the role table says so once; an empty
     exceptions block would read as an all-clear. */
  const nobody = people.data !== undefined && roomPeople(people.data.people).length === 0
  /* The targets desk's own readiness: a count that lands early would jump. */
  const settled =
    !roster.isPending && (!canApprove || !reasons.isPending) && (!canSet || !toClose.isPending)
  const waiting =
    (canSet || canApprove) &&
    settled &&
    catalog.data &&
    targets.data &&
    allocations.data &&
    counters.data
      ? waitingCount(
          waitingOf({
            catalog: catalog.data,
            targets: targets.data,
            packages: allocations.data.allocations,
            counters: counters.data.counters,
            teams,
            me,
            canSet,
            reasons: reasons.data?.reasons ?? [],
            closing,
            closingClose: toClose.data?.monthClose,
          }),
        )
      : undefined

  const hidden = canAll
    ? []
    : ['dự báo cuối tháng', 'KPI theo vai trò', 'người đang hụt chỉ tiêu', 'chi tiết từng người']

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="KPI công ty"
          description={day && <span className="tnum font-num">{day}</span>}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        {/* Closing is a task on the targets desk; here only the closed line shows. */}
        {company.data?.monthClose && (
          <MonthCloseBar period={period} monthClose={company.data.monthClose} />
        )}

        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">Chỉ số phòng Kinh doanh</SectionTitle>
          <QueryBlock query={withCatalog(company, catalog)} what="chỉ số phòng Kinh doanh">
            {([data, defs]) => (
              <CompanyStrip
                catalog={defs}
                role={data.scorecard.role}
                readings={data.scorecard.readings}
              />
            )}
          </QueryBlock>
        </section>

        {canAll && (
          <>
            <section className="flex flex-col gap-3">
              <SectionTitle size="lg">Dự báo cuối tháng</SectionTitle>
              <QueryBlock
                query={withCatalog(forecast, catalog)}
                what="dự báo cuối tháng"
                variant="b"
              >
                {([data, defs]) => <KpiForecastBlock catalog={defs} data={data} />}
              </QueryBlock>
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle size="lg">Theo vai trò</SectionTitle>
              <QueryBlock query={withCatalog(people, catalog)} what="KPI theo vai trò" variant="b">
                {([data, defs]) => (
                  <RolesBlock catalog={defs} people={data.people} room={company.data?.scorecard} />
                )}
              </QueryBlock>
            </section>

            {!nobody && (
              <section className="flex flex-col gap-3">
                <SectionTitle size="lg">Đang hụt chỉ tiêu</SectionTitle>
                <QueryBlock
                  query={withCatalog(people, catalog)}
                  what="danh sách đang hụt chỉ tiêu"
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
              </section>
            )}

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

            {isTieredPeriod(period) && (
              <TieredNote to={statusHref(period)} label="Mở Tình trạng giao" />
            )}
            <TargetsDoor period={period} waiting={waiting} />
          </>
        )}

        {hidden.length > 0 && <p className={NOTE}>Bạn không có quyền xem: {hidden.join(' · ')}.</p>}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiCompanyPage
