import { addDays, dayOf, daysBetween, isWeekend, vnAt } from './clock'
import { dealSteps, derivedEnds } from './knobs-age'
import { contractBeats, fixedDues } from './expand-contract'
import { dealBeats, planDeal, type DealPlan } from './expand-deal'
import { sideBeats } from './expand-side'
import {
  beatAt,
  Infeasible,
  LOCAL,
  DAY_MS,
  makeTimer,
  spread,
  type Anchors,
  type Timer,
} from './expand-time'
import { growthKnobs } from './knobs'
import { CAST, DEAL, EXIT_REASON, HOURS } from './params'
import type { Rng } from './rng'
import type { Beat, Day, Knobs, Story } from './story.types'
import type { GenCtx } from './types'

/** Knobs -> one dated Story. Order of work: born day, lead phase, deal phase
 *  (which tells the lead phase where to stop), contract, side beats, growth.
 *  A draw that cannot meet the knobs throws `Infeasible`; the caller redraws. */

const TIERS = ['prospect', 'mql', 'sql'] as const
type LeadPhase = Pick<Anchors, 'claim' | 'firstTouch' | 'parked' | 'disabledAt'>

function pickBornDay(rng: Rng, k: Knobs): Day {
  const days: [Day, number][] = []
  const s = HOURS.weekendShare
  const weekend = (5 * s) / (2 * (1 - s))
  for (let d = k.born.from; d <= k.born.to; d = addDays(d, 1))
    days.push([d, isWeekend(d) ? weekend : 1])
  return days.length === 1 ? days[0]![0] : rng.weighted(days)
}

function channel(rng: Rng): 'call' | 'mail' | 'message' {
  return rng.weighted(LOCAL.channel)
}

/** What happens to the lead before it ends or becomes a deal, between `born`
 *  and `stop`. A recycled lead is parked once and reclaimed on the way. */
function leadPhase(
  rng: Rng,
  tm: Timer,
  k: Knobs,
  born: Date,
  stop: Date,
  beats: Beat[],
): LeadPhase {
  const out: LeadPhase = { claim: null, firstTouch: null, parked: null, disabledAt: null }
  const by = k.worker
  const lead = k.lead
  beats.push({ kind: 'lead-born', at: born, by: k.marketer })
  const fromPool = lead.state === 'new' && !!lead.fromPool
  const plainNew = lead.state === 'new' && !fromPool
  if (plainNew || !by) return out

  const lag = rng.real(LOCAL.claimLagHours[0], LOCAL.claimLagHours[1]) / 24
  let claim = tm.after(born, lag)
  if (claim.getTime() > stop.getTime()) claim = tm.between(born, stop)
  beats.push({ kind: 'lead-claimed', at: claim, by })
  out.claim = claim

  const reclaim = k.motion === 'RECYCLE' && (lead.state === 'assigned' || lead.state === 'working')
  const worked = lead.state === 'working' || lead.state === 'nurturing' || !!k.deal || fromPool
  const parkedHere = lead.state === 'nurturing' && !k.deal
  const tiers = k.tierReached ? TIERS.slice(0, TIERS.indexOf(k.tierReached) + 1) : []

  type Step = 'first' | 'care' | 'tier' | 'merged' | 'park' | 'reclaim' | 'reply'
  const steps: Step[] = []
  if (reclaim) steps.push('park', 'reclaim')
  if (worked || (reclaim && lead.state === 'working')) steps.push('first')
  const extra: Step[] = []
  if (worked) {
    const [lo, hi] = LOCAL.careCount
    for (let i = 0; i < rng.int(lo, hi); i++) extra.push('care')
    for (let i = 0; i < tiers.length; i++) extra.push('tier')
  }
  if (k.duplicateMerged) extra.push('merged')
  const mixed: Step[] = []
  for (const s of extra) mixed.splice(rng.int(0, mixed.length), 0, s)
  const tierOrder = [...tiers]
  steps.push(...mixed)
  if (parkedHere || fromPool) steps.push('park')
  if (fromPool) steps.push('reply')

  const times = spread(rng, tm, claim, stop, steps.length)
  const reason = lead.state === 'nurturing' ? lead.reasonKey : rng.weighted(EXIT_REASON)
  steps.forEach((s, i) => {
    const at = times[i]!
    if (s === 'first') {
      beats.push({ kind: 'first-touch', at, by, channel: channel(rng) })
      out.firstTouch = at
    } else if (s === 'care') {
      beats.push({
        kind: 'care',
        at,
        by,
        channel: channel(rng),
        reached: rng.chance(LOCAL.reachedShare),
      })
    } else if (s === 'tier') {
      beats.push({ kind: 'tier', at, by, tier: tierOrder.shift()! })
    } else if (s === 'merged') beats.push({ kind: 'merged', at, by })
    else if (s === 'park') {
      const recontact = lead.state === 'nurturing' && lead.recontact
      beats.push({
        kind: 'parked',
        at,
        by,
        reasonKey: reason,
        recontactOn: recontact ? addDays(tm.today, rng.int(7, 60)) : null,
      })
      if (!reclaim) out.parked = at
    } else if (s === 'reclaim') beats.push({ kind: 'reclaimed', at, by })
    else beats.push({ kind: 'pool-reply', at })
  })
  if (k.disabled) {
    const last = beats[beats.length - 1]!
    const at = tm.between(beatAt(last, tm.now), tm.now)
    beats.push({ kind: 'disabled', at, by: CAST.head })
    out.disabledAt = at
  }
  return out
}

const roundTo = (x: number, unit: number): number => Math.max(unit, Math.round(x / unit) * unit)

function makeAmount(rng: Rng, k: Knobs): number {
  const d = k.deal
  if (!d) return 0
  const vnd = rng.logUniform(DEAL.valueVnd[0]!, DEAL.valueVnd[1]!)
  return d.currency === 'USD' ? roundTo(vnd / 26_000, 100) : roundTo(vnd, 1_000_000)
}

export function expand(k: Knobs, key: string, rng: Rng, ctx: GenCtx): Story {
  const tm = makeTimer(rng, ctx.now)
  const beats: Beat[] = []
  const bornAt = tm.onDay(pickBornDay(rng, k))
  const amount = makeAmount(rng, k)
  const ends =
    k.contract && !derivedEnds.has(k.contract.installments) ? k.contract.installments : null
  const ranges = k.deal ? dealSteps(k.deal).map((s) => s.range) : []
  const chain: [number, number] = [
    ranges.reduce((n, [l]) => n + l, 0) + 1,
    ranges.reduce((n, [, h]) => n + h, 0) - 1,
  ]
  const ago = daysBetween(dayOf(bornAt), tm.today)
  const fixed = ends ? fixedDues(rng, ends, tm.today, ago, chain) : null
  const dues = fixed?.dues
  const exact = fixed ? (vnAt(fixed.sign, 12).getTime() - bornAt.getTime()) / DAY_MS : undefined
  const plan: DealPlan | null = k.deal ? planDeal(rng, tm, k, bornAt, exact) : null
  const lead = leadPhase(rng, tm, k, bornAt, plan?.open ?? ctx.now, beats)
  const a: Anchors = {
    ...lead,
    dealOpen: plan?.open ?? null,
    accept: plan?.accept ?? null,
    lost: null,
    signed: null,
    ownerAt: () => k.worker ?? '',
  }
  let terminated: Date | null = null
  if (plan) {
    const out = dealBeats(rng, tm, k, plan, amount, beats)
    a.lost = out.lost
    a.signed = out.signed
    a.ownerAt = out.ownerAt
    const parkAfter = (at: Date, reasonKey: string): void => {
      if (k.lead.state === 'nurturing' && k.lead.reasonKey === reasonKey) {
        const t = tm.minutes(at, rng.int(1, 5))
        beats.push({ kind: 'parked', at: t, by: null, reasonKey, recontactOn: null })
      }
    }
    if (out.lost) parkAfter(out.lost, 'EX-08')
    if (out.signed && k.contract) {
      terminated = contractBeats(rng, tm, k, out.signed, beats, dues).terminated
      if (terminated) parkAfter(terminated, 'EX-09')
    }
  }
  sideBeats(rng, tm, k, a, beats, k.scenario === 'S03')

  const contacts = ctx.companies[k.company]?.contacts.length ?? 2
  const story: Story = {
    key,
    knobs: k,
    bornAt,
    contact: rng.int(0, contacts - 1),
    amount,
    beats: [],
    growth: null,
  }
  story.beats = beats
    .map((b, i) => ({ b, i, t: beatAt(b, ctx.now).getTime() }))
    .sort((x, y) => x.t - y.t || x.i - y.i)
    .map((x) => x.b)
  if (k.contract?.growth && !terminated && a.signed) {
    const child = growthKnobs(k, dayOf(a.signed), rng.fork('growth'), ctx)
    story.growth = expand(child, `${key}-G`, rng.fork('growth-story'), ctx)
    if (dayOf(story.growth.bornAt) < dayOf(a.signed))
      throw new Infeasible('growth born before sign')
  }
  return story
}
