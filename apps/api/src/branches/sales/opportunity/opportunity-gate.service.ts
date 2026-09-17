import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  CriterionTickResponse,
  OpportunityGate as OpportunityGateView,
  StageKey,
  type CriterionTick,
  type ObjectCode,
} from '@pv/contracts'
import { conflict, notFound } from '@api/platform/http/problem'
import type { StageCriterionRowDb } from '../config/stage-criterion.schema'
import { OpportunityGateRepository } from './opportunity-gate.repository'
import { gateStatesOf } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

const LADDER = StageKey.options

/** The stage gate. The rule itself lives on `stage-gate.ts` in the contracts;
 *  this file is the one place that enforces it, so `moveStage`, `update`,
 *  `sign`, `create` and the import check ask here instead of each carrying a
 *  copy.
 *
 *  No door skips it by entering sideways: a reopened deal is gated from the
 *  stage it left the ladder on, and a new deal entering at stage T owes every
 *  criterion before T — with no ticks yet, so any active one refuses. Leaving
 *  the ladder as lost is never gated. */
@Injectable()
export class OpportunityGate {
  constructor(
    private readonly gate: OpportunityGateRepository,
    private readonly deals: OpportunityRepository,
  ) {}

  /** Refuses a move forward past unticked criteria; backward and same are free.
   *  `from` null is a deal off the ladder coming back: it resumes from the stage
   *  it left on (first stage if it never stood on one), so ticks still count. */
  async assertMove(code: string, from: StageKey | null, to: StageKey | null): Promise<void> {
    if (to === null) return
    const start = from ?? (await this.gate.leftFrom(code))
    const [i, j] = [start === null ? 0 : LADDER.indexOf(start), LADDER.indexOf(to)]
    if (j > i) await this.assertCleared(code, LADDER.slice(i, j))
  }

  /** `create` refuses a new deal entering past active criteria. */
  async assertEntry(to: StageKey | null): Promise<void> {
    const missing = (await this.entryRule())(to)
    if (missing.length === 0) return
    throw conflict(
      'Cơ hội mới chưa qua được các stage trước — tạo ở stage sớm hơn rồi tick điều kiện',
      { criteria: [...missing] },
    )
  }

  /** The entry rule over every active criterion read ONCE, so an import checks
   *  a whole file on one read and with the same predicate `create` uses. */
  async entryRule(): Promise<EntryRule> {
    const active = await this.gate.activeCriteria(LADDER)
    return (to) =>
      to === null ? [] : labelsOf(missingOf(active, new Set(), LADDER.slice(0, LADDER.indexOf(to))))
  }

  /** Signing leaves the ladder past its last stage, so every stage from the
   *  current one to the end must be cleared. */
  async assertSign(code: string, from: StageKey | null): Promise<void> {
    if (from !== null) await this.assertCleared(code, LADDER.slice(LADDER.indexOf(from)))
  }

  /** `PATCH /sales/opportunities/:code/criteria/:criterionId`. */
  async tick(
    who: Actor,
    code: ObjectCode,
    criterionId: string,
    body: CriterionTick,
  ): Promise<CriterionTickResponse> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    const criterion = await this.gate.criterion(criterionId, body.ticked)
    if (criterion === null) throw notFound('tiêu chí', criterionId)

    if (found.signed || found.row.closedAt !== null) {
      throw conflict(`Cơ hội ${code} đã đóng sổ nên không đánh dấu tiêu chí được nữa.`)
    }

    if (!body.ticked) {
      await this.gate.untick(code, criterionId)
      return CriterionTickResponse.parse({
        id: criterion.id,
        label: criterion.label,
        tickedAt: null,
        tickedBy: null,
      })
    }

    const stored = await this.gate.tick({
      opportunityCode: code,
      criterionId,
      tickedById: who.id,
      tickedBy: who.name,
    })
    return CriterionTickResponse.parse({
      id: criterion.id,
      label: criterion.label,
      tickedAt: stored.tickedAt.toISOString(),
      tickedBy: stored.tickedBy,
    })
  }

  /** `GET /sales/opportunities/:code/criteria` — every stage that has an active
   *  criterion, in ladder order, with this deal's ticks. Same 404 for missing
   *  and out of scope as the profile door. */
  async checklist(who: Actor, code: ObjectCode): Promise<OpportunityGateView> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    const list = await this.gate.checklist([code])
    return OpportunityGateView.parse({
      stage: found.signed ? null : (found.row.stage ?? null),
      stages: LADDER.map((stage) => ({ stage, criteria: gateStatesOf(list, code, stage) })).filter(
        (s) => s.criteria.length > 0,
      ),
    })
  }

  private async assertCleared(code: string, stages: readonly StageKey[]): Promise<void> {
    const [required, ticked] = await Promise.all([
      this.gate.activeCriteria(stages),
      this.gate.tickedIds(code),
    ])
    const missing = labelsOf(missingOf(required, ticked, stages))
    if (missing.length === 0) return

    throw conflict('Chưa đủ điều kiện qua stage', { criteria: missing })
  }
}

/** Missing labels for a deal entering at `to`; empty means it may enter. */
export type EntryRule = (to: StageKey | null) => readonly string[]

/** Unticked criteria of `stages`, in ladder order then checklist order. */
function missingOf(
  criteria: readonly StageCriterionRowDb[],
  ticked: ReadonlySet<string>,
  stages: readonly StageKey[],
): StageCriterionRowDb[] {
  return criteria
    .filter((c) => stages.includes(c.stage) && !ticked.has(c.id))
    .sort((a, b) => LADDER.indexOf(a.stage) - LADDER.indexOf(b.stage) || a.ord - b.ord)
}

const labelsOf = (rows: readonly StageCriterionRowDb[]): string[] => rows.map((c) => c.label)
