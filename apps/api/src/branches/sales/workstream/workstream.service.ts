import { Inject, Injectable } from '@nestjs/common'
import {
  daysUntil,
  pipelinePosition,
  type AccessControl,
  type Actor,
  type Decidable,
  type ObjectRef,
} from '@pv/engines'
import {
  LeadTier,
  PipelinePositionView,
  StageKey,
  WorkstreamBoardResponse,
  WorkstreamBookResponse,
  WorkstreamJourneyResponse,
  WorkstreamScorecard,
  lastDayOf,
  salesCompareSpan,
  salesPeriodSpan,
  type DaySpan,
  type ObjectCode,
  type OpportunityOwner,
  type SalesPeriodKey,
  type WorkstreamBookQuery,
  type WorkstreamRow,
  type WorkstreamScorecardQuery,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { ApprovalService } from '@api/platform/approval/approval.service'
import { notFound } from '@api/platform/http/problem'
import { phasesOf, stageConfigOf, tierConfigOf, type PhaseConfig } from '../ladder'
import { toRef as leadRef } from '../lead/lead.mapper'
import { mayWriteContract } from '../contract/contract-writer'
import { NextStepRepository } from '../next-step/next-step.repository'
import { scopeRefOf, toRef as dealRef, type OwnerRow } from '../opportunity/opportunity.mapper'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import {
  blankFootprint,
  WorkstreamRepository,
  type WorkstreamFilters,
  type RunContract,
  type WorkstreamPageRow,
  type WorkstreamRead,
} from './workstream.repository'
import {
  boardColumns,
  contractOpens,
  holdersOf,
  liveCodeOf,
  liveOf,
  opensStand,
  scorecardStages,
  standOf,
  toContract,
  type WorkstreamLive,
} from './workstream.mapper'
import { journeyOf } from './workstream-lanes'
import {
  WorkstreamLanesRepository,
  type ContractLaneRow,
  type LaneRows,
} from './workstream-lanes.repository'
import { inChargeOf, rowStepOf, stepSubjectOf } from './workstream-seat'

/** Module 5 · the journey book. Repository AND engine, the only layer allowed
 *  to know both.
 *
 *  Everything expensive about this book is the merge, and the merge is paid for
 *  ONCE PER PAGE: `rowsOf` runs two waves of statements whose count does not
 *  grow with the page. Reaching for a per-row read here is how a fifty-row
 *  screen becomes two hundred queries. */
@Injectable()
export class WorkstreamService {
  constructor(
    private readonly repo: WorkstreamRepository,
    /* E3's durable half, asked one question: what is still waiting on the
       object this run currently stands on. */
    private readonly approvals: ApprovalService,
    private readonly lanes: WorkstreamLanesRepository,
    private readonly steps: NextStepRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async book(who: Actor, q: WorkstreamBookQuery): Promise<WorkstreamBookResponse> {
    const page = await this.repo.book(who, q, true)

    /* The second grid rides the ANCHOR LEAD's ref (`ObjectKind` has no `'WS'`),
       carrying the reader as owner when the SQL fence let them in — see `runRef`. */
    const items = page.rows.map((r) => ({ ...r, ref: runRef(who, r) }))
    const { visible, hidden } = this.access.visible(who, items)

    return WorkstreamBookResponse.parse({
      rows: await this.rowsOf(who, visible),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }

  /** The board's column catalogue — `GET /sales/workstreams/board`.
   *
   *  Counts only: the screen then asks the book door once per column, so a
   *  column pages and sorts like any other view. Each `total` is counted under
   *  the book door's own joins, filters and scope axis, which is what lets a
   *  header and the cards below it agree.
   *
   *  E2's second grid is NOT applied here and cannot be: it cuts rows one ref
   *  at a time, and this door never reads a row. `book()` reports that cut as
   *  `hidden` against the same SQL total, so the two numbers stay comparable. */
  async board(who: Actor, q: WorkstreamFilters): Promise<WorkstreamBoardResponse> {
    const [totals, ladders] = await Promise.all([
      this.repo.boardTotals(who, q, true),
      this.repo.ladderRows(),
    ])

    return WorkstreamBoardResponse.parse({
      columns: boardColumns(totals, q.status, stageConfigOf(ladders.stage)),
    })
  }

  /** The cards — `GET /sales/workstreams/scorecard`.
   *
   *  Counted by SQL under the book's scope axis, so E2's second grid is NOT
   *  applied: it cuts one ref at a time and this door reads no row. Today it
   *  cuts nothing the axis has not (every role holding `workstream.view` holds
   *  `lead.view`), but a role granted the first without the second sees an
   *  empty book under a non-zero card. */
  async scorecard(who: Actor, q: WorkstreamScorecardQuery): Promise<WorkstreamScorecard> {
    const period = q.period ? await this.periodSpans(q.period) : null
    const [totals, ladders] = await Promise.all([
      this.repo.scorecard(who, true, period ? [period.span, period.compare] : []),
      this.repo.ladderRows(),
    ])
    const [now, figures] = totals.periods
    return WorkstreamScorecard.parse({
      overdue: totals.overdue,
      won: totals.won,
      stopped: totals.stopped,
      stages: scorecardStages(totals.stages, stageConfigOf(ladders.stage)),
      ...(period && now && figures
        ? { inPeriod: { ...period, now, compare: { ...period.compare, figures } } }
        : {}),
    })
  }

  /** The period's two spans (ADR 0110 §5). `asOf` is the database's Vietnam
   *  day — `steps.today()` runs the very expression `PerformanceRepository
   *  .today()` does, so the compare cut matches the overview's (ADR 0106 §3). */
  private async periodSpans(period: SalesPeriodKey) {
    const asOf = await this.steps.today()
    const span = rangeOf(salesPeriodSpan(period))
    return { period, asOf, span, compare: rangeOf(salesCompareSpan(period, asOf)) }
  }

  /** One journey by code. Both ways of failing answer the SAME 404.
   *
   *  `WS-` codes run from 1 with no gaps, so telling "no such run" apart from
   *  "not your run" hands anyone with a session a way to walk the space and
   *  count what the desk is holding. That is the trade `OpportunityService
   *  .profile` already made and for the stronger reason here.
   *
   *  Deals are cut per reader BEFORE the second read: contracts, installments,
   *  stage events and next steps are asked for visible deals only, so a hidden
   *  deal's codes and amounts never leave the database. */
  async profile(who: Actor, code: ObjectCode): Promise<WorkstreamJourneyResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('hành trình', code)

    const [[byRun, owners], ladders, ordinal, papers] = await Promise.all([
      this.dealsWithOwners([found.row.code]),
      this.repo.ladderRows(),
      this.repo.ordinalOf(found.row),
      this.repo.contractsOf([found.row.code]),
    ])
    const all = byRun.get(found.row.code) ?? []
    const closed = papers.get(found.row.code) ?? []
    const { deals, hidden } = this.visibleDeals(who, found, all, owners, closed)
    const dealCodes = deals.map((d) => d.code)
    const stopKeys = deals.flatMap((d) => (d.stopReason === null ? [] : [d.stopReason]))

    const [lanes, steps, today, acceptors] = await Promise.all([
      this.lanes.lanesOf(found.lead.code, dealCodes, stopKeys),
      this.steps.stepsOf(dealCodes),
      this.steps.today(),
      this.repo.dealAcceptorsOf(dealCodes),
    ])
    /* A closer's deal shows whole, its sibling papers do not (ADR 0110 §2). */
    const stands = standsFor(who.id, all, owners)
    const rows = who.ownOnly
      ? readableLanes(lanes, (c) => contractOpens(found, c, stands, who.id))
      : lanes

    return WorkstreamJourneyResponse.parse(
      journeyOf({
        read: found,
        ordinal,
        all,
        deals,
        hidden,
        owners,
        acceptors,
        rows,
        steps,
        stage: stageConfigOf(ladders.stage),
        now: new Date(),
        today,
        canEdit: (ownerId) => mayWriteContract(who, ownerId),
      }),
    )
  }

  /** The merge, for one page or for one row.
   *
   *  Two waves, and the split is forced rather than stylistic: which object a
   *  run stands on is only known after its deals, their owners and its
   *  contracts are in hand, and the approvals are read for THAT object. Neither
   *  wave grows with the number of rows.
   *
   *  Deals are cut per reader before anything is derived from them: the run is
   *  scoped by its lead, a deal by its own owners, so a colleague's deal must
   *  not surface as the row's stand, holder or waiting-on. */
  private async rowsOf(who: Actor, reads: readonly WorkstreamPageRow[]): Promise<WorkstreamRow[]> {
    const codes = reads.map((r) => r.row.code)
    const [[deals, owners], contracts, footprints, ladders] = await Promise.all([
      this.dealsWithOwners(codes),
      this.repo.contractsOf(codes),
      this.repo.footprintOf(codes),
      this.repo.ladderRows(),
    ])

    /* Null for a reader who sees the whole book — `standPair` takes the same
       branch in SQL, and the two must fence the same rows or a card lands in a
       column that does not describe it. */
    const readerId = who.ownOnly ? who.id : null
    const stands = standsFor(who.id, [...deals.values()].flat(), owners)
    const stage = stageConfigOf(ladders.stage)
    const tier = tierConfigOf(ladders.tier)

    const walked = reads.map((read) => {
      const runContracts = contracts.get(read.row.code) ?? []
      const own = this.visibleDeals(
        who,
        read,
        deals.get(read.row.code) ?? [],
        owners,
        runContracts,
      ).deals
      /* The newest signature this reader may open — the stand's own rule. */
      const signed = runContracts.find((c) =>
        readerId === null
          ? own.some((d) => d.code === c.deal)
          : contractOpens(read, c, stands, readerId),
      )
      const kept = opensStand(read, runContracts, stands, readerId)
      /* The stand's own paper when this reader may open it, else their newest. */
      const paper =
        readerId === null
          ? undefined
          : (runContracts.find(
              (c) => c.code === read.row.standCode && contractOpens(read, c, stands, readerId),
            ) ?? signed)
      return {
        read,
        own,
        runContracts,
        live: liveOf(own, signed?.code ?? null),
        kept,
        stand: standOf(read, kept, stage, paper?.code ?? null),
      }
    })

    const standDeals = walked.flatMap((w) => (w.stand.kind === 'OP' ? [w.stand.code] : []))
    const [waiting, acceptors, steps, today] = await Promise.all([
      this.approvals.pendingOnMany(walked.map((w) => liveCodeOf(w.read, w.live))),
      this.repo.dealAcceptorsOf([
        ...walked.flatMap((w) => w.own.map((d) => d.code)),
        ...standDeals,
      ]),
      this.steps.stepsOf(walked.flatMap((w) => stepSubjectOf(w.stand) ?? [])),
      this.steps.today(),
    ])

    const now = new Date().toISOString()

    return walked.map((w) =>
      toContract({
        read: w.read,
        stand: w.stand,
        /* A folded row prints the lead's rung, so it prints no deadline of the
           deal; a held stand has its clock stopped (ADR 0097 §3). */
        overdueBy: w.kept && !w.read.held ? overdueOf(w.read.row.standDueAt, now) : null,
        position: positionOf(
          w.read,
          w.live,
          { stage, tier },
          waiting.get(liveCodeOf(w.read, w.live)) ?? [],
        ),
        holders: holdersOf(w.read, w.own, owners, acceptors),
        /* A run whose three ledgers are all silent still prints seven zeroes:
           `footprintOf` only emits the buckets it counted something in. */
        footprint: footprints.get(w.read.row.code) ?? blankFootprint(),
        inCharge: inChargeOf(w.stand, w.read, owners, acceptors, w.runContracts),
        nextStep: rowStepOf(w.stand, steps, today),
      }),
    )
  }

  private async dealsWithOwners(
    codes: readonly string[],
  ): Promise<[Map<string, OpportunityRowDb[]>, Map<string, OwnerRow[]>]> {
    const deals = await this.repo.dealsOf(codes)
    const owners = await this.repo.dealOwnersOf([...deals.values()].flat().map((d) => d.code))
    return [deals, owners]
  }

  /** E2 per deal, with the ref `OpportunityService.book()` builds — the same
   *  fence the opportunity book puts between this reader and a deal. A deal
   *  with a contract the reader may open (`contractOpens`: closer, lead
   *  holder) also shows, read-only, so the card hangs off it as the book's
   *  stand says (ADR 0110 §2–3). Deal write doors keep their own scope. */
  private visibleDeals(
    who: Actor,
    read: WorkstreamRead,
    all: readonly OpportunityRowDb[],
    owners: Map<string, OpportunityOwner[]>,
    papers: readonly RunContract[],
  ): { deals: OpportunityRowDb[]; hidden: number } {
    const stands = standsFor(who.id, all, owners)
    const opened = papers.filter((c) => contractOpens(read, c, stands, who.id))
    const reached = new Set(opened.map((c) => c.deal))
    const items = all.map((row) => {
      const ref = scopeRefOf(row, owners.get(row.code) ?? [], who)
      return {
        row,
        ref: reached.has(row.code) ? { ...ref, owner: who.name, ownerId: who.id } : ref,
      }
    })
    const { visible } = this.access.visible(who, items)
    /* E2 reads a ref with no owner as shared; a deal with no owner row must
       still stay out of an own-only reader's journey, so the id is asked here too. */
    const deals = visible
      .map((v) => v.row)
      .filter((d) => !who.ownOnly || stands(d.code) || reached.has(d.code))
    return { deals, hidden: all.length - deals.length }
  }
}

/** `overdueBy` off the stored deadline: days from that deadline to now, in
 *  whole calendar days.
 *
 *  `daysUntil(a, b)` is `a − b`, so passing `now` as the near side gives the
 *  days ALREADY PAST the deadline — the same subtraction `pipelinePosition`
 *  makes from the other end, reused rather than written again. The book's
 *  `ORDER BY` sorts on this very column, so the number on the card and the
 *  place in the list are one fact. */
const overdueOf = (due: Date | null, now: string): number | null =>
  due === null ? null : daysUntil(now, due.toISOString())

/** Where the live object of a journey stands, translated for the engine.
 *
 *  Two translations only the branch can make, the same pair `LeadService` and
 *  `OpportunityService` each make for their own door: the LADDER, paired to
 *  `config_entry` by ordinal position behind `../ladder.ts`'s fence, and the
 *  EVIDENCE, which for both a deal and a lead is the object's own rung.
 *
 *  A run standing on a CONTRACT comes back `null`, and that is the honest
 *  answer rather than a gap: no contract ladder exists in `config_entry`, so
 *  there is no rung to place it on and no `limitDays` to judge it by. */
function positionOf(
  read: WorkstreamRead,
  live: WorkstreamLive,
  config: { stage: Map<StageKey, PhaseConfig>; tier: Map<LeadTier, PhaseConfig> },
  approvals: readonly Decidable[],
): PipelinePositionView | null {
  const input = inputOf(read, live, config)
  if (input === null) return null

  const position = pipelinePosition({ ...input, approvals }, new Date().toISOString())
  return position === null ? null : PipelinePositionView.parse(position)
}

function inputOf(
  read: WorkstreamRead,
  live: WorkstreamLive,
  config: { stage: Map<StageKey, PhaseConfig>; tier: Map<LeadTier, PhaseConfig> },
): {
  ref: ObjectRef
  phases: ReturnType<typeof phasesOf>
  reached: string[]
  since: string | null
} | null {
  if (live.kind === 'HĐ') return null

  if (live.kind === 'OP') {
    return {
      ref: dealRef(
        live.deal,
        read.lead.ownerId && read.saleName ? { id: read.lead.ownerId, name: read.saleName } : null,
      ),
      phases: phasesOf(config.stage, StageKey.options),
      reached: [live.stage],
      since: live.deal.stageSince?.toISOString() ?? null,
    }
  }

  const rung = read.lead.tier
  if (rung === null) return null

  return {
    ref: leadRef(read.lead, read.saleName),
    phases: phasesOf(config.tier, LeadTier.options),
    reached: [rung],
    since: read.lead.stateSince.toISOString(),
  }
}

/** The anchor lead's ref for E2's second grid. A reader the SQL fence let in
 *  through a deal or a contract of the run (ADR 0110 §3) is named as its
 *  owner — the move `scopeRefOf` makes for a deal — or axis 3 hides the row. */
function runRef(who: Actor, r: WorkstreamPageRow): ObjectRef {
  const ref = leadRef(r.lead, r.saleName)
  return who.ownOnly && r.inScope ? { ...ref, owner: who.name, ownerId: who.id } : ref
}

/** The lane rows minus the contracts, and their instalments, the reader may
 *  not open. */
function readableLanes(rows: LaneRows, opens: (c: ContractLaneRow) => boolean): LaneRows {
  const contracts = rows.contracts.filter(opens)
  const kept = new Set(contracts.map((c) => c.code))
  return {
    ...rows,
    contracts,
    installments: rows.installments.filter((i) => kept.has(i.contractCode)),
  }
}

const rangeOf = (span: DaySpan) => ({ first: span.from, last: lastDayOf(span) })

/** `dealStoodBy` (`../open-deal.ts`) over rows already loaded: the reader
 *  stands on the deal in either lane, or accepted it. */
function standsFor(
  readerId: string,
  deals: readonly OpportunityRowDb[],
  owners: ReadonlyMap<string, readonly { id: string }[]>,
): (dealCode: string) => boolean {
  const accepted = new Set(deals.filter((d) => d.acceptedById === readerId).map((d) => d.code))
  return (code) => accepted.has(code) || (owners.get(code) ?? []).some((o) => o.id === readerId)
}
