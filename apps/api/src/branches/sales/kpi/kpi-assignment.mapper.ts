import {
  kpiAssignmentDeadline,
  kpiAssignmentNeedsSet,
  kpiAssignmentSum,
  kpiMetricShare,
  type KpiAssignmentLine,
  type KpiAssignmentLineKind,
  type KpiAssignmentPersonState,
  type KpiAssignmentSet,
  type KpiAssignmentSum,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiMetricShare,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { subtreeOf } from '@api/platform/org/org-heads'
import { defOf } from './kpi-allocation.mapper'
import type { KpiSetLineRow, KpiSetRow } from './kpi-assignment.repository'
import type { KpiOrgMember, KpiOrgTree } from './kpi-team.repository'

/** Tiered sets → rules and wire (ADR 0120). Reads nothing.
 *
 *  How a metric travels is `kpiMetricShare`'s: an additive line is typed by the
 *  head, a copied one repeats this unit's level (the company's own total, else
 *  what it received), a room one is a company `total` and stops there. A slot
 *  holds at most one `sent` row (in force, what people hold) and one `draft`
 *  over it; sending the draft supersedes the sent one in the same transaction. */

export type Line = {
  metricKey: KpiMetricKey
  kind: KpiAssignmentLineKind
  childUnitId: string | null
  personId: string | null
  value: number
  confirmedAt: Date | null
}

/** One month's sets and lines with the tree that month reads. */
export type Book = {
  period: KpiPeriodKey
  tree: KpiOrgTree
  sets: KpiSetRow[]
  lines: KpiSetLineRow[]
}

export type Receivers = { units: string[]; people: string[] }

/** Last month's figure of one person, and of the company level (ADR 0120 §6). */
export type Previous = {
  person(actorId: string, key: KpiMetricKey): number
  level(key: KpiMetricKey): number
}

const KIND_ORDER: Record<KpiAssignmentLineKind, number> = { total: 0, unit: 1, person: 2 }

export const shareOf = (role: RoleId, key: KpiMetricKey): KpiMetricShare => {
  const def = defOf(role, key)
  return def ? kpiMetricShare(def) : 'copied'
}

export const toLine = (r: KpiSetLineRow): Line => ({
  metricKey: r.metricKey,
  kind: r.kind,
  childUnitId: r.childUnitId,
  personId: r.personId,
  value: Number(r.value),
  confirmedAt: r.confirmedAt,
})

export const linesOf = (book: Book, setId: string): Line[] =>
  book.lines.filter((l) => l.assignmentId === setId).map(toLine)

const slotRow =
  (status: KpiSetRow['status']) => (sets: readonly KpiSetRow[], role: RoleId, unitId: string) =>
    sets.find((s) => s.role === role && s.unitId === unitId && s.status === status) ?? null

/** The set in force: the slot's one `sent` row. */
export const inForceOf = slotRow('sent')
/** The slot's one unsent draft, over the set in force or before any. */
export const draftOf = slotRow('draft')

export const nodeOf = (tree: KpiOrgTree, unitId: string) =>
  tree.nodes.find((n) => n.unitId === unitId) ?? null

export const isCompany = (tree: KpiOrgTree, unitId: string): boolean =>
  nodeOf(tree, unitId)?.kind === 'company'

/** ADR 0120 §6 and 0114's flag: a person line unanswered past the 28th is
 *  accepted by default, never confirmed. The one copy of that rule. */
export const defaulted = (l: Pick<Line, 'confirmedAt'>, today: string, due: string): boolean =>
  !l.confirmedAt && today > due

/** Depth-first from the company, siblings by name: the order the tree screen reads. */
export function treeOrder(tree: KpiOrgTree): { unitId: string; depth: number }[] {
  const out: { unitId: string; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    const kids = tree.nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    for (const n of kids) {
      out.push({ unitId: n.unitId, depth })
      walk(n.unitId, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** People with person lines on a set, and how many have answered every one. */
export function confirmedIn(lines: readonly Line[]): { confirmed: number; total: number } {
  const byPerson = new Map<string, boolean>()
  for (const l of lines) {
    if (l.kind !== 'person' || !l.personId) continue
    byPerson.set(l.personId, (byPerson.get(l.personId) ?? true) && l.confirmedAt !== null)
  }
  const all = [...byPerson.values()]
  return { confirmed: all.filter(Boolean).length, total: all.length }
}

/** Locked people hold no line: they could never confirm it. */
const holds = (m: KpiOrgMember, role: RoleId) => !m.locked && m.roleIds.includes(role)

export function holdersUnder(tree: KpiOrgTree, role: RoleId, unitId: string): string[] {
  const units = subtreeOf(tree, unitId)
  return tree.members.filter((m) => units.has(m.unitId) && holds(m, role)).map((m) => m.actorId)
}

/** ADR 0120 §2: each child unit whose subtree holds the role, each direct member holding it. */
export function receiversOf(tree: KpiOrgTree, role: RoleId, unitId: string): Receivers {
  return {
    units: tree.nodes
      .filter((n) => n.parentId === unitId && holdersUnder(tree, role, n.unitId).length > 0)
      .map((n) => n.unitId),
    people: tree.members.filter((m) => m.unitId === unitId && holds(m, role)).map((m) => m.actorId),
  }
}

/** Below the company a role of room metrics only has nothing to hand down. */
export function needsSet(
  tree: KpiOrgTree,
  defs: readonly KpiMetricDef[],
  role: RoleId,
  unitId: string,
): boolean {
  const holders = holdersUnder(tree, role, unitId).length > 0
  return kpiAssignmentNeedsSet(defs, isCompany(tree, unitId), holders)
}

/** What `unitId` got from the set in force one level up, per metric. */
export function receivedOf(book: Book, role: RoleId, unitId: string): Map<KpiMetricKey, number> {
  const parent = nodeOf(book.tree, unitId)?.parentId
  const above = parent ? inForceOf(book.sets, role, parent) : null
  if (!above) return new Map()
  const mine = linesOf(book, above.id).filter((l) => l.kind === 'unit' && l.childUnitId === unitId)
  return new Map(mine.map((l) => [l.metricKey, l.value]))
}

export const totalsIn = (lines: readonly Line[]): Map<KpiMetricKey, number> =>
  new Map(lines.filter((l) => l.kind === 'total').map((l) => [l.metricKey, l.value]))

const line = (
  metricKey: KpiMetricKey,
  to: { unit?: string; person?: string },
  value: number,
): Line => ({
  metricKey,
  kind: to.unit ? 'unit' : to.person ? 'person' : 'total',
  childUnitId: to.unit ?? null,
  personId: to.person ?? null,
  value,
  confirmedAt: null,
})

const toEach = (
  key: KpiMetricKey,
  to: Receivers,
  value: (r: { unit?: string; person?: string }) => number,
) => [
  ...to.units.map((unit) => line(key, { unit }, value({ unit }))),
  ...to.people.map((person) => line(key, { person }, value({ person }))),
]

/** What a send writes: the typed lines plus each copied metric at this unit's level. */
export function withCopied(
  defs: readonly KpiMetricDef[],
  company: boolean,
  received: ReadonlyMap<KpiMetricKey, number>,
  typed: readonly Line[],
  to: Receivers,
): Line[] {
  const level = company ? totalsIn(typed) : received
  const copied = defs
    .filter((d) => kpiMetricShare(d) === 'copied' && level.has(d.key))
    .flatMap((d) => toEach(d.key, to, () => level.get(d.key)!))
  return [...typed, ...copied]
}

/** ADR 0120 §6: last month's figures, summed up the tree; nothing found is 0.
 *  A copied metric the unit never received is skipped, as `withCopied` does:
 *  a 0 on a lower-is-better metric would fail everyone. */
export function defaultLines(
  defs: readonly KpiMetricDef[],
  company: boolean,
  received: ReadonlyMap<KpiMetricKey, number>,
  to: Receivers,
  under: (unitId: string) => readonly string[],
  prev: Previous,
): Line[] {
  return defs.flatMap((d): Line[] => {
    const share = kpiMetricShare(d)
    if (share === 'total') return company ? [line(d.key, {}, prev.level(d.key))] : []
    if (share === 'copied') {
      if (!company && !received.has(d.key)) return []
      const level = company ? prev.level(d.key) : received.get(d.key)!
      return [...(company ? [line(d.key, {}, level)] : []), ...toEach(d.key, to, () => level)]
    }
    const lines = toEach(d.key, to, (r) =>
      r.person
        ? prev.person(r.person, d.key)
        : under(r.unit!).reduce((n, id) => n + prev.person(id, d.key), 0),
    )
    const sum = lines.reduce((n, l) => n + l.value, 0)
    return [...(company ? [line(d.key, {}, sum)] : []), ...lines]
  })
}

/** ADR 0120 §4, additive metrics only; the company's own total is what it "received". */
export function sumsOf(
  defs: readonly KpiMetricDef[],
  received: ReadonlyMap<KpiMetricKey, number>,
  lines: readonly Line[],
): KpiAssignmentSum[] {
  return defs
    .filter((d) => kpiMetricShare(d) === 'additive')
    .map((d) => {
      const assigned = lines
        .filter((l) => l.metricKey === d.key && l.kind !== 'total')
        .reduce((n, l) => n + l.value, 0)
      return kpiAssignmentSum(d.key, received.get(d.key) ?? 0, assigned)
    })
}

/** The contract's rule, under the name the doors and the sweep already call. */
export const deadlineOf = kpiAssignmentDeadline

/** A person's answer on their lines of one set (ADR 0120 §6, 0114's flag). */
export function personState(
  mine: readonly Line[],
  today: string,
  due: string,
): KpiAssignmentPersonState {
  if (mine.length === 0) return 'not-sent'
  if (mine.every((l) => l.confirmedAt)) return 'confirmed'
  return mine.some((l) => defaulted(l, today, due)) ? 'defaulted' : 'pending'
}

export function toWireLine(
  role: RoleId,
  l: Line,
  company: boolean,
  today: string,
  due: string,
): KpiAssignmentLine {
  return {
    metricKey: l.metricKey,
    kind: l.kind,
    childUnitId: l.childUnitId,
    personId: l.personId,
    value: l.value,
    readOnly: shareOf(role, l.metricKey) !== 'additive' && !(company && l.kind === 'total'),
    confirmedAt: l.confirmedAt?.toISOString() ?? null,
    acceptedByDefault: l.kind === 'person' && defaulted(l, today, due),
  }
}

export const sortLines = (defs: readonly KpiMetricDef[], lines: readonly Line[]): Line[] => {
  const at = new Map(defs.map((d, i) => [d.key, i]))
  return [...lines].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (at.get(a.metricKey) ?? 99) - (at.get(b.metricKey) ?? 99),
  )
}

export function toWireSet(
  set: KpiSetRow,
  lines: readonly Line[],
  company: boolean,
  today: string,
): KpiAssignmentSet {
  const due = deadlineOf(set.period, 'person')
  return {
    id: set.id,
    period: set.period,
    role: set.role,
    unitId: set.unitId,
    version: set.version,
    status: set.status,
    byDefault: set.byDefault,
    sentBy: set.sentBy && set.sender ? { actorId: set.sentBy, name: set.sender } : null,
    sentAt: set.sentAt?.toISOString() ?? null,
    lines: lines.map((l) => toWireLine(set.role, l, company, today, due)),
  }
}

/** Stored values are `numeric`, a string on the way in. */
export const toValues = (lines: readonly Line[]) =>
  lines.map((l) => ({ ...l, value: String(l.value) }))
