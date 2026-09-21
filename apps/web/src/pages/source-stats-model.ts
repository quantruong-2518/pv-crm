import { LEAD_SIDE_LABEL, type LeadMotion, type LeadSourceStatsResponse } from '@pv/contracts'

/** The source-stats funnel as a tree: side → motion → origin → campaign.
 *
 *  The server answers flat — one row per (motion, origin, campaign) — and only
 *  counts; every sum above a leaf is added up here, once, so the screen draws
 *  and never adds. A `null`/absent level is a real group (leads written before
 *  the two-level origin existed) and gets a name saying so, not a fold into a
 *  neighbour. */

type StatsRow = LeadSourceStatsResponse['rows'][number]

export type Funnel = { leads: number; mql: number; sql: number; deals: number; won: number }

export type StatsNode = {
  id: string
  depth: number
  label: string
  funnel: Funnel
  children: StatsNode[]
}

const ZERO: Funnel = { leads: 0, mql: 0, sql: 0, deals: 0, won: 0 }

const add = (a: Funnel, b: Funnel): Funnel => ({
  leads: a.leads + b.leads,
  mql: a.mql + b.mql,
  sql: a.sql + b.sql,
  deals: a.deals + b.deals,
  won: a.won + b.won,
})

/** Lead → signed, the one conversion the block prints. */
export const conversionOf = (f: Funnel): number => (f.leads > 0 ? f.won / f.leads : 0)

type MotionLabel = (motion: LeadMotion) => string

/** The four levels, each naming its key and its label for one flat row. */
const levelsOf = (motionLabel: MotionLabel): Level[] => [
  (r) => ({ key: r.side ?? '-', label: r.side ? LEAD_SIDE_LABEL[r.side] : 'Chưa rõ phía' }),
  (r) => ({
    key: r.motion ?? '-',
    label: r.motion ? motionLabel(r.motion) : 'Chưa ghi phương án',
  }),
  (r) => ({ key: r.originId ?? '-', label: r.originName ?? 'Chưa ghi nguồn' }),
  (r) => ({ key: r.campaignCode ?? '-', label: r.campaignName ?? 'Không thuộc chiến dịch' }),
]

type Level = (r: StatsRow) => { key: string; label: string }

function grow(
  rows: readonly StatsRow[],
  levels: readonly Level[],
  depth: number,
  prefix: string,
): StatsNode[] {
  const level = levels[depth]
  if (!level) return []
  const groups = new Map<string, { label: string; rows: StatsRow[] }>()
  for (const row of rows) {
    const { key, label } = level(row)
    const group = groups.get(key)
    if (group) group.rows.push(row)
    else groups.set(key, { label, rows: [row] })
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const id = `${prefix}/${key}`
      return {
        id,
        depth,
        label: group.label,
        funnel: group.rows.reduce<Funnel>((sum, r) => add(sum, r), ZERO),
        children: grow(group.rows, levels, depth + 1, id),
      }
    })
    .sort((a, b) => b.funnel.leads - a.funnel.leads)
}

/** `motionLabel` is the policy-aware one (`useMotionLabel`), so the tree names
 *  a motion exactly as the create form does. */
export const statsTree = (rows: readonly StatsRow[], motionLabel: MotionLabel): StatsNode[] =>
  grow(rows, levelsOf(motionLabel), 0, '')

export const totalOf = (nodes: readonly StatsNode[]): Funnel =>
  nodes.reduce<Funnel>((sum, n) => add(sum, n.funnel), ZERO)

/** Depth-first, descending only into nodes the reader opened. */
export function visibleNodes(nodes: readonly StatsNode[], open: ReadonlySet<string>): StatsNode[] {
  return nodes.flatMap((n) => [n, ...(open.has(n.id) ? visibleNodes(n.children, open) : [])])
}
