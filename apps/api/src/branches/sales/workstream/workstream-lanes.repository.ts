import { and, asc, eq, inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { CurrencyCode, StageKey, TouchKind } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { contract, contractInstallment } from '../contract/contract.schema'
import { opportunityStageEvent } from '../opportunity/opportunity.schema'
import { touch } from '../touch/touch.schema'

/** The extra SQL of ONE journey's detail. Every read takes the whole run's
 *  codes at once, so the statement count is fixed, not one per rung.
 *
 *  `dealCodes` are the deals the reader may OPEN: contracts, installments and
 *  stage events of a hidden deal never leave the database. */
@Injectable()
export class WorkstreamLanesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async lanesOf(
    leadCode: string,
    dealCodes: readonly string[],
    careReasonKeys: readonly string[],
  ): Promise<LaneRows> {
    const deals = [...dealCodes]
    const none = Promise.resolve([])

    const [leadTouches, events, contracts, installments, reasons] = await Promise.all([
      this.db
        .select({
          at: touch.at,
          by: touch.by,
          actorId: touch.actorId,
          kind: touch.kind,
          to: touch.toActorId,
          note: touch.note,
        })
        .from(touch)
        .where(and(eq(touch.subjectCode, leadCode), inArray(touch.kind, [...LEAD_LANE_KINDS])))
        .orderBy(asc(touch.at)),
      deals.length === 0
        ? none
        : this.db
            .select({
              deal: opportunityStageEvent.opportunityCode,
              at: opportunityStageEvent.at,
              byId: opportunityStageEvent.byId,
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
            .select({
              code: contract.code,
              deal: contract.opportunityCode,
              amount: contract.amount,
              currency: contract.currency,
              signedAt: contract.signedAt,
              ownerId: contract.ownerId,
              ownerName: actor.name,
            })
            .from(contract)
            .leftJoin(actor, eq(actor.id, contract.ownerId))
            .where(inArray(contract.opportunityCode, deals))
            .orderBy(asc(contract.signedAt), asc(contract.code)),
      deals.length === 0
        ? none
        : this.db
            .select({
              contractCode: contractInstallment.contractCode,
              no: contractInstallment.no,
              label: contractInstallment.label,
              share: contractInstallment.share,
              amount: contractInstallment.amount,
              due: contractInstallment.due,
              paidAt: contractInstallment.paidAt,
            })
            .from(contractInstallment)
            .innerJoin(contract, eq(contract.code, contractInstallment.contractCode))
            .where(inArray(contract.opportunityCode, deals))
            .orderBy(asc(contractInstallment.contractCode), asc(contractInstallment.no)),
      careReasonKeys.length === 0
        ? none
        : this.db
            .select({ id: configEntry.id, name: configEntry.name })
            .from(configEntry)
            .where(
              and(
                eq(configEntry.list, 'LOSS_REASON'),
                inArray(configEntry.id, [...careReasonKeys]),
              ),
            ),
    ])

    return {
      leadTouches,
      events,
      contracts,
      installments,
      careReasons: new Map(reasons.map((r) => [r.id, r.name])),
    }
  }
}

/** Every touch kind that MOVES a lead's state (ADR 0058, 0063), and no other:
 *  the lead rungs and its waiting door fold out of these. Two kinds per forward
 *  rung, legacy beside new, and both stay FOREVER: the rows written under
 *  `first-action`/`verified` are on disk (ADR 0063 §5). Same pairing as the
 *  trigger WHEN list in migration 0058. */
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
] as const satisfies readonly TouchKind[]

/** One state-moving touch of the anchor lead. `to` is the RECEIVING end of a
 *  hand-over — also set on `created` for a lead born with a holder. `actorId`
 *  is null when the machine wrote the row. */
export type LeadTouchEntry = {
  at: Date
  by: string
  actorId: string | null
  kind: TouchKind
  to: string | null
  note: string
}

export type StageEventRow = {
  deal: string
  at: Date
  byId: string
  by: string
  from: StageKey | null
  to: StageKey | null
  daysInFrom: number | null
}

export type ContractLaneRow = {
  code: string
  deal: string
  amount: number | null
  currency: CurrencyCode | null
  signedAt: Date
  ownerId: string | null
  ownerName: string | null
}

export type InstallmentLaneRow = {
  contractCode: string
  no: number
  label: string
  share: number
  amount: number
  due: Date
  paidAt: Date | null
}

export type LaneRows = {
  /** Oldest first. */
  leadTouches: LeadTouchEntry[]
  /** Oldest first. */
  events: StageEventRow[]
  /** Oldest signature first. */
  contracts: ContractLaneRow[]
  installments: InstallmentLaneRow[]
  /** `config_entry` LOSS_REASON id → display name. */
  careReasons: Map<string, string>
}
