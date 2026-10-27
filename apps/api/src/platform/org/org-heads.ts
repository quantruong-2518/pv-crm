import type { OrgMemberRowDb, OrgNodeRowDb } from '../db/org.schema'

/** Walks over ONE version of the org tree (ADR 0118, 0120 §7). Pure: the caller
 *  reads the version, so a door that read it under a lock judges that one.
 *  Who may act on a seat is not decided here, only who sits where. */

export type OrgTreeRows = {
  nodes: readonly Pick<OrgNodeRowDb, 'unitId' | 'kind' | 'name' | 'parentId'>[]
  members: readonly Pick<OrgMemberRowDb, 'actorId' | 'unitId' | 'head'>[]
}

export const headOf = (tree: OrgTreeRows, unitId: string): string | null =>
  tree.members.find((m) => m.unitId === unitId && m.head)?.actorId ?? null

/** The units above `unitId`, nearest first. The kind ladder caps the depth; the
 *  bound only keeps a hand-made cycle from spinning forever. */
export function unitsAbove(tree: OrgTreeRows, unitId: string): string[] {
  const parent = new Map(tree.nodes.map((n) => [n.unitId, n.parentId]))
  const out: string[] = []
  for (let p = parent.get(unitId) ?? null; p && out.length < tree.nodes.length;) {
    out.push(p)
    p = parent.get(p) ?? null
  }
  return out
}

/** The heads of the units above, nearest first; a headless level is skipped. */
export const headsOver = (tree: OrgTreeRows, unitId: string): string[] =>
  unitsAbove(tree, unitId).flatMap((u) => {
    const head = headOf(tree, u)
    return head ? [head] : []
  })

/** `unitId` and every unit below it. */
export function subtreeOf(tree: OrgTreeRows, unitId: string): Set<string> {
  const out = new Set([unitId])
  for (let grew = true; grew;) {
    grew = false
    for (const n of tree.nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.unitId)) {
        out.add(n.unitId)
        grew = true
      }
    }
  }
  return out
}

/** Everyone placed in `unitId` or below it. */
export const membersUnder = (tree: OrgTreeRows, unitId: string): string[] => {
  const units = subtreeOf(tree, unitId)
  return tree.members.filter((m) => units.has(m.unitId)).map((m) => m.actorId)
}
