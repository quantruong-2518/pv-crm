import {
  isKpiV2Period,
  type KpiGrade,
  type KpiMetricKey,
  type KpiMonthScore,
  type KpiScoreLine,
} from '@pv/contracts'

/** Month total score (ADR 0158 §3) — pure: no clock, no database, no Nest.
 *
 *  Whether a metric is lower-is-better is `KpiMetricDef.higherIsBetter`, read by
 *  the caller; this file only follows the flag it is handed. */

/** An over-achiever cannot buy back a missed metric beyond this share. */
export const SCORE_CAP = 120

export type ScoreInput = {
  key: KpiMetricKey
  actual: number | null
  target: number | null
  lowerIsBetter: boolean
  primary: boolean
  /** Whole percent from the month's set; read only for a v2 month (ADR 0160 §6). */
  weight?: number
}

/** Owner's 15/11 rule for v1 months: the primary metric weighs half. */
const PRIMARY_WEIGHT = 0.5

export type ScoreSettings = {
  gradeA: number
  gradeB: number
  gradeC: number
}

/** `null` = the line cannot be judged: no target, no data, or a zero target on
 *  a higher-is-better metric (nothing to divide by). */
function percentOf(l: ScoreInput): number | null {
  if (l.target === null || l.actual === null) return null
  const raw = l.lowerIsBetter
    ? l.actual === 0
      ? SCORE_CAP
      : (l.target / l.actual) * 100
    : l.target === 0
      ? null
      : (l.actual / l.target) * 100
  return raw === null ? null : Math.max(0, Math.min(SCORE_CAP, raw))
}

export function gradeOf(score: number, s: ScoreSettings): KpiGrade {
  if (score >= s.gradeA) return 'A'
  if (score >= s.gradeB) return 'B'
  return score >= s.gradeC ? 'C' : 'D'
}

/** `null` when no line can be judged. Lines left out stay listed with weight 0,
 *  so the card can still print their figures. */
export function monthScoreOf(
  period: string,
  inputs: readonly ScoreInput[],
  settings: ScoreSettings,
): KpiMonthScore | null {
  const judged = inputs.map((l) => ({ l, percent: percentOf(l) }))
  const kept = judged.filter((j) => j.percent !== null)
  const primary = inputs.find((l) => l.primary)
  if (kept.length === 0 || !primary) return null

  const primaryKept = kept.some((j) => j.l.primary)
  const others = kept.length - (primaryKept ? 1 : 0)
  /* A v2 month re-shares its own weights in proportion over the kept lines. */
  const v2 = isKpiV2Period(period)
  const keptWeight = kept.reduce((sum, j) => sum + (j.l.weight ?? 0), 0)
  if (v2 && keptWeight === 0) return null
  /* Re-share: weights always sum to 1 over what was kept. */
  const weightOf = (l: ScoreInput): number => {
    if (v2) return (l.weight ?? 0) / keptWeight
    if (!primaryKept) return 1 / kept.length
    if (others === 0) return 1
    return l.primary ? PRIMARY_WEIGHT : (1 - PRIMARY_WEIGHT) / others
  }

  const lines = judged.map(({ l, percent }): KpiScoreLine => ({
    key: l.key,
    actual: l.actual,
    target: l.target,
    percent,
    weight: percent === null ? 0 : weightOf(l),
    lowerIsBetter: l.lowerIsBetter,
  }))
  const total = lines.reduce((sum, x) => sum + (x.percent ?? 0) * x.weight, 0)
  const score = Math.round(total * 10) / 10
  return { period, score, grade: gradeOf(score, settings), primary: primary.key, lines }
}
