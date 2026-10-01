import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type {
  ApprovalState,
  ContractKind,
  CurrencyCode,
  OpportunityOwnerRole,
  StageKey,
  TouchKind,
} from '@pv/contracts'
import type { RoleId } from '@pv/engines'
import { approval } from '@api/platform/approval/approval.schema'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { contract, contractInstallment } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { leadDealsAllLost } from '../open-deal'
import {
  opportunity,
  opportunityOwner,
  opportunityStageEvent,
} from '../opportunity/opportunity.schema'
import { touch } from '../touch/touch.schema'

/** The extra SQL of ONE journey's detail. Every read takes the whole run's
 *  codes at once, so the statement count is fixed, not one per rung.
 *
 *  `dealCodes` are the deals the reader may OPEN: contracts, installments,
 *  stage events, quote sends and sign requests of a hidden deal never leave
 *  the database. `allLost` is asked of every deal, the only fact the lead's
 *  waiting door needs about the ones it may not name. */
@Injectable()
export class WorkstreamLanesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async lanesOf(
    leadCode: string,
    dealCodes: readonly string[],
    stopReasonKeys: readonly string[],
  ): Promise<LaneRows> {
    const deals = [...dealCodes]
    const none = Promise.resolve([])

    const [leadTouches, events, contracts, installments, reasons, quoteSends, signs, owners, lost] =
      await Promise.all([
        this.db
          .select({
            at: touch.at,
            by: touch.by,
            actorId: touch.actorId,
            kind: touch.kind,
            to: touch.toActorId,
            note: touch.note,
            reasonId: touch.reasonId,
            reasonName: configEntry.name,
          })
          .from(touch)
          .leftJoin(
            configEntry,
            and(eq(configEntry.id, touch.reasonId), eq(configEntry.list, 'EXIT_REASON')),
          )
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
                kind: contract.kind,
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
        stopReasonKeys.length === 0
          ? none
          : this.db
              .select({
                id: configEntry.id,
                name: configEntry.name,
                doNotContact: configEntry.doNotContact,
              })
              .from(configEntry)
              .where(
                and(
                  eq(configEntry.list, 'LOSS_REASON'),
                  inArray(configEntry.id, [...stopReasonKeys]),
                ),
              ),
        deals.length === 0
          ? none
          : this.db
              .select({ deal: touch.subjectCode, at: touch.at })
              .from(touch)
              .where(and(inArray(touch.subjectCode, deals), eq(touch.kind, 'quotation-sent')))
              .orderBy(asc(touch.at)),
        deals.length === 0 ? none : this.signApprovalsOf(deals),
        deals.length === 0
          ? none
          : this.db
              .select({
                deal: opportunityOwner.opportunityCode,
                id: opportunityOwner.actorId,
                name: actor.name,
                role: opportunityOwner.role,
                roleId: actor.roleId,
              })
              .from(opportunityOwner)
              .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
              .where(inArray(opportunityOwner.opportunityCode, deals))
              .orderBy(asc(actor.name), asc(actor.id)),
        this.db
          .select({ allLost: sql<boolean>`${leadDealsAllLost(lead.code)}` })
          .from(lead)
          .where(eq(lead.code, leadCode)),
      ])
    const acceptors = await this.acceptorsOf(deals)

    return {
      leadTouches,
      events,
      contracts,
      installments,
      stopReasons: new Map(
        reasons.map((r) => [r.id, { name: r.name, doNotContact: r.doNotContact }]),
      ),
      quoteSends,
      signApprovals: signs,
      dealOwners: owners,
      dealAcceptors: new Map(acceptors.map((a) => [a.deal, { id: a.id, name: a.name }])),
      allLost: lost[0]?.allLost ?? false,
    }
  }

  /** Who accepted each deal (ADR 0071) — the holder's fallback after a Sale. */
  private acceptorsOf(deals: string[]): Promise<{ deal: string; id: string; name: string }[]> {
    if (deals.length === 0) return Promise.resolve([])
    return this.db
      .select({ deal: opportunity.code, id: actor.id, name: actor.name })
      .from(opportunity)
      .innerJoin(actor, eq(actor.id, opportunity.acceptedById))
      .where(inArray(opportunity.code, deals))
  }

  /** Read off `platform.approval` by the same payload key as
   *  `approval_contract_sign_waiting_uq`: the request carries the deal code in
   *  its payload, not as an `approval_link` this read could join. */
  private signApprovalsOf(deals: string[]): Promise<SignApprovalRow[]> {
    const deal = sql<string>`${approval.payload}->>'opportunityCode'`
    return this.db
      .select({
        id: approval.id,
        deal,
        state: approval.state,
        raisedAt: approval.raisedAt,
        decidedAt: approval.decidedAt,
        decidedReason: approval.decidedReason,
      })
      .from(approval)
      .where(and(eq(approval.kind, 'contract-sign'), inArray(deal, deals)))
      .orderBy(asc(approval.raisedAt), asc(approval.id))
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
  /** Stop touches only (ADR 0070): the `EXIT_REASON` id, and its name when the
   *  catalogue still holds it — `'other'` is virtual and never resolves. */
  reasonId: string | null
  reasonName: string | null
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
  /** Null for contracts signed before 0068 named a kind. */
  kind: ContractKind | null
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

export type QuoteSendRow = { deal: string; at: Date }

export type SignApprovalRow = {
  id: string
  deal: string
  state: ApprovalState
  raisedAt: Date
  decidedAt: Date | null
  decidedReason: string | null
}

export type DealOwnerRow = {
  deal: string
  id: string
  name: string
  role: OpportunityOwnerRole
  roleId: RoleId
}

/** `doNotContact` is the catalogue's own flag, `false` on every pre-0068 row. */
export type StopReasonRow = { name: string; doNotContact: boolean }

export type LaneRows = {
  /** Oldest first. */
  leadTouches: LeadTouchEntry[]
  /** Oldest first. */
  events: StageEventRow[]
  /** Oldest signature first. */
  contracts: ContractLaneRow[]
  installments: InstallmentLaneRow[]
  /** `config_entry` LOSS_REASON id → its name and do-not-contact flag. */
  stopReasons: Map<string, StopReasonRow>
  /** Every `quotation-sent` touch of the visible deals, oldest first. */
  quoteSends: QuoteSendRow[]
  /** Every `contract-sign` request of the visible deals, oldest first. */
  signApprovals: SignApprovalRow[]
  /** Owners of the visible deals by actor name then id — `holderOf`'s "first". */
  dealOwners: DealOwnerRow[]
  /** Deal code → who accepted it (ADR 0071), the holder's second fallback. */
  dealAcceptors: Map<string, { id: string; name: string }>
  /** `leadDealsAllLost` over EVERY deal of the lead, hidden ones included. */
  allLost: boolean
}
