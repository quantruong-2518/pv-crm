import { kpiSums, RoleId, type KpiMetricDef, type KpiMetricKey } from '@pv/contracts'
import type { KpiCatalog } from '@api/branches/sales/kpi/kpi-config.overlay'
import type {
  KpiAllocationLineValues,
  KpiAllocationShareValues,
  KpiAllocationValues,
  KpiCounterValues,
} from '@api/branches/sales/kpi/kpi-allocation.schema'
import { lapsedAt } from '@api/branches/sales/kpi/kpi-rules'
import type { KpiAcknowledgementValues } from '@api/branches/sales/kpi/kpi.schema'
import { vnAt } from './clock'
import {
  figure,
  holdersOf,
  roundFor,
  split,
  unitOf,
  weightOf,
  type Person,
} from './emit-kpi-figures'
import type { TeamRef } from './emit-kpi-teams'
import { CAST } from './params'
import type { Rng } from './rng'

/** November's allocation packages (ADR 0098, 0101), in every state the screens know.
 *
 *  Old months only: tiered months (from 12/2026) hand targets down by assignment
 *  sets instead (`emit-kpi-december.ts`). Room tier by role: sale and bd agreed,
 *  account-executive submitted, marketing returned, presales draft. Under an
 *  agreed room each team has a package: sale north reissued (v1 superseded, v2
 *  draft), sale south and bd north agreed, bd south submitted. `LINE` marks the
 *  lines that are not plainly acknowledged: one lapsed, one per counter outcome.
 *  Every agreed package adds up exactly to its team's share. */

const PERIOD = '2026-11'
const ACK_DAYS = 3
/** Agreed on 29/10 plus three days, so a line still pending on 16/11 reads lapsed. */
const DUE = '2026-11-01'

const T = {
  roomSent: vnAt('2026-10-28', 14),
  roomDecided: vnAt('2026-10-29', 9),
  teamMade: vnAt('2026-10-29', 10),
  teamSent: vnAt('2026-10-29', 11),
  teamDecided: vnAt('2026-10-29', 15),
}

type RoomState = 'draft' | 'submitted' | 'returned' | 'agreed'
const ROOM: Partial<Record<RoleId, RoomState>> = {
  sale: 'agreed',
  bd: 'agreed',
  'account-executive': 'submitted',
  marketing: 'returned',
  presales: 'draft',
}

type TeamState = 'agreed' | 'submitted' | 'reissued'
const TEAM_STATE: Record<string, TeamState> = {
  'sale|north': 'reissued',
  'sale|south': 'agreed',
  'bd|north': 'agreed',
  'bd|south': 'submitted',
}

type Tag = 'lapsed' | 'accepted' | 'kept' | 'open' | 'countered'
const LINE: Record<string, Tag> = {
  'sale|north|u-test1|signed-value': 'lapsed',
  'sale|north|u-test1|win-rate': 'lapsed',
  'sale|north|u-test1|debriefs-closed': 'accepted',
  'sale|south|u-test2|signed-value': 'kept',
  'bd|north|u-test1|opportunities-opened': 'open',
  'bd|north|u-vita|first-response-hours': 'lapsed',
  'bd|south|u-vivian|opportunities-opened': 'countered',
}

/** A counter of each outcome: the share of the line it asks for, when it was
 *  raised and settled, and what the lead offered back (`countered` only). */
const COUNTER: Partial<
  Record<Tag, { ask: number; raised: Date; settled?: Date; offer?: number; reason: string }>
> = {
  open: {
    ask: 0.7,
    raised: vnAt('2026-10-31', 10),
    reason: 'Khách khu vực tôi chậm lại, xin hạ mức này.',
  },
  accepted: {
    ask: 0.8,
    raised: vnAt('2026-10-30', 14),
    settled: vnAt('2026-11-02', 9, 30),
    reason: 'Hai khách lớn dời sang quý sau, xin hạ mức này.',
  },
  kept: {
    ask: 0.85,
    raised: vnAt('2026-10-30', 16),
    settled: vnAt('2026-10-31', 9),
    reason: 'Tôi nghỉ gần một tuần trong tháng, xin hạ mức này.',
  },
  countered: {
    ask: 0.6,
    raised: vnAt('2026-10-30', 13),
    settled: vnAt('2026-10-30', 17),
    offer: 0.8,
    reason: 'Mới nhận thêm việc hỗ trợ, xin hạ mức này.',
  },
}
const STATUS = { open: 'open', accepted: 'accepted', kept: 'kept', countered: 'countered' } as const

export type Bundle = {
  alloc: KpiAllocationValues
  lines: KpiAllocationLineValues[]
  shares: KpiAllocationShareValues[]
  counters: KpiCounterValues[]
}

type Value = Map<KpiMetricKey, number>
type Ack = Pick<KpiAllocationLineValues, 'ackStatus' | 'ackedAt' | 'ackedByDefault'>
type Spec = { actorId: string; def: KpiMetricDef; value: number; orig: number; tag?: Tag; ack: Ack }

const pending: Ack = { ackStatus: 'pending', ackedAt: null, ackedByDefault: false }
const answered = (at: Date): Ack => ({
  ackStatus: 'acknowledged',
  ackedAt: at,
  ackedByDefault: false,
})
const ackAt = (n: number): Date => new Date(T.teamDecided.getTime() + (n % 30) * 53 * 60_000)

/** Each team's share of every metric of `role` with a figure: pooled metrics are split
 *  by the weight of the team's holders, the rest repeat the role's figure. */
function sharesOf(role: RoleId, catalog: KpiCatalog, people: Person[], teams: TeamRef[]) {
  const holders = holdersOf(people, role)
  const eligible = teams.filter((t) => t.members.some((m) => holders.includes(m)))
  const weights = eligible.map((t) =>
    t.members.filter((m) => holders.includes(m)).reduce((n, m) => n + weightOf(m), 0),
  )
  const out = new Map<string, Value>(eligible.map((t) => [t.id, new Map()]))
  for (const def of catalog[role]) {
    const pool = figure(role, def, PERIOD, holders.length)
    if (pool === null) continue
    const parts = kpiSums(def) ? split(pool, weights, unitOf(def)) : eligible.map(() => pool)
    eligible.forEach((t, i) => out.get(t.id)!.set(def.key, parts[i]!))
  }
  return out
}

function roomBundle(role: RoleId, state: RoomState, shares: Map<string, Value>, rng: Rng): Bundle {
  const sent = state !== 'draft'
  const decided = state === 'agreed' || state === 'returned'
  const alloc: KpiAllocationValues = {
    id: rng.uuid(),
    period: PERIOD,
    role,
    teamId: null,
    version: 1,
    status: state,
    submittedBy: CAST.head,
    submittedAt: sent ? T.roomSent : null,
    decidedBy: decided ? CAST.director : null,
    decidedAt: decided ? T.roomDecided : null,
    returnReason: state === 'returned' ? 'Chỉ tiêu tháng này cần bàn lại với phòng.' : null,
    ackDays: sent ? ACK_DAYS : null,
    createdAt: vnAt('2026-10-27', 10),
  }
  const rows = [...shares].flatMap(([teamId, values]) =>
    [...values].map(([metricKey, value]) => ({
      allocationId: alloc.id!,
      teamId,
      metricKey,
      value: String(value),
    })),
  )
  return { alloc, lines: [], shares: rows, counters: [] }
}

/** The members' lines of one team package as sent: the share split by weight. */
function specsOf(
  role: RoleId,
  team: TeamRef,
  share: Value,
  members: string[],
  catalog: KpiCatalog,
  status: 'agreed' | 'submitted',
): Spec[] {
  let n = 0
  return catalog[role].flatMap((def) => {
    const total = share.get(def.key)
    if (total === undefined) return []
    const parts = kpiSums(def)
      ? split(total, members.map(weightOf), unitOf(def))
      : members.map(() => total)
    return members.map((actorId, i): Spec => {
      const orig = parts[i]!
      const tag = LINE[`${role}|${team.key}|${actorId}|${def.key}`]
      const c = tag && COUNTER[tag]
      const value = c?.offer ? roundFor(def, orig * c.offer) : orig
      const ack =
        tag === 'open'
          ? { ...answered(c!.raised), ackStatus: 'countered' as const }
          : tag === 'kept'
            ? answered(vnAt('2026-10-31', 11))
            : tag || status === 'submitted'
              ? pending
              : answered(ackAt(n++))
      return { actorId, def, value, orig, tag, ack }
    })
  })
}

function packageOf(
  role: RoleId,
  team: TeamRef,
  status: KpiAllocationValues['status'],
  version: number,
  specs: Spec[],
  rng: Rng,
): Bundle {
  const decided = status === 'agreed' || status === 'superseded'
  const draft = status === 'draft'
  const alloc: KpiAllocationValues = {
    id: rng.uuid(),
    period: PERIOD,
    role,
    teamId: team.id,
    version,
    status,
    submittedBy: team.lead,
    submittedAt: draft ? null : T.teamSent,
    decidedBy: decided ? CAST.head : null,
    decidedAt: decided ? T.teamDecided : null,
    ackDays: ACK_DAYS,
    createdAt: draft ? COUNTER.accepted!.settled! : T.teamMade,
  }
  const lines = specs.map((s) => ({
    allocationId: alloc.id!,
    actorId: s.actorId,
    metricKey: s.def.key,
    value: String(s.value),
    ...s.ack,
  }))
  const counters = specs.flatMap((s): KpiCounterValues[] => {
    const c = s.tag && COUNTER[s.tag]
    if (!s.tag || !c) return []
    return [
      {
        id: rng.uuid(),
        allocationId: alloc.id!,
        actorId: s.actorId,
        metricKey: s.def.key,
        proposedValue: String(roundFor(s.def, s.orig * c.ask)),
        reason: c.reason,
        status: STATUS[s.tag as keyof typeof STATUS],
        resolvedBy: c.settled ? team.lead : null,
        resolvedAt: c.settled ?? null,
        counterValue: c.offer ? String(s.value) : null,
        createdAt: c.raised,
      },
    ]
  })
  return { alloc, lines, shares: [], counters }
}

/** What the reissue copies (kpi-allocation-counter `reissue`): a lapsed line is carried
 *  answered at its lapse and flagged; the accepted counter's line takes the proposal, pending. */
function reissued(specs: Spec[]): Spec[] {
  return specs.map((s) => {
    if (s.tag === 'accepted') {
      return { ...s, value: roundFor(s.def, s.orig * COUNTER.accepted!.ask), ack: pending }
    }
    if (s.tag === 'lapsed') {
      return {
        ...s,
        ack: { ackStatus: 'acknowledged', ackedAt: lapsedAt(DUE), ackedByDefault: true },
      }
    }
    return s
  })
}

/** Answers to November's targets: whoever acknowledged a line of a package holds a
 *  stamp at the last such answer; people with no line answer the role directly, every other one. */
function acksOf(
  bundles: Bundle[],
  catalog: KpiCatalog,
  people: Person[],
): KpiAcknowledgementValues[] {
  const out: KpiAcknowledgementValues[] = []
  for (const role of RoleId.options.filter((r) => catalog[r].length > 0)) {
    holdersOf(people, role).forEach((actorId, i) => {
      const mine = bundles
        .filter((b) => b.alloc.role === role)
        .flatMap((b) => b.lines)
        .filter((l) => l.actorId === actorId)
      const stamps = mine.filter((l) => l.ackStatus === 'acknowledged' && !l.ackedByDefault)
      const at =
        mine.length === 0
          ? i % 2 === 0
            ? vnAt('2026-10-30', 10, i * 5)
            : null
          : stamps.reduce<Date | null>((m, l) => (!m || l.ackedAt! > m ? l.ackedAt! : m), null)
      if (at) out.push({ actorId, role, period: PERIOD, acknowledgedAt: at })
    })
  }
  return out
}

export function buildPackages(args: {
  catalog: KpiCatalog
  people: Person[]
  teams: TeamRef[]
  rng: Rng
}) {
  const { catalog, people, teams, rng } = args
  const bundles: Bundle[] = []
  for (const role of RoleId.options) {
    const state = ROOM[role]
    if (!state || catalog[role].length === 0) continue
    const shares = sharesOf(role, catalog, people, teams)
    bundles.push(roomBundle(role, state, shares, rng))
    if (state !== 'agreed') continue
    const holders = holdersOf(people, role)
    for (const team of teams) {
      const share = shares.get(team.id)
      if (!share) continue
      const members = team.members.filter((m) => holders.includes(m))
      const how = TEAM_STATE[`${role}|${team.key}`] ?? 'agreed'
      const sent = specsOf(
        role,
        team,
        share,
        members,
        catalog,
        how === 'submitted' ? 'submitted' : 'agreed',
      )
      if (how !== 'reissued') {
        bundles.push(packageOf(role, team, how, 1, sent, rng))
        continue
      }
      bundles.push(packageOf(role, team, 'superseded', 1, sent, rng))
      bundles.push(packageOf(role, team, 'draft', 2, reissued(sent), rng))
    }
  }
  return { bundles, acks: acksOf(bundles, catalog, people) }
}
