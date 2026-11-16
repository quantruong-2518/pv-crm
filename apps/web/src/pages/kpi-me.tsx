import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell, Button, GlassCard, ScreenHeader, ScreenLayout, SectionTitle, cn } from '@pv/ui'
import {
  RoleId,
  isTieredPeriod,
  quarterMonths,
  quarterOf,
  stepSalesPeriod,
  type KpiAllocation,
  type KpiForecastResponse,
  type KpiScorecard,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { kpiRoleText } from '@/data/kpi-i18n'
import { KpiTabs } from '@/components/kpi-tabs'
import { kpiPlanQuery } from '@/data/kpi-plan'
import { useAppChrome } from '@/app/chrome'
import { toastDone, toastFail } from '@/app/toast'
import { kpiMeQuery, useAcknowledgeKpi } from '@/data/kpi'
import { kpiAllocationsQuery } from '@/data/kpi-allocation'
import { kpiCatalogFor, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { flagsOf } from '@/data/kpi-forecast'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { answerable, kpiForecastMeQuery, myPackages, type MyPackage } from '@/data/kpi-personal'
import { currentPick, keyOf, type PeriodPick } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { AbsenceBlock } from './kpi-absence'
import { AssignLink, ConfirmCard } from './kpi-assign-confirm'
import { ContributionsPanel, FrozenNote } from './kpi-contributions'
import { DESCRIPTION, acknowledgementOf, needsAcknowledgement, useMonthParam } from './kpi-model'
import { ForecastFlags, SideFailure, TeamLeadLink, ThresholdNote } from './kpi-me-parts'
import { PersonalBoard } from './kpi-me-sale-board'
import { SignedByDayChart } from './kpi-me-sale-chart'
import { KpiMeRoleBoard } from './kpi-me-role-board'
import { isBoardRole } from './kpi-me-role-model'
import { MonthPicker, QueryBlock } from './kpi-parts'
import {
  QuarterPicker,
  QuarterView,
  ViewSwitch,
  YearPicker,
  YearView,
  type MeView,
} from './kpi-me-quarter'
import { ForecastForm } from './kpi-me-commit'
import { PlanSection } from './kpi-me-plan'
import { ScoreCard } from './kpi-me-score'
import { confirmAnchor } from './kpi-me-model'
import { TodayStrip } from './kpi-me-today'
import { ReceivePackage } from './kpi-receive-parts'
import { teamsActedFor } from './kpi-team-model'

/** The personal KPI screen, "mine" (ADR 0159 §3, 0160 §9): KPI tabs, a Month /
 *  Quarter / Year switch, today's actions, the role board with the last closed
 *  month's score, and for `signed-value` holders the signed chart, the plan,
 *  coverage and weekly forecast form. Marketing, BD and Presales draw
 *  `KpiMeRoleBoard` in place of those Sale-only sections.
 *
 *  The month lives in the address, so a bell line opens the month it counted.
 *  Month reads sit in `MonthBody`, so the quarter and year views never fire them.
 *  From `TIERED_FROM` the old allocation and team reads are not called; the
 *  assigned-targets card answers there. Each side read fails on its own line.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

const SPAN_DESCRIPTION = message(
  'Tổng các tháng của kỳ. Trạng thái so với mức cần đạt đến hôm nay.',
  'The months of the period added up, against the pace needed by today.',
  '기간 내 월 합계입니다. 상태는 오늘까지 필요한 수준 기준입니다.',
)

function RoleBoard({
  catalog,
  period,
  closed,
  card,
  allocated,
  forecast,
  between,
  actorId,
}: {
  catalog: KpiCatalog
  period: string
  closed: boolean
  card: KpiScorecard
  /** The reader holds lines of a package for this role. */
  allocated: boolean
  forecast: KpiForecastResponse | undefined
  /** Drawn between the primary metric and the other cards. */
  between?: ReactNode
  actorId: string | undefined
}) {
  const { t, lang } = useI18n()
  const acknowledge = useAcknowledgeKpi(period, card.role)
  const ack = acknowledgementOf(card)

  return (
    <section className="flex flex-col gap-4">
      {/* The button is a sibling, not `actions`: below `sm` it takes its own row. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionTitle
          size="lg"
          hint={allocated ? undefined : <span className="tnum font-num">{ack.text}</span>}
        >
          {kpiRoleText(card.role, lang)}
        </SectionTitle>
        {!closed && !allocated && !isTieredPeriod(period) && needsAcknowledgement(ack) && (
          <Button
            className="pointer-coarse:h-12 shrink-0 self-start"
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate(undefined, {
                onSuccess: () =>
                  toastDone(
                    t(message('Đã nhận chỉ tiêu', 'Target acknowledged', '목표를 확인했습니다')),
                  ),
                onError: (e) => toastFail(userMessage(e)),
              })
            }
          >
            {t(message('Xác nhận đã nhận chỉ tiêu', 'Acknowledge targets', '목표 확인'))}
          </Button>
        )}
      </div>
      {/* A closed month projects its own value: a flag there would warn about nothing. */}
      {!closed && forecast && (
        <ForecastFlags catalog={catalog} role={card.role} forecast={forecast} />
      )}
      <PersonalBoard
        catalog={catalog}
        period={period}
        role={card.role}
        readings={card.readings}
        between={between}
        chart={
          actorId && card.readings.some((r) => r.key === 'signed-value') ? (
            <SignedByDayChart period={period} actorId={actorId} />
          ) : undefined
        }
      />
    </section>
  )
}

/** The month's signed value as the scorecard reads it, for the plan bar. */
const signedOf = (cards: readonly KpiScorecard[]): number | null =>
  cards.flatMap((c) => c.readings).find((r) => r.key === 'signed-value')?.value ?? null

/** A holder has lines of a role in one tier only, so the first package holding one names their team, if any. */
const teamOf = (packages: readonly KpiAllocation[], role: RoleId, me: string | undefined) =>
  packages.find((a) => a.role === role && a.lines.some((l) => l.actorId === me))?.team?.name

/** The reader's allocation lines per package, to confirm or counter (ADR 0098 §3). */
function AssignedTargets({
  period,
  closed,
  packs,
  packages,
  me,
}: {
  period: string
  closed: boolean
  packs: readonly MyPackage[]
  packages: readonly KpiAllocation[]
  me: string | undefined
}) {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-6">
      <SectionTitle size="lg">
        {t(message('Chỉ tiêu được giao', 'Assigned targets', '배정된 목표'))}
      </SectionTitle>
      {packs.map((pack) => (
        <ReceivePackage
          key={`${pack.role}/${pack.status}`}
          period={period}
          closed={closed}
          pack={pack}
          me={me}
          team={teamOf(packages, pack.role, me)}
        />
      ))}
    </section>
  )
}

/** The month view: every read below is for one month, so the quarter view never fires them. */
function MonthBody({ pick }: { pick: PeriodPick }) {
  const { t } = useI18n()
  const period = keyOf(pick)
  const me = useQuery(kpiMeQuery(period))
  const catalog = useQuery(kpiCatalogFor(period))
  const tiered = isTieredPeriod(period)
  /* The old allocations read answers 409 from the tiered months on. */
  const allocations = useQuery({ ...kpiAllocationsQuery(period), enabled: !tiered })
  const forecast = useQuery(kpiForecastMeQuery(period))
  const roster = useQuery({ ...kpiTeamRosterQuery(period), enabled: !tiered })
  const actorId = useSession((s) => s.actor?.id)
  const plan = useQuery({ ...kpiPlanQuery(period, actorId ?? ''), enabled: actorId !== undefined })
  const lastClosed = stepSalesPeriod(currentPick().month, -1)
  const holder = !!plan.data && (plan.data.plan !== null || plan.data.leading !== null)

  const packs =
    allocations.data && catalog.data ? myPackages(catalog.data, allocations.data, actorId) : []
  const pending = packs
    .filter(answerable)
    .flatMap((p) => p.lines)
    .filter((l) => l.ackState === 'pending').length
  const allocatedRoles = new Set(packs.map((p) => p.role))
  const seen = forecast.data
  /* The roster is a side read: without it the links are simply absent. */
  const ledTeams = teamsActedFor(roster.data?.teams ?? [], actorId)

  return (
    <>
      <QueryBlock
        query={withCatalog(me, catalog)}
        what={message('KPI của bạn', 'your KPIs', '내 KPI')}
      >
        {([data, defs]) => {
          /* Flags are not drawn on a closed month, so neither is their legend. */
          const legend =
            !data.closed &&
            seen &&
            data.scorecards.some((c) => flagsOf(defs, c.role, seen).length > 0)
          /* Old packages answer 409 on a tiered month; its lines are in the confirm cards. */
          const assigned = allocations.data && packs.length > 0 && !isTieredPeriod(data.period) && (
            <AssignedTargets
              period={data.period}
              closed={data.closed}
              packs={packs}
              packages={allocations.data.allocations}
              me={actorId}
            />
          )
          const first = !data.closed && pending > 0
          return (
            <>
              <TodayStrip
                period={data.period}
                lastClosed={lastClosed}
                actorId={actorId}
                holder={holder}
                roles={data.scorecards.map((c) => c.role)}
                closed={data.closed}
              />
              {ledTeams.map((team) => (
                <TeamLeadLink key={team.id} team={team} period={period} />
              ))}
              {/* Any role's page read finds the unit the reader heads. */}
              {tiered && <AssignLink period={period} role={RoleId.enum.sale} />}
              {actorId && <AbsenceBlock me={actorId} />}
              {data.closed && (
                <p className={NOTE}>
                  {t(
                    message(
                      'Tháng đã kết thúc, chỉ tiêu không đổi được nữa.',
                      'This month is closed. Targets can no longer be changed.',
                      '월이 마감되어 목표를 더 이상 변경할 수 없습니다.',
                    ),
                  )}
                </p>
              )}
              {actorId && data.scorecards.length > 0 && (
                <FrozenNote period={data.period} actorId={actorId} />
              )}
              {allocations.error && (
                <SideFailure
                  what={t(message('chỉ tiêu được giao', 'assigned targets', '배정된 목표'))}
                  retry={() => void allocations.refetch()}
                />
              )}
              {forecast.error && (
                <SideFailure
                  what={t(message('cảnh báo sắp trượt, sắp đạt', 'forecast alerts', '예측 알림'))}
                  retry={() => void forecast.refetch()}
                />
              )}
              {first && assigned}
              {tiered &&
                data.scorecards.map((card) => (
                  <div
                    key={`confirm/${card.role}`}
                    id={confirmAnchor(card.role)}
                    className="scroll-mt-4 empty:hidden"
                  >
                    <ConfirmCard
                      catalog={defs}
                      period={data.period}
                      role={card.role}
                      closed={data.closed}
                    />
                  </div>
                ))}
              {legend && seen && <ThresholdNote thresholds={seen.thresholds} />}
              {data.scorecards.length === 0 && packs.length === 0 && (
                <GlassCard className={cn(TILE, 'text-[12.5px]')}>
                  {t(
                    message(
                      'Bạn chưa được giao chỉ tiêu KPI nào.',
                      'You have no KPI targets assigned yet.',
                      '아직 배정된 KPI 목표가 없습니다.',
                    ),
                  )}
                </GlassCard>
              )}
              {data.scorecards.map((card, i) => (
                <RoleBoard
                  key={card.role}
                  catalog={defs}
                  period={data.period}
                  closed={data.closed}
                  card={card}
                  allocated={allocatedRoles.has(card.role)}
                  forecast={forecast.data}
                  actorId={actorId}
                  between={
                    i === 0 ? <ScoreCard period={lastClosed} actorId={actorId} /> : undefined
                  }
                />
              ))}
              <PlanSection read={plan} signed={signedOf(data.scorecards)} />
              {tiered && holder && <ForecastForm period={data.period} />}
              {actorId &&
                data.scorecards
                  .map((c) => c.role)
                  .filter(isBoardRole)
                  .map((role) => (
                    <KpiMeRoleBoard key={role} period={data.period} actorId={actorId} role={role} />
                  ))}
              {!first && assigned}
              {actorId && data.scorecards.length > 0 && (
                <ContributionsPanel catalog={defs} period={data.period} actorId={actorId} />
              )}
            </>
          )
        }}
      </QueryBlock>
    </>
  )
}

/** `?view=quarter` selects the quarter view; the quarter is the one holding the
 *  address' month, so the switch and the month picker never disagree. */
const VIEW_PARAM = 'view'

export function KpiMePage() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const [pick, setPick] = useMonthParam()
  const [params, setParams] = useSearchParams()
  const view: MeView =
    params.get(VIEW_PARAM) === 'quarter'
      ? 'quarter'
      : params.get(VIEW_PARAM) === 'year'
        ? 'year'
        : 'month'
  const quarter = quarterOf(pick.month)
  const year = pick.month.slice(0, 4)
  /* Landing on the running quarter keeps the running month, so the month view reopens on it. */
  const monthOfQuarter = (q: string) => {
    const months = quarterMonths(q)
    const now = currentPick().month
    return months.find((m) => m === now) ?? months[0]
  }
  const pickYear = (y: string) => {
    const now = currentPick().month
    setPick({ ...pick, month: y === now.slice(0, 4) ? now : `${y}-01` })
  }
  const setView = (next: MeView) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev)
        if (next === 'month') out.delete(VIEW_PARAM)
        else out.set(VIEW_PARAM, next)
        return out
      },
      { replace: true },
    )

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(message('KPI của tôi', 'My KPIs', '내 KPI'))}
          description={t(view === 'month' ? DESCRIPTION : SPAN_DESCRIPTION)}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <ViewSwitch value={view} onChange={setView} />
              {view === 'quarter' && (
                <QuarterPicker
                  quarter={quarter}
                  onPick={(q) => setPick({ ...pick, month: monthOfQuarter(q) })}
                />
              )}
              {view === 'year' && <YearPicker year={year} onPick={pickYear} />}
              {view === 'month' && <MonthPicker pick={pick} onPick={setPick} />}
            </div>
          }
        />
        <KpiTabs period={pick.month} active="me" />
        {view === 'quarter' && (
          <QuarterView quarter={quarter} onMonthView={() => setView('month')} />
        )}
        {view === 'year' && <YearView year={year} onMonthView={() => setView('month')} />}
        {view === 'month' && <MonthBody pick={pick} />}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiMePage
