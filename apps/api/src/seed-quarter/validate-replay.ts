import { dayOf, daysBetween, vnAt } from './clock'
import { beatAt, DEAL_KINDS } from './expand-time'
import { CAMPAIGNS, WINDOW_START } from './params'
import type { Beat, Day, OppStage, Story } from './story.types'

/** Replays one story's beats against the state machines the database enforces
 *  and compares the result with its knobs. Every failure names the story. */

export function bad(s: Story, message: string): never {
  throw new Error(`${s.key}: ${message}`)
}

type LeadState = 'none' | 'new' | 'assigned' | 'working' | 'nurturing' | 'converted'
const NEXT: Record<OppStage, OppStage[]> = {
  new: ['assigned'],
  assigned: ['engaged', 'quotation'],
  engaged: ['quotation'],
  quotation: [],
}
const LEAD_ONLY = new Set<Beat['kind']>(['first-touch', 'care', 'tier', 'merged'])

export function checkTime(s: Story, now: Date): void {
  const k = s.knobs
  if (s.beats[0]?.kind !== 'lead-born') bad(s, 'first beat is not lead-born')
  if (s.beats[0]!.at.getTime() !== s.bornAt.getTime()) bad(s, 'lead-born is not bornAt')
  const day = dayOf(s.bornAt)
  if (day < k.born.from || day > k.born.to) bad(s, `born ${day} outside its window`)
  if (s.bornAt.getTime() < vnAt(WINDOW_START, 0).getTime()) bad(s, 'born before the window')
  const c = CAMPAIGNS.find((x) => x.key === k.campaign)
  if (c?.from && (day < c.from || (c.to !== 'today' && c.to && day > c.to))) {
    bad(s, `born ${day} outside campaign ${c.key}`)
  }
  let prev = 0
  for (const b of s.beats) {
    const t = beatAt(b, now).getTime()
    if (t < prev) bad(s, `beats out of order at ${b.kind}`)
    prev = t
    const scheduled = b.kind === 'meeting' && b.state === 'scheduled'
    if (t > now.getTime() && !scheduled) bad(s, `${b.kind} after now`)
    if (t < s.bornAt.getTime()) bad(s, `${b.kind} before born`)
  }
}

export function checkLead(s: Story): void {
  const k = s.knobs
  let st: LeadState = 'none'
  let reason: string | null = null
  let replied = false
  let disabled = false
  let merged = 0
  const tiers: string[] = []
  const need = (b: Beat, ...ok: LeadState[]): void => {
    if (!ok.includes(st)) bad(s, `${b.kind} while lead is ${st}`)
    if (disabled && b.kind !== 'disabled') bad(s, `${b.kind} after the lead was disabled`)
  }
  for (const b of s.beats) {
    if (LEAD_ONLY.has(b.kind)) need(b, 'assigned', 'working')
    switch (b.kind) {
      case 'lead-born':
        st = 'new'
        break
      case 'lead-claimed':
        need(b, 'new')
        st = 'assigned'
        break
      case 'first-touch':
        need(b, 'assigned')
        st = 'working'
        break
      case 'tier':
        tiers.push(b.tier)
        break
      case 'merged':
        merged++
        break
      case 'parked':
        need(b, 'assigned', 'working', 'converted')
        st = 'nurturing'
        reason = b.reasonKey
        break
      case 'reclaimed':
        need(b, 'nurturing')
        st = 'assigned'
        break
      case 'pool-reply':
        need(b, 'nurturing')
        st = 'new'
        replied = true
        break
      case 'deal-opened':
        need(b, 'assigned', 'working')
        st = 'converted'
        break
      case 'disabled':
        need(b, 'assigned', 'working', 'nurturing')
        disabled = true
        break
      default:
    }
  }
  const want = k.lead
  if (st !== want.state) bad(s, `lead ends ${st}, knobs say ${want.state}`)
  if (want.state === 'new' && !!want.fromPool !== replied)
    bad(s, 'pool reply does not match fromPool')
  if (want.state === 'nurturing' && reason !== want.reasonKey) bad(s, `exit reason ${reason}`)
  if (disabled !== k.disabled) bad(s, 'disabled does not match knobs')
  if (merged > 0 !== k.duplicateMerged) bad(s, 'merged does not match knobs')
  const ladder = ['prospect', 'mql', 'sql']
  const top = k.tierReached ? ladder.indexOf(k.tierReached) + 1 : 0
  if (tiers.join() !== ladder.slice(0, top).join()) bad(s, `tier ladder ${tiers.join('>')}`)
}

export function checkDeal(s: Story, now: Date): void {
  const k = s.knobs
  const d = k.deal
  let stage: OppStage | null = null
  let accepted = false
  let lost: Extract<Beat, { kind: 'deal-lost' }> | null = null
  let signed = false
  let owner = d?.sale ?? ''
  let owners = 0
  let rounds = 0
  let pending = 0
  let requests = 0
  let requester = ''
  const decisions: boolean[] = []
  let waiting = false
  const acts: string[] = []
  for (const b of s.beats) {
    if (!d) {
      if (DEAL_KINDS.has(b.kind)) bad(s, `${b.kind} without a deal`)
      continue
    }
    if ((lost || signed) && DEAL_KINDS.has(b.kind)) bad(s, `${b.kind} after the deal closed`)
    switch (b.kind) {
      case 'deal-opened':
        stage = 'new'
        break
      case 'deal-accepted':
        if (stage !== 'new') bad(s, 'accepted outside new')
        accepted = true
        break
      case 'stage':
        if (b.from !== stage || !NEXT[b.from].includes(b.to))
          bad(s, `stage ${b.from}>${b.to} at ${stage}`)
        if (!accepted) bad(s, 'stage move before the head accepted')
        stage = b.to as OppStage
        break
      case 'activity':
        if (stage !== 'engaged') bad(s, `activity at ${stage}`)
        acts.push(b.activity)
        break
      case 'quote':
        if (stage !== 'quotation') bad(s, `quote at ${stage}`)
        rounds++
        if (b.round !== rounds) bad(s, 'quote rounds not sequential')
        if ((b.outcome === 'pending') !== (b.closedAt === null)) bad(s, 'quote closedAt vs outcome')
        if (b.closedAt && b.closedAt.getTime() < b.at.getTime()) bad(s, 'quote closed before sent')
        if (b.closedAt && b.closedAt.getTime() > now.getTime()) bad(s, 'quote closed after now')
        if (b.outcome === 'pending') pending++
        break
      case 'owner-changed':
        if (b.from !== owner || b.to === owner) bad(s, 'owner-changed from the wrong owner')
        owner = b.to
        owners++
        break
      case 'deal-lost':
        if (b.atStage !== stage) bad(s, `lost at ${b.atStage} but deal is at ${stage}`)
        lost = b
        break
      case 'sign-requested':
        if (stage !== 'quotation' || waiting) bad(s, 'sign request out of place')
        requests++
        requester = b.by
        waiting = true
        break
      case 'sign-decided':
        if (!waiting) bad(s, 'decision without a request')
        if (b.by === requester) bad(s, 'decider is the requester')
        decisions.push(b.approved)
        waiting = false
        break
      case 'signed':
        if (stage !== 'quotation' || rounds === 0 || waiting) bad(s, 'signed out of place')
        if (decisions.length > 0 && decisions[decisions.length - 1] !== true)
          bad(s, 'signed without approval')
        signed = true
        break
      default:
    }
  }
  if (!d) return
  const e = d.end
  if (e.kind === 'open' && (lost || signed || stage !== e.stage)) bad(s, `open deal ends ${stage}`)
  if (
    e.kind === 'lost' &&
    (!lost || lost.atStage !== e.atStage || lost.reasonKey !== e.reasonKey)
  ) {
    bad(s, 'lost deal does not match')
  }
  if (e.kind === 'won' && !signed) bad(s, 'won deal not signed')
  if (rounds !== d.quoteRounds) bad(s, `${rounds} quote rounds, knobs say ${d.quoteRounds}`)
  if (pending > 1) bad(s, 'more than one pending quote')
  if (owners > 0 !== d.primaryChanged) bad(s, 'primary owner change does not match')
  if (acts.slice().sort().join() !== d.activities.slice().sort().join())
    bad(s, 'activities do not match')
  const wantWaiting = e.kind === 'open' && d.signApproval === 'waiting'
  if (waiting !== wantWaiting) bad(s, 'waiting sign approval does not match')
  const wantRequests =
    e.kind === 'won'
      ? { none: 0, approved: 1, 'rejected-then-approved': 2, waiting: 1 }[d.signApproval]
      : wantWaiting
        ? 1
        : 0
  if (requests !== wantRequests) bad(s, `${requests} sign requests, want ${wantRequests}`)
}

type Subject = 'lead' | 'deal'

export function checkSide(s: Story, now: Date): void {
  const k = s.knobs
  const today: Day = dayOf(now)
  const holds: Record<Subject, { sets: number; open: boolean; until: Day }> = {
    lead: { sets: 0, open: false, until: '' },
    deal: { sets: 0, open: false, until: '' },
  }
  const steps: Record<Subject, number> = { lead: 0, deal: 0 }
  const lastDue: Record<Subject, Day> = { lead: '', deal: '' }
  const m = { held: 0, cancelled: 0, upcoming: 0, today: 0 }
  for (const b of s.beats) {
    if (b.kind === 'hold-set') {
      const h = holds[b.on]
      if (h.open || h.sets > 0) bad(s, `second ${b.on} hold`)
      if (b.until < dayOf(b.at)) bad(s, 'hold due before it was set')
      h.sets++
      h.open = true
      h.until = b.until
    } else if (b.kind === 'hold-ended') {
      if (!holds[b.on].open) bad(s, 'hold ended while none open')
      holds[b.on].open = false
    } else if (b.kind === 'next-step-open') {
      if (steps[b.on] > 0) bad(s, `second open ${b.on} next step`)
      steps[b.on]++
      lastDue[b.on] = b.due
    } else if (b.kind === 'next-step-done') {
      if (steps[b.on] === 0) bad(s, 'next step done while none open')
      steps[b.on]--
    } else if (b.kind === 'meeting') {
      if (b.state === 'held') m.held++
      else if (b.state === 'cancelled') m.cancelled++
      else if (dayOf(b.at) === today) m.today++
      else m.upcoming++
      if (b.state === 'scheduled' && b.at.getTime() <= now.getTime())
        bad(s, 'scheduled meeting in the past')
    }
  }
  const want = k.meetings
  const got = `${m.held}/${m.cancelled}/${m.upcoming}/${m.today}`
  const exp = `${want.held}/${want.cancelled}/${want.upcoming}/${want.today ? 1 : 0}`
  if (got !== exp) bad(s, `meetings held/cancelled/upcoming/today ${got}, knobs say ${exp}`)
  const leadWantsStep = k.leadNextStep && !k.deal
  if (steps.lead !== (leadWantsStep ? 1 : 0)) bad(s, 'lead next step does not match')
  if (steps.deal !== (k.deal?.nextStep ? 1 : 0)) bad(s, 'deal next step does not match')
  if (k.scenario === 'S03' && !(lastDue.lead < today)) bad(s, 'S03 next step is not overdue')
  const wantHold = { lead: k.leadHold, deal: k.deal?.hold ?? null }
  for (const on of ['lead', 'deal'] as const) {
    const w = wantHold[on]
    const h = holds[on]
    if (!w) {
      if (h.sets > 0) bad(s, `unexpected ${on} hold`)
      continue
    }
    if (h.sets !== 1) bad(s, `${on} hold missing`)
    if ('open' in w !== h.open) bad(s, `${on} hold open/ended does not match`)
    if ('open' in w) {
      const gap = daysBetween(today, h.until)
      const level = gap < 0 ? 'overdue' : gap === 0 ? 'due' : gap <= 7 ? 'due-soon' : 'upcoming'
      if (level !== w.open) bad(s, `${on} hold is ${level}, knobs say ${w.open}`)
    }
  }
}
