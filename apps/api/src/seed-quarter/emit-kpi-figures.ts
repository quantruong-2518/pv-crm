import { kpiSums, type KpiMetricDef, type KpiMetricKey, type RoleId } from '@pv/contracts'

/** KPI figures of the demo quarter: one table, so no emitter invents a number.
 *
 *  Sized against the book (about 800 leads, 250 deals, 80 contracts, contract
 *  values 0.18-5.2 billion VND, so roughly 30 billion VND signed a month). Each figure is for ONE
 *  holder of the role; `figure` turns it into what the target row stores: an
 *  additive own metric becomes the POOL the role's package splits (ADR 0098),
 *  a room metric stays whole, a ratio / hours / days figure stays per person.
 *  Months ramp up because the quarter starts cold. */

const M = 1_000_000

/** Per holder (room metrics: the whole company), at the October level. */
export const BASE: Record<RoleId, Partial<Record<KpiMetricKey, number>>> = {
  // 80 contracts in 3.5 months at about 1.5 billion VND: 30 billion a month
  director: {
    'signed-value': 30_000 * M,
    'collected-value': 20_000 * M,
    'approval-turnaround-hours': 12,
    'overdue-receivables': 4_000 * M,
  },
  'head-of-sales': {
    'signed-value': 30_000 * M,
    'win-rate': 0.45, // 80 won of about 175 closed
    'accept-lag-days': 1.5,
    'overdue-receivables': 4_000 * M,
  },
  // 800 leads, about a third from marketing seats, shared by four
  marketing: {
    'leads-sourced': 50,
    'lead-to-opportunity-rate': 0.3, // 250 deals from 800 leads
    'sourced-signed-value': 4_000 * M,
  },
  // 250 deals, 70% opened by BD, four BD seats
  bd: { 'opportunities-opened': 12, 'first-response-hours': 8, 'opportunity-accept-rate': 0.85 },
  // 75 demos over 3.5 months, one presales seat
  presales: { 'demos-joined': 18 },
  sale: {
    'signed-value': 6_500 * M,
    'win-rate': 0.45,
    'debriefs-closed': 10,
    'overdue-receivables': 400 * M,
  },
  'account-executive': {
    'opportunities-opened': 6,
    'debriefs-closed': 6,
    'win-rate': 0.5,
    'signed-value': 4_000 * M,
    'overdue-receivables': 300 * M,
  },
}

/** Quota ramp by month: the quarter opens at 70%, December asks the most. */
const RAMP: Record<string, number> = {
  '2026-08': 0.7,
  '2026-09': 0.85,
  '2026-10': 1,
  '2026-11': 1.1,
  '2026-12': 1.2,
}

/** A person as the KPI emitters need them: id and the roles they hold now. */
export type Person = { id: string; roleIds: readonly string[] }

export const holdersOf = (people: readonly Person[], role: RoleId): string[] =>
  people.filter((p) => p.roleIds.includes(role)).map((p) => p.id)

/** Some people carry more than their share; the packages split pools by it. */
export const WEIGHT: Record<string, number> = {
  'u-sale1': 1.25,
  'u-test1': 0.9,
  'u-test2': 0.8,
  'u-nari': 1.1,
  'u-vita': 1.15,
  'u-vivian': 0.9,
}
export const weightOf = (actorId: string): number => WEIGHT[actorId] ?? 1

/** Whether a metric is a tally the ramp scales: count or money, higher better. */
const ramps = (def: KpiMetricDef): boolean =>
  def.higherIsBetter && (def.unit === 'count' || def.unit === 'money')

/** Round to what the screen shows: whole counts, whole millions of VND. */
export const roundFor = (def: KpiMetricDef, value: number): number => {
  if (def.unit === 'count') return Math.max(1, Math.round(value))
  if (def.unit === 'money') return Math.round(value / M) * M
  return Math.round(value * 100) / 100
}

/** The stored target of one role metric, or null when the table has no figure. */
export function figure(
  role: RoleId,
  def: KpiMetricDef,
  period: string,
  holders: number,
): number | null {
  const base = BASE[role][def.key]
  if (base === undefined) return null
  const ramp = ramps(def) ? (RAMP[period] ?? 1) : 1
  const people = kpiSums(def) ? Math.max(1, holders) : 1
  return roundFor(def, base * ramp * people)
}

/** `total` split by `weights`, in whole `unit`s, the last one taking the rest so the sum is exact. */
export function split(total: number, weights: readonly number[], unit: number): number[] {
  const sum = weights.reduce((n, w) => n + w, 0)
  let left = total
  return weights.map((w, i) => {
    const part = i === weights.length - 1 ? left : Math.round((total * w) / sum / unit) * unit
    left -= part
    return part
  })
}

/** Grain of a metric's whole numbers: money by million, counts by one. */
export const unitOf = (def: KpiMetricDef): number => (def.unit === 'money' ? M : 1)
