import { addDays, dayOf, daysBetween, vnAt } from './clock'
import { Infeasible, spread, type Timer } from './expand-time'
import { derivedEnds, type ContractK } from './knobs-age'
import { CAST, CONTRACT } from './params'
import type { Rng } from './rng'
import type { Beat, Day, InstallmentEnd, Knobs } from './story.types'

/** Contract phase: due dates from the sign, an end for every installment, the
 *  termination and the temperature readings. A fixed end (a scenario) must fit
 *  its due date or the draw is refused; a derived end (the bulk) is picked
 *  from what the due date allows. */

/** Does an installment that is `late` days past due (negative = ahead) fit `end`? */
export function fits(end: InstallmentEnd, late: number): boolean {
  switch (end) {
    case 'paid':
      return late >= 1
    case 'paid-late':
      return late >= 4
    case 'overdue':
      return late >= 1 && late <= 14
    case 'long-overdue':
      return late >= 15
    case 'overdue-waiting':
      return late >= 2
    case 'overdue-approved':
    case 'overdue-rejected':
      return late >= 3
    case 'due-soon':
      return late <= -1 && late >= -7
    case 'upcoming':
      return late <= -8
  }
}

/** Lead time from the sign to the first due: the contract's 10-20 days minus the
 *  slack the sign flow can eat. */
const SIGN_TO_FIRST_DUE = [13, 19] as const

const sooner = (a: Date, b: Date): Date => (a.getTime() < b.getTime() ? a : b)
const later = (a: Date, b: Date): Date => (a.getTime() > b.getTime() ? a : b)

function dueDays(rng: Rng, first: Day, n: number, today: Day, derived: boolean): Day[] {
  const dues: Day[] = []
  let due = first
  for (let i = 0; i < n; i++) {
    if (derived && due === today) due = addDays(due, 1)
    dues.push(due)
    due = addDays(due, rng.pick(CONTRACT.gapDays))
  }
  return dues
}

/** Due dates and a sign day for a fixed list of ends. `ago` is how many days
 *  back the lead was born and `chain` the days the deal may take from there:
 *  the only first dues that qualify are those every end fits AND whose sign day
 *  leaves the deal a feasible chain, so the draw is conditioned, not retried. */
export function fixedDues(
  rng: Rng,
  ends: InstallmentEnd[],
  today: Day,
  ago: number,
  chain: [number, number],
): { dues: Day[]; sign: Day } {
  const lead = rng.int(...SIGN_TO_FIRST_DUE)
  const offsets = ends.map(() => 0)
  for (let i = 1; i < ends.length; i++) offsets[i] = offsets[i - 1]! + rng.pick(CONTRACT.gapDays)
  const ok: number[] = []
  for (let x = -120; x <= 300; x++) {
    const sign = x + lead
    if (sign < ago - chain[1] || sign > ago - chain[0]) continue
    if (ends.every((e, i) => fits(e, x - offsets[i]!))) ok.push(x)
  }
  if (ok.length === 0) throw new Infeasible('no due dates fit the installment ends')
  const first = addDays(today, -rng.pick(ok))
  return { dues: offsets.map((o) => addDays(first, o)), sign: addDays(first, -lead) }
}

function deriveEnd(rng: Rng, late: number): InstallmentEnd {
  if (late <= -8) return 'upcoming'
  if (late < 0) return 'due-soon'
  const pairs = (Object.entries(CONTRACT.pastDue) as [InstallmentEnd, number][]).filter(([e]) =>
    fits(e, late),
  )
  return rng.weighted(pairs)
}

function shareOf(i: number, n: number): number {
  const base = Math.floor(100 / n)
  return i === n - 1 ? 100 - base * (n - 1) : base
}

function installmentBeat(
  tm: Timer,
  c: ContractK,
  end: InstallmentEnd,
  i: number,
  due: Day,
  signed: Date,
): Beat {
  const late = daysBetween(due, tm.today)
  const base = {
    kind: 'installment' as const,
    no: i + 1,
    due,
    share: shareOf(i, c.installments.length),
    paidAt: null,
    paidBy: null,
    reason: null,
  }
  const dueEnd = vnAt(due, 17)
  if (end === 'paid') {
    const from = later(signed, vnAt(addDays(due, -5), 8))
    return { ...base, paidAt: tm.between(from, dueEnd), paidBy: c.collector }
  }
  if (end === 'paid-late') {
    const to = sooner(tm.now, vnAt(addDays(due, Math.min(late - 1, 20)), 17))
    return { ...base, paidAt: tm.between(vnAt(addDays(due, 1), 8), to), paidBy: c.collector }
  }
  if (end === 'overdue-waiting' || end === 'overdue-approved' || end === 'overdue-rejected') {
    const first = vnAt(addDays(due, 1), 8)
    const at = tm.between(first, end === 'overdue-waiting' ? tm.now : vnAt(addDays(due, 2), 17))
    const decided = end !== 'overdue-waiting'
    const decidedAt = decided ? tm.between(at, tm.now) : null
    const state =
      end === 'overdue-waiting' ? 'waiting' : end === 'overdue-approved' ? 'approved' : 'rejected'
    return {
      ...base,
      reason: { state, at, by: c.collector, decidedAt, decidedBy: decided ? CAST.head : null },
    }
  }
  return base
}

export type ContractOut = { terminated: Date | null }

export function contractBeats(
  rng: Rng,
  tm: Timer,
  k: Knobs,
  signed: Date,
  beats: Beat[],
  fixed?: Day[],
): ContractOut {
  const c = k.contract!
  const n = c.installments.length
  const derived = derivedEnds.has(c.installments)
  const first = addDays(
    dayOf(signed),
    rng.int(CONTRACT.firstDueAfterSignDays[0]!, CONTRACT.firstDueAfterSignDays[1]!),
  )
  const dues = fixed ?? dueDays(rng, first, n, tm.today, derived)
  const gap = daysBetween(dayOf(signed), dues[0]!)
  if (gap < 10 || gap > 20) throw new Infeasible(`first due ${gap} days after the sign`)
  const out: Beat[] = []
  dues.forEach((due, i) => {
    const late = daysBetween(due, tm.today)
    const end = derived ? deriveEnd(rng, late) : c.installments[i]!
    if (!fits(end, late)) throw new Infeasible(`installment ${i + 1}: ${end} at ${late} days late`)
    out.push(installmentBeat(tm, c, end, i, due, signed))
  })
  beats.push(...out)

  let last = new Date(signed.getTime() + 2 * 86_400_000)
  for (const b of out) {
    if (b.kind !== 'installment') continue
    for (const t of [b.paidAt, b.reason?.at, b.reason?.decidedAt]) if (t) last = later(last, t)
  }
  let terminated: Date | null = null
  if (c.termination !== 'none') {
    if (last.getTime() > tm.now.getTime()) throw new Infeasible('termination: no room')
    terminated = tm.between(last, tm.now)
    beats.push({ kind: 'terminated', at: terminated, by: CAST.head, knob: c.termination })
  } else if (c.temperature.length > 0) {
    const stop = new Date(tm.now.getTime() - 21 * 86_400_000)
    const to = stop.getTime() > signed.getTime() ? stop : tm.now
    const times = spread(rng, tm, signed, to, c.temperature.length)
    c.temperature.forEach((temperature, i) => {
      beats.push({ kind: 'temperature', at: times[i]!, by: c.collector, temperature })
    })
  }
  return { terminated }
}
