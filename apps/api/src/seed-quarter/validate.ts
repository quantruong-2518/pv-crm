import { dayOf, daysBetween } from './clock'
import { fits } from './expand-contract'
import { LOCAL } from './expand-time'
import { derivedEnds } from './knobs-age'
import { COUNTS, DEAL, MEETINGS } from './params'
import { SCENARIOS } from './scenarios'
import type { Beat, InstallmentEnd, Story } from './story.types'
import { bad, checkDeal, checkLead, checkSide, checkTime } from './validate-replay'

/** `validate` throws on the first broken invariant, naming the story key.
 *  `summarize` is what the harness prints so a human can see the shape. */

type Installment = Extract<Beat, { kind: 'installment' }>

/** The end an installment's own fields amount to, as the product would read it. */
export function endOfInstallment(b: Installment, today: string): InstallmentEnd | 'due-today' {
  if (b.paidAt) return daysBetween(b.due, dayOf(b.paidAt)) > 0 ? 'paid-late' : 'paid'
  if (b.reason) {
    return b.reason.state === 'waiting'
      ? 'overdue-waiting'
      : b.reason.state === 'approved'
        ? 'overdue-approved'
        : 'overdue-rejected'
  }
  const late = daysBetween(b.due, today)
  if (late <= -8) return 'upcoming'
  if (late < 0) return 'due-soon'
  if (late === 0) return 'due-today'
  return late <= 14 ? 'overdue' : 'long-overdue'
}

function checkContract(s: Story, now: Date): void {
  const c = s.knobs.contract
  const signed = s.beats.find((b) => b.kind === 'signed')
  const inst = s.beats.filter((b): b is Installment => b.kind === 'installment')
  const term = s.beats.filter((b) => b.kind === 'terminated')
  const temps = s.beats.flatMap((b) => (b.kind === 'temperature' ? [b.temperature] : []))
  if (!c) {
    if (inst.length + term.length + temps.length > 0) bad(s, 'contract beats without a contract')
    return
  }
  if (!signed) bad(s, 'contract without a sign')
  const today = dayOf(now)
  if (inst.length !== c.installments.length)
    bad(s, `${inst.length} installments, knobs say ${c.installments.length}`)
  if (inst.reduce((n, b) => n + b.share, 0) !== 100) bad(s, 'installment shares do not sum to 100')
  const derived = derivedEnds.has(c.installments)
  let last = signed!.at.getTime()
  inst.forEach((b, i) => {
    const end = endOfInstallment(b, today)
    if (end === 'due-today') bad(s, `installment ${b.no} is due today with no end`)
    if (b.no !== i + 1 || (i > 0 && b.due <= inst[i - 1]!.due))
      bad(s, 'installment numbering or due order')
    if (!fits(end, daysBetween(b.due, today)))
      bad(s, `installment ${b.no} reads ${end}, which its due ${b.due} cannot be`)
    if (!derived && end !== c.installments[i])
      bad(s, `installment ${b.no} is ${end}, knobs say ${c.installments[i]}`)
    const gap = daysBetween(dayOf(signed!.at), b.due)
    if (i === 0 && (gap < 10 || gap > 20)) bad(s, `first due ${gap} days after the sign`)
    if (b.paidAt && b.paidAt.getTime() <= signed!.at.getTime()) bad(s, 'paid before the sign')
    if (b.reason) {
      const r = b.reason
      if ((r.state === 'waiting') !== (r.decidedAt === null))
        bad(s, 'overdue reason decision vs state')
      if (r.decidedBy === r.by) bad(s, 'overdue reason decided by its writer')
      if (daysBetween(b.due, dayOf(r.at)) < 1)
        bad(s, 'overdue reason written before the due passed')
      if (r.decidedAt && r.decidedAt.getTime() < r.at.getTime())
        bad(s, 'overdue reason decided before written')
    }
    for (const t of [b.paidAt, b.reason?.at, b.reason?.decidedAt])
      if (t) last = Math.max(last, t.getTime())
  })
  const t = term[0]
  if ((c.termination === 'none') !== (term.length === 0) || term.length > 1)
    bad(s, 'termination does not match knobs')
  if (t && t.kind === 'terminated') {
    if (t.knob !== c.termination) bad(s, 'termination kind does not match')
    if (t.at.getTime() < last) bad(s, 'terminated before the last payment event')
    if (temps.length > 0) bad(s, 'temperature on a terminated contract')
  }
  if (temps.join() !== c.temperature.join()) bad(s, 'temperature readings do not match')
  const [lo, hi] = LOCAL.growthAfterSignDays
  const expectGrowth = c.growth && c.termination === 'none'
  if (expectGrowth !== (s.growth !== null)) bad(s, 'growth story does not match knobs')
  if (s.growth) {
    const days = daysBetween(dayOf(signed!.at), dayOf(s.growth.bornAt))
    if (days < lo || days > hi) bad(s, `growth born ${days} days after the sign`)
    if (s.growth.knobs.company !== s.knobs.company) bad(s, 'growth journey has another company')
  }
}

function checkOne(s: Story, now: Date): void {
  checkTime(s, now)
  checkLead(s)
  checkDeal(s, now)
  checkSide(s, now)
  checkContract(s, now)
  const won = s.beats.some((b) => b.kind === 'signed')
  if (won !== (s.knobs.contract !== null)) bad(s, 'signed beat and contract disagree')
  if (s.growth) {
    if (s.growth.key !== `${s.key}-G`) bad(s, 'growth key')
    checkOne(s.growth, now)
  }
}

const flat = (stories: Story[]): Story[] => stories.flatMap((s) => (s.growth ? [s, s.growth] : [s]))

export function validate(stories: Story[], now: Date): void {
  const keys = new Set<string>()
  stories.forEach((s, i) => {
    if (keys.has(s.key)) bad(s, 'duplicate key')
    keys.add(s.key)
    if (i > 0 && s.bornAt.getTime() < stories[i - 1]!.bornAt.getTime())
      bad(s, 'stories not sorted by bornAt')
    checkOne(s, now)
  })
  const all = flat(stories)
  const scenarios = stories.filter((s) => s.knobs.scenario)
  if (scenarios.length !== SCENARIOS.length)
    throw new Error(`${scenarios.length} scenarios, want ${SCENARIOS.length}`)
  if (stories.length !== COUNTS.leads)
    throw new Error(`${stories.length} journeys, want ${COUNTS.leads}`)
  const today = all.filter((s) => s.knobs.meetings.today).length
  if (today !== MEETINGS.todayCount)
    throw new Error(`${today} journeys meet today, want ${MEETINGS.todayCount}`)
  const waiting = all.filter(
    (s) => s.knobs.deal?.end.kind === 'open' && s.knobs.deal.signApproval === 'waiting',
  ).length
  if (waiting !== DEAL.waitingApprovals)
    throw new Error(`${waiting} waiting sign approvals, want ${DEAL.waitingApprovals}`)
}

const tally = <T extends string>(xs: T[]): string =>
  Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {}))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')

export function summarize(stories: Story[], now?: Date): string[] {
  const all = flat(stories)
  const beats = all.flatMap((s) => s.beats)
  const at =
    now ??
    new Date(Math.max(...beats.flatMap((b) => (b.kind === 'installment' ? [] : [b.at.getTime()]))))
  const today = dayOf(at)
  const leadKey = (s: Story): string => {
    const l = s.knobs.lead
    const base = l.state === 'new' && l.fromPool ? 'new-replied' : l.state
    return s.knobs.disabled ? `${base}+disabled` : base
  }
  const deals = all.filter((s) => s.knobs.deal)
  const dealKey = (s: Story): string => {
    const e = s.knobs.deal!.end
    return e.kind === 'open' ? `open:${e.stage}` : e.kind === 'lost' ? `lost:${e.atStage}` : 'won'
  }
  const inst = beats.filter((b): b is Installment => b.kind === 'installment')
  const holds = beats.filter((b) => b.kind === 'hold-set')
  const ended = beats.filter((b) => b.kind === 'hold-ended')
  const meet = beats.filter(
    (b): b is Extract<Beat, { kind: 'meeting' }> => b.kind === 'meeting' && b.state === 'scheduled',
  )
  const todayN = meet.filter((b) => dayOf(b.at) === today).length
  return [
    `journeys ${all.length} (${stories.length} + ${all.length - stories.length} growth) · scenarios ${stories.filter((s) => s.knobs.scenario).length}`,
    `leads: ${tally(all.map(leadKey))}`,
    `deals ${deals.length}: ${tally(deals.map(dealKey))}`,
    `contracts ${all.filter((s) => s.knobs.contract).length} · terminated ${beats.filter((b) => b.kind === 'terminated').length}`,
    `installments ${inst.length}: ${tally(inst.map((b) => endOfInstallment(b, today)))}`,
    `holds ${holds.length} (open ${holds.length - ended.length}, ended ${ended.length})`,
    `meetings: held ${beats.filter((b) => b.kind === 'meeting' && b.state === 'held').length} · cancelled ${beats.filter((b) => b.kind === 'meeting' && b.state === 'cancelled').length} · today ${todayN} · upcoming ${meet.length - todayN}`,
  ]
}
