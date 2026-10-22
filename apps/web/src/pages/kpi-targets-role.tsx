import { useState } from 'react'
import { Button, GlassCard, SectionTitle, SegmentedControl, Skeleton } from '@pv/ui'
import type {
  KpiAllocation,
  KpiCounter,
  KpiPerson,
  KpiRoleTargets,
  KpiTargetsResponse,
  KpiTeam,
  RoleId,
} from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { teamRowsOf } from './kpi-allocate-model'
import { PackageSteps } from './kpi-allocate-parts'
import { AnswersBlock, DecideBlock, ReturnedNote } from './kpi-allocate-review'
import { AllocationTable } from './kpi-allocate-table'
import { TeamPackages } from './kpi-allocate-team-packages'
import type { CounterOwner } from './kpi-counter-detail'
import { RoleTargets } from './kpi-company-targets'
import { TargetHistoryButton } from './kpi-history'
import { holdersOf, stepId } from './kpi-targets-model'

/** The role picker and one role's month on the targets screen (ADR 0098, 0101): the four steps
 *  say where it stands, and each step is a section under the same name — the
 *  role target, its split per person and team, each holder's answer, and the
 *  second manager's decision — then the teams' own packages.
 *
 *  The role target stays mounted across a package's versions, so a value
 *  typed there survives a save below; the split remounts on each version. */

const SECTION = 'flex scroll-mt-4 flex-col gap-3'

type PaneProps = {
  catalog: KpiCatalog
  period: string
  entry: KpiRoleTargets
  /** The room package, and the teams' packages of the role. */
  pkg: KpiAllocation | undefined
  teamPkgs: readonly KpiAllocation[]
  people: readonly KpiPerson[]
  teams: readonly KpiTeam[]
  /** The role's counters this month, any status and tier. */
  counters: readonly KpiCounter[]
  focusTeam: string | null
  closed: boolean
  canSet: boolean
  me: string | undefined
  onOpenCounters: (actorId: string, teamId: string | null) => void
}

/** The role has an agreed target: the package carries its own, else the targets read says. */
const hasTotalOf = (entry: KpiRoleTargets, pkg: KpiAllocation | undefined) =>
  pkg ? pkg.totals.some((t) => t.roleTarget !== null) : entry.metrics.some((m) => m.agreed !== null)

/** Holders whose counters the answers table does not list: a settled counter
 *  reopens a draft and hides that table, and the record must stay reachable. */
function OtherCounters({
  names,
  onOpen,
}: {
  names: readonly (readonly [string, string])[]
  onOpen: (actorId: string) => void
}) {
  return (
    <section className={SECTION}>
      <SectionTitle size="lg">Đề xuất của người nhận</SectionTitle>
      <GlassCard variant="b" className="py-2">
        <ul className="divide-surface-ink/6 flex flex-col divide-y">
          {names.map(([actorId, name]) => (
            <li
              key={actorId}
              className="flex min-h-12 items-center justify-between gap-3 px-5 py-2 text-[12.5px] leading-5"
            >
              <span className="truncate font-semibold">{name}</span>
              <Button
                variant="secondary"
                size="sm"
                className="pointer-coarse:h-12 shrink-0"
                onClick={() => onOpen(actorId)}
              >
                Xem đề xuất
              </Button>
            </li>
          ))}
        </ul>
      </GlassCard>
    </section>
  )
}

function RoleAllocation({
  catalog,
  period,
  entry,
  pkg,
  teamPkgs,
  people,
  teams,
  counters,
  focusTeam,
  closed,
  canSet,
  me,
  onOpenCounters,
}: PaneProps) {
  const [editing, setEditing] = useState(false)
  const role = entry.role
  const defs = catalog[role]
  const holders = holdersOf(role, people, pkg, teams)
  const writable = canSet && !closed
  const status = pkg?.status
  const editable = writable && (!pkg || status === 'draft' || (status === 'returned' && editing))
  const agreed = (key: string) => entry.metrics.find((m) => m.key === key)?.agreed?.value ?? null
  const hasTotal = hasTotalOf(entry, pkg)
  const room = counters.filter((c) => !c.team)
  const ackShown =
    pkg !== undefined && pkg.lines.length > 0 && (status === 'submitted' || status === 'agreed')
  const listed = new Set(ackShown ? pkg.lines.map((l) => l.actorId) : [])
  const others = [
    ...new Map(room.filter((c) => !listed.has(c.actorId)).map((c) => [c.actorId, c.name])),
  ]
  const openRoom = (actorId: string) => onOpenCounters(actorId, null)

  return (
    <>
      <section id={stepId(role, 'split')} className={SECTION}>
        <SectionTitle
          size="lg"
          hint={editable ? 'Để trống thì người đó theo chỉ tiêu của vai trò.' : undefined}
          actions={
            <TargetHistoryButton period={period} role={role} defs={defs} subject={{ holders }} />
          }
        >
          Phân bổ
        </SectionTitle>
        {pkg && status === 'returned' && (
          <ReturnedNote
            pkg={pkg}
            onEdit={writable && !editing ? () => setEditing(true) : undefined}
          />
        )}
        <AllocationTable
          period={period}
          role={role}
          defs={defs}
          holders={holders}
          teams={teamRowsOf(role, teams, pkg)}
          pkg={pkg}
          teamPkgs={teamPkgs}
          roleTargetOf={agreed}
          hasTotal={hasTotal}
          editable={editable}
          canSend={writable}
          me={me}
        />
      </section>

      {ackShown && (
        <section id={stepId(role, 'ack')} className={SECTION}>
          <SectionTitle size="lg">Người nhận xác nhận</SectionTitle>
          <AnswersBlock pkg={pkg} holders={holders} counters={room} onOpenCounters={openRoom} />
        </section>
      )}

      {others.length > 0 && <OtherCounters names={others} onOpen={openRoom} />}

      {pkg && status === 'submitted' && writable && (
        <section id={stepId(role, 'lock')} className={SECTION}>
          <SectionTitle size="lg">Duyệt và khoá</SectionTitle>
          <DecideBlock period={period} role={role} pkg={pkg} me={me} />
        </section>
      )}

      <TeamPackages
        period={period}
        defs={defs}
        packages={teamPkgs}
        focus={focusTeam}
        counters={counters}
        canDecide={writable}
        me={me}
        onOpenCounters={onOpenCounters}
      />
    </>
  )
}

function RolePane(props: PaneProps) {
  const { catalog, period, entry, pkg, closed, canSet, me } = props
  const hasTotal = hasTotalOf(entry, pkg)
  const writable = canSet && !closed

  return (
    <>
      <PackageSteps pkg={pkg} hasTotal={hasTotal} />
      <section id={stepId(entry.role, 'total')} className={SECTION}>
        <SectionTitle size="lg" hint={writable ? 'Đề nghị mới cần người khác duyệt.' : undefined}>
          Chỉ tiêu vai trò
        </SectionTitle>
        <RoleTargets catalog={catalog} period={period} entry={entry} canSet={writable} me={me} />
      </section>
      <RoleAllocation key={`${period}/${entry.role}/${pkg?.version ?? 0}`} {...props} />
    </>
  )
}

/** Every role stays mounted and only the picked one shows, so a value typed
 *  under one role survives a switch to another. */
export function RoleSteps({
  catalog,
  targets,
  allocations,
  people,
  teams,
  counters,
  roster,
  shown,
  focusTeam,
  canSet,
  me,
  onPick,
  onOpenCounters,
}: {
  catalog: KpiCatalog
  targets: KpiTargetsResponse
  allocations: readonly KpiAllocation[]
  people: readonly KpiPerson[]
  teams: readonly KpiTeam[]
  counters: readonly KpiCounter[]
  /** The roster has answered; until then team members would show as loose people. */
  roster: boolean
  shown: RoleId
  focusTeam: string | null
  canSet: boolean
  me: string | undefined
  onPick: (role: string) => void
  onOpenCounters: (who: CounterOwner) => void
}) {
  if (!roster) return <Skeleton className="h-24 w-full" />
  return (
    <>
      <div className="overflow-x-auto">
        <SegmentedControl
          label="Vai trò"
          tone="quiet"
          value={shown}
          onChange={onPick}
          options={targets.roles.map((r) => ({ value: r.role, label: ROLE_LABEL[r.role] }))}
        />
      </div>
      {targets.roles.map((entry) => (
        <div
          key={`${targets.period}/${entry.role}`}
          hidden={entry.role !== shown}
          className="flex flex-col gap-5 lg:gap-6"
        >
          <RolePane
            catalog={catalog}
            period={targets.period}
            entry={entry}
            pkg={allocations.find((x) => x.role === entry.role && x.team === null)}
            teamPkgs={allocations.filter((x) => x.role === entry.role && x.team)}
            people={people}
            teams={teams}
            counters={counters.filter((x) => x.role === entry.role)}
            focusTeam={entry.role === shown ? focusTeam : null}
            closed={targets.closed}
            canSet={canSet}
            me={me}
            onOpenCounters={(actorId, teamId) =>
              onOpenCounters({ actorId, role: entry.role, teamId })
            }
          />
        </div>
      ))}
    </>
  )
}
