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
import { isTieredPeriod, type KpiPeopleResponse } from '@pv/contracts'
import { useCan, useSession } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { useAppChrome } from '@/app/chrome'
import { kpiCompanyQuery, kpiPeopleQuery, kpiTargetsQuery } from '@/data/kpi'
import { kpiAllocationsQuery, kpiCountersQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog, type BlockQuery, type KpiCatalog } from '@/data/kpi-catalog'
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

const COPY = {
  title: message('KPI công ty', 'Company KPIs', '회사 KPI'),
  strip: message('Chỉ số phòng Kinh doanh', 'Sales department metrics', '영업 부서 지표'),
  forecast: message('Dự báo cuối tháng', 'Month-end forecast', '월말 예상'),
  forecastWhat: message('dự báo cuối tháng', 'month-end forecast', '월말 예상'),
  roles: message('Theo vai trò', 'By role', '역할별'),
  rolesWhat: message('KPI theo vai trò', 'KPIs by role', '역할별 KPI'),
  behind: message('Đang hụt chỉ tiêu', 'Behind target', '목표 미달'),
  behindWhat: message(
    'danh sách đang hụt chỉ tiêu',
    'the list of people behind target',
    '목표 미달 인원 목록',
  ),
  people: message('Chi tiết từng người', 'Details by person', '개인별 상세'),
  peopleWhat: message('KPI từng người', 'KPIs by person', '개인별 KPI'),
  assignStatus: message('Mở Tình trạng giao', 'Open assignment status', '배정 현황 열기'),
  hiddenLead: message(
    'Bạn không có quyền xem',
    'You do not have access to',
    '열람 권한이 없는 항목',
  ),
}

/** The door to the targets desk. Its count is `waitingOf` over the desk's own
 *  reads, so it is the length of the desk's waiting list; no count until
 *  they land, and none for a reader with nothing to decide there. */
function TargetsDoor({ period, waiting }: { period: string; waiting: number | undefined }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <GlassCard className={cn(TILE, 'sm:flex-row sm:items-center')}>
      <Icon icon={ClipboardList} size={20} className="text-accent-foreground shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-[13px] font-semibold leading-5">
          {t(message('Chỉ tiêu tháng', 'Monthly targets', '월간 목표'))}
        </h2>
        {waiting !== undefined && (
          <p className={cn(NOTE, 'tnum font-num')}>
            {waiting > 0
              ? t(
                  message(
                    `${num(waiting)} mục chờ bạn xử lý.`,
                    `${num(waiting)} items need your attention.`,
                    `처리할 항목 ${num(waiting)}개.`,
                  ),
                )
              : t(NOTHING_WAITING)}
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
        onClick={() => navigate(`${TARGETS_PATH}${monthQuery(period)}`)}
      >
        {t(message('Mở Chỉ tiêu tháng', 'Open monthly targets', '월간 목표 열기'))}
        <Icon icon={ArrowRight} size={16} />
      </Button>
    </GlassCard>
  )
}

/** One quiet people block under the roles table: a title over the same read, drawn by `View`. */
function PeopleSection({
  title,
  what,
  query,
  teamOf,
  View,
}: {
  title: Message
  what: Message
  query: BlockQuery<[KpiPeopleResponse, KpiCatalog]>
  teamOf: TeamOf
  View: typeof AttentionBlock
}) {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle size="lg">{t(title)}</SectionTitle>
      <QueryBlock query={query} what={what} variant="b" quiet>
        {([data, defs]) => (
          <View
            catalog={defs}
            people={roomPeople(data.people)}
            period={data.period}
            teamOf={teamOf}
          />
        )}
      </QueryBlock>
    </section>
  )
}

export function KpiCompanyPage() {
  const { t } = useI18n()
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
    : [
        t(COPY.forecastWhat),
        t(COPY.rolesWhat),
        t(message('người đang hụt chỉ tiêu', 'people behind target', '목표 미달 인원')),
        t(message('chi tiết từng người', 'details by person', '개인별 상세')),
      ]

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(COPY.title)}
          description={day && <span className="tnum font-num">{day}</span>}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        {/* Closing is a task on the targets desk; here only the closed line shows. */}
        {company.data?.monthClose && (
          <MonthCloseBar period={period} monthClose={company.data.monthClose} />
        )}

        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">{t(COPY.strip)}</SectionTitle>
          <QueryBlock
            query={withCatalog(company, catalog)}
            what={message('chỉ số phòng Kinh doanh', 'Sales department metrics', '영업 부서 지표')}
          >
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
              <SectionTitle size="lg">{t(COPY.forecast)}</SectionTitle>
              <QueryBlock
                query={withCatalog(forecast, catalog)}
                what={COPY.forecastWhat}
                variant="b"
              >
                {([data, defs]) => <KpiForecastBlock catalog={defs} data={data} />}
              </QueryBlock>
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle size="lg">{t(COPY.roles)}</SectionTitle>
              <QueryBlock query={withCatalog(people, catalog)} what={COPY.rolesWhat} variant="b">
                {([data, defs]) => (
                  <RolesBlock catalog={defs} people={data.people} room={company.data?.scorecard} />
                )}
              </QueryBlock>
            </section>

            {!nobody && (
              <PeopleSection
                title={COPY.behind}
                what={COPY.behindWhat}
                query={withCatalog(people, catalog)}
                teamOf={teamOf}
                View={AttentionBlock}
              />
            )}

            {!nobody && (
              <PeopleSection
                title={COPY.people}
                what={COPY.peopleWhat}
                query={withCatalog(people, catalog)}
                teamOf={teamOf}
                View={RankedHeatmap}
              />
            )}

            {isTieredPeriod(period) && (
              <TieredNote to={statusHref(period)} label={t(COPY.assignStatus)} />
            )}
            <TargetsDoor period={period} waiting={waiting} />
          </>
        )}

        {hidden.length > 0 && (
          <p className={NOTE}>
            {t(COPY.hiddenLead)}: {hidden.join(' · ')}.
          </p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiCompanyPage
