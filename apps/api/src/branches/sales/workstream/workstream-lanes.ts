import {
  APPROVAL_STATE_LABEL,
  ContractRungKey,
  JourneyDealStop,
  JourneySubStep,
  JourneyWaitingDoor,
  LEAD_LANE_BACKBONE,
  StageKey,
  type JourneyContract,
  type JourneyDeal,
  type JourneyDealSubStep,
  type JourneyDoor,
  type JourneyDoorAnchor,
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
import { holderOf } from '../opportunity/opportunity.mapper'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import type { PhaseConfig } from '../ladder'
import type {
  ContractLaneRow,
  LaneRows,
  LeadTouchEntry,
  SignApprovalRow,
  StageEventRow,
} from './workstream-lanes.repository'
import type { WorkstreamRead } from './workstream.repository'

/** The journey detail, folded from rows already read — no SQL, no engine call
 *  beyond the pure due ladder. A rung's state compares its ladder index with
 *  the rung the object stands (or last stood) on; `stopped` is where it
 *  stopped. Rung labels never travel — the contract maps keys to words; only
 *  sub-steps carry a label, built from the contract's own tables. */

type Entry = { at: Date; by: WorkstreamHolder | null } | null

type Ladder<K extends string> = {
  keys: readonly K[]
  /** Rung the object stands or last stood on; -1 when nothing says which. */
  index: number
  /** What the stood-on rung reads as once the object stopped moving. */
  closed: Extract<JourneyRungState, 'current' | 'stopped' | 'done'>
  /** A passed rung nothing ever entered reads `skipped`, not a dateless `done`. */
  skipUnentered: boolean
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
/** No contract constant names the catch-all reason's words. */
const REASON_OTHER_LABEL = 'Khác'
/** ADR 0069 §3: the lead parked on a deal this reader may not open. */
const HIDDEN_DEAL_REASON = 'Cơ hội cuối đã dừng'

/** The `textInput(n)` cap a journey field declares, read off the contract. */
const capOf = (field: { out: { maxLength: number | null } }): number =>
  field.out.maxLength ?? Number.POSITIVE_INFINITY
const REASON_MAX = capOf(JourneyWaitingDoor.shape.reason)
const STOP_REASON_MAX = capOf(JourneyDealStop.shape.reason)
/** Both below what their doors accept (`OPPORTUNITY_STOP_NOTE_MAX`, a refusal's
 *  `textInput(500)`) — a contract mismatch; `clip` marks the cut. */
const STOP_NOTE_MAX = capOf(JourneyDealStop.shape.note.unwrap())
const NOTE_MAX = capOf(JourneySubStep.shape.note.unwrap())

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`

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

const personOf = (id: string | null, name: string | null): WorkstreamHolder | null =>
  id !== null && name !== null ? { id, name } : null

function rungsOf<K extends string>(l: Ladder<K>): Rung<K>[] {
  return l.keys.map((key, i) => {
    if (i > l.index) return { key, state: 'upcoming', at: null, by: null, days: null }

    const entry = l.entryOf(key)
    if (i < l.index && entry === null && l.skipUnentered) {
      return { key, state: 'skipped', at: null, by: null, days: null }
    }
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
  const deals = [...input.deals]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.code.localeCompare(b.code))
    .map((deal) => dealOf(deal, input))
  const lead = leadOf(read, input.all, rows, input.now, parkedOnDeal(input.all, deals, rows))

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
    deals,
    hiddenDeals: input.hidden,
    contracts: rows.contracts.map((c) => contractOf(c, rows, input.now, input.today)),
    doors: lead.door ? [lead.door] : [],
  }
}

/** Where the lead's door hangs when its last live deal was lost (ADR 0069
 *  §3): SQL says every deal is lost, and the latest to stop anchors it. A
 *  hidden latest deal yields `hidden`: the door keeps the lead's own anchor,
 *  a neutral reason and no concluder — the park's touch note is not read. */
type DealPark = { from: JourneyDoorAnchor; stop: JourneyDealStop } | 'hidden'

function parkedOnDeal(
  all: readonly OpportunityRowDb[],
  deals: JourneyDeal[],
  rows: LaneRows,
): DealPark | null {
  if (!rows.allLost || all.length === 0) return null
  const closed = (d: OpportunityRowDb): number => d.closedAt?.getTime() ?? 0
  const last = all.reduce((a, b) => (closed(b) > closed(a) ? b : a))
  const shown = deals.find((d) => d.code === last.code)
  if (!shown) return 'hidden'
  if (!shown.stop || last.stoppedAtStage === null) return null
  return { from: { code: last.code, rung: last.stoppedAtStage }, stop: shown.stop }
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

const touchHolder = (t: LeadTouchEntry): WorkstreamHolder | null => personOf(t.actorId, t.by)

/** The five backbone rungs, and the waiting door while the lead sits in
 *  `nurturing` (ADR 0068: it loops there on the same lead) — the ONLY waiting
 *  door: a lost deal draws none (ADR 0069). `disqualified` also stops the
 *  rung but opens no door — a person stopped caring. */
function leadOf(
  read: WorkstreamRead,
  deals: readonly OpportunityRowDb[],
  rows: LaneRows,
  now: Date,
  onDeal: DealPark | null,
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
    skipUnentered: false,
    entryOf,
    since,
    until: stoppedAt ?? now,
    doneDays,
  })

  const shown = onDeal === 'hidden' ? null : onDeal
  const why: Pick<JourneyDealStop, 'reason' | 'concludedBy'> =
    onDeal === 'hidden'
      ? { reason: HIDDEN_DEAL_REASON, concludedBy: null }
      : (shown?.stop ?? {
          reason: parkReasonOf(parked),
          concludedBy: parked ? touchHolder(parked) : null,
        })
  const door: JourneyDoor | null =
    lead.state !== 'nurturing'
      ? null
      : {
          kind: 'waiting',
          leadCode: lead.code,
          from: shown?.from ?? { code: lead.code, rung: LEAD_LANE_BACKBONE[index] ?? 'new' },
          at: (parked?.at ?? lead.stateSince).toISOString(),
          reason: clip(why.reason, REASON_MAX),
          concludedBy: why.concludedBy,
          /* A presale park is an `EXIT_REASON`; the flag lives on `LOSS_REASON` only (drizzle 0068). */
          doNotContact: shown?.stop.doNotContact ?? null,
          campaignName: read.campaignName,
          lastTouch: null,
        }

  return {
    lead: {
      code: lead.code,
      state: lead.state,
      holder: personOf(lead.ownerId, read.saleName),
      rungs,
    },
    door,
  }
}

/** A presale park's words. The touch note embeds the raw reason id since ADR
 *  0070, so it is read only for a park older than `reason_id`; 0067 migrated
 *  parks with no touch at all under the catch-all "other". */
function parkReasonOf(parked: LeadTouchEntry | null | undefined): string {
  if (!parked) return REASON_OTHER_LABEL
  if (parked.reasonId !== null) return parked.reasonName ?? REASON_OTHER_LABEL
  return parked.note
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

/** A stop is final (ADR 0069 §1): `lost` stands `stopped` on the rung its fail
 *  log names, and carries that log as `stop`. A step belongs to an open deal only — same rule as the deal's own
 *  next-step door, so a row the stop/sign door has not dropped yet never shows. */
function dealOf(deal: OpportunityRowDb, input: JourneyInput): JourneyDeal {
  const { rows, now } = input
  const events = rows.events.filter((e) => e.deal === deal.code)
  const signed = rows.contracts.filter((c) => c.deal === deal.code)
  const outcome = signed.length > 0 ? 'won' : deal.state === 'lost' ? 'lost' : 'open'
  const entryOf = (key: StageKey): Entry => {
    const e = lastOf(events, (x) => x.to === key)
    return e ? { at: e.at, by: { id: e.byId, name: e.by } } : null
  }
  const stood = deal.stage ?? deal.stoppedAtStage ?? lastStageOf(events)

  const rungs = rungsOf({
    keys: StageKey.options,
    index: stood === null ? -1 : StageKey.options.indexOf(stood),
    closed: outcome === 'won' ? 'done' : outcome === 'lost' ? 'stopped' : 'current',
    skipUnentered: true,
    entryOf,
    /* A closed deal's `stage_since` is nulled on close, so its clock falls
       back to when it entered the rung it left from. */
    since: deal.stageSince ?? (stood === null ? null : (entryOf(stood)?.at ?? null)),
    until: outcome === 'lost' ? (deal.closedAt ?? now) : now,
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
      subSteps: r.key === 'quotation' ? quotationStepsOf(deal.code, rows) : [],
    }
  })

  const holder = holderOf(rows.dealOwners.filter((o) => o.deal === deal.code))
  const step = input.steps.get(deal.code)

  return {
    code: deal.code,
    name: deal.name,
    holder,
    amount: vndOf(deal.amount, deal.currency),
    expectedClose: deal.expectedClose,
    outcome,
    outcomeAt: iso(
      outcome === 'won' ? (signed[0]?.signedAt ?? null) : outcome === 'lost' ? deal.closedAt : null,
    ),
    rungs,
    nextAction: step && outcome === 'open' ? toNextStep(step, input.today) : null,
    contractCodes: signed.map((c) => c.code),
    stop: outcome === 'lost' ? stopOf(deal, events, rows) : null,
  }
}

/** The quotation rung's drawer: one round per quote send, then each sign request,
 *  merged in time order (ADR 0069 §8). A decided request is `done` either way;
 *  `decision` says which way, and a refusal's reason rides as the note. */
function quotationStepsOf(dealCode: string, rows: LaneRows): JourneyDealSubStep[] {
  const sends = rows.quoteSends
    .filter((q) => q.deal === dealCode)
    .map((q, i) => ({ at: q.at, step: quoteSentStep(i + 1, q.at) }))
  const signs = rows.signApprovals
    .filter((a) => a.deal === dealCode)
    .map((a) => ({ at: a.decidedAt ?? a.raisedAt, step: signStep(a) }))
  return [...sends, ...signs].sort((a, b) => a.at.getTime() - b.at.getTime()).map((x) => x.step)
}

const quoteSentStep = (round: number, at: Date): JourneyDealSubStep => ({
  kind: 'quote-sent',
  round,
  label: `Gửi lần ${round}`,
  state: 'done',
  at: at.toISOString(),
  due: null,
  note: null,
  dueLevel: null,
})

/** `at` is when it was raised while waiting, when it was decided after. */
const signStep = (a: SignApprovalRow): JourneyDealSubStep => ({
  kind: 'sign-approval',
  approvalId: a.id,
  decision: a.state,
  label: `${APPROVAL_STATE_LABEL[a.state]} ký`,
  state: a.state === 'waiting' ? 'current' : 'done',
  at: (a.decidedAt ?? a.raisedAt).toISOString(),
  due: null,
  note: a.decidedReason ? clip(a.decidedReason, NOTE_MAX) : null,
  dueLevel: null,
})

/** The fail log of a lost deal. Never a raw config id: a key the catalogue
 *  does not hold (`'other'`, a retired entry) reads as the catch-all label, and the deal's own
 *  sentence travels only as `note`. Who concluded is the mover of the event
 *  that took the deal off the board. */
function stopOf(
  deal: OpportunityRowDb,
  events: readonly StageEventRow[],
  rows: LaneRows,
): JourneyDealStop {
  const known = deal.stopReason === null ? undefined : rows.stopReasons.get(deal.stopReason)
  const off = lastOf(events, (e) => e.to === null)
  return {
    reason: clip(known?.name ?? REASON_OTHER_LABEL, STOP_REASON_MAX),
    note: deal.stopNote ? clip(deal.stopNote, STOP_NOTE_MAX) : null,
    /* Null, not false, off the catalogue: nobody answered the question. */
    doNotContact: known?.doNotContact ?? null,
    concludedBy: off ? { id: off.byId, name: off.by } : null,
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
    kind: c.kind,
    amount: vndOf(c.amount, c.currency),
    signedAt: c.signedAt.toISOString(),
    holder: personOf(c.ownerId, c.ownerName),
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
