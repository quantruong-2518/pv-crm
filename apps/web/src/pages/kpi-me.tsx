import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, GlassCard, ScreenHeader, ScreenLayout, SectionTitle, cn } from '@pv/ui'
import {
  RoleId,
  isTieredPeriod,
  type KpiAllocation,
  type KpiForecastResponse,
  type KpiScorecard,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toastDone, toastFail } from '@/app/toast'
import { kpiMeQuery, useAcknowledgeKpi } from '@/data/kpi'
import { kpiAllocationsQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { flagsOf } from '@/data/kpi-forecast'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { answerable, kpiForecastMeQuery, myPackages, type MyPackage } from '@/data/kpi-personal'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { AbsenceBlock } from './kpi-absence'
import { AssignLink, ConfirmCard } from './kpi-assign-confirm'
import { ContributionsPanel, FrozenNote } from './kpi-contributions'
import { DESCRIPTION, acknowledgementOf, needsAcknowledgement, useMonthParam } from './kpi-model'
import {
  ForecastFlags,
  PersonalBoard,
  SideFailure,
  TeamLeadLink,
  ThresholdNote,
} from './kpi-me-parts'
import { MonthPicker, QueryBlock } from './kpi-parts'
import { ReceivePackage } from './kpi-receive-parts'
import { teamsActedFor } from './kpi-team-model'

/** The personal KPI screen — what the reader is short of, per role they hold,
 *  read live from `GET /sales/kpi/:period/me`, with the ADR 0098 reads beside
 *  it: the allocation lines to confirm or counter, slip / hit flags, the weekly
 *  chart. No fixture and no scenario; every figure and every verdict is the server's.
 *
 *  The month lives in the address, so a bell line opens the month it counted.
 *  Lines still to confirm put the assigned-targets section first.
 *  The side reads never block the board: their failure is one line. A role with
 *  a package is answered in the assigned-targets section, which records both books; the
 *  role-target button is for a role without one, and shows only while an agreed
 *  target is unreceived or changed, never on a closed month.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

function RoleBoard({
  catalog,
  period,
  closed,
  card,
  allocated,
  forecast,
}: {
  catalog: KpiCatalog
  period: string
  closed: boolean
  card: KpiScorecard
  /** The reader holds lines of a package for this role. */
  allocated: boolean
  forecast: KpiForecastResponse | undefined
}) {
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
          {ROLE_LABEL[card.role]}
        </SectionTitle>
        {!closed && !allocated && !isTieredPeriod(period) && needsAcknowledgement(ack) && (
          <Button
            className="pointer-coarse:h-12 shrink-0 self-start"
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate(undefined, {
                onSuccess: () => toastDone('Đã nhận chỉ tiêu'),
                onError: (e) => toastFail(userMessage(e)),
              })
            }
          >
            Xác nhận đã nhận chỉ tiêu
          </Button>
        )}
      </div>
      {/* A closed month projects its own value: a flag there would warn about nothing. */}
      {!closed && forecast && (
        <ForecastFlags catalog={catalog} role={card.role} forecast={forecast} />
      )}
      <PersonalBoard catalog={catalog} period={period} role={card.role} readings={card.readings} />
    </section>
  )
}

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
  return (
    <section className="flex flex-col gap-6">
      <SectionTitle size="lg">Chỉ tiêu được giao</SectionTitle>
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

export function KpiMePage() {
  const chrome = useAppChrome()
  const [pick, setPick] = useMonthParam()
  const period = keyOf(pick)
  const me = useQuery(kpiMeQuery(period))
  const catalog = useQuery(kpiCatalogQuery)
  const allocations = useQuery(kpiAllocationsQuery(period))
  const forecast = useQuery(kpiForecastMeQuery(period))
  const roster = useQuery(kpiTeamRosterQuery(period))
  const actorId = useSession((s) => s.actor?.id)

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
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="KPI của tôi"
          description={DESCRIPTION}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        {ledTeams.map((team) => (
          <TeamLeadLink key={team.id} team={team} period={period} />
        ))}
        {/* Any role's page read finds the unit the reader heads. */}
        {isTieredPeriod(period) && <AssignLink period={period} role={RoleId.enum.sale} />}
        {actorId && <AbsenceBlock me={actorId} />}

        <QueryBlock query={withCatalog(me, catalog)} what="KPI của bạn">
          {([data, defs]) => {
            /* Flags are not drawn on a closed month, so neither is their legend. */
            const legend =
              !data.closed &&
              seen &&
              data.scorecards.some((c) => flagsOf(defs, c.role, seen).length > 0)
            /* Old packages answer 409 on a tiered month; its lines are in the confirm cards. */
            const assigned = allocations.data &&
              packs.length > 0 &&
              !isTieredPeriod(data.period) && (
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
                {data.closed && (
                  <p className={NOTE}>Tháng đã kết thúc, chỉ tiêu không đổi được nữa.</p>
                )}
                {actorId && data.scorecards.length > 0 && (
                  <FrozenNote period={data.period} actorId={actorId} />
                )}
                {allocations.error && (
                  <SideFailure what="chỉ tiêu được giao" retry={() => void allocations.refetch()} />
                )}
                {forecast.error && (
                  <SideFailure
                    what="cảnh báo sắp trượt, sắp đạt"
                    retry={() => void forecast.refetch()}
                  />
                )}
                {first && assigned}
                {isTieredPeriod(data.period) &&
                  data.scorecards.map((card) => (
                    <ConfirmCard
                      key={`confirm/${card.role}`}
                      catalog={defs}
                      period={data.period}
                      role={card.role}
                      closed={data.closed}
                    />
                  ))}
                {legend && seen && <ThresholdNote thresholds={seen.thresholds} />}
                {data.scorecards.length === 0 && packs.length === 0 && (
                  <GlassCard className={cn(TILE, 'text-[12.5px]')}>
                    Bạn chưa được giao chỉ tiêu KPI nào.
                  </GlassCard>
                )}
                {data.scorecards.map((card) => (
                  <RoleBoard
                    key={card.role}
                    catalog={defs}
                    period={data.period}
                    closed={data.closed}
                    card={card}
                    allocated={allocatedRoles.has(card.role)}
                    forecast={forecast.data}
                  />
                ))}
                {!first && assigned}
                {actorId && data.scorecards.length > 0 && (
                  <ContributionsPanel catalog={defs} period={data.period} actorId={actorId} />
                )}
              </>
            )
          }}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiMePage
