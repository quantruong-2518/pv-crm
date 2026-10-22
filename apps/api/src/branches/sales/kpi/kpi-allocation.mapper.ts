import {
  KPI_METRIC_LABEL,
  type KpiAllocation,
  type KpiAllocationShareLine,
  type KpiAllocationTotal,
  type KpiCounter,
  type KpiCounterEffect,
  type KpiMetricDef,
  type KpiMetricKey,
  type RoleId,
} from '@pv/contracts'
import type {
  KpiAgreedLine,
  KpiCounterRow,
  KpiLineRow,
  KpiPackageRow,
  KpiShareRow,
} from './kpi-allocation.repository'
import { catalogDef } from './kpi-config.overlay'
import { ackDueOn, ackStateOf, lapsedOnOf, lapseOf } from './kpi-rules'
import type { KpiTargetRow } from './kpi-targets.repository'
import { verdictOf } from './kpi-verdict'
import { slotsOf, type LineAck, type TargetSlots } from './kpi.mapper'

/** Allocation rows → wire, plus the two sums the rules need. Reads nothing.
 *
 *  Figures come in as lookups (`(role, key) → number | null`) built by the
 *  service from the existing readers, so "what last month was" and "who is on
 *  pace" stay `kpi.mapper.ts`'s and `kpi-verdict.ts`'s rules, not copies. */

export type RoleTargetOf = (role: RoleId, key: KpiMetricKey) => number | null
/** One person's figure for one metric of one role this month or last. */
export type FigureOf = (role: RoleId, actorId: string, key: KpiMetricKey) => number | null

/** ADR 0098 §2: only a count or money figure kept per person adds up. */
export const additive = (def: KpiMetricDef): boolean =>
  def.scope === 'own' && (def.unit === 'count' || def.unit === 'money')

/** Code traits, not the effective catalog: a stored line of a metric switched
 *  off since still sums by its unit (ADR 0099 §1 keeps old packages whole). */
export const defOf = (role: RoleId, key: KpiMetricKey): KpiMetricDef | undefined =>
  catalogDef(role, key)

const keysOf = (lines: readonly { metricKey: KpiMetricKey }[]): KpiMetricKey[] => [
  ...new Set(lines.map((l) => l.metricKey)),
]

/** What the balance adds up: a holder's line, or a team's share — a share
 *  counts exactly like one more holder (ADR 0101). */
export type Amount = { metricKey: KpiMetricKey; value: string }

const sumOf = (lines: readonly Amount[], key: KpiMetricKey) =>
  lines.filter((l) => l.metricKey === key).reduce((n, l) => n + Number(l.value), 0)

/** Per metric present in the package — a metric left out falls back to the
 *  role target on every card, so there is nothing of it to sum. On a team
 *  package `roleTarget` answers the team's share, and `role` only picks the
 *  metric's traits. */
export function totalsOf(
  role: RoleId,
  lines: readonly Amount[],
  roleTarget: RoleTargetOf,
): KpiAllocationTotal[] {
  return keysOf(lines).map((key) => {
    const def = defOf(role, key)
    const allocated = def && additive(def) ? sumOf(lines, key) : null
    const target = roleTarget(role, key)
    return {
      metricKey: key,
      allocated,
      roleTarget: target,
      delta: allocated !== null && target !== null ? allocated - target : null,
    }
  })
}

/** The sentence `submit` refuses with, or `null` when every additive metric
 *  sums exactly to its target: the agreed role target on the room tier, the
 *  team's share on a team package. */
export function mismatchOf(
  role: RoleId,
  lines: readonly Amount[],
  roleTarget: RoleTargetOf,
  tier: 'room' | 'team' = 'room',
): string | null {
  const vn = new Intl.NumberFormat('vi-VN')
  const faults = totalsOf(role, lines, roleTarget).flatMap((t) => {
    const def = defOf(role, t.metricKey)
    if (!def || !additive(def)) return []
    const label = KPI_METRIC_LABEL[t.metricKey]
    if (t.roleTarget === null) {
      return [
        `${label} ${tier === 'team' ? 'chưa có phần của nhóm' : 'chưa có chỉ tiêu vai được duyệt'}`,
      ]
    }
    if (t.delta === null || t.delta === 0) return []
    return [`${label} ${t.delta < 0 ? 'thiếu' : 'thừa'} ${vn.format(Math.abs(t.delta))}`]
  })
  if (faults.length === 0) return null
  return tier === 'team'
    ? `Tổng chỉ tiêu từng người chưa khớp phần của nhóm: ${faults.join('; ')}.`
    : `Tổng chỉ tiêu từng người chưa khớp chỉ tiêu vai: ${faults.join('; ')}.`
}

/** What a team package adds to the wire beside the room package's fields. */
export type TierView = { shares: KpiAllocationShareLine[]; shareChanged: boolean }

/** A room package's shares as the head reads them. `members` are the team's
 *  people who hold the role; last month's team figure is their sum, and only
 *  an additive metric has one. */
export function toShareLines(
  shares: readonly KpiShareRow[],
  role: RoleId,
  members: (teamId: string) => readonly string[],
  roleTarget: RoleTargetOf,
  lastMonth: FigureOf,
): KpiAllocationShareLine[] {
  return shares.map((s) => {
    const def = defOf(role, s.metricKey)
    const ids = members(s.teamId)
    const figures = ids.map((id) => lastMonth(role, id, s.metricKey))
    const known = figures.filter((v): v is number => v !== null)
    return {
      team: { id: s.teamId, name: s.teamName },
      memberCount: ids.length,
      metricKey: s.metricKey,
      value: Number(s.value),
      roleValue: roleTarget(role, s.metricKey),
      lastMonth: def && additive(def) && known.length > 0 ? known.reduce((n, v) => n + v, 0) : null,
    }
  })
}

export function toAllocation(
  pkg: KpiPackageRow,
  lines: readonly KpiLineRow[],
  totals: KpiAllocationTotal[],
  roleTarget: RoleTargetOf,
  lastMonth: FigureOf,
  today: string,
  tier: TierView = { shares: [], shareChanged: false },
): KpiAllocation {
  const dueOn = ackDueOn(pkg)
  return {
    period: pkg.period,
    role: pkg.role,
    team: pkg.teamId && pkg.teamName ? { id: pkg.teamId, name: pkg.teamName } : null,
    version: pkg.version,
    status: pkg.status,
    /* Set on a draft too: its last author is the one person who may send it. */
    submittedBy: { actorId: pkg.submittedBy, name: pkg.submitter },
    submittedAt: pkg.submittedAt?.toISOString() ?? null,
    decidedBy: pkg.decidedBy && pkg.decider ? { actorId: pkg.decidedBy, name: pkg.decider } : null,
    decidedAt: pkg.decidedAt?.toISOString() ?? null,
    returnReason: pkg.returnReason,
    ackDays: pkg.ackDays,
    ackDueOn: dueOn,
    lines: lines.map((l) => ({
      actorId: l.actorId,
      name: l.name,
      metricKey: l.metricKey,
      value: Number(l.value),
      ackStatus: l.ackStatus,
      ackState: ackStateOf(l, dueOn, today),
      ackedAt: l.ackedAt?.toISOString() ?? null,
      lapsedOn: lapsedOnOf(l, dueOn, today),
      roleValue: roleTarget(pkg.role, l.metricKey),
      lastMonth: lastMonth(pkg.role, l.actorId, l.metricKey),
    })),
    shares: tier.shares,
    shareChanged: tier.shareChanged,
    totals,
  }
}

/** What accepting the counter does to the package's split.
 *
 *  `compensators`: the other holders of the same metric in the same package
 *  whose figure this month is `met` or `on-track` against THEIR line — the
 *  pace rule of `kpi-verdict.ts`, no new threshold. The shortfall is shared
 *  among them in proportion to their line: `delta_i = shortfall × line_i ÷
 *  Σ line`. Nobody on pace, or Σ line = 0, leaves the list empty.
 *
 *  `target` is the package's own: the role target on the room tier, the team's
 *  share on a team package. `shares` are the room package's, which count as
 *  lines in the sum but are nobody to compensate. */
export function effectOf(
  counter: KpiCounterRow,
  pkgLines: readonly KpiLineRow[],
  roleTarget: number | null,
  now: FigureOf,
  elapsed: number,
  tolerance: number,
  shares: readonly Amount[] = [],
): KpiCounterEffect {
  const def = defOf(counter.role, counter.metricKey)
  if (!def || !additive(def)) {
    return { allocatedAfter: null, roleTarget, shortfall: null, compensators: [] }
  }
  const same = pkgLines.filter((l) => l.metricKey === counter.metricKey)
  const others = same.filter((l) => l.actorId !== counter.actorId)
  const allocatedAfter =
    sumOf(others, counter.metricKey) +
    sumOf(shares, counter.metricKey) +
    Number(counter.proposedValue)
  const shortfall = roleTarget === null ? null : Math.max(0, roleTarget - allocatedAfter)

  const ahead = others.filter((l) => {
    const v = verdictOf(
      now(counter.role, l.actorId, l.metricKey),
      Number(l.value),
      def,
      elapsed,
      tolerance,
    )
    return v === 'met' || v === 'on-track'
  })
  const base = ahead.reduce((n, l) => n + Number(l.value), 0)
  const compensators =
    shortfall && base > 0
      ? ahead
          .map((l) => ({
            actorId: l.actorId,
            name: l.name,
            delta: (shortfall * Number(l.value)) / base,
          }))
          .filter((c) => c.delta > 0)
      : []
  return { allocatedAfter, roleTarget, shortfall, compensators }
}

export function toCounter(row: KpiCounterRow, effect: KpiCounterEffect): KpiCounter {
  return {
    id: row.id,
    actorId: row.actorId,
    name: row.name,
    role: row.role,
    team: row.teamId && row.teamName ? { id: row.teamId, name: row.teamName } : null,
    metricKey: row.metricKey,
    assigned: Number(row.assigned),
    proposed: Number(row.proposedValue),
    reason: row.reason,
    status: row.status,
    counterValue: row.counterValue === null ? null : Number(row.counterValue),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    effect,
  }
}

/** Each agreed line as the target row a scorecard reads, so the card goes
 *  through `slotsOf` and `verdictOf` unchanged. Version and stamps are the
 *  package's: that is the agreement behind this number. */
function toPersonalTargets(lines: readonly KpiAgreedLine[]): Map<string, KpiTargetRow[]> {
  const out = new Map<string, KpiTargetRow[]>()
  for (const l of lines) {
    const p = l.package
    if (!p.submittedAt) continue
    const row: KpiTargetRow = {
      role: p.role,
      period: p.period,
      metricKey: l.metricKey,
      version: p.version,
      value: l.value,
      proposedById: p.submittedBy,
      proposedAt: p.submittedAt,
      agreedById: p.decidedBy,
      agreedAt: p.decidedAt,
      proposedBy: '',
      agreedBy: null,
    }
    out.set(l.actorId, [...(out.get(l.actorId) ?? []), row])
  }
  return out
}

/** ADR 0098 §4's precedence, decided HERE and nowhere else: a person's line in
 *  the role's last agreed package beats the role's agreed target. The card,
 *  the forecast and the weekly series all read targets through this.
 *
 *  Personal rows are appended after the role's, so `slotsOf` — "the last
 *  agreed row seen wins" — picks them without a second rule. */
export function targetSources(rows: readonly KpiTargetRow[], lines: readonly KpiAgreedLine[]) {
  const base = slotsOf(rows)
  const own = toPersonalTargets(lines)
  return {
    slotsFor: (actorId: string): TargetSlots => {
      const extra = own.get(actorId)
      return extra ? slotsOf([...rows, ...extra]) : base
    },
    acksFor: (actorId: string, role: RoleId, today: string): LineAck[] =>
      lines
        .filter((l) => l.actorId === actorId && l.package.role === role)
        .map((l) => {
          const dueOn = ackDueOn(l.package)
          return {
            metricKey: l.metricKey,
            ackState: ackStateOf(l, dueOn, today),
            lapsedAt: lapseOf(l, dueOn, today),
          }
        }),
  }
}
