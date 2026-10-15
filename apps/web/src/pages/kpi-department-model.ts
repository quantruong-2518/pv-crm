import type {
  KpiCounter,
  KpiForecastResponse,
  KpiPerson,
  KpiScorecard,
  KpiVerdict,
  RoleId,
} from '@pv/contracts'
import { acknowledgementOf, needsAcknowledgement } from './kpi-model'

/** The department screen's cut of the room: the director's role is left out
 *  (the head of sales coaches the people under them, not the room's owner),
 *  and people are ordered by how much they need a manager. No render, no fetch.
 *
 *  Attention is counted from the server's verdicts and acknowledgement flags
 *  only: missed readings first, then behind, then a target not yet received.
 *  Ties keep the order the server sent. */

const DIRECTOR: RoleId = 'director'

type Weight = readonly [missed: number, behind: number, unreceived: number]

export function weightOf(cards: readonly KpiScorecard[]): Weight {
  const verdicts = cards.flatMap((c) => c.readings.map((r) => r.verdict))
  const count = (v: KpiVerdict) => verdicts.filter((x) => x === v).length
  const unreceived = cards.filter((c) => needsAcknowledgement(acknowledgementOf(c))).length
  return [count('missed'), count('behind'), unreceived]
}

export const heavierFirst = (a: Weight, b: Weight) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]

/** Every person without their director card, dropped if nothing is left, heaviest first. */
export function roomPeople(people: readonly KpiPerson[]): KpiPerson[] {
  return people
    .map((p) => ({ ...p, scorecards: p.scorecards.filter((c) => c.role !== DIRECTOR) }))
    .filter((p) => p.scorecards.length > 0)
    .sort((a, b) => heavierFirst(weightOf(a.scorecards), weightOf(b.scorecards)))
}

export const roomForecast = (data: KpiForecastResponse): KpiForecastResponse => ({
  ...data,
  items: data.items.filter((i) => i.role !== DIRECTOR),
})

export const openCounters = (counters: readonly KpiCounter[]) =>
  counters.filter((c) => c.status === 'open' && c.role !== DIRECTOR).length
