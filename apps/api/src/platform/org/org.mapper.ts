import type { OrgUnit, OrgUnitKind } from '@pv/contracts'
import type { OrgSeedEntry } from './org-hook'
import type { OrgFace, OrgSeed } from './org.repository'

/** The company every first version gets — 0140's and a later seed's alike.
 *  Fixed, so the preview a reader is shown names the id the first write keeps. */
export const SEED_COMPANY_ID = '00000000-0000-4000-8000-000000000001'

/** Tree rows → the wire, and the KPI roster → a first version. Pure, so the
 *  read cut and the seed are judged without a database. */

const KIND_ORDER: Record<OrgUnitKind, number> = { company: 0, department: 1, team: 2 }

/** Company, departments, teams, each by name; members head first, then by name. */
export function unitsOf(
  nodes: OrgSeed['nodes'],
  members: OrgSeed['members'],
  people: readonly OrgFace[],
): OrgUnit[] {
  const name = new Map(people.map((p) => [p.id, p.name]))
  type Member = OrgSeed['members'][number]
  const byName = (a: Member, b: Member) =>
    Number(b.head) - Number(a.head) ||
    (name.get(a.actorId) ?? a.actorId).localeCompare(name.get(b.actorId) ?? b.actorId, 'vi')
  return [...nodes]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'vi'))
    .map((n) => {
      const own = members.filter((m) => m.unitId === n.unitId).sort(byName)
      return {
        id: n.unitId,
        kind: n.kind,
        name: n.name,
        parentId: n.parentId,
        headId: own.find((m) => m.head)?.actorId ?? null,
        memberIds: own.map((m) => m.actorId),
      }
    })
}

/** ADR 0101's cut for a reader without `kpi.view-all`: their unit with its
 *  people, the units above it bare; someone placed nowhere sees the company only. */
export function ownPath(units: readonly OrgUnit[], actorId: string): OrgUnit[] {
  const byId = new Map(units.map((u) => [u.id, u]))
  const mine = units.find((u) => u.memberIds.includes(actorId))
  const path = new Set<string>()
  for (let u = mine; u; u = u.parentId ? byId.get(u.parentId) : undefined) path.add(u.id)
  return units
    .filter((u) => (mine ? path.has(u.id) : u.kind === 'company'))
    .map((u) => (u.id === mine?.id ? u : { ...u, headId: null, memberIds: [] }))
}

/** The first version as migration 0140 builds it: one company, every roster
 *  team under it with the same id, its members, the lead as head. */
export function seedOf(entries: readonly OrgSeedEntry[], companyName: string): OrgSeed {
  const company = SEED_COMPANY_ID
  const teams = new Map(entries.map((e) => [e.teamId, e.teamName]))
  return {
    nodes: [
      { unitId: company, kind: 'company', name: companyName, parentId: null },
      ...[...teams].map(([unitId, name]) => ({
        unitId,
        kind: 'team' as const,
        name,
        parentId: company,
      })),
    ],
    members: entries.map((e) => ({ actorId: e.actorId, unitId: e.teamId, head: e.lead })),
  }
}
