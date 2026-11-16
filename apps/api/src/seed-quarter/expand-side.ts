import { addDays, dayOf, vnAt } from './clock'
import { Infeasible, LOCAL, spread, type Anchors, type Timer } from './expand-time'
import type { Rng } from './rng'
import type { ActorId, Beat, Day, HoldKnob, Knobs } from './story.types'

/** Holds, next steps and meetings: the beats that hang off a subject (the
 *  lead, then the deal) rather than off a stage. Each takes the window the
 *  subject was alive in, so nothing lands on a lead after it became a deal. */

type On = 'lead' | 'deal'
type Who = (t: Date) => ActorId

const sooner = (a: Date, b: Date): Date => (a.getTime() < b.getTime() ? a : b)
const MIN_MS = 60_000

function untilOf(rng: Rng, today: Day, level: 'upcoming' | 'due-soon' | 'due' | 'overdue'): Day {
  if (level === 'upcoming') return addDays(today, rng.int(9, 30))
  if (level === 'due-soon') return addDays(today, rng.int(1, 6))
  if (level === 'due') return today
  return addDays(today, -rng.int(1, 4))
}

/** One hold on one subject. `closeAt` is when the subject left the hold's world
 *  (parked, lost, converted); `to-waiting` and `converted` end exactly there. */
function holdOn(
  rng: Rng,
  tm: Timer,
  hold: HoldKnob,
  on: On,
  start: Date,
  closeAt: Date | null,
  who: Who,
  beats: Beat[],
): void {
  const limit = closeAt ?? tm.now
  if (start.getTime() > limit.getTime()) throw new Infeasible('hold: subject too young')
  if ('open' in hold) {
    const until = untilOf(rng, tm.today, hold.open)
    const latest = hold.open === 'overdue' ? sooner(limit, vnAt(until, 12)) : limit
    if (start.getTime() > latest.getTime()) throw new Infeasible('hold: overdue before start')
    const at = tm.between(start, latest)
    beats.push({ kind: 'hold-set', at, by: who(at), on, until })
    return
  }
  const at = tm.between(start, limit)
  beats.push({ kind: 'hold-set', at, by: who(at), on, until: addDays(dayOf(at), rng.int(3, 20)) })
  const end = hold.ended
  const auto = end === 'to-waiting' || end === 'converted'
  const endAt = auto && closeAt ? closeAt : tm.between(at, limit)
  const by = end === 'resumed' || end === 'stopped' ? who(endAt) : null
  beats.push({ kind: 'hold-ended', at: endAt, by, on, end })
}

function nextStepOn(
  rng: Rng,
  tm: Timer,
  on: On,
  start: Date,
  who: Who,
  overdue: boolean,
  beats: Beat[],
): void {
  const due = overdue ? addDays(tm.today, -rng.int(1, 6)) : addDays(tm.today, rng.int(0, 14))
  const latest = overdue ? sooner(tm.now, vnAt(due, 12)) : tm.now
  if (start.getTime() > latest.getTime()) throw new Infeasible('next step: too young')
  const openAt = tm.between(start, latest)
  if (rng.chance(LOCAL.nextStepDoneShare)) {
    const [t1, t2] = spread(rng, tm, start, openAt, 2) as [Date, Date]
    const doer = who(t1)
    beats.push({
      kind: 'next-step-open',
      at: t1,
      by: doer,
      on,
      due: addDays(dayOf(t1), rng.int(1, 7)),
      doer,
    })
    beats.push({ kind: 'next-step-done', at: t2, by: doer, on })
  }
  const doer = who(openAt)
  beats.push({ kind: 'next-step-open', at: openAt, by: doer, on, due, doer })
}

function meetingAt(
  rng: Rng,
  at: Date,
  host: ActorId,
  on: On,
  state: 'held' | 'cancelled' | 'scheduled',
): Beat {
  return {
    kind: 'meeting',
    at,
    host,
    on,
    state,
    minutes: rng.weighted(LOCAL.meetingMinutes),
    mode: rng.weighted(LOCAL.meetingMode),
  }
}

type MeetingWindow = { on: On; from: Date; to: Date; cancelAt: Date | null; who: Who }

function meetingsOn(rng: Rng, tm: Timer, k: Knobs, w: MeetingWindow, beats: Beat[]): void {
  const m = k.meetings
  if (m.held > 0 && w.from.getTime() > w.to.getTime()) throw new Infeasible('meeting: no window')
  for (let i = 0; i < m.held; i++) {
    const at = tm.between(w.from, w.to)
    beats.push(meetingAt(rng, at, w.who(at), w.on, 'held'))
  }
  for (let i = 0; i < m.cancelled; i++) {
    if (!w.cancelAt) throw new Infeasible('meeting: nothing cancelled it')
    const at = tm.between(w.cancelAt, tm.now)
    beats.push(meetingAt(rng, at, w.who(at), w.on, 'cancelled'))
  }
  for (let i = 0; i < m.upcoming; i++) {
    const at = tm.ahead(addDays(tm.today, rng.int(1, 14)))
    beats.push(meetingAt(rng, at, w.who(at), w.on, 'scheduled'))
  }
  if (m.today) {
    const at = new Date(tm.now.getTime() + rng.int(30, 150) * MIN_MS)
    beats.push(meetingAt(rng, at, w.who(at), w.on, 'scheduled'))
  }
}

/** Lead-side then deal-side side beats. `nextOverdue` forces the open next
 *  step already late (the S03 scenario). */
export function sideBeats(
  rng: Rng,
  tm: Timer,
  k: Knobs,
  a: Anchors,
  beats: Beat[],
  nextOverdue: boolean,
): void {
  const worker: Who = () => k.worker!
  const late = (): boolean => nextOverdue || rng.chance(LOCAL.nextStepOverdueShare)
  const lh = k.leadHold
  if (lh && a.claim) {
    const h: HoldKnob = a.dealOpen ? { ended: 'converted' } : lh
    const toWaiting = 'ended' in h && h.ended === 'to-waiting'
    holdOn(rng, tm, h, 'lead', a.claim, a.dealOpen ?? (toWaiting ? a.parked : null), worker, beats)
  }
  if (k.leadNextStep && a.claim && !k.deal)
    nextStepOn(rng, tm, 'lead', a.claim, worker, late(), beats)

  const d = k.deal
  if (d && a.accept) {
    const dh = d.hold
    if (dh) {
      const close = d.end.kind === 'lost' ? a.lost : d.end.kind === 'won' ? a.signed : null
      holdOn(rng, tm, dh, 'deal', a.accept, 'ended' in dh && close ? close : null, a.ownerAt, beats)
    }
    if (d.nextStep) nextStepOn(rng, tm, 'deal', a.accept, a.ownerAt, late(), beats)
    const to = a.lost ?? a.signed ?? tm.now
    meetingsOn(
      rng,
      tm,
      k,
      { on: 'deal', from: a.accept, to, cancelAt: a.lost, who: a.ownerAt },
      beats,
    )
    return
  }
  if (d) return
  const from = a.firstTouch ?? a.claim
  if (!from) return
  const cancelAt = a.disabledAt ?? a.parked
  const to = a.parked ?? a.disabledAt ?? tm.now
  meetingsOn(rng, tm, k, { on: 'lead', from, to, cancelAt, who: worker }, beats)
}
