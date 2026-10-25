import { z } from 'zod'
import { searchText } from '../search-text'
import { PageQuery, SortDir, paged } from '../pagination'
import { PipelinePositionView } from '../position'
import { ThreadChannel } from '../comms/thread'
import { Bool, Day, Moment, ObjectCode, textInput } from '../primitives'
import { DueLevel, type LeadState, WorkstreamCloseReason } from './enums'
import { SalesDayRange, SalesPeriodKey } from './performance'

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
  /** The rung's MACHINE key, a `StageKey`
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
  [...ThreadChannel.options, 'mail'],
  'Kênh không có trong danh sách',
)

/** A count for EVERY channel, not only the ones that fired — so the screen
 *  prints every cell straight off the object, with no channel left to
 *  default to zero itself. Same reasoning `OpportunityHistogram` states for
 *  its buckets, exhaustive here because the set is fixed and known
 *  rather than open-ended. */
export const WorkstreamFootprint = z.object({
  /* Read tolerantly: a server one deploy behind does not know a channel added
     since, and a missing count is zero, not a reason to refuse the whole book. */
  byChannel: z
    .partialRecord(WorkstreamChannel, z.number().int().nonnegative())
    .transform(
      (counts) =>
        Object.fromEntries(WorkstreamChannel.options.map((c) => [c, counts[c] ?? 0])) as Record<
          WorkstreamChannel,
          number
        >,
    ),
  lastContactedAt: Moment.nullable(),
})

/** Who answers for the object the run stands on, under that object's seat:
 *  the lead's PIC, the deal's primary seller, or the closer of each live contract
 *  of the run (ADR 0110). Never the lead's PIC standing in for a contract. */
export const WorkstreamInCharge = z.object({
  seat: z.enum(['lead', 'deal', 'contract']),
  people: z.array(WorkstreamHolder),
})

/** The stand's next step, slimmed for a book row. Not `NextStep` itself:
 *  `./next-step` imports this file, and the cycle would break module load. */
export const WorkstreamRowStep = z.object({
  text: z.string().min(1),
  due: Day,
  dueLevel: DueLevel,
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

  /** `daysHere − limitDays` of the rung the run stands on, hidden (null) from a
   *  reader who cannot open that rung's object. NULL ON PURPOSE, and it means "nobody has set a deadline for the
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

  /* Optional: the screen must still read an API one deploy behind. */
  inCharge: WorkstreamInCharge.nullable().optional(),
  nextStep: WorkstreamRowStep.nullable().optional(),
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
  q: searchText,
  /** `WorkstreamStandKind` codes joined by commas; a run standing on ANY of
   *  them matches. One code is also the board's "this column only" filter —
   *  each column is one call to the same book door, so a column pages and
   *  sorts like any other view. `standKey` only means something beside ONE code. */
  standKind: z
    .string()
    .max(20)
    .refine((v) => v.split(',').every((s) => WorkstreamStandKind.safeParse(s).success))
    .optional(),
  standKey: z.string().min(1).max(40).optional(),
  /** The dropped step's filter — it groups by WHY a run closed, not by the
   *  rung it stands on. Only meaningful with `status` `closed` or `all`: an
   *  open run has no close reason at all, the invariant the DB already holds
   *  as `CHECK workstream_close_pair`. */
  closeReason: WorkstreamCloseReason.optional(),
  /** `true` = open runs whose current rung is past its deadline — the same
   *  set `WorkstreamScorecard.overdue` counts, so the card opens its own rows. */
  overdue: Bool.optional(),
  /** `true` = closed LOST or CHURNED — the set `WorkstreamScorecard.stopped`
   *  counts. Pair with `status` `closed` or `all`. */
  stopped: Bool.optional(),
  /** Runs open at any moment of the span: opened by its end, not closed before
   *  its start. Vietnam days, both ends inclusive; pair with `status` `all`. */
  liveFrom: Day.optional(),
  liveTo: Day.optional(),
  /** Close moment (`closedAt`) as Vietnam days, both ends inclusive. */
  closedFrom: Day.optional(),
  closedTo: Day.optional(),
  /** Open moment (`openedAt`) as Vietnam days, both ends inclusive — the
   *  scorecard's opened-in-period set; pair with `status` `all`. */
  openedFrom: Day.optional(),
  openedTo: Day.optional(),
  /** Actor ids joined by commas; a run whose `inCharge.people` holds ANY of them
   *  matches. The SAME derived set the row shows (lead PIC, deal seller or
   *  contract closers), not a stored column. `OWNER_NONE` = `inCharge` empty. */
  owner: z.string().min(1).max(512).optional(),
  sort: WorkstreamSortKey.default('priority'),
  dir: SortDir.default('desc'),
})

export const WorkstreamBookResponse = paged(WorkstreamRow)

/** The board asks the book's question minus paging, sorting and the filters a
 *  board cannot show. Cut from the book's schema, so the web reads its keys
 *  from `.shape` and a key added here reaches the header counts and the cards. */
export const WorkstreamBoardQuery = WorkstreamBookQuery.pick({
  status: true,
  accountCode: true,
  owner: true,
  q: true,
})
export type WorkstreamBoardQuery = z.infer<typeof WorkstreamBoardQuery>

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

/** Runs counted over one span, each with the book filter that opens its rows:
 *  `live` = `liveFrom/liveTo`, `opened` = `openedFrom/openedTo`, `won` =
 *  `closeReason` WON + `closedFrom/closedTo`, `stopped` = `stopped` + the same
 *  close range, `closed` = `status` closed + the same close range. */
export const WorkstreamPeriodFigures = z.object({
  live: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  stopped: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
})

/** `GET /sales/workstreams/scorecard` — the strip above the book, counted by
 *  SQL over the WHOLE book the reader may see (scoped like the book, unlike
 *  the room-wide `LeadScorecard`, because each count opens its own rows). No params: tab, search and
 *  filters never move these, so a card cannot disagree with the book it heads
 *  just because a page or a filter was narrower.
 *  `overdue` is OPEN runs with `overdueBy > 0`; runs with no deadline (null)
 *  are not counted. `stopped` is LOST plus CHURNED; WON is `won` alone.
 *  `stages` groups the OPEN runs by current rung with the same `kind`/`key`
 *  pair the book's `standKind`/`standKey` filter by, so a count opens exactly
 *  the rows it names. Rungs with no open run are listed with count 0. */
export const WorkstreamScorecard = z.object({
  /** Open runs whose current rung is past its deadline. */
  overdue: z.number().int().nonnegative(),
  /** Closed with `closeReason` WON. */
  won: z.number().int().nonnegative(),
  /** Closed with `closeReason` LOST or CHURNED. */
  stopped: z.number().int().nonnegative(),
  /** Open runs per current rung, in ladder order. `label` is resolved by the
   *  server (the same words the row pills print), never by the screen. */
  stages: z.array(
    z.object({
      kind: WorkstreamStandKind,
      key: z.string().min(1).max(40),
      label: z.string().min(1),
      count: z.number().int().nonnegative(),
    }),
  ),
  /** Present only when `?period=` was asked; optional for an API one deploy
   *  behind. */
  inPeriod: z
    .object({
      period: SalesPeriodKey,
      /** The database's Vietnam day, as on the overview (ADR 0106 §3). */
      asOf: Day,
      span: SalesDayRange,
      now: WorkstreamPeriodFigures,
      /** The period before, cut to as many days as `span` has run by `asOf`. */
      compare: SalesDayRange.extend({ figures: WorkstreamPeriodFigures }),
    })
    .optional(),
})

/** `GET /sales/workstreams/scorecard?period=` — the overview's period keys
 *  (`2026-W43`, `2026-10`, `2026-Q4`, `2026`). Absent = no `inPeriod` block. */
export const WorkstreamScorecardQuery = z.object({ period: SalesPeriodKey.optional() })

// ---------------------------------------------------------------------------
// SHARED LADDERS
// ---------------------------------------------------------------------------

/** The four backbone rungs, in order, and no others — every lead lane draws
 *  exactly this ladder so any two leads sit side by side and compare (ADR
 *  0058). Declared once so the API's writer and this contract agree on which
 *  four. `working` is entered by `exchange-logged` or legacy `verified`; the
 *  `verifying` rung is gone (ADR 0123). */
export const LEAD_LANE_BACKBONE = [
  'new',
  'assigned',
  'working',
  'converted',
] as const satisfies readonly LeadState[]

/** The six journey steps in order — level one of the board, above the rungs
 *  each step's book supplies. Declared once here for the same reason
 *  `LEAD_LANE_BACKBONE` is: both ends read it, the screen to draw the six and
 *  the API to know which of them has a book. `after-sale` and `growth` have no
 *  board column — bought customers list on their own book (`./after-sale`) —
 *  so the screen draws the placeholder; the absent column already says it. */
export const WORKSTREAM_JOURNEY_STEPS = [
  { key: 'lead', label: 'Lead' },
  { key: 'opportunity', label: 'Cơ hội' },
  { key: 'contract', label: 'Hợp đồng' },
  { key: 'after-sale', label: 'Sau bán' },
  { key: 'growth', label: 'Tăng trưởng' },
  { key: 'dropped', label: 'Rơi' },
] as const

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
export type WorkstreamScorecard = z.infer<typeof WorkstreamScorecard>
export type WorkstreamScorecardQuery = z.infer<typeof WorkstreamScorecardQuery>
export type WorkstreamPeriodFigures = z.infer<typeof WorkstreamPeriodFigures>
export type WorkstreamInCharge = z.infer<typeof WorkstreamInCharge>
export type WorkstreamRowStep = z.infer<typeof WorkstreamRowStep>
