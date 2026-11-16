import { CAST, DEAL, QUOTE_REVISION_REASON } from './params'
import { compress, DAY_MS, Infeasible, LOCAL, type Timer } from './expand-time'
import { dealSteps, tailDays, type DealK } from './knobs-age'
import type { Rng } from './rng'
import type { ActorId, Beat, Knobs, OppStage } from './story.types'

/** The deal phase: knobs + chain instants -> opened, accepted, stage moves,
 *  activities, quote rounds, signing or loss. Dates are drawn forward from the
 *  born instant; `compress` squeezes the chain when the journey is young. */

export type DealPlan = {
  open: Date
  accept: Date | null
  engaged: Date | null
  quote: Date | null
  end: Date | null
}

/** Spans that add up to exactly `total` days: every range stretched by the
 *  same fraction, so the sum is exact and each span stays inside its range. */
function fixedSpans(ranges: [number, number][], total: number): number[] {
  const lo = ranges.reduce((n, [l]) => n + l, 0)
  const hi = ranges.reduce((n, [, h]) => n + h, 0)
  if (total < lo || total > hi) throw new Infeasible('deal chain cannot span the days')
  const t = hi === lo ? 0 : (total - lo) / (hi - lo)
  return ranges.map(([l, h]) => l + (h - l) * t)
}

/** `exact` pins the whole chain's length in days (a scenario whose installment
 *  ends fix the sign date); otherwise the chain is squeezed only to fit. */
export function planDeal(rng: Rng, tm: Timer, k: Knobs, born: Date, exact?: number): DealPlan {
  const d = k.deal!
  const steps = dealSteps(d)
  const avail = (tm.now.getTime() - born.getTime()) / DAY_MS - LOCAL.snapMarginDays - tailDays(k)
  const ranges = steps.map((s) => s.range)
  const spans = exact === undefined ? compress(rng, ranges, avail) : fixedSpans(ranges, exact)
  const at: Record<string, Date> = {}
  let t = born
  steps.forEach((s, i) => {
    t = tm.after(t, spans[i]!)
    at[s.name] = t
  })
  return {
    open: at.open!,
    accept: at.accept ?? null,
    engaged: at.engaged ?? null,
    quote: at.quotation ?? null,
    end: at.end ?? null,
  }
}

export type DealOut = { signed: Date | null; lost: Date | null; ownerAt: (t: Date) => ActorId }

const plusDays = (t: Date, days: number): Date => new Date(t.getTime() + days * DAY_MS)
const sooner = (a: Date, b: Date): Date => (a.getTime() < b.getTime() ? a : b)
const later = (a: Date, b: Date): Date => (a.getTime() > b.getTime() ? a : b)

type Round = { at: Date; amount: number }

/** Rounds spread over [first, window end]; the first sits exactly at `first`. */
function roundTimes(tm: Timer, first: Date, until: Date, n: number): Date[] {
  const times = [first]
  const span = Math.max(0, until.getTime() - first.getTime())
  for (let r = 1; r < n; r++) {
    const target = new Date(first.getTime() + (span * r) / n)
    times.push(tm.snap(target, times[r - 1]!))
  }
  return times
}

export function dealBeats(
  rng: Rng,
  tm: Timer,
  k: Knobs,
  plan: DealPlan,
  amount: number,
  beats: Beat[],
): DealOut {
  const d = k.deal!
  const head = CAST.head
  const owner2 = d.primaryChanged ? rng.pick(CAST.sales.filter((a) => a !== d.sale)) : null
  const tOwner = owner2 && plan.accept ? tm.between(plan.accept, plan.end ?? tm.now) : null
  const ownerAt = (t: Date): ActorId =>
    owner2 && tOwner && t.getTime() >= tOwner.getTime() ? owner2 : d.sale

  beats.push({ kind: 'deal-opened', at: plan.open, by: rng.chance(0.5) ? k.worker! : d.sale })
  let stage: OppStage = 'new'
  if (plan.accept) {
    beats.push({ kind: 'deal-accepted', at: plan.accept, by: head })
    beats.push({ kind: 'stage', at: plan.accept, by: head, from: 'new', to: 'assigned' })
    stage = 'assigned'
  }
  if (owner2 && tOwner) {
    beats.push({ kind: 'owner-changed', at: tOwner, by: head, from: d.sale, to: owner2 })
  }
  const move = (to: OppStage, at: Date): void => {
    beats.push({ kind: 'stage', at, by: ownerAt(at), from: stage, to })
    stage = to
  }
  const actEnd = plan.quote ?? plan.end ?? tm.now
  if (plan.engaged) {
    move('engaged', plan.engaged)
    const times = d.activities.map((_, i) =>
      i === 0 ? plan.engaged! : tm.between(plan.engaged!, actEnd),
    )
    d.activities.forEach((activity, i) => {
      const by =
        d.presales && (activity === 'demo' || activity === 'poc' || activity === 'solution')
          ? d.presales
          : ownerAt(times[i]!)
      beats.push({ kind: 'activity', at: times[i]!, by, activity })
    })
  }
  if (!plan.quote) return finish(rng, tm, k, plan, ownerAt, beats, amount, null)

  move('quotation', plan.quote)
  const n = d.quoteRounds
  const unit = d.currency === 'USD' ? 100 : 1_000_000
  const rounds: Round[] = []
  const lastClose = signingWindow(rng, tm, d, plan)
  const times = roundTimes(tm, plan.quote, lastClose.roundsUntil, n)
  times.forEach((at, i) => {
    const amountOf = Math.round((amount * (1 + 0.04 * (n - 1 - i))) / unit) * unit
    rounds.push({ at, amount: amountOf })
  })
  return finish(rng, tm, k, plan, ownerAt, beats, amount, { rounds, lastClose })
}

type Signing = { roundsUntil: Date; span: number }

/** Where the quote rounds must end so the approval chain still fits before the sign. */
function signingWindow(rng: Rng, tm: Timer, d: DealK, plan: DealPlan): Signing {
  const quote = plan.quote!
  if (d.end.kind === 'won') {
    const spans: Record<string, number> = { none: 0.3, approved: 2.5, 'rejected-then-approved': 6 }
    const span = spans[d.signApproval] ?? 0.3
    return { roundsUntil: later(quote, plusDays(plan.end!, -span - 0.2)), span }
  }
  if (d.end.kind === 'lost')
    return { roundsUntil: later(quote, plusDays(plan.end!, -0.2)), span: 0 }
  const until = sooner(
    plusDays(tm.now, -0.5),
    plusDays(quote, rng.real(DEAL.quotationToSignDays[0]!, DEAL.quotationToSignDays[1]!)),
  )
  return { roundsUntil: later(quote, until), span: 0 }
}

function finish(
  rng: Rng,
  tm: Timer,
  k: Knobs,
  plan: DealPlan,
  ownerAt: (t: Date) => ActorId,
  beats: Beat[],
  amount: number,
  q: { rounds: Round[]; lastClose: Signing } | null,
): DealOut {
  const d = k.deal!
  const rounds = q?.rounds ?? []
  const lastAt = rounds.length > 0 ? rounds[rounds.length - 1]!.at : plan.open
  let signed: Date | null = null
  let lost: Date | null = null

  if (d.end.kind === 'lost') {
    lost = later(plan.end!, lastAt)
    beats.push({
      kind: 'deal-lost',
      at: lost,
      by: ownerAt(lost),
      atStage: d.end.atStage,
      reasonKey: d.end.reasonKey,
    })
  } else if (d.end.kind === 'won') {
    signed = signFlow(rng, tm, d, plan, lastAt, ownerAt, amount, beats)
  } else if (d.signApproval === 'waiting') {
    const req = tm.after(lastAt, rng.real(0.3, 3))
    beats.push({ kind: 'sign-requested', at: req, by: ownerAt(req) })
  }
  const closeAt = signed ?? lost
  rounds.forEach((r, i) => {
    const isLast = i === rounds.length - 1
    const next = isLast ? null : rounds[i + 1]!.at
    const outcome = !isLast
      ? 'not-closed'
      : d.end.kind === 'won'
        ? 'won'
        : d.end.kind === 'lost'
          ? 'not-closed'
          : 'pending'
    const reasonKey = !isLast
      ? rng.weighted(QUOTE_REVISION_REASON)
      : d.end.kind === 'lost'
        ? d.end.reasonKey
        : null
    beats.push({
      kind: 'quote',
      at: r.at,
      by: ownerAt(r.at),
      negotiation: 1,
      round: i + 1,
      amount: r.amount,
      outcome,
      closedAt: isLast ? (outcome === 'pending' ? null : closeAt) : next,
      reasonKey,
    })
  })
  return { signed, lost, ownerAt }
}

/** Sign flows by approval kind; returns the instant of `signed`. */
function signFlow(
  rng: Rng,
  tm: Timer,
  d: DealK,
  plan: DealPlan,
  lastAt: Date,
  ownerAt: (t: Date) => ActorId,
  value: number,
  beats: Beat[],
): Date {
  const head = CAST.head
  const [aLo, aHi] = LOCAL.approvalLagDays
  const span = d.signApproval === 'none' ? 0.3 : d.signApproval === 'approved' ? 2.5 : 6
  const planned = later(lastAt, plusDays(plan.end!, -span))
  if (d.signApproval === 'none') {
    const at = tm.snap(plan.end!, lastAt)
    beats.push({ kind: 'signed', at, by: head, value })
    return at
  }
  let t = tm.snap(planned, lastAt)
  const request = (): void => {
    beats.push({ kind: 'sign-requested', at: t, by: ownerAt(t) })
  }
  const decide = (approved: boolean): void => {
    t = tm.after(t, rng.real(aLo, aHi))
    beats.push({
      kind: 'sign-decided',
      at: t,
      by: head,
      approved,
      reason: approved ? null : rng.pick(LOCAL.rejectReasons),
    })
  }
  request()
  if (d.signApproval === 'rejected-then-approved') {
    decide(false)
    t = tm.after(t, rng.real(...LOCAL.resubmitDays))
    request()
  }
  decide(true)
  t = tm.after(t, rng.real(...LOCAL.signLagDays))
  beats.push({ kind: 'signed', at: t, by: ownerAt(t), value })
  return t
}
