import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { StageKey, TouchKind } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { account } from '../account/account.schema'
import { contract } from '../contract/contract.schema'
import { opportunityStageEvent } from '../opportunity/opportunity.schema'
import { touch } from '../touch/touch.schema'

/** The extra SQL of ONE journey's profile lanes. Every read takes the whole
 *  run's codes at once, so the statement count is fixed, not one per step. */
@Injectable()
export class WorkstreamLanesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async lanesOf(
    leadCode: string,
    dealCodes: readonly string[],
    accountCode: string | null,
  ): Promise<LaneRows> {
    const deals = [...dealCodes]
    const none = Promise.resolve([])

    const [leadTouches, events, contracts, owner] = await Promise.all([
      this.db
        .select({ at: touch.at, by: touch.by, kind: touch.kind, to: touch.toActorId })
        .from(touch)
        .where(and(eq(touch.subjectCode, leadCode), inArray(touch.kind, [...LEAD_LANE_KINDS])))
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

    return { leadTouches, events, contracts, accountOwner: owner[0] ?? null }
  }
}

/** Every touch kind that MOVES a lead's state (ADR 0058, 0063), and no other:
 *  the lead lane folds its backbone, its nurture loop and its exit out of these.
 *  `tier-raised` is gone with the tier ladder the lane used to draw; so are
 *  `contacted`, `field-filled` and `first-meeting`, which record work done but
 *  move no column — the rung rows are the ones written AS the state moves.
 *
 *  Two kinds per forward rung, legacy beside new, and both stay FOREVER: the
 *  rows written under `first-action`/`verified` are on disk (ADR 0063 §5). Same
 *  pairing as the trigger WHEN list in migration 0058. */
const LEAD_LANE_KINDS = [
  'created',
  'handed-over',
  'first-action',
  'care-planned',
  'verified',
  'exchange-logged',
  'nurtured',
  'resumed',
  'entered-pipeline',
  'exited',
  'archived',
] as const satisfies readonly TouchKind[]

/** One state-moving touch of the anchor lead. `to` is the RECEIVING end of a
 *  hand-over — also set on `created` for a lead born with a holder, which is
 *  the only way to tell that lead from one that landed in the common pool. */
export type LeadTouchEntry = { at: Date; by: string; kind: TouchKind; to: string | null }

export type StageEventRow = {
  deal: string
  at: Date
  by: string
  from: StageKey | null
  to: StageKey | null
  daysInFrom: number | null
}

export type LaneRows = {
  /** Oldest first. */
  leadTouches: LeadTouchEntry[]
  /** Oldest first. */
  events: StageEventRow[]
  /** Newest signature first. */
  contracts: { deal: string; code: string; at: Date }[]
  accountOwner: { id: string; name: string } | null
}
