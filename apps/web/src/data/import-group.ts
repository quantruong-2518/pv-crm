import { foldText } from '@pv/contracts'
import type { BuiltRow } from '@/data/intake'

/** The group-by-company decision, as data — pure, no React.
 *
 *  A plan only records what the person CHANGED: a company with no entry is
 *  `apart`, which is the panel's behaviour before this step existed. So an
 *  untouched plan sends exactly the rows `buildRows` produced. */

export type GroupMode = 'apart' | 'together' | 'split'

export type GroupPlan = {
  companies: Record<string, { mode: GroupMode; letters: Record<number, number> }>
  /** File lines picked as a main contact. A group with none of its lines here
   *  falls back to its first row — the server's own default. */
  mains: readonly number[]
}

export const EMPTY_PLAN: GroupPlan = { companies: {}, mains: [] }

/** One company the file names on two or more valid rows, rows in file order. */
export type CompanyCluster = { key: string; name: string; rows: BuiltRow[] }

/** Clustered by `foldText`, the fold the server uses, so the step never offers
 *  a group the server would refuse as "not one company". */
export function clustersOf(rows: readonly BuiltRow[], field: string): CompanyCluster[] {
  const byKey = new Map<string, CompanyCluster>()
  for (const row of rows) {
    const name = row.values[field] ?? ''
    const key = foldText(name)
    if (key === '') continue
    const hit = byKey.get(key)
    if (hit) hit.rows.push(row)
    else byKey.set(key, { key, name, rows: [row] })
  }
  return [...byKey.values()].filter((c) => c.rows.length > 1)
}

export const modeOf = (plan: GroupPlan, cluster: CompanyCluster): GroupMode =>
  plan.companies[cluster.key]?.mode ?? 'apart'

export const letterOf = (plan: GroupPlan, cluster: CompanyCluster, line: number): number =>
  plan.companies[cluster.key]?.letters[line] ?? 0

export type GroupMark = { group: string; primary: boolean }

/** Every row of one company that sits in a group of TWO OR MORE, by file line.
 *  A letter held by one person yields no mark: that row is an ordinary lead.
 *
 *  The id is the group's first file line. A line belongs to one group, so the
 *  id is unique across the file with no truncation to collide on. */
export function groupMarks(cluster: CompanyCluster, plan: GroupPlan): Map<number, GroupMark> {
  const marks = new Map<number, GroupMark>()
  const mode = modeOf(plan, cluster)
  if (mode === 'apart') return marks

  const byLetter = new Map<number, BuiltRow[]>()
  for (const row of cluster.rows) {
    const letter = mode === 'together' ? 0 : letterOf(plan, cluster, row.line)
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), row])
  }

  for (const rows of byLetter.values()) {
    const first = rows[0]
    if (!first || rows.length < 2) continue
    const main = rows.find((r) => plan.mains.includes(r.line)) ?? first
    for (const row of rows) {
      marks.set(row.line, { group: `L${first.line}`, primary: row === main })
    }
  }
  return marks
}

/** Make `line` the main contact of whatever group it currently sits in. */
export function withMain(plan: GroupPlan, cluster: CompanyCluster, line: number): GroupPlan {
  const marks = groupMarks(cluster, plan)
  const group = marks.get(line)?.group
  const peers = new Set(
    cluster.rows.filter((r) => marks.get(r.line)?.group === group).map((r) => r.line),
  )
  return { ...plan, mains: [...plan.mains.filter((l) => !peers.has(l)), line] }
}

/** The rows as they go to `onCommit`: grouped rows carry `group`, each group's
 *  main row also `primary`; every other row is returned untouched. */
export function applyPlan(
  rows: readonly BuiltRow[],
  clusters: readonly CompanyCluster[],
  plan: GroupPlan,
): BuiltRow[] {
  const marks = new Map(clusters.flatMap((c) => [...groupMarks(c, plan)]))
  return rows.map((row) => {
    const mark = marks.get(row.line)
    if (!mark) return row
    return { ...row, group: mark.group, ...(mark.primary ? { primary: true } : {}) }
  })
}
