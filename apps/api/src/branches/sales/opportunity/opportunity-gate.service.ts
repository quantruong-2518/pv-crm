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
import type { Db } from '@api/platform/db/db.module'
import type { StageCriterionRowDb } from '../config/stage-criterion.schema'
import { OpportunityGateRepository } from './opportunity-gate.repository'
import { gateStatesOf } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

const LADDER = StageKey.options

/** The stage gate. The rule itself lives on `stage-gate.ts` in the contracts;
 *  this file is the one place that enforces it, so `moveStage`, `update` and
 *  signing ask here instead of each carrying a copy.
 *
 *  It blocks exactly two things (ADR 0057 §6): a FORWARD move, and signing.
 *  Both look back across every earlier stage, not only the one being left, so
 *  a deal created straight into a late stage owes the earlier criteria before
 *  its next step forward. Creating, importing, losing and reopening a lost
 *  deal are never gated. */
@Injectable()
export class OpportunityGate {
  constructor(
    private readonly gate: OpportunityGateRepository,
    private readonly deals: OpportunityRepository,
  ) {}

  /** Refuses a forward move while any criterion of a stage before `to` is
   *  unticked. `from` null is a deal coming back off the ladder — free. */
  async assertMove(code: string, from: StageKey | null, to: StageKey | null): Promise<void> {
    if (from === null || to === null) return
    const j = LADDER.indexOf(to)
    if (j > LADDER.indexOf(from)) await this.assertCleared(code, LADDER.slice(0, j))
  }

  /** Signing leaves the ladder past its last stage, so the whole ladder must be
   *  cleared whatever stage the deal stands on. `handle` lets the E3 applier
   *  ask inside the transaction that settles the request. */
  async assertSign(code: string, handle?: Db): Promise<void> {
    await this.assertCleared(code, LADDER, handle)
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

  private async assertCleared(
    code: string,
    stages: readonly StageKey[],
    handle?: Db,
  ): Promise<void> {
    const [required, ticked] = await Promise.all([
      this.gate.activeCriteria(stages, handle),
      this.gate.tickedIds(code, handle),
    ])
    const missing = labelsOf(missingOf(required, ticked, stages))
    if (missing.length === 0) return

    throw conflict('Chưa đủ điều kiện qua stage', { criteria: missing })
  }
}

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
