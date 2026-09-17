import { z } from 'zod'
import { PageQuery, SortDir, paged } from '../pagination'
import { ObjectChainLink, PipelinePositionView } from '../position'
import { Moment, ObjectCode, textInput } from '../primitives'
import { LeadSourceKind, WorkstreamCloseReason } from './enums'
import { GateCriterionState } from './stage-gate'

/** Workstream — `GET /sales/workstreams`. One row per CUSTOMER JOURNEY: the
 *  lead, its opportunities and the contracts that came out of ONE run at ONE
 *  company.
 *
 *  `closedAt` is the field that makes a journey a RUN and not a company's
 *  whole lifetime — the same account may open a second workstream years
 *  later, and the two must not collapse into one endless row. `closeReason`
 *  is null exactly when `closedAt` is: see `WorkstreamCloseReason` in
 *  `./enums`.
 *
 *  `accountCode` is nullable because a run often opens before anybody knows
 *  which company it belongs to — the same fact `LeadAccountAttach` in
 *  `./account` exists to correct later. */

// ---------------------------------------------------------------------------
// THE COLUMN THREE OTHER TABLES GAIN — NOT PART OF THIS FILE'S WIRE SHAPE
// ---------------------------------------------------------------------------

/** `lead.workstream_code` / `opportunity.workstream_code` /
 *  `contract.workstream_code` — all NULLABLE, not `NOT NULL`.
 *
 *  Migrations 0045/0048 give every lead one run and copy it down; the lead
 *  doors mint one per new lead, and the deal and contract doors copy it. The
 *  column stays nullable so no write door can be refused over a missing run. */

// ---------------------------------------------------------------------------
// WHERE THE JOURNEY STANDS
// ---------------------------------------------------------------------------

/** Which door the live object opens. Closed rather than free text, the same
 *  law every enum in `./enums` states — a value outside the three dies at the
 *  zod gate naming the field. */
export const WorkstreamStandKind = z.enum(
  ['LD', 'OP', 'HĐ'],
  'Loại đối tượng không có trong danh sách',
)

/** Which object is the live one, and its phase's display label.
 *
 *  `code` is not `ObjectCode`: a contract code does not match that regex —
 *  see `ContractCode`'s own docblock for why. `phaseLabel` is
 *  resolved server-side from `config_entry`, the same move
 *  `OpportunityStageBucket.label` makes, so the screen never holds three
 *  fixtures' worth of phase names to print one cell. */
export const WorkstreamStand = z.object({
  code: z.string().min(1).max(20),
  kind: WorkstreamStandKind,
  phaseLabel: textInput(120),
})

// ---------------------------------------------------------------------------
// WHO HOLDS IT — TWO ROLES, NOT ONE
// ---------------------------------------------------------------------------

/** One person holding a role on the journey. Id AND name, same pairing
 *  `OpportunityOwner` carries and for the same reason: E2's `ownOnly` axis
 *  compares display NAMES today (a known, unpaid debt), so nothing here may
 *  depend on a name being unique — the id is the only safe key. */
export const WorkstreamHolder = z.object({
  id: z.string().min(1).max(64),
  name: textInput(120),
})

// ---------------------------------------------------------------------------
// THE COMMUNICATION FOOTPRINT — three ledgers merged, one excluded on purpose
// ---------------------------------------------------------------------------

/** Where the footprint is counted from.
 *
 *  `comms.message` and `sales.meeting` speak for themselves. `mail` is
 *  `platform.email_delivery` FILTERED to rows whose `aggregate_type` is not
 *  `'opportunity'` — that column also carries internal alerts to our own
 *  desk, not customer contact. Deliberately excluded: `sales.touch` — it logs
 *  business EVENTS (`created`, `tier-raised`), not conversations, and has no
 *  channel or direction to bucket by. Reaching for touch here is reaching for
 *  the wrong ledger. */
export const WorkstreamChannel = z.enum(
  ['email', 'zalo-oa', 'telegram', 'phone', 'in-app', 'meeting', 'mail'],
  'Kênh không có trong danh sách',
)

/** A count for EVERY channel, not only the ones that fired — so the screen
 *  prints seven cells straight off the object, with no channel left to
 *  default to zero itself. Same reasoning `OpportunityHistogram` states for
 *  its buckets, exhaustive here because the set of seven is fixed and known
 *  rather than open-ended. */
export const WorkstreamFootprint = z.object({
  byChannel: z.record(WorkstreamChannel, z.number().int().nonnegative()),
  lastContactedAt: Moment.nullable(),
})

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One row of the workstream book. */
export const WorkstreamRow = z.object({
  code: ObjectCode,
  customer: textInput(200),
  accountCode: ObjectCode.nullable(),

  openedAt: Moment,
  closedAt: Moment.nullable(),
  closeReason: WorkstreamCloseReason.nullable(),

  stand: WorkstreamStand,

  /** `daysHere − limitDays` of the live opportunity, and null for every other
   *  rung. NULL ON PURPOSE, and it means "nobody has set a deadline for the
   *  rung this journey stands on", never "on time": a lead's ladder (`TIER`)
   *  carries no `limitDays` at all, and a closed opportunity has no
   *  `stage`/`stage_since` to measure from. Printing 0 or "OK" for either
   *  would be the screen lying on the server's behalf. */
  overdueBy: z.number().int().nullable(),

  saleHolder: WorkstreamHolder.nullable(),
  bdHolder: WorkstreamHolder.nullable(),

  /** Reused, not re-declared: `PipelinePositionView.shape.waitingOn` in
   *  `../position` already mirrors E1's `WaitingOn` field-for-field.
   *  Contracts may not import `@pv/engines` (`eslint.config.js`), so this
   *  borrows the shape already living on this side of that fence rather than
   *  drawing a second copy that could drift from the first. */
  waitingOn: PipelinePositionView.shape.waitingOn,

  footprint: WorkstreamFootprint,
})

// ---------------------------------------------------------------------------
// ASKING THE BOOK A NARROWER QUESTION
// ---------------------------------------------------------------------------

/** The book's one required filter. `all` exists because a closed journey is
 *  still worth finding — the same argument `LeadStatus` makes for `exited`. */
export const WorkstreamStatus = z.enum(['open', 'closed', 'all'])

export const WorkstreamSortKey = z.enum(['openedAt', 'customer'])

/** `GET /sales/workstreams`. Server-side paging, filtering and sorting —
 *  the same arithmetic `LeadBookQuery` and `OpportunityBookQuery` already
 *  state: a filter left on the client only filters whatever page the server
 *  happened to send for page 1. */
export const WorkstreamBookQuery = PageQuery.extend({
  status: WorkstreamStatus.default('open'),
  accountCode: ObjectCode.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  sort: WorkstreamSortKey.default('openedAt'),
  dir: SortDir.default('desc'),
})

export const WorkstreamBookResponse = paged(WorkstreamRow)

// ---------------------------------------------------------------------------
// THE PROFILE — swimlanes: one lead lane, one lane per deal, one account lane
// ---------------------------------------------------------------------------

/** The four states the screen legend prints, one per dot colour. */
export const WorkstreamStepState = z.enum(
  ['done', 'current', 'dropped', 'upcoming'],
  'Trạng thái bước không có trong danh sách',
)

/** One rung of a lane. `key` is a `StageKey` or `LeadTier` value, left as a
 *  string because one step shape serves both ladders; `label` comes from
 *  `config_entry`. `at` is when the rung was entered — null for upcoming or a
 *  skipped rung. `by` is the mover's name snapshotted then. */
export const WorkstreamStep = z.object({
  key: z.string().min(1).max(40),
  label: textInput(120),
  state: WorkstreamStepState,
  at: Moment.nullable(),
  by: textInput(120).nullable(),
  /** Recorded for done/dropped, counted to now for current, null for upcoming. */
  days: z.number().int().nonnegative().nullable(),
  /** Always `[]` on lead steps — the gate is an opportunity ladder only. */
  criteria: z.array(GateCriterionState),
})

/** `converted` = the lead produced at least one deal (`outcomeAt` = the first);
 *  `exited` = `lead.exited_at`. */
export const WorkstreamLeadOutcome = z.enum(['converted', 'exited', 'open'])

export const WorkstreamLeadLane = z.object({
  code: ObjectCode,
  sourceKind: LeadSourceKind.nullable(),
  owner: WorkstreamHolder.nullable(),
  steps: z.array(WorkstreamStep),
  outcome: WorkstreamLeadOutcome,
  outcomeAt: Moment.nullable(),
})

export const WorkstreamDealOutcome = z.enum(['won', 'lost', 'open'])

export const WorkstreamDealLane = z.object({
  code: ObjectCode,
  /** The first sale owner. */
  owner: WorkstreamHolder.nullable(),
  steps: z.array(WorkstreamStep),
  outcome: WorkstreamDealOutcome,
  outcomeAt: Moment.nullable(),
  /** Not `ObjectCode`: a contract code fails that regex, as `WorkstreamStand.code` notes. */
  contractCode: z.string().min(1).max(20).nullable(),
})

/** `code` is null while the run has no company yet. `purchased` = at least one
 *  deal of the run is signed, including deals not listed in `deals`. */
export const WorkstreamAccountLane = z.object({
  code: ObjectCode.nullable(),
  name: textInput(200).nullable(),
  owner: WorkstreamHolder.nullable(),
  purchased: z.boolean(),
})

/** `GET /sales/workstreams/:code` — the book row, the object chain for
 *  ContextRail (server-walked via `E1.story()`, never assembled by a screen),
 *  and the lanes. `deals` is oldest first and holds only deals the reader may
 *  open — the run is scoped by the lead, a deal by its own owners — and
 *  `hiddenDeals` counts the ones cut. */
export const WorkstreamProfileResponse = WorkstreamRow.extend({
  chain: z.array(ObjectChainLink),
  lead: WorkstreamLeadLane,
  deals: z.array(WorkstreamDealLane),
  hiddenDeals: z.number().int().nonnegative(),
  account: WorkstreamAccountLane,
})

export type WorkstreamStandKind = z.infer<typeof WorkstreamStandKind>
export type WorkstreamStand = z.infer<typeof WorkstreamStand>
export type WorkstreamHolder = z.infer<typeof WorkstreamHolder>
export type WorkstreamChannel = z.infer<typeof WorkstreamChannel>
export type WorkstreamFootprint = z.infer<typeof WorkstreamFootprint>
export type WorkstreamRow = z.infer<typeof WorkstreamRow>
export type WorkstreamStatus = z.infer<typeof WorkstreamStatus>
export type WorkstreamSortKey = z.infer<typeof WorkstreamSortKey>
export type WorkstreamBookQuery = z.infer<typeof WorkstreamBookQuery>
export type WorkstreamBookResponse = z.infer<typeof WorkstreamBookResponse>
export type WorkstreamStepState = z.infer<typeof WorkstreamStepState>
export type WorkstreamStep = z.infer<typeof WorkstreamStep>
export type WorkstreamLeadOutcome = z.infer<typeof WorkstreamLeadOutcome>
export type WorkstreamLeadLane = z.infer<typeof WorkstreamLeadLane>
export type WorkstreamDealOutcome = z.infer<typeof WorkstreamDealOutcome>
export type WorkstreamDealLane = z.infer<typeof WorkstreamDealLane>
export type WorkstreamAccountLane = z.infer<typeof WorkstreamAccountLane>
export type WorkstreamProfileResponse = z.infer<typeof WorkstreamProfileResponse>
