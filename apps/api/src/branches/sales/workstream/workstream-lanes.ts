import {
  LeadTier,
  StageKey,
  type GateCriterionState,
  type OpportunityOwner,
  type WorkstreamAccountLane,
  type WorkstreamDealLane,
  type WorkstreamLeadLane,
  type WorkstreamStep,
} from '@pv/contracts'
import { gateStatesOf } from '../opportunity/opportunity.mapper'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import type { PhaseConfig } from '../ladder'
import type { LaneRows, StageEventRow } from './workstream-lanes.repository'
import type { WorkstreamRead } from './workstream.repository'

/** The profile's swimlanes, folded from rows already read — no SQL, no engine.
 *
 *  A step's state compares its ladder index with the rung the object stands (or
 *  last stood) on; the rules per state are the contract's `WorkstreamStep`. */

type Entry = { at: Date; by: string } | null

type Ladder = {
  keys: readonly string[]
  config: Map<string, PhaseConfig>
  /** Rung the object stands or last stood on; -1 when nothing says which. */
  index: number
  /** What the stood-on rung reads as once the object stopped moving. */
  closed: 'current' | 'dropped' | 'done'
  entryOf: (key: string) => Entry
  since: Date | null
  /** Close/exit date for `dropped`, now for `current`. */
  until: Date
  doneDays: (i: number, entryAt: Date | null) => number | null
  criteriaOf: (key: string) => GateCriterionState[]
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

function stepsOf(l: Ladder): WorkstreamStep[] {
  return l.keys.map((key, i) => {
    const label = l.config.get(key)?.label ?? key
    const criteria = l.criteriaOf(key)
    if (i > l.index) {
      return { key, label, state: 'upcoming', at: null, by: null, days: null, criteria }
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
        criteria,
      }
    }

    const at = entry?.at ?? l.since
    const days = l.closed === 'done' ? l.doneDays(i, at) : wholeDays(l.since, l.until)
    return { key, label, state: l.closed, at: iso(at), by: entry?.by ?? null, days, criteria }
  })
}

export function leadLaneOf(
  read: WorkstreamRead,
  deals: readonly OpportunityRowDb[],
  rows: LaneRows,
  tier: Map<LeadTier, PhaseConfig>,
  now: Date,
): WorkstreamLeadLane {
  const { lead } = read
  const firstDeal = deals.reduce<Date | null>(
    (min, d) => (min === null || d.createdAt < min ? d.createdAt : min),
    null,
  )
  /* An archived lead left the funnel too (its run closes LOST), at `state_since`. */
  const leftAt = lead.state === 'archived' ? lead.stateSince : lead.exitedAt
  const outcome = leftAt ? 'exited' : firstDeal ? 'converted' : 'open'
  const outcomeAt = leftAt ?? firstDeal

  const keys = LeadTier.options
  const index = lead.tier === null ? -1 : keys.indexOf(lead.tier)
  const entryOf = (key: string): Entry => lastOf(rows.tiers, (t) => t.tier === key) ?? null
  /* The current rung's clock is its latest `verified`/`tier-raised` entry;
     `state_since` only when the ledger has none (it may predate the lead). */
  const tierSince = entryOf(lead.tier ?? '')?.at ?? lead.stateSince
  const atOf = (i: number): Date | null =>
    entryOf(keys[i] ?? '')?.at ?? (i === index ? tierSince : null)

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
    owner:
      lead.ownerId !== null && read.saleName !== null
        ? { id: lead.ownerId, name: read.saleName }
        : null,
    steps: stepsOf({
      keys,
      config: tier,
      index,
      closed: outcome === 'exited' ? 'dropped' : outcome === 'converted' ? 'done' : 'current',
      entryOf,
      since: tierSince,
      until: leftAt ?? now,
      doneDays,
      criteriaOf: () => [],
    }),
    outcome,
    outcomeAt: iso(outcomeAt),
  }
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
  const entryOf = (key: string): Entry => lastOf(events, (e) => e.to === key) ?? null
  const sale = (owners.get(deal.code) ?? []).find((o) => o.role === 'SALE')
  const stood = deal.stage ?? lastStageOf(events)

  return {
    code: deal.code,
    owner: sale ? { id: sale.id, name: sale.name } : null,
    steps: stepsOf({
      keys: StageKey.options,
      config: stage,
      index: stood === null ? -1 : StageKey.options.indexOf(stood),
      closed: outcome === 'won' ? 'done' : outcome === 'lost' ? 'dropped' : 'current',
      entryOf,
      /* A closed deal's `stage_since` is nulled on close, so its clock falls
         back to when it entered the rung it left from. */
      since: deal.stageSince ?? (stood === null ? null : (entryOf(stood)?.at ?? null)),
      until: outcome === 'lost' ? (deal.closedAt ?? now) : now,
      doneDays: (i) => lastOf(events, (e) => e.from === StageKey.options[i])?.daysInFrom ?? null,
      criteriaOf: (key) => gateStatesOf(rows, deal.code, key),
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
