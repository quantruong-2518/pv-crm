import { KPI_METRIC_LABEL, type KpiMetricKey, type RoleId } from '@pv/contracts'
import { conflict, invalid } from '@api/platform/http/problem'
import { additive, defOf, type Amount, type RoleTargetOf } from './kpi-allocation.mapper'
import type { KpiShareRow } from './kpi-allocation.repository'
import type { RosterEntry } from './kpi-team.repository'

/** The team tier's rules (ADR 0101), pure: the roster of a month as an index,
 *  and the faults a package can have against it. Nothing here reads the
 *  database, so a draft (body) and a send (stored rows) are judged by one copy. */

type TeamRef = { id: string; name: string }

export type Roster = {
  teamOf(actorId: string): TeamRef | null
  team(teamId: string): TeamRef | null
  teams(): TeamRef[]
  membersOf(teamId: string): string[]
  leadOf(teamId: string): string | null
}

export function rosterOf(entries: readonly RosterEntry[]): Roster {
  const ref = (e: RosterEntry): TeamRef => ({ id: e.teamId, name: e.teamName })
  const byTeam = new Map<string, RosterEntry[]>()
  for (const e of entries) byTeam.set(e.teamId, [...(byTeam.get(e.teamId) ?? []), e])
  return {
    teamOf: (actorId) => {
      const hit = entries.find((e) => e.actorId === actorId)
      return hit ? ref(hit) : null
    },
    team: (teamId) => {
      const hit = byTeam.get(teamId)?.[0]
      return hit ? ref(hit) : null
    },
    teams: () => [...byTeam.values()].map((rows) => ref(rows[0]!)),
    membersOf: (teamId) => (byTeam.get(teamId) ?? []).map((e) => e.actorId),
    leadOf: (teamId) => byTeam.get(teamId)?.find((e) => e.lead)?.actorId ?? null,
  }
}

/** True when `lead` leads the team `actorId` sits in. */
export const leadsOver = (roster: Roster, lead: string, actorId: string): boolean => {
  const team = roster.teamOf(actorId)
  return team !== null && roster.leadOf(team.id) === lead
}

export type Faults = { lines: string[]; shares: string[] }

type FaultInput = {
  roster: Roster
  /** Everyone who holds the package's role. */
  holders: ReadonlySet<string>
  nameOf: (actorId: string) => string
  actorIds: readonly string[]
}

const strangersOf = ({ holders, actorIds }: FaultInput): string[] => {
  const strangers = new Set(actorIds.filter((id) => !holders.has(id)))
  return strangers.size > 0 ? [`${strangers.size} người được giao không giữ vai này.`] : []
}

/** Room package: lines go to holders in no team, shares to teams that have a
 *  holder of the role. `complete` (a send, not a draft) also wants a share for
 *  every such team, or its agreed package would stay in force with nothing
 *  behind it. */
export function roomFaults(
  input: FaultInput & { teamIds: readonly string[]; complete: boolean },
): Faults {
  const { roster, holders, nameOf, actorIds, teamIds, complete } = input
  const inTeam = [...new Set(actorIds)].flatMap((id) => {
    const team = roster.teamOf(id)
    return team && holders.has(id)
      ? [`${nameOf(id)} đang ở nhóm ${team.name}, chia qua phần của nhóm.`]
      : []
  })
  const eligible = new Set(
    roster
      .teams()
      .filter((t) => roster.membersOf(t.id).some((m) => holders.has(m)))
      .map((t) => t.id),
  )
  const noHolder = [...new Set(teamIds)].flatMap((id) => {
    if (eligible.has(id)) return []
    const team = roster.team(id)
    return [
      team ? `Nhóm ${team.name} chưa có ai giữ vai này.` : 'Có nhóm không còn trong tháng này.',
    ]
  })
  const given = new Set(teamIds)
  const unshared = complete
    ? roster
        .teams()
        .filter((t) => eligible.has(t.id) && !given.has(t.id))
        .map((t) => `Nhóm ${t.name} chưa được giao phần.`)
    : []
  return { lines: [...strangersOf(input), ...inTeam], shares: [...noHolder, ...unshared] }
}

/** Team package: lines only for members who hold the role, and only for
 *  metrics the team was given a share of. */
export function teamFaults(
  input: FaultInput & {
    teamId: string
    share: ReadonlyMap<KpiMetricKey, number>
    lineKeys: readonly KpiMetricKey[]
  },
): Faults {
  const { roster, nameOf, actorIds, teamId, share, lineKeys } = input
  const members = new Set(roster.membersOf(teamId))
  const outside = [...new Set(actorIds)]
    .filter((id) => !members.has(id))
    .map((id) => `${nameOf(id)} không thuộc nhóm này.`)
  const rest = actorIds.filter((id) => members.has(id))
  const unshared = [...new Set(lineKeys)]
    .filter((key) => !share.has(key))
    .map((key) => `${KPI_METRIC_LABEL[key]} không có trong phần của nhóm.`)
  return {
    lines: [...outside, ...strangersOf({ ...input, actorIds: rest }), ...unshared],
    shares: [],
  }
}

/** A draft answers 400 with the field; a send, whose body held nothing wrong,
 *  answers 409: the roster moved under it. */
export function throwFaults(faults: Faults, as: 'draft' | 'send'): void {
  const all = [...faults.lines, ...faults.shares]
  if (all.length === 0) return
  if (as === 'send') throw conflict(`${all.join(' ')} Sửa lại bản nháp rồi gửi lại.`)
  throw invalid({
    ...(faults.lines.length > 0 ? { lines: faults.lines } : {}),
    ...(faults.shares.length > 0 ? { shares: faults.shares } : {}),
  })
}

/** A share row of the room package in force, with the role it belongs to. */
export type ShareInForce = KpiShareRow & { role: RoleId }

/** One team's share per metric in the room package in force for `role`. */
export function shareValues(
  rows: readonly ShareInForce[],
  role: RoleId,
  teamId: string,
): Map<KpiMetricKey, number> {
  return new Map(
    rows
      .filter((r) => r.role === role && r.teamId === teamId)
      .map((r) => [r.metricKey, Number(r.value)]),
  )
}

/** A team's share as the target lookup the balance and the cards read. */
export const shareTargetOf =
  (values: ReadonlyMap<KpiMetricKey, number>): RoleTargetOf =>
  (_role, key) =>
    values.get(key) ?? null

/** The members' lines plus a zero for every shared metric they left out, so a
 *  share nobody was given still shows up as a shortfall. */
export const teamAmounts = (
  lines: readonly Amount[],
  share: ReadonlyMap<KpiMetricKey, number>,
): Amount[] => [...lines, ...[...share.keys()].map((metricKey) => ({ metricKey, value: '0' }))]

/** A metric that cannot be summed (ratio, hours, days) is not balanced, so
 *  nothing would notice a member left without it — and their card would fall
 *  back to the whole room's target. Each such gap is a fault at send. */
export function missingSharedLines(input: {
  roster: Roster
  teamId: string
  role: RoleId
  holders: ReadonlySet<string>
  nameOf: (actorId: string) => string
  lines: readonly { actorId: string; metricKey: KpiMetricKey }[]
  share: ReadonlyMap<KpiMetricKey, number>
}): string[] {
  const { roster, teamId, role, holders, nameOf, lines, share } = input
  const keys = [...share.keys()].filter((key) => {
    const def = defOf(role, key)
    return def !== undefined && !additive(def)
  })
  const given = new Set(lines.map((l) => `${l.actorId}|${l.metricKey}`))
  return roster
    .membersOf(teamId)
    .filter((id) => holders.has(id))
    .flatMap((id) =>
      keys
        .filter((key) => !given.has(`${id}|${key}`))
        .map((key) => `Chưa nhập ${KPI_METRIC_LABEL[key]} cho ${nameOf(id)}.`),
    )
}
