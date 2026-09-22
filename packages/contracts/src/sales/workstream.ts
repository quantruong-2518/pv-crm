import { z } from 'zod'
import { PageQuery, SortDir, paged } from '../pagination'
import { ObjectChainLink, PipelinePositionView } from '../position'
import { Moment, ObjectCode, textInput } from '../primitives'
import {
  ExitReason,
  LeadSourceKind,
  type LeadState,
  LeadTier,
  WorkstreamCloseReason,
} from './enums'

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
  /** The rung's MACHINE key, same shape as `WorkstreamStep.key`: a `StageKey`
   *  when `kind` is `OP`, a `LeadState` when `LD`, and `'signed'` for the
   *  contract kind.
   *  The board groups columns by this and never by `phaseLabel` — a label is
   *  translatable text owned by `config_entry`, so grouping by it means one
   *  catalogue rename silently splits or merges columns. */
  key: z.string().min(1).max(40),
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
  /** The customer-side person to call. From `sales.lead.contact_name`, a
   *  `notNull` column, so never nullable here. */
  contact: textInput(120),
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

/** `priority` is one composite ladder, not a column: `overdueBy` descending
 *  with nulls last, then journeys already past their deadline while waiting on
 *  somebody else, then the oldest `lastContactedAt` with never-contacted runs
 *  first, then the oldest `openedAt`. The rungs are declared in `@pv/engines`
 *  and the repository translates them to SQL mechanically — this contract only
 *  names the ladder so the URL can ask for it. No threshold lives here. */
export const WorkstreamSortKey = z.enum(['openedAt', 'customer', 'priority', 'lastContactedAt'])

/** `GET /sales/workstreams`. Server-side paging, filtering and sorting —
 *  the same arithmetic `LeadBookQuery` and `OpportunityBookQuery` already
 *  state: a filter left on the client only filters whatever page the server
 *  happened to send for page 1. */
export const WorkstreamBookQuery = PageQuery.extend({
  status: WorkstreamStatus.default('open'),
  accountCode: ObjectCode.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  /** The board's "this column only" filter — each column is one call to the
   *  same book door, so a column pages and sorts like any other view instead
   *  of needing a door of its own. */
  standKind: WorkstreamStandKind.optional(),
  standKey: z.string().min(1).max(40).optional(),
  /** The dropped step's filter — it groups by WHY a run closed, not by the
   *  rung it stands on. Only meaningful with `status` `closed` or `all`: an
   *  open run has no close reason at all, the invariant the DB already holds
   *  as `CHECK workstream_close_pair`. */
  closeReason: WorkstreamCloseReason.optional(),
  sort: WorkstreamSortKey.default('priority'),
  dir: SortDir.default('desc'),
})

export const WorkstreamBookResponse = paged(WorkstreamRow)

/** One board column, tagged by WHICH question fetched it, because the first
 *  three steps group by the rung a live run stands on and the dropped step
 *  groups by why a closed run ended. The tag carries exactly the book-door
 *  params for that column and nothing else, so a reader never has to infer
 *  them from `key` — `status` included, because a signed run is a CLOSED run
 *  and its column would read 0 forever under the view's own filter. `total`
 *  is the whole book's count in that column — a `GROUP BY` at the DB, not the
 *  length of a page the screen holds. */
export const WorkstreamBoardColumn = z.discriminatedUnion('by', [
  z.object({
    by: z.literal('stand'),
    kind: WorkstreamStandKind,
    key: z.string().min(1).max(40),
    status: WorkstreamStatus,
    label: textInput(120),
    total: z.number().int().nonnegative(),
  }),
  z.object({
    by: z.literal('closeReason'),
    closeReason: WorkstreamCloseReason,
    status: WorkstreamStatus,
    label: textInput(120),
    total: z.number().int().nonnegative(),
  }),
])

/** `GET /sales/workstreams/board` — the column catalogue in ladder order, the
 *  screen then asks the book door once per column. The server returns columns
 *  ONLY for the steps that have a book behind them (lead, opportunity,
 *  `signed`, and the dropped step off `close_reason`); for a step with no book
 *  it returns nothing rather than an empty column, because a zero that means
 *  "no data yet" and a zero that means "none here" are different facts. The
 *  screen draws its own "not built yet" placeholder from
 *  `WORKSTREAM_JOURNEY_STEPS`. Every column names the status it was counted
 *  under, and the screen asks the book door with that one, not the view's. */
export const WorkstreamBoardResponse = z.object({
  columns: z.array(WorkstreamBoardColumn),
})

// ---------------------------------------------------------------------------
// THE PROFILE — swimlanes: one lead lane, one lane per deal, one account lane
// ---------------------------------------------------------------------------

/** The five states the screen legend prints, one per dot colour. `parked` is a
 *  rung a CARE-listed deal stopped on — reversible, so it draws quiet, never
 *  the red `dropped` reserved for a lead that truly exited (ADR 0064 §6). */
export const WorkstreamStepState = z.enum(
  ['done', 'current', 'dropped', 'parked', 'upcoming'],
  'Trạng thái bước không có trong danh sách',
)

/** One rung of a lane. `key` is a `StageKey` value (`new` … `quotation`) on a
 *  deal lane or one of `LEAD_LANE_BACKBONE` on a lead lane, left as a string
 *  because one step shape serves both ladders. `label` comes from `config_entry`
 *  for the deal ladder, falling back to `OPPORTUNITY_STAGE_LABEL`; on a lead
 *  lane it is the matching `LEAD_STATE_LABEL` entry. `at` is when the rung was
 *  entered — null for upcoming or a skipped rung. `by` is the mover's name
 *  snapshotted then. */
export const WorkstreamStep = z.object({
  key: z.string().min(1).max(40),
  label: textInput(120),
  state: WorkstreamStepState,
  at: Moment.nullable(),
  by: textInput(120).nullable(),
  /** Recorded for done/dropped, counted to now for current, null for upcoming. */
  days: z.number().int().nonnegative().nullable(),
})

/** `converted` = the lead produced at least one deal (`outcomeAt` = the first);
 *  `exited` = the lead left the backbone, `disqualified` OR `archived`. Not
 *  `lead.exited_at` alone: that column pairs with `disqualified` only, and an
 *  archived lead has none. */
export const WorkstreamLeadOutcome = z.enum(['converted', 'exited', 'open'])

/** The five backbone rungs, in order, and no others — every lead lane draws
 *  exactly this ladder so any two leads sit side by side and compare (ADR
 *  0058). Declared once so the API's writer and this contract agree on which
 *  five. The `verifying` rung is entered by touch kind `care-planned` or legacy
 *  `first-action`; `working` by `exchange-logged` or legacy `verified`. */
export const LEAD_LANE_BACKBONE = [
  'new',
  'assigned',
  'verifying',
  'working',
  'converted',
] as const satisfies readonly LeadState[]

/** The six journey steps in order — level one of the board, above the rungs
 *  each step's book supplies. Declared once here for the same reason
 *  `LEAD_LANE_BACKBONE` is: both ends read it, the screen to draw the six and
 *  the API to know which of them has a book. `after-sale` and `growth` have no
 *  book yet, so the board door returns no column for them and the screen draws
 *  the placeholder; no flag marks that — the absent column already says it. */
export const WORKSTREAM_JOURNEY_STEPS = [
  { key: 'lead', label: 'Lead' },
  { key: 'opportunity', label: 'Cơ hội' },
  { key: 'contract', label: 'Hợp đồng' },
  { key: 'after-sale', label: 'Sau bán' },
  { key: 'growth', label: 'Tăng trưởng' },
  { key: 'dropped', label: 'Rơi' },
] as const

/** The nurture loop, attached to the `working` rung rather than drawn as a rung
 *  of its own — ADR 0058 parks a lead in `nurturing`, it does not advance it.
 *  Null means this lead has never been parked. `count`/`totalDays` cover every
 *  stay, closed or open; `since` is only the CURRENT stay's start, null once
 *  the lead is back on the backbone. */
export const WorkstreamLeadNurture = z.object({
  count: z.number().int().nonnegative(),
  totalDays: z.number().int().nonnegative(),
  since: Moment.nullable(),
})

/** How a lead actually left the backbone. Null on a lane that never left —
 *  deliberately absent rather than two ever-present dropped/archived cells,
 *  which made a lead still being worked look like an exit was pending. `reason`
 *  is set for `disqualified` and null for `archived`: the system retires a lead
 *  on a timer, it does not choose among `ExitReason`. */
export const WorkstreamLeadExit = z.object({
  state: z.enum(['disqualified', 'archived']),
  at: Moment,
  by: textInput(120).nullable(),
  reason: ExitReason.nullable(),
})

/** The lead lane: a fixed five-rung backbone (`LEAD_LANE_BACKBONE`) so every
 *  lead lines up the same way, plus two things that happen ALONGSIDE the
 *  backbone rather than on it — `nurture`, a loop that can return the lead to
 *  `working`, and `exit`, which is present only once a lead has actually left.
 *  `tier` rides on the lane rather than being read off a `LeadRow`: this screen
 *  never holds one, so fetching the lead door would cost a round trip to print
 *  one badge. It is an optional field independent of state, not a rung. It, `sourceKind` and
 *  `campaignName` are lead facts reaching a reader who only proved
 *  `workstream.view` — safe while no role holds that without `lead.view`, and
 *  the thing to re-check the day somebody builds a journey-only role. `campaignName` is null for a lead typed in by hand —
 *  the same absence `LeadSource.campaignId` states in `./lead-source`. */
export const WorkstreamLeadLane = z.object({
  code: ObjectCode,
  sourceKind: LeadSourceKind.nullable(),
  campaignName: textInput(120).nullable(),
  tier: LeadTier.nullable(),
  owner: WorkstreamHolder.nullable(),
  steps: z.array(WorkstreamStep),
  nurture: WorkstreamLeadNurture.nullable(),
  exit: WorkstreamLeadExit.nullable(),
  outcome: WorkstreamLeadOutcome,
  outcomeAt: Moment.nullable(),
})

/** `care` is a LIVE, reversible parking state (ADR 0064's
 *  `sales.opportunity.state = 'care'`) — a deal there can still be
 *  reactivated, so it must not collapse into `lost`. `lost` is kept for a
 *  truly closed loss; under the current lifecycle no writer produces it
 *  (`OpportunityState` only carries `open`/`care` before `won` — see
 *  `./opportunity`), so it is dead until a real terminal-loss state exists. */
export const WorkstreamDealOutcome = z.enum(['won', 'care', 'lost', 'open'])

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
export type WorkstreamBoardColumn = z.infer<typeof WorkstreamBoardColumn>
export type WorkstreamBoardResponse = z.infer<typeof WorkstreamBoardResponse>
export type WorkstreamStepState = z.infer<typeof WorkstreamStepState>
export type WorkstreamStep = z.infer<typeof WorkstreamStep>
export type WorkstreamLeadOutcome = z.infer<typeof WorkstreamLeadOutcome>
export type WorkstreamLeadNurture = z.infer<typeof WorkstreamLeadNurture>
export type WorkstreamLeadExit = z.infer<typeof WorkstreamLeadExit>
export type WorkstreamLeadLane = z.infer<typeof WorkstreamLeadLane>
export type WorkstreamDealOutcome = z.infer<typeof WorkstreamDealOutcome>
export type WorkstreamDealLane = z.infer<typeof WorkstreamDealLane>
export type WorkstreamAccountLane = z.infer<typeof WorkstreamAccountLane>
export type WorkstreamProfileResponse = z.infer<typeof WorkstreamProfileResponse>
