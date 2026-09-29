import {
  ContractRungKey,
  LEAD_LANE_BACKBONE,
  OPPORTUNITY_CARE_REASON_OTHER,
  StageKey,
  type JourneyContract,
  type JourneyDeal,
  type JourneyDoor,
  type JourneyLead,
  type JourneyRungState,
  type LeadState,
  type OpportunityOwner,
  type WorkstreamHolder,
  type WorkstreamJourneyResponse,
} from '@pv/contracts'
import { daysUntil, dueLevelOf, stepLevelOf } from '@pv/engines'
import { stateByWork } from '../lead/lead-state'
import type { LeadRowDb } from '../lead/lead.schema'
import { toContract as toNextStep } from '../next-step/next-step.mapper'
import type { NextStepBatchRead } from '../next-step/next-step.repository'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import type { PhaseConfig } from '../ladder'
import type {
  ContractLaneRow,
  LaneRows,
  LeadTouchEntry,
  StageEventRow,
} from './workstream-lanes.repository'
import type { WorkstreamRead } from './workstream.repository'

/** The journey detail, folded from rows already read — no SQL, no engine call
 *  beyond the pure due ladder. A rung's state compares its ladder index with
 *  the rung the object stands (or last stood) on; `stopped` is where it went
 *  to waiting. Labels never travel — the contract maps keys to words. */

type Entry = { at: Date; by: WorkstreamHolder | null } | null

type Ladder<K extends string> = {
  keys: readonly K[]
  /** Rung the object stands or last stood on; -1 when nothing says which. */
  index: number
  /** What the stood-on rung reads as once the object stopped moving. */
  closed: Extract<JourneyRungState, 'current' | 'stopped' | 'done'>
  entryOf: (key: K) => Entry
  since: Date | null
  /** Stop date for `stopped`, now for `current`. */
  until: Date
  doneDays: (i: number, entryAt: Date | null) => number | null
}

type Rung<K extends string> = {
  key: K
  state: JourneyRungState
  at: string | null
  by: WorkstreamHolder | null
  days: number | null
}

const DAY_MS = 86_400_000
/** `textInput(200)` on every door reason; a longer free note is clipped, not refused. */
const REASON_MAX = 200
const REASON_OTHER_LABEL = 'Khác'

/** Calendar days between two instants, the book's own count (`daysUntil`). */
const wholeDays = (from: Date | null, to: Date | null): number | null =>
  from === null || to === null ? null : Math.max(0, daysUntil(to.toISOString(), from.toISOString()))

/** `Array.prototype.findLast` is past the api's `lib` target. */
function lastOf<T>(list: readonly T[], hit: (x: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (hit(list[i] as T)) return list[i]
  return undefined
}

const iso = (d: Date | null): string | null => d?.toISOString() ?? null

/** A foreign amount printed as dong (VND) is worse than a blank. */
const vndOf = (amount: number | null, currency: string | null): number | null =>
  currency === 'VND' ? amount : null

const holderOf = (id: string | null, name: string | null): WorkstreamHolder | null =>
  id !== null && name !== null ? { id, name } : null

function rungsOf<K extends string>(l: Ladder<K>): Rung<K>[] {
  return l.keys.map((key, i) => {
    if (i > l.index) return { key, state: 'upcoming', at: null, by: null, days: null }

    const entry = l.entryOf(key)
    if (i < l.index) {
      const at = entry?.at ?? null
      return { key, state: 'done', at: iso(at), by: entry?.by ?? null, days: l.doneDays(i, at) }
    }

    const at = entry?.at ?? l.since
    const days = l.closed === 'done' ? l.doneDays(i, at) : wholeDays(l.since, l.until)
    return { key, state: l.closed, at: iso(at), by: entry?.by ?? null, days }
  })
}

export type JourneyInput = {
  read: WorkstreamRead
  ordinal: number
  /** Every deal of the run — the lead's `converted` rung is a fact about the lead. */
  all: readonly OpportunityRowDb[]
  /** Only the deals this reader may open. */
  deals: readonly OpportunityRowDb[]
  hidden: number
  owners: Map<string, OpportunityOwner[]>
  rows: LaneRows
  steps: Map<string, NextStepBatchRead>
  stage: Map<StageKey, PhaseConfig>
  now: Date
  /** Vietnam calendar day (`YYYY-MM-DD`) every due level is graded against. */
  today: string
}

export function journeyOf(input: JourneyInput): WorkstreamJourneyResponse {
  const { read, rows } = input
  const { row } = read
  const lead = leadOf(read, input.all, rows, input.now)
  const deals = [...input.deals]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.code.localeCompare(b.code))
    .map((deal) => dealOf(deal, input))

  return {
    code: row.code,
    ordinal: input.ordinal,
    customer: read.accountName ?? read.lead.company,
    accountCode: row.accountCode,
    status: row.closedAt === null ? 'open' : 'closed',
    closeReason: row.closeReason ?? null,
    openedAt: row.openedAt.toISOString(),
    closedAt: iso(row.closedAt),
    /* No table links one run to the next yet. */
    previous: null,
    next: [],
    lead: lead.lead,
    deals: deals.map((d) => d.deal),
    hiddenDeals: input.hidden,
    contracts: rows.contracts.map((c) => contractOf(c, rows, input.now, input.today)),
    doors: [lead.door, ...deals.map((d) => d.door)].filter((d): d is JourneyDoor => d !== null),
  }
}

/** A backbone rung, and the touch that puts the lead on it. `assigned` answers
 *  to `created` as well: a lead born with a holder was never handed over.
 *  Two kinds each for `verifying`/`working`, legacy beside new (ADR 0063 §5). */
type LeadRungKey = (typeof LEAD_LANE_BACKBONE)[number]

const RUNG_HIT: Record<LeadRungKey, (t: LeadTouchEntry) => boolean> = {
  new: (t) => t.kind === 'created',
  assigned: (t) => (t.kind === 'handed-over' || t.kind === 'created') && t.to !== null,
  verifying: (t) => t.kind === 'first-action' || t.kind === 'care-planned',
  working: (t) => t.kind === 'verified' || t.kind === 'exchange-logged',
  converted: (t) => t.kind === 'entered-pipeline',
}

const touchHolder = (t: LeadTouchEntry): WorkstreamHolder | null => holderOf(t.actorId, t.by)

/** The five backbone rungs, and the waiting door while the lead sits in
 *  `nurturing` (ADR 0068: it loops there on the same lead). `disqualified`
 *  also stops the rung but opens no door — a person stopped caring. */
function leadOf(
  read: WorkstreamRead,
  deals: readonly OpportunityRowDb[],
  rows: LaneRows,
  now: Date,
): { lead: JourneyLead; door: JourneyDoor | null } {
  const { lead } = read
  const trail = rows.leadTouches
  const firstDeal = deals.reduce<Date | null>(
    (min, d) => (min === null || d.createdAt < min ? d.createdAt : min),
    null,
  )

  /* FIRST hit, not last: a rung is entered once, while `handed-over` fires
     again every time the lead changes hands afterwards. */
  const entryOf = (key: LeadRungKey): Entry => {
    const hit = trail.find(RUNG_HIT[key])
    if (hit) return { at: hit.at, by: touchHolder(hit) }
    return key === 'new' ? { at: lead.createdAt, by: null } : null
  }

  const parked = lead.state === 'nurturing' ? lastOf(trail, (t) => t.kind === 'nurtured') : null
  const stoppedAt =
    lead.state === 'disqualified'
      ? (lastOf(trail, (t) => t.kind === 'exited')?.at ?? lead.exitedAt ?? lead.stateSince)
      : lead.state === 'nurturing'
        ? (parked?.at ?? lead.stateSince)
        : null
  const outcomeAt = stoppedAt ?? firstDeal

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

  const rungs = rungsOf({
    keys: LEAD_LANE_BACKBONE,
    index,
    closed: stoppedAt ? 'stopped' : firstDeal ? 'done' : 'current',
    entryOf,
    since,
    until: stoppedAt ?? now,
    doneDays,
  })

  const door: JourneyDoor | null =
    lead.state !== 'nurturing'
      ? null
      : {
          kind: 'waiting',
          leadCode: lead.code,
          from: { code: lead.code, rung: LEAD_LANE_BACKBONE[index] ?? 'new' },
          at: (parked?.at ?? lead.stateSince).toISOString(),
          /* A lead parked before the `nurtured` touch existed has no note;
             0067 migrated those under the catch-all "other" reason. */
          reason: (parked?.note ?? REASON_OTHER_LABEL).slice(0, REASON_MAX),
          concludedBy: parked ? touchHolder(parked) : null,
          doNotContact: null,
          campaignName: read.campaignName,
          lastTouch: null,
        }

  return {
    lead: { code: lead.code, holder: holderOf(lead.ownerId, read.saleName), rungs },
    door,
  }
}

/** Which rung the lead is DRAWN on. `nurturing` parks it exactly where
 *  `LeadExitService.resume` would put it back — the same `stateByWork`, off
 *  the fact that an exchange was once logged (ADR 0063 §4). A lead that LEFT
 *  stands on the last rung its trail proves it reached. */
function standingOn(lead: LeadRowDb, entryOf: (key: LeadRungKey) => Entry): number {
  if (lead.state === 'nurturing') {
    return LEAD_LANE_BACKBONE.indexOf(stateByWork(entryOf('working') !== null))
  }
  const onBackbone = (LEAD_LANE_BACKBONE as readonly LeadState[]).indexOf(lead.state)
  if (onBackbone >= 0) return onBackbone

  let reached = 0
  for (let i = 0; i < LEAD_LANE_BACKBONE.length; i++) {
    if (entryOf(LEAD_LANE_BACKBONE[i] ?? 'new') !== null) reached = i
  }
  return reached
}

/** `care` is drawn as `waiting`, NEVER a loss: the care list is reversible
 *  (ADR 0064) and every presale stop becomes a waiting lead (ADR 0067). */
function dealOf(
  deal: OpportunityRowDb,
  input: JourneyInput,
): { deal: JourneyDeal; door: JourneyDoor | null } {
  const { rows, now } = input
  const events = rows.events.filter((e) => e.deal === deal.code)
  const signed = rows.contracts.filter((c) => c.deal === deal.code)
  const outcome = signed.length > 0 ? 'won' : deal.state === 'care' ? 'waiting' : 'open'
  const entryOf = (key: StageKey): Entry => {
    const e = lastOf(events, (x) => x.to === key)
    return e ? { at: e.at, by: { id: e.byId, name: e.by } } : null
  }
  const stood = deal.stage ?? deal.careFromStage ?? lastStageOf(events)

  const rungs = rungsOf({
    keys: StageKey.options,
    index: stood === null ? -1 : StageKey.options.indexOf(stood),
    closed: outcome === 'won' ? 'done' : outcome === 'waiting' ? 'stopped' : 'current',
    entryOf,
    /* A closed deal's `stage_since` is nulled on close, so its clock falls
       back to when it entered the rung it left from. */
    since: deal.stageSince ?? (stood === null ? null : (entryOf(stood)?.at ?? null)),
    until: outcome === 'waiting' ? (deal.closedAt ?? now) : now,
    doneDays: (i) => lastOf(events, (e) => e.from === StageKey.options[i])?.daysInFrom ?? null,
  }).map((r) => {
    const limit = input.stage.get(r.key)?.limitDays ?? null
    const limitDays = limit !== null && limit > 0 ? limit : null
    /* The stage clock ends `limitDays` after entry, graded by `stepLevelOf`:
       the same three levels the opportunity book uses, not the contract band. */
    const clockEnd =
      r.state === 'current' && limitDays !== null && deal.stageSince !== null
        ? new Date(deal.stageSince.getTime() + limitDays * DAY_MS).toISOString()
        : null
    return {
      ...r,
      limitDays,
      dueLevel: clockEnd ? stepLevelOf(clockEnd, input.today) : null,
      subSteps: [],
    }
  })

  const sale = (input.owners.get(deal.code) ?? []).find((o) => o.role === 'SALE')
  const step = input.steps.get(deal.code)

  return {
    deal: {
      code: deal.code,
      name: deal.name,
      holder: sale ? { id: sale.id, name: sale.name } : null,
      amount: vndOf(deal.amount, deal.currency),
      expectedClose: deal.expectedClose,
      outcome,
      outcomeAt: iso(
        outcome === 'won'
          ? (signed[0]?.signedAt ?? null)
          : outcome === 'waiting'
            ? deal.closedAt
            : null,
      ),
      rungs,
      nextAction: step ? toNextStep(step, input.today) : null,
      contractCodes: signed.map((c) => c.code),
    },
    door: outcome === 'waiting' ? careDoorOf(deal, events, rows) : null,
  }
}

/** The waiting door of a cared-for deal. `closed_at` and `care_from_stage` are
 *  non-null in `care` (CHECK, drizzle 0061); the guard only narrows the type.
 *  Who concluded is the mover of the event that took the deal off the board. */
function careDoorOf(
  deal: OpportunityRowDb,
  events: readonly StageEventRow[],
  rows: LaneRows,
): JourneyDoor | null {
  if (deal.closedAt === null || deal.careFromStage === null) return null
  const key = deal.careReason
  const reason =
    key === null
      ? REASON_OTHER_LABEL
      : (rows.careReasons.get(key) ??
        (key === OPPORTUNITY_CARE_REASON_OTHER ? (deal.careNote ?? REASON_OTHER_LABEL) : key))
  const off = lastOf(events, (e) => e.to === null)

  return {
    kind: 'waiting',
    leadCode: deal.leadCode,
    from: { code: deal.code, rung: deal.careFromStage },
    at: deal.closedAt.toISOString(),
    reason: reason.slice(0, REASON_MAX),
    concludedBy: off ? { id: off.byId, name: off.by } : null,
    doNotContact: null,
    campaignName: null,
    lastTouch: null,
  }
}

/** The rung a closed deal left from — its stage column is null by then. */
function lastStageOf(events: readonly StageEventRow[]): StageKey | null {
  let stood: StageKey | null = null
  for (const e of events) stood = e.to ?? e.from ?? stood
  return stood
}

/** Only `signed` and `collect` have a source today; deploy, accept and done
 *  stay `upcoming` until their tables exist. `collect` reads the schedule:
 *  all paid → done, some → current. */
function contractOf(c: ContractLaneRow, rows: LaneRows, now: Date, today: string): JourneyContract {
  const schedule = rows.installments.filter((i) => i.contractCode === c.code)
  const paid = schedule
    .map((i) => i.paidAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())
  const firstPaid = paid[0] ?? null
  const collect: JourneyRungState =
    paid.length === 0 ? 'upcoming' : paid.length === schedule.length ? 'done' : 'current'
  const collectEnd = collect === 'done' ? (paid[paid.length - 1] ?? null) : now

  const rungs = ContractRungKey.options.map((key) => {
    if (key === 'signed') {
      return { key, state: 'done' as const, at: c.signedAt.toISOString(), by: null, days: null }
    }
    if (key === 'collect' && collect !== 'upcoming') {
      return {
        key,
        state: collect,
        at: iso(firstPaid),
        by: null,
        days: wholeDays(firstPaid, collectEnd),
      }
    }
    return { key, state: 'upcoming' as const, at: null, by: null, days: null }
  })

  return {
    code: c.code,
    dealCode: c.deal,
    kind: null,
    amount: vndOf(c.amount, c.currency),
    signedAt: c.signedAt.toISOString(),
    holder: holderOf(c.ownerId, c.ownerName),
    implementer: null,
    rungs,
    milestones: [],
    acceptance: [],
    installments: schedule.map((i) => ({
      no: i.no,
      label: i.label,
      share: i.share,
      amount: i.amount,
      due: i.due.toISOString(),
      invoiceNo: null,
      invoicedAt: null,
      paidAt: iso(i.paidAt),
      paidAmount: i.paidAt ? i.amount : null,
      dueLevel: dueLevelOf(i.due.toISOString(), today, iso(i.paidAt) ?? undefined),
    })),
    licence: null,
  }
}
