import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AppShell, ScreenHeader, ScreenLayout, SectionTitle, Skeleton } from '@pv/ui'
import type { RoleId } from '@pv/contracts'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiPeopleQuery, kpiTargetsQuery } from '@/data/kpi'
import { kpiAllocationsQuery, kpiCountersQuery } from '@/data/kpi-allocation'
import { kpiCatalogQuery } from '@/data/kpi-catalog'
import { waitingReasonsQuery } from '@/data/kpi-close'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { keyOf } from './home-model'
import { NOTE } from './home-tiles'
import { CounterDrawer, type CounterOwner } from './kpi-counter-detail'
import { MonthCloseBar } from './kpi-month-close'
import { monthPick, useMonthParam } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'
import { allOf, closingOf, landingOf, waitingOf } from './kpi-targets-model'
import { WaitingList } from './kpi-targets-queue'
import { RoleSteps } from './kpi-targets-role'

/** The month's targets screen — `/sales/kpi/targets?month=&role=&team=`, read live from
 *  `/sales/kpi/:period/targets|allocations|counters|people` and the team roster.
 *  No fixture and no scenario.
 *
 *  What waits on the reader comes first, then one role at a time with its four
 *  steps and its teams' packages. Every role stays mounted and only the picked
 *  one shows, so a value typed under one role survives a switch. `?role=` (and
 *  `?team=`) from a bell link picks the role and scrolls to its open step.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens): a role target is
 *  a role's month, not an object with a code a chain could be anchored on. */

const ROLE_PARAM = 'role'
const TEAM_PARAM = 'team'

/** Scrolls to the first of `ids` drawn, once the picked role's pane shows;
 *  `clear` takes two state setters, so the effect never reruns on them. */
function useStepJump(
  ids: string[] | null,
  ready: boolean,
  shown: string | undefined,
  clear: readonly [(v: null) => void, (v: false) => void],
) {
  const target = ids?.join(' ') ?? ''
  const [clearJump, clearLanding] = clear
  useEffect(() => {
    if (!target || !ready) return
    const found = target.split(' ').flatMap((id) => document.getElementById(id) ?? [])
    /* The role switch has not rendered yet: wait for `shown` to move. */
    if (found.some((el) => el.closest('[hidden]'))) return
    clearJump(null)
    clearLanding(false)
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    found[0]?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [target, ready, shown, clearJump, clearLanding])
}

export function KpiTargetsPage() {
  const chrome = useAppChrome()
  const canSet = useCan('kpi.set-target')
  const canApprove = useCan('contract.approve-overdue-reason')
  const me = useSession((s) => s.actor?.id)
  const [pick, setPick] = useMonthParam()
  const [params, setParams] = useSearchParams()
  const period = keyOf(pick)
  const running = monthPick()
  const closing = closingOf(period)
  const [owner, setOwner] = useState<CounterOwner | null>(null)
  const [jump, setJump] = useState<string[] | null>(null)
  const [landing, setLanding] = useState(() => params.get(ROLE_PARAM) !== null)

  const catalog = useQuery(kpiCatalogQuery)
  const targets = useQuery(kpiTargetsQuery(period))
  const allocations = useQuery(kpiAllocationsQuery(period))
  const people = useQuery(kpiPeopleQuery(period))
  const counters = useQuery(kpiCountersQuery(period))
  const roster = useQuery(kpiTeamRosterQuery(period))
  const reasons = useQuery(waitingReasonsQuery(running.month, canApprove))
  const toClose = useQuery({ ...kpiAllocationsQuery(closing), enabled: canSet })
  const all = allOf(catalog, targets, allocations, people, counters)
  /* The roster only refines the split; waiting keeps team members from showing as loose people. */
  const ready = all.data !== undefined && !roster.isPending
  /* The roster settles first: until then a lead's own counter would hide, then jump in. */
  const waitReady =
    !roster.isPending && (!canApprove || !reasons.isPending) && (!canSet || !toClose.isPending)

  const roles = targets.data?.roles ?? []
  const shown = (roles.find((r) => r.role === params.get(ROLE_PARAM)) ?? roles[0])?.role
  const team = params.get(TEAM_PARAM)
  const landed = roles.find((r) => r.role === params.get(ROLE_PARAM))
  const room = (role: RoleId) =>
    allocations.data?.allocations.find((a) => a.role === role && a.team === null)
  const ids = jump ?? (landing && landed ? landingOf(landed, room(landed.role), team) : null)
  useStepJump(ids, ready, shown, [setJump, setLanding])

  const pickRole = (role: string) => {
    setLanding(false)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(ROLE_PARAM, role)
        next.delete(TEAM_PARAM)
        return next
      },
      { replace: true },
    )
  }
  const openStep = (role: RoleId, to: string[]) => {
    pickRole(role)
    setJump(to)
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Chỉ tiêu tháng"
          description={canSet ? undefined : 'Bạn chỉ có quyền xem.'}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        <QueryBlock query={all} what="chỉ tiêu tháng" variant="b">
          {([defs, t, a, p, c]) => {
            const teams = roster.data?.teams ?? []
            const waiting = waitingOf({
              catalog: defs,
              targets: t,
              packages: a.allocations,
              counters: c.counters,
              teams,
              me,
              canSet,
              reasons: reasons.data?.reasons ?? [],
              closing,
              closingClose: toClose.data?.monthClose,
            })
            return (
              <>
                {(canSet || canApprove) && (
                  <section className="flex flex-col gap-3">
                    <SectionTitle size="lg">Chờ bạn xử lý</SectionTitle>
                    {waitReady ? (
                      <WaitingList
                        catalog={defs}
                        waiting={waiting}
                        reasonsFailed={reasons.isError}
                        onOpenStep={openStep}
                        onOpenCounter={(x) =>
                          setOwner({ actorId: x.actorId, role: x.role, teamId: x.team?.id ?? null })
                        }
                      />
                    ) : (
                      <Skeleton className="h-24 w-full" />
                    )}
                  </section>
                )}

                {a.monthClose ? (
                  <MonthCloseBar period={period} monthClose={a.monthClose} />
                ) : (
                  t.closed && (
                    <p className={NOTE}>Tháng đã kết thúc, chỉ tiêu không đổi được nữa.</p>
                  )
                )}

                {shown ? (
                  <RoleSteps
                    catalog={defs}
                    targets={t}
                    allocations={a.allocations}
                    people={p.people}
                    teams={teams}
                    counters={c.counters}
                    roster={!roster.isPending}
                    shown={shown}
                    focusTeam={team}
                    canSet={canSet}
                    me={me}
                    onPick={pickRole}
                    onOpenCounters={setOwner}
                  />
                ) : (
                  <p className={NOTE}>Chưa có vai trò nào có KPI.</p>
                )}

                <CounterDrawer
                  who={owner}
                  onClose={() => setOwner(null)}
                  period={t.period}
                  counters={c.counters}
                  packages={a.allocations}
                  closed={t.closed}
                  canSet={canSet}
                  me={me}
                />
              </>
            )
          }}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiTargetsPage
