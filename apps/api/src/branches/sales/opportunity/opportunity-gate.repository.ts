import { and, asc, eq, inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { StageKey } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { stageCriterion, type StageCriterionRowDb } from '../config/stage-criterion.schema'
import {
  opportunityCriterionTick,
  type OpportunityCriterionTickRowDb,
} from './opportunity-criterion-tick.schema'

/** SQL of the stage gate: which criteria are active, which a deal has ticked.
 *  Decides nothing — `OpportunityGate` owns the rule. Reads `stage_criterion`
 *  only; its CRUD belongs to the config module. */
@Injectable()
export class OpportunityGateRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async activeCriteria(
    stages: readonly StageKey[],
    handle: Db = this.db,
  ): Promise<StageCriterionRowDb[]> {
    if (stages.length === 0) return []
    return handle
      .select()
      .from(stageCriterion)
      .where(and(eq(stageCriterion.active, true), inArray(stageCriterion.stage, [...stages])))
  }

  /** `activeOnly: false` is for unticking: a criterion switched off after it
   *  was ticked must still be clearable. */
  async criterion(id: string, activeOnly: boolean): Promise<StageCriterionRowDb | null> {
    const [row] = await this.db
      .select()
      .from(stageCriterion)
      .where(
        and(eq(stageCriterion.id, id), activeOnly ? eq(stageCriterion.active, true) : undefined),
      )
      .limit(1)
    return row ?? null
  }

  /** Active criteria in checklist order and every tick the given deals hold —
   *  the ONE read behind both the deal's checklist door and the journey lanes.
   *  Two lists rather than a join, so one statement pair serves any number of
   *  deals; `gateStatesOf` pairs them. */
  async checklist(dealCodes: readonly string[]): Promise<GateChecklist> {
    const [criteria, ticks] = await Promise.all([
      this.db
        .select({ id: stageCriterion.id, stage: stageCriterion.stage, label: stageCriterion.label })
        .from(stageCriterion)
        .where(eq(stageCriterion.active, true))
        .orderBy(asc(stageCriterion.ord), asc(stageCriterion.id)),
      dealCodes.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              deal: opportunityCriterionTick.opportunityCode,
              criterionId: opportunityCriterionTick.criterionId,
              at: opportunityCriterionTick.tickedAt,
              by: opportunityCriterionTick.tickedBy,
            })
            .from(opportunityCriterionTick)
            .where(inArray(opportunityCriterionTick.opportunityCode, [...dealCodes])),
    ])
    return { criteria, ticks }
  }

  async tickedIds(code: string, handle: Db = this.db): Promise<Set<string>> {
    const rows = await handle
      .select({ id: opportunityCriterionTick.criterionId })
      .from(opportunityCriterionTick)
      .where(eq(opportunityCriterionTick.opportunityCode, code))
    return new Set(rows.map((r) => r.id))
  }

  /** Idempotent: a second tick keeps the first one's time and name, and the
   *  stored row is what comes back. */
  async tick(
    row: Omit<OpportunityCriterionTickRowDb, 'tickedAt'>,
  ): Promise<OpportunityCriterionTickRowDb> {
    await this.db.insert(opportunityCriterionTick).values(row).onConflictDoNothing()
    const [stored] = await this.db
      .select()
      .from(opportunityCriterionTick)
      .where(
        and(
          eq(opportunityCriterionTick.opportunityCode, row.opportunityCode),
          eq(opportunityCriterionTick.criterionId, row.criterionId),
        ),
      )
      .limit(1)
    if (!stored) throw new Error(`sales.opportunity_criterion_tick: ${row.criterionId} not stored`)
    return stored
  }

  async untick(code: string, criterionId: string): Promise<void> {
    await this.db
      .delete(opportunityCriterionTick)
      .where(
        and(
          eq(opportunityCriterionTick.opportunityCode, code),
          eq(opportunityCriterionTick.criterionId, criterionId),
        ),
      )
  }
}

export type GateChecklist = {
  /** Active only, in checklist order. */
  criteria: { id: string; stage: StageKey; label: string }[]
  ticks: { deal: string; criterionId: string; at: Date; by: string }[]
}
