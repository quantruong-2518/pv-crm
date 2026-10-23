import {
  stepSalesPeriod,
  type OrgPerson,
  type OrgTreeResponse,
  type OrgUnit,
  type OrgUnitKind,
} from '@pv/contracts'
import type { ApiError } from '@/app/api'
import { ROLE_LABEL } from '@/data/users'

/** Pure reads of the org tree (ADR 0118) for the org section (5.18):
 *  the rows in tree order, the labels each level wears, who is placed nowhere,
 *  which units may hold which, and which server complaint belongs to which box. */

export const KIND_LABEL: Record<OrgUnitKind, string> = {
  company: 'Công ty',
  department: 'Phòng',
  team: 'Nhóm',
}

/** What the head of each level is called. Head is not a role (ADR 0118 §4), so
 *  the company's head is named by the seat, not by a job title. */
export const HEAD_LABEL: Record<OrgUnitKind, string> = {
  company: 'Người đứng đầu',
  department: 'Trưởng phòng',
  team: 'Trưởng nhóm',
}

export const noHead = (kind: OrgUnitKind) => `Chưa có ${HEAD_LABEL[kind].toLowerCase()}`

/** The selection key of the "not placed" row; never a unit id (those are uuids). */
export const UNPLACED = 'unplaced'

/** Newest first, from the month an edit lands on back to `earliest`. No
 *  version is ever later than `editableFrom`, so later months add nothing. */
export function monthOptions(earliest: string, editableFrom: string): string[] {
  const out: string[] = []
  for (let at = editableFrom; at >= earliest; at = stepSalesPeriod(at, -1)) out.push(at)
  return out
}

/** A month before the tree's first: the old KPI team roster still answers it.
 *  Not "no units": a reader without `kpi.view-all` outside the tree gets few. */
export const isBeforeTree = (tree: OrgTreeResponse) =>
  tree.fromPeriod === null && tree.period < tree.editableFrom

export type TreeRow = { unit: OrgUnit; depth: number }

/** Depth-first from the root, keeping the server's order (kind, then name) among siblings. */
export function treeRows(units: readonly OrgUnit[]): TreeRow[] {
  const ids = new Set(units.map((u) => u.id))
  const rows: TreeRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const unit of units) {
      const isChild =
        parentId === null
          ? unit.parentId === null || !ids.has(unit.parentId)
          : unit.parentId === parentId
      if (!isChild) continue
      rows.push({ unit, depth })
      walk(unit.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

export const placedIds = (units: readonly OrgUnit[]) => new Set(units.flatMap((u) => u.memberIds))

/** People who sit in no unit. Only a setter receives anyone outside the tree. */
export function unplacedOf(tree: OrgTreeResponse): OrgPerson[] {
  const placed = placedIds(tree.units)
  return tree.people.filter((p) => !placed.has(p.actorId))
}

export const rolesText = (p: OrgPerson | undefined) =>
  p ? p.roleIds.map((r) => ROLE_LABEL[r]).join(', ') : ''

/** Who may hang under whom (ADR 0118 §1): a department under the company only,
 *  a team under the company or a department. */
export function parentsFor(kind: Exclude<OrgUnitKind, 'company'>, units: readonly OrgUnit[]) {
  return units.filter((u) => u.kind === 'company' || (kind === 'team' && u.kind === 'department'))
}

export const unitOf = (tree: OrgTreeResponse, actorId: string) =>
  tree.units.find((u) => u.memberIds.includes(actorId))

/** The server's complaint about each box the dialog draws; the footer carries
 *  the error only when no box does, so one refusal is never said twice. */
export function splitError(error: ApiError | null, fields: readonly string[]) {
  const problems: Record<string, string | undefined> = {}
  for (const f of fields) problems[f] = error?.errors?.[f]?.[0]
  const onABox = fields.some((f) => problems[f] !== undefined)
  return { problems, footer: onABox ? null : error }
}
