import type { CareActivityKind, LeadMotion, LeadTier } from '@pv/contracts'
import { addDays, daysBetween, isWeekend } from './clock'
import { hourOf, Infeasible, LOCAL } from './expand-time'
import {
  derivedEnds,
  isAccepted,
  minAgeDays,
  rankOf,
  STAGES,
  topStage,
  type ContractK,
  type DealK,
} from './knobs-age'
import {
  CAMPAIGNS,
  CAST,
  CONTRACT,
  COUNTS,
  DEAL,
  DEAL_END,
  EXIT_REASON,
  HOURS,
  LEAD,
  LEAD_END_BY_AGE,
  LOSS_REASON,
  MEETINGS,
  MOTION,
  SOURCE_KIND,
  WINDOW_START,
} from './params'
import type { Rng } from './rng'
import type { Override, Scenario } from './scenarios'
import { SCENARIOS } from './scenarios'
import type { ActorId, DealEnd, Day, HoldKnob, Knobs, LeadEnd } from './story.types'
import type { GenCtx } from './types'

/** Knobs: what happens to one journey, before any date is drawn. The bulk and
 *  the scenarios share `draw`: a scenario samples every default exactly like
 *  the bulk and then lays its override on top, so only what it names is fixed.
 *  The bulk degrades an outcome the journey is too young for; a scenario keeps
 *  its outcome and narrows its born window instead. */

type Campaign = (typeof CAMPAIGNS)[number]
type Opts = { dealOpenOnly?: boolean; contact?: number }
type Window = { from: Day; to: Day }
type Extras = Pick<
  Knobs,
  'tierReached' | 'leadHold' | 'leadNextStep' | 'duplicateMerged' | 'disabled' | 'meetings'
>

const orders = new WeakMap<object, number[]>()

/** Companies are dealt round-robin from one shuffle, so every company gets a journey. */
function companyOf(ctx: GenCtx, i: number): number {
  let order = orders.get(ctx)
  if (!order) {
    const rng = ctx.rng.fork('company-order')
    order = Array.from({ length: COUNTS.companies }, (_, n) => n)
    for (let n = order.length - 1; n > 0; n--) {
      const j = rng.int(0, n)
      ;[order[n], order[j]] = [order[j]!, order[n]!]
    }
    orders.set(ctx, order)
  }
  return order[i % order.length]!
}

const windowOf = (c: Campaign | null, today: Day): { from: Day; to: Day } | null =>
  !c || !c.from ? null : { from: c.from, to: c.to === 'today' ? today : (c.to ?? today) }

function pickCampaign(rng: Rng, motion: LeadMotion, today: Day): Campaign | null {
  const of = (m: LeadMotion): Campaign[] =>
    CAMPAIGNS.filter((c) => c.motion === m && c.from) as unknown as Campaign[]
  if (motion === 'EVENT' || motion === 'RECYCLE') return rng.pick(of(motion))
  if (motion === 'REFERRAL') {
    return rng.chance(LOCAL.referralCampaignShare) ? rng.pick(of('REFERRAL')) : null
  }
  if (motion !== 'OUTBOUND') return null
  const length = (c: Campaign): number => {
    const w = windowOf(c, today)!
    return daysBetween(w.from, w.to) + 1
  }
  return rng.weighted(of('OUTBOUND').map((c) => [c, length(c)] as [Campaign, number]))
}

/** Day weights: weekends at the configured share, event aftermath boosted. */
function pickDay(rng: Rng, win: Window, ctx: GenCtx, spike: Day | null): Day {
  const s = HOURS.weekendShare
  const weekend = (5 * s) / (2 * (1 - s))
  const days: [Day, number][] = []
  for (let d = win.from; d <= win.to; d = addDays(d, 1)) {
    let w = isWeekend(d) ? weekend : 1
    if (spike && d >= spike && d <= addDays(spike, 3)) w *= LOCAL.eventSpike
    if (d === ctx.today && hourOf(ctx.now) < 9) w = 0
    days.push([d, w])
  }
  if (days.every(([, w]) => w === 0)) return win.from
  return rng.weighted(days)
}

function sampleLead(rng: Rng, age: number): LeadEnd {
  const row = LEAD_END_BY_AGE.find((r) => age <= r.maxDays) ?? LEAD_END_BY_AGE[2]!
  const state = rng.weightedKey(row.w)
  if (state === 'nurturing') {
    if (rng.chance(LEAD.replyFromPoolShare)) return { state: 'new', fromPool: 'replied' }
    return {
      state: 'nurturing',
      reasonKey: rng.weighted(EXIT_REASON),
      recontact: rng.chance(LEAD.recontactShare),
    }
  }
  return { state }
}

const OPEN_HOLDS = ['upcoming', 'due-soon', 'due', 'overdue'] as const
const OPEN_ENDS = ['resumed', 'touch', 'stopped'] as const

function sampleHold(rng: Rng, kind: 'open' | 'lost' | 'won' | 'lead-open'): HoldKnob {
  if (kind === 'lost') return { ended: 'to-waiting' }
  if (kind === 'won') return { ended: 'converted' }
  if (rng.chance(LOCAL.holdOpenShare)) return { open: rng.pick(OPEN_HOLDS) }
  return { ended: rng.pick(OPEN_ENDS) }
}

function sampleDeal(
  rng: Rng,
  worker: ActorId | null,
  allow: { lost: boolean; openOnly: boolean },
): DealK {
  const pairs: [DealEnd, number][] = []
  for (const s of STAGES) pairs.push([{ kind: 'open', stage: s }, DEAL_END.open[s]])
  if (!allow.openOnly) {
    if (allow.lost) {
      for (const s of STAGES) {
        pairs.push([
          { kind: 'lost', atStage: s, reasonKey: rng.weighted(LOSS_REASON) },
          DEAL_END.lost[s],
        ])
      }
    }
    pairs.push([{ kind: 'won' }, DEAL_END.won])
  }
  const end = rng.weighted(pairs)
  const presales = rng.chance(DEAL.presalesShare) ? CAST.presales[0] : null
  const sale = rng.pick(CAST.sales.filter((a) => a !== presales))
  const activities = (Object.entries(DEAL.activity) as [CareActivityKind, number][])
    .filter(([, p]) => rng.chance(p))
    .map(([kind]) => kind)
  const hold = rng.chance(DEAL.holdShare)
    ? sampleHold(rng, end.kind === 'open' ? 'open' : end.kind)
    : null
  return normalizeDeal(
    {
      end,
      sale,
      bd: rng.chance(DEAL.bdShare) ? worker : null,
      presales,
      activities,
      quoteRounds: rng.weighted(DEAL.quoteRounds),
      hold,
      nextStep: rng.chance(DEAL.nextStepShare),
      primaryChanged: rng.chance(DEAL.primaryChangedShare),
      signApproval: end.kind === 'won' ? rng.weightedKey(DEAL.signApproval) : 'none',
      currency: rng.chance(DEAL.usdShare) ? 'USD' : 'VND',
    },
    rng,
  )
}

/** Forces a deal into a shape the expander and the DB can hold. Runs after
 *  every merge and every degrade, so an override never has to repeat the rules. */
export function normalizeDeal(d: DealK, rng: Rng): DealK {
  const top = rankOf(topStage(d.end))
  const out: DealK = { ...d }
  if (top < 2) out.activities = []
  else if (top === 2 && out.activities.length === 0) {
    out.activities = [rng.weighted(Object.entries(DEAL.activity) as [CareActivityKind, number][])]
  }
  out.quoteRounds = top === 3 ? Math.max(1, d.quoteRounds) : 0
  if (out.activities.some((a) => a === 'demo' || a === 'poc')) out.presales = CAST.presales[0]
  if (out.sale === out.presales) out.sale = rng.pick(CAST.sales.filter((a) => a !== out.presales))
  if (out.bd === out.sale || out.bd === out.presales) out.bd = null
  const accepted = isAccepted(d.end)
  out.primaryChanged = accepted && d.primaryChanged
  out.nextStep = d.end.kind === 'open' && accepted && d.nextStep
  const open = d.end.kind === 'open'
  const h = d.hold
  if (!h || !accepted) out.hold = null
  else if (d.end.kind === 'lost') out.hold = { ended: 'to-waiting' }
  else if (d.end.kind === 'won') out.hold = { ended: 'converted' }
  else if (open && 'ended' in h && (h.ended === 'to-waiting' || h.ended === 'converted')) {
    out.hold = { ended: 'resumed' }
  }
  if (d.end.kind === 'won') {
    out.signApproval = d.signApproval === 'waiting' ? 'approved' : d.signApproval
  } else if (!(
    d.end.kind === 'open' &&
    d.end.stage === 'quotation' &&
    d.signApproval === 'waiting'
  )) {
    out.signApproval = 'none'
  }
  return out
}

/** `plain` = a scenario: no termination or re-buy unless it names one. */
function sampleContract(rng: Rng, plain: boolean): ContractK {
  const count = rng.weighted(CONTRACT.installmentsCount)
  const termination = plain ? 'none' : rng.weightedKey(CONTRACT.termination)
  const terminated = termination !== 'none'
  const [lo, hi] = CONTRACT.temperatureReadings as [number, number]
  return {
    installments: Array.from({ length: count }, () => 'paid' as const),
    termination,
    collector: rng.pick(CAST.collectors),
    temperature: terminated
      ? []
      : Array.from({ length: rng.int(lo, hi) }, () => rng.pick(['hot', 'warm', 'cold'] as const)),
    growth: !plain && !terminated && rng.chance(CONTRACT.growthShare),
    documentsMissing: rng.chance(CONTRACT.documentsMissingShare),
  }
}

const emptyMeetings = (): Knobs['meetings'] => ({
  held: 0,
  cancelled: 0,
  upcoming: 0,
  today: false,
})

/** Open = still being worked: the subject today's meetings, holds and next steps attach to. */
const leadOpen = (k: Pick<Knobs, 'lead' | 'disabled' | 'deal'>): boolean =>
  !k.deal && !k.disabled && (k.lead.state === 'assigned' || k.lead.state === 'working')

/** Sampled extras for a journey whose lead and deal are already settled. */
function sampleExtras(rng: Rng, lead: LeadEnd, deal: DealK | null): Extras {
  const worked =
    lead.state === 'working' || lead.state === 'nurturing' || lead.state === 'converted'
  const tier = rng.weightedKey(LEAD.tier)
  const solo =
    !deal && (lead.state === 'assigned' || lead.state === 'working' || lead.state === 'nurturing')
  const meetings = emptyMeetings()
  if (deal) {
    const dealMeetings = MEETINGS.deal
    if (isAccepted(deal.end)) {
      meetings.held = rng.int(...(dealMeetings.held as [number, number]))
      meetings.upcoming = deal.end.kind === 'open' && rng.chance(dealMeetings.upcoming) ? 1 : 0
    }
    meetings.cancelled = deal.end.kind === 'lost' && rng.chance(dealMeetings.cancelled) ? 1 : 0
  } else {
    const m = MEETINGS.leadOnly
    if (lead.state === 'working' || lead.state === 'nurturing')
      meetings.held = rng.int(...(m.held as [number, number]))
    if (lead.state === 'nurturing') meetings.cancelled = rng.chance(m.cancelled) ? 1 : 0
    if (lead.state === 'assigned' || lead.state === 'working')
      meetings.upcoming = rng.chance(m.upcoming) ? 1 : 0
  }
  return {
    tierReached: worked && tier !== 'none' ? (tier as LeadTier) : null,
    leadHold: rng.chance(LEAD.holdShare)
      ? sampleHold(rng, lead.state === 'converted' ? 'won' : 'lead-open')
      : null,
    leadNextStep: rng.chance(LEAD.nextStepShare),
    duplicateMerged: solo && rng.chance(LEAD.duplicateMergedShare),
    disabled: solo && rng.chance(LEAD.disabledShare),
    meetings,
  }
}

/** Makes lead-side knobs agree with the final lead state and deal. */
export function coerceLead(k: Knobs): Knobs {
  const out: Knobs = { ...k }
  const s = k.lead.state
  const plainNew = s === 'new' && !k.lead.fromPool
  if (plainNew) {
    out.worker = null
    out.tierReached = null
  }
  if (s === 'assigned') out.tierReached = null
  const solo = !k.deal && (s === 'assigned' || s === 'working' || s === 'nurturing')
  if (!solo) {
    out.duplicateMerged = false
    out.disabled = false
  }
  out.leadNextStep = leadOpen(out) && k.leadNextStep
  const h = k.leadHold
  const fromPool = s === 'new' && !!k.lead.fromPool
  if (!h || out.disabled || plainNew) out.leadHold = null
  else if (s === 'converted') out.leadHold = { ended: 'converted' }
  else if (s === 'nurturing' || fromPool) out.leadHold = { ended: 'to-waiting' }
  else if ('ended' in h && (h.ended === 'to-waiting' || h.ended === 'converted')) {
    out.leadHold = { ended: 'resumed' }
  } else if ('ended' in h && h.ended === 'touch' && s === 'assigned')
    out.leadHold = { ended: 'resumed' }
  out.meetings = coerceMeetings(out)
  return out
}

function coerceMeetings(k: Knobs): Knobs['meetings'] {
  const m = { ...k.meetings }
  const d = k.deal
  const s = k.lead.state
  if (d) {
    const open = d.end.kind === 'open' && isAccepted(d.end)
    if (!isAccepted(d.end)) m.held = 0
    if (d.end.kind !== 'lost' || !isAccepted(d.end)) m.cancelled = 0
    if (!open) {
      m.upcoming = 0
      m.today = false
    }
  } else {
    if (s !== 'working' && s !== 'nurturing') m.held = 0
    if (!leadOpen(k)) {
      m.upcoming = 0
      m.today = false
    }
    if (m.cancelled > 0 && s !== 'nurturing' && !k.disabled) m.cancelled = 0
  }
  return m
}

/** One step down the ladder of outcomes, when a bulk journey is too young. */
export function lower(k: Knobs, rng: Rng): Knobs {
  const extras =
    k.leadHold ||
    k.deal?.hold ||
    k.duplicateMerged ||
    k.disabled ||
    k.meetings.held + k.meetings.cancelled + k.meetings.upcoming > 0
  if (extras) {
    return coerceLead({
      ...k,
      leadHold: null,
      duplicateMerged: false,
      disabled: false,
      meetings: { ...emptyMeetings(), today: k.meetings.today },
      deal: k.deal && { ...k.deal, hold: null },
    })
  }
  const c = k.contract
  if (c && (c.growth || c.termination !== 'none')) {
    const lead: LeadEnd =
      k.lead.state === 'nurturing' && k.lead.reasonKey === 'EX-09' ? { state: 'converted' } : k.lead
    return { ...k, lead, contract: { ...c, growth: false, termination: 'none' } }
  }
  const d = k.deal
  if (d) {
    const e = d.end
    if (e.kind === 'won') {
      return coerceLead({
        ...k,
        lead: { state: 'converted' },
        contract: null,
        deal: normalizeDeal(
          { ...d, end: { kind: 'open', stage: 'quotation' }, signApproval: 'none' },
          rng,
        ),
      })
    }
    const stage = topStage(e)
    const down = STAGES[rankOf(stage) - 1]
    if (down) {
      const end: DealEnd =
        e.kind === 'open' ? { kind: 'open', stage: down } : { ...e, atStage: down }
      return coerceLead({ ...k, deal: normalizeDeal({ ...d, end }, rng) })
    }
    return coerceLead({
      ...k,
      deal: null,
      lead: { state: 'working' },
      worker: k.worker ?? rng.pick(CAST.bds),
    })
  }
  const s = k.lead.state
  const lead: LeadEnd =
    s === 'nurturing'
      ? { state: 'working' }
      : s === 'working'
        ? { state: 'assigned' }
        : { state: 'new' }
  return coerceLead({ ...k, lead })
}

/** The override's plain Knobs fields, without the ones `draw` merges by hand. */
function topLevel(ov: Override | null): Partial<Knobs> {
  if (!ov) return {}
  const rest: Record<string, unknown> = { ...ov }
  for (const key of ['bornDaysAgo', 'deal', 'contract']) delete rest[key]
  return rest as Partial<Knobs>
}

function draw(
  rng: Rng,
  ctx: GenCtx,
  ov: Override | null,
  company: number,
  scenario: string | null,
  opts: Opts = {},
): Knobs | null {
  const today = ctx.today
  const motion = ov?.motion ?? rng.weightedKey(MOTION)
  let campaign: Campaign | null =
    ov?.campaign !== undefined
      ? ((CAMPAIGNS.find((c) => c.key === ov.campaign) ?? null) as unknown as Campaign | null)
      : ov?.contract?.installments
        ? null // fixed ends need the old end of the born window; a campaign can close it
        : pickCampaign(rng, motion, today)
  const cw = windowOf(campaign, today)
  const bornAgo = ov?.bornDaysAgo
  const win: Window = {
    from: [WINDOW_START, cw?.from, bornAgo && addDays(today, -bornAgo[1])]
      .filter(Boolean)
      .sort()
      .pop() as Day,
    to: [today, cw?.to, bornAgo && addDays(today, -bornAgo[0])].filter(Boolean).sort()[0] as Day,
  }
  if (win.from > win.to) return null
  const webinar = CAMPAIGNS.find((c) => c.key === 'webinar-mes')!
  const spike =
    campaign?.event?.day ?? (motion === 'INBOUND' && !campaign ? webinar.event.day : null)
  const day = pickDay(rng, win, ctx, spike)
  if (motion === 'INBOUND' && !campaign && ov?.campaign === undefined) {
    const w = windowOf(webinar as unknown as Campaign, today)!
    if (day >= w.from && day <= w.to && rng.chance(LOCAL.webinarShare))
      campaign = webinar as unknown as Campaign
  }
  const age = daysBetween(day, today)

  const leadSampled = ov?.lead ?? sampleLead(rng, age)
  const worker0: ActorId | null = rng.pick(CAST.bds)
  const needDeal = ov
    ? ov.deal !== undefined
      ? ov.deal !== null
      : leadSampled.state === 'converted'
    : leadSampled.state === 'converted'
  const keepConverted = ov?.lead?.state === 'converted' && !ov.deal?.end
  let deal: DealK | null = null
  let contract: ContractK | null = null
  if (needDeal) {
    deal = normalizeDeal(
      {
        ...sampleDeal(rng, worker0, {
          lost: !keepConverted && !opts.dealOpenOnly,
          openOnly: !!opts.dealOpenOnly,
        }),
        ...(ov?.deal ?? {}),
      },
      rng,
    )
    if (deal.end.kind === 'won' && ov?.contract !== null) {
      contract = { ...sampleContract(rng, !!ov), ...(ov?.contract ?? {}) }
      if (!ov?.contract?.installments) derivedEnds.add(contract.installments)
      if (contract.termination !== 'none') {
        contract = { ...contract, growth: false, temperature: ov?.contract?.temperature ?? [] }
      }
    }
  }
  let lead: LeadEnd = leadSampled
  if (!ov?.lead && deal) {
    lead =
      deal.end.kind === 'lost'
        ? { state: 'nurturing', reasonKey: 'EX-08' }
        : contract && contract.termination !== 'none'
          ? { state: 'nurturing', reasonKey: 'EX-09' }
          : { state: 'converted' }
  }
  const sourceKind = ov?.sourceKind ?? rng.weighted(SOURCE_KIND[motion])
  const partner = motion === 'PARTNER' ? rng.int(0, COUNTS.partners - 1) : null
  const marketer = campaign
    ? campaign.owner
    : motion === 'INBOUND'
      ? null
      : rng.pick(CAST.marketers)
  const base: Knobs = {
    scenario,
    company,
    motion,
    sourceKind,
    campaign: campaign?.key ?? null,
    partner,
    born: { from: day, to: day },
    marketer,
    worker: worker0,
    lead,
    disabled: false,
    tierReached: null,
    leadHold: null,
    leadNextStep: false,
    duplicateMerged: false,
    deal,
    contract,
    meetings: emptyMeetings(),
  }
  let k = coerceLead({ ...base, ...sampleExtras(rng, lead, deal), ...topLevel(ov), deal, contract })
  if (k.deal) k = { ...k, deal: normalizeDeal(k.deal, rng), worker: k.worker ?? worker0 }
  if (!ov) {
    let guard = 0
    while (minAgeDays(k) > age && guard++ < 20) k = lower(k, rng)
    return k
  }
  const latest = addDays(today, -Math.ceil(minAgeDays(k)))
  const cwNow = windowOf(campaign, today)
  const from = cwNow && cwNow.from > win.from ? cwNow.from : win.from
  const upTo = win.to < latest ? win.to : latest
  const to = cwNow && cwNow.to < upTo ? cwNow.to : upTo
  if (from > to) return null
  return { ...k, born: { from, to } }
}

export function bulkKnobs(i: number, rng: Rng, ctx: GenCtx): Knobs {
  for (let attempt = 0; attempt < 20; attempt++) {
    const k = draw(
      attempt === 0 ? rng : rng.fork(`retry:${attempt}`),
      ctx,
      null,
      companyOf(ctx, i),
      null,
    )
    if (k) return k
  }
  throw new Error(`bulkKnobs: no feasible draw for journey ${i}`)
}

export function scenarioKnobs(s: Scenario, rng: Rng, ctx: GenCtx): Knobs {
  const company = companyOf(ctx, SCENARIOS.indexOf(s))
  for (let attempt = 0; attempt < 60; attempt++) {
    const k = draw(attempt === 0 ? rng : rng.fork(`retry:${attempt}`), ctx, s.knobs, company, s.key)
    if (k) return k
  }
  throw new Error(`scenario ${s.key}: no born window satisfies its outcome`)
}

/** A re-buy: the same company, born 30-60 days after the sign, open at a sampled stage. */
export function growthKnobs(parent: Knobs, signDay: Day, rng: Rng, ctx: GenCtx): Knobs {
  const since = daysBetween(signDay, ctx.today)
  const [lo, hi] = LOCAL.growthAfterSignDays
  const ov: Override = {
    motion: 'REFERRAL',
    campaign: null,
    sourceKind: 'MANUAL',
    lead: { state: 'converted' },
    worker: parent.worker,
    bornDaysAgo: [Math.max(4, since - hi), since - lo],
    deal: { sale: parent.deal!.sale },
    contract: null,
  }
  for (let n = 0; n < 40; n++) {
    const k = draw(rng.fork(`try:${n}`), ctx, ov, parent.company, null, { dealOpenOnly: true })
    if (k) return k
  }
  throw new Infeasible('growth: parent signed too recently')
}
