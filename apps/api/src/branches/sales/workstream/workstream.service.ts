import { Inject, Injectable } from '@nestjs/common'
import {
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
  WorkstreamBookResponse,
  WorkstreamProfileResponse,
  type ObjectCode,
  type WorkstreamBookQuery,
  type WorkstreamRow,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { ApprovalService } from '@api/platform/approval/approval.service'
import { GraphService } from '@api/platform/graph/graph.service'
import { toChainLink } from '@api/platform/graph/graph.mapper'
import { notFound } from '@api/platform/http/problem'
import { phasesOf, stageConfigOf, tierConfigOf, type PhaseConfig } from '../ladder'
import { toRef as leadRef } from '../lead/lead.mapper'
import { toRef as dealRef } from '../opportunity/opportunity.mapper'
import { blankFootprint, WorkstreamRepository, type WorkstreamRead } from './workstream.repository'
import { holdersOf, liveOf, standOf, toContract, type WorkstreamLive } from './workstream.mapper'

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
    private readonly graph: GraphService,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async book(who: Actor, q: WorkstreamBookQuery): Promise<WorkstreamBookResponse> {
    const page = await this.repo.book(who, q, true)

    /* The second grid rides the ANCHOR LEAD's ref: `ObjectKind` has no `'WS'`,
       and the lead is what the SQL axis already cut on — so both fences ask
       one question rather than two. */
    const items = page.rows.map((r) => ({ ...r, ref: leadRef(r.lead, r.saleName) }))
    const { visible, hidden } = this.access.visible(who, items)

    return WorkstreamBookResponse.parse({
      rows: await this.rowsOf(visible),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }

  /** One journey by code. Both ways of failing answer the SAME 404.
   *
   *  `WS-` codes run from 1 with no gaps, so telling "no such run" apart from
   *  "not your run" hands anyone with a session a way to walk the space and
   *  count what the desk is holding. That is the trade `OpportunityService
   *  .profile` already made and for the stronger reason here; the book still
   *  reports `hidden`, so the count is available where it is not a list. */
  async profile(who: Actor, code: ObjectCode): Promise<WorkstreamProfileResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('hành trình', code)

    /* Walked from the LEAD: E1 has no `WS` kind to start at, and the lead is
       the first link of the chain the rail draws anyway. `storyFor`, not
       `story` — E2 cuts links this reader may not open. */
    const [rows, story] = await Promise.all([
      this.rowsOf([found]),
      this.graph.storyFor(who, found.lead.code),
    ])
    const [row] = rows
    if (!row) throw notFound('hành trình', code)

    return WorkstreamProfileResponse.parse({ ...row, chain: story.chain.map(toChainLink) })
  }

  /** The merge, for one page or for one row.
   *
   *  Two waves, and the split is forced rather than stylistic: which object a
   *  run stands on is only known after its deals and its contract are in hand,
   *  and the owners and the approvals are read for THOSE objects. Neither wave
   *  grows with the number of rows. */
  private async rowsOf(reads: readonly WorkstreamRead[]): Promise<WorkstreamRow[]> {
    const codes = reads.map((r) => r.row.code)
    const [deals, contracts, footprints, ladders] = await Promise.all([
      this.repo.dealsOf(codes),
      this.repo.contractsOf(codes),
      this.repo.footprintOf(codes),
      this.repo.ladderRows(),
    ])

    const walked = reads.map((read) => {
      const own = deals.get(read.row.code) ?? []
      return { read, own, live: liveOf(own, contracts.get(read.row.code) ?? null) }
    })

    const [owners, waiting] = await Promise.all([
      this.repo.dealOwnersOf(walked.flatMap((w) => w.own.map((d) => d.code))),
      this.approvals.pendingOnMany(walked.map((w) => liveCodeOf(w.read, w.live))),
    ])

    const stage = stageConfigOf(ladders.stage)
    const tier = tierConfigOf(ladders.tier)

    return walked.map((w) =>
      toContract({
        read: w.read,
        stand: standOf(w.read, w.live, stage, tier),
        position: positionOf(
          w.read,
          w.live,
          { stage, tier },
          waiting.get(liveCodeOf(w.read, w.live)) ?? [],
        ),
        holders: holdersOf(w.read, w.own, owners),
        /* A run whose three ledgers are all silent still prints seven zeroes:
           `footprintOf` only emits the buckets it counted something in. */
        footprint: footprints.get(w.read.row.code) ?? blankFootprint(),
      }),
    )
  }
}

const liveCodeOf = (read: WorkstreamRead, live: WorkstreamLive): string =>
  live.kind === 'HĐ' ? live.code : live.kind === 'OP' ? live.deal.code : read.lead.code

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
      ref: dealRef(live.deal, read.saleName),
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
    since: read.lead.stageSince.toISOString(),
  }
}
