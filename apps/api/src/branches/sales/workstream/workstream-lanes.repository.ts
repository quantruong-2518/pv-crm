import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { LeadTier, StageKey } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { account } from '../account/account.schema'
import { contract } from '../contract/contract.schema'
import type { GateChecklist } from '../opportunity/opportunity-gate.repository'
import { opportunityStageEvent } from '../opportunity/opportunity.schema'
import { touch } from '../touch/touch.schema'

/** The extra SQL of ONE journey's profile lanes. Every read takes the whole
 *  run's codes at once, so the statement count is fixed, not one per step.
 *  The stage-gate checklist is not read here: `OpportunityGateRepository
 *  .checklist` is its one home. */
@Injectable()
export class WorkstreamLanesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async lanesOf(
    leadCode: string,
    dealCodes: readonly string[],
    accountCode: string | null,
  ): Promise<LaneRead> {
    const deals = [...dealCodes]
    const none = Promise.resolve([])

    const [tiers, events, contracts, owner] = await Promise.all([
      this.db
        .select({ at: touch.at, by: touch.by, tier: touch.toTier })
        .from(touch)
        .where(
          and(eq(touch.subjectCode, leadCode), inArray(touch.kind, ['created', 'tier-raised'])),
        )
        .orderBy(asc(touch.at)),
      deals.length === 0
        ? none
        : this.db
            .select({
              deal: opportunityStageEvent.opportunityCode,
              at: opportunityStageEvent.at,
              by: opportunityStageEvent.by,
              from: opportunityStageEvent.fromStage,
              to: opportunityStageEvent.toStage,
              daysInFrom: opportunityStageEvent.daysInFrom,
            })
            .from(opportunityStageEvent)
            .where(inArray(opportunityStageEvent.opportunityCode, deals))
            .orderBy(asc(opportunityStageEvent.at)),
      deals.length === 0
        ? none
        : this.db
            .select({ deal: contract.opportunityCode, code: contract.code, at: contract.signedAt })
            .from(contract)
            .where(inArray(contract.opportunityCode, deals))
            .orderBy(desc(contract.signedAt), desc(contract.code)),
      accountCode === null
        ? none
        : this.db
            .select({ id: actor.id, name: actor.name })
            .from(account)
            .innerJoin(actor, eq(actor.id, account.ownerId))
            .where(eq(account.code, accountCode))
            .limit(1),
    ])

    return { tiers, events, contracts, accountOwner: owner[0] ?? null }
  }
}

export type TierEntry = { at: Date; by: string; tier: LeadTier | null }

export type StageEventRow = {
  deal: string
  at: Date
  by: string
  from: StageKey | null
  to: StageKey | null
  daysInFrom: number | null
}

type LaneRead = {
  /** Oldest first. */
  tiers: TierEntry[]
  /** Oldest first. */
  events: StageEventRow[]
  /** Newest signature first. */
  contracts: { deal: string; code: string; at: Date }[]
  accountOwner: { id: string; name: string } | null
}

/** What the lane folds read: this file's rows plus the gate checklist. */
export type LaneRows = LaneRead & GateChecklist
