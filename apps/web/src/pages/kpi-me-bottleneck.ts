/** The one rule for the bottleneck on every KPI board (ADR 0160 §11): the step furthest
 *  under its own target, else the step that loses the most. Pure, so the funnel
 *  of Marketing, BD and Presales and the stage rates of Sale cannot drift apart. */

export type FunnelLink = {
  rate: number | null
  target: number | null
  /** Only ranks the fallback, never printed: a count for a funnel, a share for Sale's stages. */
  lost: number
}

export type FunnelFact =
  { kind: 'neck'; at: number; gap: number } | { kind: 'drop'; at: number; allMet: boolean }

export function bottleneckOf(links: readonly FunnelLink[]): FunnelFact | null {
  let neck = -1
  let gap = 0
  links.forEach((l, i) => {
    if (l.rate === null || l.target === null || l.rate >= l.target) return
    if (l.target - l.rate > gap) {
      gap = l.target - l.rate
      neck = i
    }
  })
  if (neck >= 0) return { kind: 'neck', at: neck, gap }

  let widest = 0
  let drop = -1
  links.forEach((l, i) => {
    if (l.lost > widest) {
      widest = l.lost
      drop = i
    }
  })
  if (drop < 0) return null
  /* A targeted step with no rate yet is not "met", so one such step withholds the claim. */
  const targeted = links.filter((l) => l.target !== null)
  const allMet =
    targeted.length > 0 && targeted.every((l) => l.rate !== null && l.rate >= l.target!)
  return { kind: 'drop', at: drop, allMet }
}
