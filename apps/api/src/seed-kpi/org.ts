import { randomUUID } from 'node:crypto'
import { kpiMetricShare, type KpiMetricKey, type RoleId } from '@pv/contracts'
import type { KpiCatalog } from '@api/branches/sales/kpi/kpi-config.overlay'
import type {
  kpiAssignment,
  kpiAssignmentLine,
} from '@api/branches/sales/kpi/kpi-assignment.schema'
import type { kpiTeam } from '@api/branches/sales/kpi/kpi-team.schema'
import type { orgMember, orgNode } from '@api/platform/db/org.schema'
import { DIRECTOR, PEOPLE, SEED_UUID, TAG, idOf, vn, type Key } from './cast'

/** December 2026, the first tiered month (ADR 0118, 0120): a test department
 *  with two teams in the org tree, and the targets handed down it — company
 *  to department to team to person. Team B's sets stay drafts (not handed down yet),
 *  and BD 3, Marketing 3, Presales 3 and AE 2 sit in no unit.
 *
 *  Lines follow `kpiMetricShare`: an additive metric is split so each level
 *  adds up exactly to what it received, a copied one repeats the level, a room
 *  one is a company `total` only. Unit ids are fixed under `SEED_UUID`. */

export const TIERED = '2026-12'
const M = 1_000_000
const unit = (n: number) => `${SEED_UUID}0000-4000-8000-${String(n).padStart(12, '0')}`

export const SEED_COMPANY = unit(1)
const DEPT = unit(2)
const TEAM_A = unit(3)
const TEAM_B = unit(4)

type Node = { id: string; kind: 'department' | 'team'; name: string; head: Key; members: Key[] }

const NODES: Node[] = [
  { id: DEPT, kind: 'department', name: 'Phòng Kinh doanh', head: 'head2', members: ['sale3'] },
  {
    id: TEAM_A,
    kind: 'team',
    name: 'Nhóm A',
    head: 'sale1',
    members: ['sale2', 'bd1', 'pre1', 'mkt1'],
  },
  {
    id: TEAM_B,
    kind: 'team',
    name: 'Nhóm B',
    head: 'ae3',
    members: ['ae1', 'bd2', 'pre2', 'mkt2'],
  },
]
const parentOf = (n: Node, company: string) => (n.kind === 'department' ? company : DEPT)

/** What the company hands down in December, per role. */
const DECEMBER: Partial<Record<RoleId, Partial<Record<KpiMetricKey, number>>>> = {
  'head-of-sales': {
    'signed-value': 4000 * M,
    'win-rate': 0.5,
    'accept-lag-days': 2,
    'overdue-receivables': 200 * M,
  },
  marketing: {
    'leads-sourced': 12,
    'lead-to-opportunity-rate': 0.5,
    'sourced-signed-value': 1500 * M,
  },
  bd: { 'opportunities-opened': 10, 'first-response-hours': 8, 'opportunity-accept-rate': 0.8 },
  presales: { 'demos-joined': 8 },
  sale: {
    'signed-value': 1800 * M,
    'win-rate': 0.5,
    'debriefs-closed': 12,
    'overdue-receivables': 100 * M,
  },
  'account-executive': {
    'opportunities-opened': 6,
    'debriefs-closed': 8,
    'win-rate': 0.5,
    'signed-value': 1000 * M,
    'overdue-receivables': 60 * M,
  },
}
const CONFIRMED: readonly Key[] = ['mkt1', 'bd1', 'sale1', 'sale3']

export type OrgRows = {
  nodes: (typeof orgNode.$inferInsert)[]
  members: (typeof orgMember.$inferInsert)[]
  teams: (typeof kpiTeam.$inferInsert)[]
  sets: (typeof kpiAssignment.$inferInsert)[]
  lines: (typeof kpiAssignmentLine.$inferInsert)[]
}

/** What already stands: `company` is the version's root (real or seeded),
 *  `slots` the `role|unit` pairs that already hold a December set. */
export type OrgSeen = {
  company: string
  nodes: ReadonlySet<string>
  placed: ReadonlySet<string>
  teams: ReadonlySet<string>
  slots: ReadonlySet<string>
}

export function orgRows(catalog: KpiCatalog, seen: OrgSeen): OrgRows {
  const out: OrgRows = { nodes: [], members: [], teams: [], sets: [], lines: [] }
  for (const n of NODES) {
    const name = `${TAG}${n.name}`
    if (!seen.nodes.has(n.id)) {
      const parentId = parentOf(n, seen.company)
      out.nodes.push({ fromPeriod: TIERED, unitId: n.id, kind: n.kind, name, parentId })
    }
    if (n.kind === 'team' && !seen.teams.has(n.id)) {
      out.teams.push({ id: n.id, name, createdBy: idOf(n.head) })
    }
    for (const key of membersOf(n.id).filter((k) => !seen.placed.has(idOf(k)))) {
      out.members.push({
        fromPeriod: TIERED,
        actorId: idOf(key),
        unitId: n.id,
        head: key === n.head,
      })
    }
  }
  const tree = new Tree(seen.company)
  for (const [role, totals] of Object.entries(DECEMBER) as [RoleId, Record<string, number>][]) {
    const level = new Map(
      catalog[role].flatMap((d): [KpiMetricKey, number][] =>
        totals[d.key] === undefined ? [] : [[d.key, totals[d.key]!]],
      ),
    )
    handDown(out, catalog[role], role, seen, tree, { unitId: seen.company, level })
  }
  return out
}

const membersOf = (unitId: string): Key[] => {
  const n = NODES.find((x) => x.id === unitId)
  return n ? [n.head, ...n.members] : []
}
const holds = (key: Key, role: RoleId): boolean =>
  PEOPLE.find((p) => p.key === key)!.roleIds.includes(role)

/** The seeded part of the tree under whichever company it hangs from. */
class Tree {
  constructor(readonly company: string) {}
  children(unitId: string): string[] {
    return NODES.filter((n) => parentOf(n, this.company) === unitId).map((n) => n.id)
  }
  holders(role: RoleId, unitId: string): Key[] {
    const under = [unitId, ...this.children(unitId).flatMap((c) => [c, ...this.children(c)])]
    return under.flatMap(membersOf).filter((k) => holds(k, role))
  }
}

type Level = { unitId: string; level: Map<KpiMetricKey, number> }
type Receiver = { unit: string; person?: undefined } | { person: Key; unit?: undefined }

/** One set for `role` at `at.unitId` (ADR 0120 §2–§4), then the sets of the
 *  units it handed to. A slot that already holds a set is left alone. */
function handDown(
  out: OrgRows,
  roleDefs: KpiCatalog[RoleId],
  role: RoleId,
  seen: OrgSeen,
  tree: Tree,
  at: Level,
): void {
  const company = at.unitId === tree.company
  const defs = roleDefs.filter((d) => at.level.has(d.key))
  const needs = defs.length > 0 && (company || defs.some((d) => kpiMetricShare(d) !== 'total'))
  if (!needs || tree.holders(role, at.unitId).length === 0) return
  const units = tree.children(at.unitId).filter((u) => tree.holders(role, u).length > 0)
  const to: Receiver[] = [
    ...units.map((unit) => ({ unit })),
    ...membersOf(at.unitId)
      .filter((k) => holds(k, role))
      .map((person) => ({ person })),
  ]
  const weight = (r: Receiver) => (r.unit ? tree.holders(role, r.unit).length : 1)
  const sum = to.reduce((n, r) => n + weight(r), 0)
  const passed = new Map(units.map((u) => [u, new Map<KpiMetricKey, number>()]))
  const draft = at.unitId === TEAM_B
  const id = randomUUID()
  const head = NODES.find((n) => n.id === at.unitId)?.head ?? 'head2'
  const stamp = vn(`2026-11-03 ${company ? '09:00' : at.unitId === DEPT ? '11:00' : '14:00'}`)

  for (const d of defs) {
    const value = at.level.get(d.key)!
    const share = kpiMetricShare(d)
    if (company)
      out.lines.push({ assignmentId: id, metricKey: d.key, kind: 'total', value: String(value) })
    if (share === 'total') continue
    let left = value
    to.forEach((r, n) => {
      const split = n === to.length - 1 ? left : Math.floor((value * weight(r)) / sum)
      const part = share === 'copied' ? value : split
      if (share !== 'copied') left -= part
      if (r.unit) passed.get(r.unit)!.set(d.key, part)
      const confirmed = !draft && r.person && CONFIRMED.includes(r.person)
      out.lines.push({
        assignmentId: id,
        metricKey: d.key,
        kind: r.unit ? 'unit' : 'person',
        childUnitId: r.unit ?? null,
        personId: r.person ? idOf(r.person) : null,
        value: String(part),
        confirmedAt: confirmed ? vn('2026-11-03 15:00') : null,
      })
    })
  }
  if (!seen.slots.has(`${role}|${at.unitId}`)) {
    out.sets.push({
      id,
      period: TIERED,
      role,
      unitId: at.unitId,
      version: 1,
      status: draft ? 'draft' : 'sent',
      sentBy: draft ? null : company ? DIRECTOR : idOf(head),
      sentAt: draft ? null : stamp,
      createdBy: idOf(company ? 'head2' : head),
      createdAt: new Date(stamp.getTime() - 30 * 60_000),
    })
  } else {
    out.lines = out.lines.filter((l) => l.assignmentId !== id)
  }
  for (const u of units)
    handDown(out, roleDefs, role, seen, tree, { unitId: u, level: passed.get(u)! })
}
