import {
  LEAD_LANE_BACKBONE,
  LEAD_STATE_LABEL,
  StageKey,
  type ExitReason,
  type LeadState,
  type OpportunityOwner,
  type WorkstreamAccountLane,
  type WorkstreamDealLane,
  type WorkstreamLeadLane,
  type WorkstreamLeadNurture,
  type WorkstreamStep,
} from '@pv/contracts'
import { stateByTier } from '../lead/lead-state'
import type { LeadRowDb } from '../lead/lead.schema'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import type { PhaseConfig } from '../ladder'
import type { LaneRows, LeadTouchEntry, StageEventRow } from './workstream-lanes.repository'
import type { WorkstreamRead } from './workstream.repository'

/** The profile's swimlanes, folded from rows already read — no SQL, no engine.
 *
 *  A step's state compares its ladder index with the rung the object stands (or
 *  last stood) on; the rules per state are the contract's `WorkstreamStep`. */

type Entry = { at: Date; by: string | null } | null

type Ladder<K extends string> = {
  keys: readonly K[]
  labelOf: (key: K) => string
  /** Rung the object stands or last stood on; -1 when nothing says which. */
  index: number
  /** What the stood-on rung reads as once the object stopped moving. */
  closed: 'current' | 'dropped' | 'done'
  entryOf: (key: K) => Entry
  since: Date | null
  /** Close/exit date for `dropped`, now for `current`. */
  until: Date
  doneDays: (i: number, entryAt: Date | null) => number | null
}

const DAY_MS = 86_400_000

const wholeDays = (from: Date | null, to: Date | null): number | null =>
  from === null || to === null
    ? null
    : Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS))

/** `Array.prototype.findLast` is past the api's `lib` target. */
function lastOf<T>(list: readonly T[], hit: (x: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (hit(list[i] as T)) return list[i]
  return undefined
}

const iso = (d: Date | null): string | null => d?.toISOString() ?? null

function stepsOf<K extends string>(l: Ladder<K>): WorkstreamStep[] {
  return l.keys.map((key, i) => {
    const label = l.labelOf(key)
    if (i > l.index) {
      return { key, label, state: 'upcoming', at: null, by: null, days: null }
    }

    const entry = l.entryOf(key)
    if (i < l.index) {
      const at = entry?.at ?? null
      return {
        key,
        label,
        state: 'done',
        at: iso(at),
        by: entry?.by ?? null,
        days: l.doneDays(i, at),
      }
    }

    const at = entry?.at ?? l.since
    const days = l.closed === 'done' ? l.doneDays(i, at) : wholeDays(l.since, l.until)
    return { key, label, state: l.closed, at: iso(at), by: entry?.by ?? null, days }
  })
}

/** A backbone rung, and the touch that puts the lead on it. `assigned` answers
 *  to `created` as well: a lead born with a holder was never handed over, so
 *  its receiving end rides on the creation row (`lead-write.service.ts`).
 *
 *  `verifying` reads the row `LeadStateWriter.firstAction` writes as it moves
 *  the state, and nothing else: any other kind dates the rung off an action by
 *  somebody who was not the holder, which is not what moved the column. Leads
 *  that moved before that row existed show the rung without a date. */
type Rung = (typeof LEAD_LANE_BACKBONE)[number]

const RUNG_HIT: Record<Rung, (t: LeadTouchEntry) => boolean> = {
  new: (t) => t.kind === 'created',
  assigned: (t) => (t.kind === 'handed-over' || t.kind === 'created') && t.to !== null,
  verifying: (t) => t.kind === 'first-action',
  working: (t) => t.kind === 'verified',
  converted: (t) => t.kind === 'entered-pipeline',
}

/** The lead lane: the five backbone rungs every lead draws, plus the nurture
 *  loop and the exit, which happen BESIDE the backbone rather than on it (ADR
 *  0058). Rung labels come from `LEAD_STATE_LABEL`, not `config_entry` — that
 *  catalogue holds the STAGE and TIER ladders and knows nothing about states. */
export function leadLaneOf(
  read: WorkstreamRead,
  deals: readonly OpportunityRowDb[],
  rows: LaneRows,
  now: Date,
): WorkstreamLeadLane {
  const { lead } = read
  const trail = rows.leadTouches
  const firstDeal = deals.reduce<Date | null>(
    (min, d) => (min === null || d.createdAt < min ? d.createdAt : min),
    null,
  )

  /* FIRST hit, not last: a rung is entered once, while `handed-over` fires
     again every time the lead changes hands afterwards. */
  const entryOf = (key: Rung): Entry =>
    trail.find(RUNG_HIT[key]) ?? (key === 'new' ? { at: lead.createdAt, by: null } : null)

  const exit = exitOf(lead, trail)
  const leftAt = exit?.at ?? null
  const outcome = leftAt ? 'exited' : firstDeal ? 'converted' : 'open'
  const outcomeAt = leftAt ?? firstDeal

  const index = standingOn(lead, entryOf)
  const since = entryOf(LEAD_LANE_BACKBONE[index] ?? 'new')?.at ?? lead.stateSince
  const atOf = (i: number): Date | null => {
    const key = LEAD_LANE_BACKBONE[i]
    return (key ? entryOf(key)?.at : null) ?? (i === index ? since : null)
  }

  const doneDays = (i: number, at: Date | null): number | null => {
    if (i === index) return wholeDays(at, outcomeAt)
    for (let j = i + 1; j <= index; j++) {
      const next = atOf(j)
      if (next !== null) return wholeDays(at, next)
    }
    return null
  }

  return {
    code: lead.code,
    sourceKind: lead.sourceKind ?? null,
    campaignName: read.campaignName,
    tier: lead.tier,
    owner:
      lead.ownerId !== null && read.saleName !== null
        ? { id: lead.ownerId, name: read.saleName }
        : null,
    steps: stepsOf({
      keys: LEAD_LANE_BACKBONE,
      labelOf: (key) => LEAD_STATE_LABEL[key],
      index,
      closed: outcome === 'exited' ? 'dropped' : outcome === 'converted' ? 'done' : 'current',
      entryOf,
      since,
      until: leftAt ?? now,
      doneDays,
    }),
    nurture: nurtureOf(trail, lead.state, leftAt ?? now),
    exit:
      exit === null
        ? null
        : { state: exit.state, at: exit.at.toISOString(), by: exit.by, reason: exit.reason },
    outcome,
    outcomeAt: iso(outcomeAt),
  }
}

/** Which rung the lane DRAWS the lead on. `nurturing` is a stop, not a step
 *  forward, so it parks the lead exactly where `LeadExitService.resume` would
 *  put it back — the same `stateByTier` both of them read. A lead that LEFT
 *  stands on the last rung its trail proves it reached, not the one it was
 *  heading for. */
function standingOn(lead: LeadRowDb, entryOf: (key: Rung) => Entry): number {
  if (lead.state === 'nurturing') return LEAD_LANE_BACKBONE.indexOf(stateByTier(lead.tier))
  const onBackbone = (LEAD_LANE_BACKBONE as readonly LeadState[]).indexOf(lead.state)
  if (onBackbone >= 0) return onBackbone

  let reached = 0
  for (let i = 0; i < LEAD_LANE_BACKBONE.length; i++) {
    if (entryOf(LEAD_LANE_BACKBONE[i] ?? 'new') !== null) reached = i
  }
  return reached
}

type Exit = {
  state: 'disqualified' | 'archived'
  at: Date
  by: string | null
  reason: ExitReason | null
}

/** How the lead left, or null while it is still on the backbone. The moment
 *  comes off the touch that WROTE the move; the lead's own columns are the
 *  fallback for rows written before those touch kinds existed. */
function exitOf(lead: LeadRowDb, trail: readonly LeadTouchEntry[]): Exit | null {
  if (lead.state === 'disqualified') {
    const row = lastOf(trail, (t) => t.kind === 'exited')
    return {
      state: 'disqualified',
      at: row?.at ?? lead.exitedAt ?? lead.stateSince,
      by: row?.by ?? null,
      reason: lead.exitReason,
    }
  }
  if (lead.state === 'archived') {
    /* No reason, by contract: the sweeper retires on a timer and picks none. */
    const row = lastOf(trail, (t) => t.kind === 'archived')
    return { state: 'archived', at: row?.at ?? lead.stateSince, by: row?.by ?? null, reason: null }
  }
  return null
}

/** Every stay in `nurturing`, folded from the `nurtured` → `resumed` pairs on
 *  the trail. `until` closes a stay nobody resumed — the exit that ended it, or
 *  now — so `totalDays` counts the open stay too. */
function nurtureOf(
  trail: readonly LeadTouchEntry[],
  state: LeadState,
  until: Date,
): WorkstreamLeadNurture | null {
  const stays = trail.filter((t) => t.kind === 'nurtured')
  if (stays.length === 0) return null

  let totalDays = 0
  for (const stay of stays) {
    const back = trail.find((t) => t.kind === 'resumed' && t.at > stay.at)
    totalDays += wholeDays(stay.at, back?.at ?? until) ?? 0
  }

  const open = state === 'nurturing' ? (stays[stays.length - 1]?.at ?? null) : null
  return { count: stays.length, totalDays, since: iso(open) }
}

/** Oldest deal first, as the contract orders the lanes. */
export function dealLanesOf(
  deals: readonly OpportunityRowDb[],
  owners: Map<string, OpportunityOwner[]>,
  rows: LaneRows,
  stage: Map<StageKey, PhaseConfig>,
  now: Date,
): WorkstreamDealLane[] {
  const oldestFirst = [...deals].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.code.localeCompare(b.code),
  )
  return oldestFirst.map((deal) => dealLaneOf(deal, owners, rows, stage, now))
}

function dealLaneOf(
  deal: OpportunityRowDb,
  owners: Map<string, OpportunityOwner[]>,
  rows: LaneRows,
  stage: Map<StageKey, PhaseConfig>,
  now: Date,
): WorkstreamDealLane {
  const events = rows.events.filter((e) => e.deal === deal.code)
  const signed = rows.contracts.find((c) => c.deal === deal.code) ?? null
  const outcome = signed ? 'won' : deal.state === 'close-lost' ? 'lost' : 'open'
  const entryOf = (key: StageKey): Entry => lastOf(events, (e) => e.to === key) ?? null
  const sale = (owners.get(deal.code) ?? []).find((o) => o.role === 'SALE')
  const stood = deal.stage ?? lastStageOf(events)

  return {
    code: deal.code,
    owner: sale ? { id: sale.id, name: sale.name } : null,
    steps: stepsOf({
      keys: StageKey.options,
      labelOf: (key) => stage.get(key)?.label ?? key,
      index: stood === null ? -1 : StageKey.options.indexOf(stood),
      closed: outcome === 'won' ? 'done' : outcome === 'lost' ? 'dropped' : 'current',
      entryOf,
      /* A closed deal's `stage_since` is nulled on close, so its clock falls
         back to when it entered the rung it left from. */
      since: deal.stageSince ?? (stood === null ? null : (entryOf(stood)?.at ?? null)),
      until: outcome === 'lost' ? (deal.closedAt ?? now) : now,
      doneDays: (i) => lastOf(events, (e) => e.from === StageKey.options[i])?.daysInFrom ?? null,
    }),
    outcome,
    outcomeAt: iso(signed?.at ?? (outcome === 'lost' ? deal.closedAt : null)),
    contractCode: signed?.code ?? null,
  }
}

/** The rung a closed deal left from — its stage column is null by then. */
function lastStageOf(events: readonly StageEventRow[]): StageKey | null {
  let stood: StageKey | null = null
  for (const e of events) stood = e.to ?? e.from ?? stood
  return stood
}

/** `purchased` reads every contract of the run, hidden deals included: it is a
 *  fact about the company and names no deal. */
export function accountLaneOf(read: WorkstreamRead, rows: LaneRows): WorkstreamAccountLane {
  return {
    code: read.row.accountCode,
    name: read.accountName,
    owner: rows.accountOwner,
    purchased: rows.contracts.length > 0,
  }
}
