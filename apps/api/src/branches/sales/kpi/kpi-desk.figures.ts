import type {
  KpiDeskPrimary,
  KpiMetricDef,
  KpiPerson,
  KpiReading,
  KpiMetricKey,
  RoleId,
} from '@pv/contracts'
import { additive } from './kpi-allocation.mapper'
import type { KpiCatalog } from './kpi-config.overlay'
import { coverageOf } from './kpi-plan.service'
import { holdsSigned } from './kpi-rules'
import { verdictOf } from './kpi-verdict'

/** The desk's pure arithmetic (ADR 0159 §4, §5): one person's face off their
 *  scorecards, and a unit's total over many faces. Reads nothing, so the unit
 *  tab and the company tab cannot count the same unit two ways.
 *
 *  A unit total is over EVERY person in the unit, caller included: the figure
 *  a head sees must be the one the company table shows for the same unit. */

export type Face = {
  actorId: string
  name: string
  role: RoleId
  def: KpiMetricDef | null
  reading: KpiReading | null
  /** The person's own `signed-value` reading, whichever role carries it. */
  signed: { reading: KpiReading; def: KpiMetricDef } | null
}

/** The role shown is the first with an agreed target on its primary metric, else the first. */
export function faceOf(person: KpiPerson, catalog: KpiCatalog): Face | null {
  const cards = person.scorecards.map((card) => {
    const def = catalog[card.role].find((d) => d.primary) ?? null
    return { card, def, reading: card.readings.find((r) => r.key === def?.key) ?? null }
  })
  const shown =
    cards.find((c) => c.reading?.target !== null && c.reading?.target !== undefined) ?? cards[0]
  if (!shown) return null
  const holding = cards.flatMap(({ card }) => {
    const def = catalog[card.role].find(holdsSigned)
    const reading = card.readings.find((r) => r.key === def?.key)
    return def && reading ? [{ reading, def }] : []
  })
  return {
    actorId: person.actorId,
    name: person.name,
    role: shown.card.role,
    def: shown.def,
    reading: shown.reading,
    signed: holding[0] ?? null,
  }
}

export const primaryOf = (reading: KpiReading | null): KpiDeskPrimary | null =>
  reading && {
    key: reading.key,
    value: reading.value,
    target: reading.target,
    verdict: reading.verdict,
  }

const sumOf = (xs: readonly (number | null)[]): number | null =>
  xs.some((x) => x !== null) ? xs.reduce<number>((n, x) => n + (x ?? 0), 0) : null

/** A unit target is unset unless every counted person has one, as the quarter's is: a partial
 *  sum would pass for the unit's goal and flatter its verdict. */
const targetOf = (xs: readonly (number | null)[]): number | null =>
  xs.every((x) => x !== null) ? sumOf(xs) : null

/** Signed-value summed when anyone holds it; else the primary key most people share,
 *  summed only where the metric adds up (a ratio has no sum). Ties go to the first key met. */
export function unitPrimary(
  faces: readonly Face[],
  elapsed: number,
  tolerance: number,
): KpiDeskPrimary | null {
  const holders = faces.filter((f) => f.signed)
  const first = holders[0]?.signed
  if (first) {
    const value = sumOf(holders.map((f) => f.signed!.reading.value))
    const target = targetOf(holders.map((f) => f.signed!.reading.target))
    return {
      key: first.def.key,
      value,
      target,
      verdict: verdictOf(value, target, first.def, elapsed, tolerance),
    }
  }
  const tally = new Map<KpiMetricKey, number>()
  for (const f of faces)
    if (f.reading) tally.set(f.reading.key, (tally.get(f.reading.key) ?? 0) + 1)
  const key = [...tally.entries()].reduce<[KpiMetricKey, number] | null>(
    (best, e) => (best === null || e[1] > best[1] ? e : best),
    null,
  )?.[0]
  const def = faces.find((f) => f.reading?.key === key)?.def
  if (!key || !def) return null
  if (!additive(def)) return { key, value: null, target: null, verdict: 'no-data' }
  const sharing = faces.filter((f) => f.reading?.key === key)
  const value = sumOf(sharing.map((f) => f.reading!.value))
  const target = targetOf(sharing.map((f) => f.reading!.target))
  return { key, value, target, verdict: verdictOf(value, target, def, elapsed, tolerance) }
}

/** Pipeline over what is still missing, summed over the signed-value holders among `faces`.
 *  Nothing is left to cover once the month `over`, so both fields are `null`. The ratio is `null` unless the reader sees every holder's pipeline (ADR 0143); the low flag
 *  is computed from the real pipeline either way, `null` only when nobody holds it. */
export function coverageOver(
  faces: readonly Face[],
  pipeline: ReadonlyMap<string, number>,
  sees: (actorId: string) => boolean,
  over = false,
): { coverage: number | null; coverageLow: boolean | null } {
  const holders = faces.filter((f) => f.signed)
  if (over || holders.length === 0) return { coverage: null, coverageLow: null }
  const real = holders.reduce((s, f) => s + (pipeline.get(f.actorId) ?? 0), 0)
  const missing = holders.reduce((s, f) => {
    const { value, target } = f.signed!.reading
    return s + Math.max(0, (target ?? 0) - (value ?? 0))
  }, 0)
  const { ratio, low } = coverageOf(
    real,
    missing,
    holders.every((f) => sees(f.actorId)),
  )
  return { coverage: ratio, coverageLow: low }
}
