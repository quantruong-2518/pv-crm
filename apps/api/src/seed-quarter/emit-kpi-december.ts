import { eq } from 'drizzle-orm'
import { kpiMetricShare, RoleId, type KpiMetricKey } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { orgMember, orgNode } from '@api/platform/db/org.schema'
import { orgVersionAt } from '@api/platform/org/org-version'
import type {
  KpiAssignmentLineValues,
  KpiAssignmentValues,
} from '@api/branches/sales/kpi/kpi-assignment.schema'
import {
  holdersUnder,
  isCompany,
  needsSet,
  receiversOf,
} from '@api/branches/sales/kpi/kpi-assignment.mapper'
import type { KpiCatalog } from '@api/branches/sales/kpi/kpi-config.overlay'
import type { KpiMarketingBudgetValues } from '@api/branches/sales/kpi/kpi-config.schema'
import type { KpiOrgTree } from '@api/branches/sales/kpi/kpi-team.repository'
import { vnAt } from './clock'
import { figure, roundFor, split, unitOf, weightOf } from './emit-kpi-figures'
import { CAST } from './params'
import type { Rng } from './rng'

/** December 2026, the first tiered month (ADR 0118, 0120): the targets handed
 *  down the org tree, company to department to team to person.
 *
 *  Every unit that owes a set for a role has one in force, so the sweeper (it
 *  acts from 21/11) has nothing to default. On top: marketing at the company is
 *  a corrected v2 beside a superseded v1, bd at the department has a draft v2
 *  beside its sent v1, and half the people have confirmed their lines. Units
 *  and people come from the tree as the database holds it; with no tree, no sets. */

export const TIERED = '2026-12'

const LEVEL_DAY = { company: '2026-11-13', department: '2026-11-14', team: '2026-11-15' } as const
const KIND_RANK = { company: 0, department: 1, team: 2 } as const

export async function readTree(tx: Db, period: string): Promise<KpiOrgTree | null> {
  const from = await orgVersionAt(tx, period)
  if (!from) return null
  const nodes = await tx.select().from(orgNode).where(eq(orgNode.fromPeriod, from))
  const members = await tx
    .select({
      fromPeriod: orgMember.fromPeriod,
      actorId: orgMember.actorId,
      unitId: orgMember.unitId,
      head: orgMember.head,
      name: actor.name,
      roleIds: actor.roleIds,
      locked: actor.disabledAt,
    })
    .from(orgMember)
    .innerJoin(actor, eq(actor.id, orgMember.actorId))
    .where(eq(orgMember.fromPeriod, from))
  return { from, nodes, members: members.map((m) => ({ ...m, locked: m.locked !== null })) }
}

type Line = Omit<KpiAssignmentLineValues, 'assignmentId'>

export type SetBundle = { set: KpiAssignmentValues; lines: Line[] }

/** The lines one unit sends for one role. `scale` bends the figures of an earlier
 *  version or a draft; the company's own figures are the pool, below it what was received. */
function linesOf(
  tree: KpiOrgTree,
  catalog: KpiCatalog,
  role: RoleId,
  unitId: string,
  received: Map<KpiMetricKey, number>,
  scale: number,
): Line[] {
  const company = isCompany(tree, unitId)
  const to = receiversOf(tree, role, unitId)
  const heldBy = (id: string) => holdersUnder(tree, role, id).reduce((n, h) => n + weightOf(h), 0)
  const takers = [
    ...to.units.map((u) => ({ unit: u, weight: heldBy(u) })),
    ...to.people.map((p) => ({ person: p, weight: weightOf(p) })),
  ]
  const make = (
    key: KpiMetricKey,
    value: number,
    to?: { unit?: string; person?: string },
  ): Line => ({
    metricKey: key,
    kind: to?.unit ? 'unit' : to?.person ? 'person' : 'total',
    childUnitId: to?.unit ?? null,
    personId: to?.person ?? null,
    value: String(value),
    confirmedAt: null,
    addedAt: null,
  })
  const holders = holdersUnder(tree, role, unitId).length
  return catalog[role].flatMap((def) => {
    const share = kpiMetricShare(def)
    const raw = company
      ? figure(role, def, TIERED, share === 'additive' ? holders : 1)
      : (received.get(def.key) ?? null)
    if (raw === null) return []
    const top = roundFor(def, raw * scale)
    const own = company ? [make(def.key, top)] : []
    if (share === 'total') return own
    const parts =
      share === 'additive'
        ? split(
            top,
            takers.map((t) => t.weight),
            unitOf(def),
          )
        : takers.map(() => top)
    return [...own, ...takers.map((t, i) => make(def.key, parts[i]!, t))]
  })
}

/** Who sends a unit's set: its head, or the director where the unit has none. */
const senderOf = (tree: KpiOrgTree, unitId: string): string =>
  tree.members.find((m) => m.unitId === unitId && m.head)?.actorId ?? CAST.director

export function buildSets(tree: KpiOrgTree, catalog: KpiCatalog, rng: Rng): SetBundle[] {
  const out: SetBundle[] = []
  const inForce = new Map<string, Line[]>()
  const units = [...tree.nodes].sort(
    (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name, 'vi'),
  )
  for (const unit of units) {
    for (const role of RoleId.options) {
      if (!needsSet(tree, catalog[role], role, unit.unitId)) continue
      const above = unit.parentId ? inForce.get(`${role}|${unit.parentId}`) : undefined
      const received = new Map(
        (above ?? [])
          .filter((l) => l.kind === 'unit' && l.childUnitId === unit.unitId)
          .map((l): [KpiMetricKey, number] => [l.metricKey, Number(l.value)]),
      )
      const sender = senderOf(tree, unit.unitId)
      const day = LEVEL_DAY[unit.kind]
      const set = (version: number, status: KpiAssignmentValues['status'], at: Date) => ({
        id: rng.uuid(),
        period: TIERED,
        role,
        unitId: unit.unitId,
        version,
        status,
        sentBy: status === 'draft' ? null : sender,
        sentAt: status === 'draft' ? null : at,
        createdBy: sender,
        createdAt: new Date(at.getTime() - 2 * 3.6e6),
      })
      const redo = unit.kind === 'company' && role === 'marketing'
      if (redo) {
        const v1 = linesOf(tree, catalog, role, unit.unitId, received, 0.9)
        out.push({ set: set(1, 'superseded', vnAt('2026-11-10', 10)), lines: v1 })
      }
      const lines = linesOf(tree, catalog, role, unit.unitId, received, 1)
      inForce.set(`${role}|${unit.unitId}`, lines)
      const people = receiversOf(tree, role, unit.unitId).people
      const confirmed = lines.map((l) => {
        const rank = l.personId ? people.indexOf(l.personId) : -1
        return rank >= 0 && rank % 2 === 0
          ? { ...l, confirmedAt: vnAt('2026-11-15', 9 + rank, 20) }
          : l
      })
      out.push({ set: set(redo ? 2 : 1, 'sent', vnAt(day, 10)), lines: confirmed })
      if (unit.kind === 'department' && role === 'bd') {
        const draft = linesOf(tree, catalog, role, unit.unitId, received, 0.95)
        out.push({ set: set(2, 'draft', vnAt('2026-11-16', 9)), lines: draft })
      }
    }
  }
  return out
}

const BUDGET: readonly (readonly [string, number])[] = [
  ['2026-12', 120_000_000],
  ['2027-01', 150_000_000],
]

/** One Marketing budget per unit that has someone in Marketing, for the first two tiered months. */
export function budgetRows(tree: KpiOrgTree): KpiMarketingBudgetValues[] {
  const sits = new Set(
    tree.members.filter((m) => !m.locked && m.roleIds.includes('marketing')).map((m) => m.unitId),
  )
  return [...sits].flatMap((unitId) =>
    BUDGET.map(([period, amount]) => ({
      unitId,
      period,
      amount,
      setBy: CAST.head,
      setAt: vnAt('2026-11-12', 14),
    })),
  )
}
