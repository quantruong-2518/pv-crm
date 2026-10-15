import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { ContractKind, WorkstreamDocumentStep } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { attachment } from '@api/platform/storage/attachment.schema'
import { configEntry } from '../config/config.schema'
import { documentStep } from '../workstream/workstream-document.schema'
import { quotation, type QuotationRowDb, type QuotationValues } from './quotation.schema'

/** SQL of the quotation ledger (ADR 0090). Decides nothing: which negotiation
 *  a round joins and whether a reason is acceptable are `QuotationService`'s.
 *
 *  Every write takes the caller's `tx`, which already holds the deal's row
 *  lock (`OpportunityRepository.lockDeal`) — that lock, not the two unique
 *  indexes, is what makes `negotiation_no` and `round_no` safe to mint. */

/** Tagged files of one deal's rounds and contracts, counted per target. */
export type StepFileCount = {
  step: WorkstreamDocumentStep['kind']
  quotationId: string | null
  contractCode: string | null
  n: number
}

@Injectable()
export class QuotationRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** "Has the deal been quoted" — the sign gate (ADR 0064 §3). */
  async exists(handle: Db, code: string): Promise<boolean> {
    const [found] = await handle
      .select({ one: sql`1` })
      .from(quotation)
      .where(eq(quotation.opportunityCode, code))
      .limit(1)
    return found !== undefined
  }

  /** Rows per deal for a page of codes — `OpportunityRow.quotationRounds`. */
  async counts(codes: readonly string[]): Promise<Map<string, number>> {
    if (codes.length === 0) return new Map()
    const rows = await this.db
      .select({ code: quotation.opportunityCode, n: count() })
      .from(quotation)
      .where(inArray(quotation.opportunityCode, [...codes]))
      .groupBy(quotation.opportunityCode)
    return new Map(rows.map((r) => [r.code, r.n]))
  }

  /** Every round of the deal, newest send first. */
  byDeal(handle: Db, code: string): Promise<QuotationRowDb[]> {
    return handle
      .select()
      .from(quotation)
      .where(eq(quotation.opportunityCode, code))
      .orderBy(desc(quotation.sentAt), desc(quotation.negotiationNo), desc(quotation.roundNo))
  }

  async insert(tx: Db, values: QuotationValues): Promise<QuotationRowDb> {
    const [written] = await tx.insert(quotation).values(values).returning()
    if (!written)
      throw new Error(`sales.quotation: INSERT on ${values.opportunityCode} returned no row`)
    return written
  }

  /** A change to a round that is still waiting; `null` = it no longer is. */
  async updatePending(
    tx: Db,
    id: string,
    patch: Partial<QuotationValues>,
  ): Promise<QuotationRowDb | null> {
    const [written] = await tx
      .update(quotation)
      .set(patch)
      .where(and(eq(quotation.id, id), eq(quotation.outcome, 'pending')))
      .returning()
    return written ?? null
  }

  /** A stopped deal: every round still waiting ends `not-closed` under the
   *  deal's own stop reason, so nobody is asked twice (ADR 0090). */
  async closeForStop(tx: Db, code: string, stopReasonKey: string, at: Date): Promise<void> {
    await tx
      .update(quotation)
      .set({ outcome: 'not-closed', closedAt: at, stopReasonKey })
      .where(and(eq(quotation.opportunityCode, code), eq(quotation.outcome, 'pending')))
  }

  /** A kind-less negotiation takes the kind of the contract that wins it: ALL
   *  its rounds move together, keeping their `round_no`, into `place` — a
   *  negotiation number that kind has not used, so no index can collide. */
  async adopt(
    tx: Db,
    round: QuotationRowDb,
    place: { kind: ContractKind; negotiationNo: number },
  ): Promise<void> {
    await tx
      .update(quotation)
      .set(place)
      .where(
        and(
          eq(quotation.opportunityCode, round.opportunityCode),
          isNull(quotation.kind),
          eq(quotation.negotiationNo, round.negotiationNo),
        ),
      )
  }

  /** The signature won `round`: it turns `won`, and every round of its
   *  negotiation carries the contract. `false` = the round stopped waiting. */
  async win(tx: Db, round: QuotationRowDb, contractCode: string, at: Date): Promise<boolean> {
    const won = await this.updatePending(tx, round.id, {
      outcome: 'won',
      closedAt: at,
      contractCode,
    })
    if (!won) return false
    await tx
      .update(quotation)
      .set({ contractCode })
      .where(
        and(
          eq(quotation.opportunityCode, round.opportunityCode),
          sql`coalesce(${quotation.kind}, '') = ${round.kind ?? ''}`,
          eq(quotation.negotiationNo, round.negotiationNo),
        ),
      )
    return true
  }

  /** The live `QUOTE_REVISION_REASON` catalogue in desk order. */
  reasons(handle: Db = this.db): Promise<{ id: string; name: string }[]> {
    return handle
      .select({ id: configEntry.id, name: configEntry.name })
      .from(configEntry)
      .where(and(eq(configEntry.list, 'QUOTE_REVISION_REASON'), eq(configEntry.active, true)))
      .orderBy(asc(configEntry.ord), asc(configEntry.id))
  }

  /** The whole `CONTRACT_KIND` catalogue in desk order, retired rows included:
   *  a hidden kind already stored on a deal still needs its name on screen. */
  kinds(
    handle: Db = this.db,
  ): Promise<{ id: string; name: string; active: boolean; ord: number }[]> {
    return handle
      .select({
        id: configEntry.id,
        name: configEntry.name,
        active: configEntry.active,
        ord: configEntry.ord,
      })
      .from(configEntry)
      .where(eq(configEntry.list, 'CONTRACT_KIND'))
      .orderBy(asc(configEntry.ord), asc(configEntry.id))
  }

  /** Label by config id across both reason lists, retired rows included: a
   *  round closed under a reason since switched off still says why. */
  async reasonNames(handle: Db, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await handle
      .select({ id: configEntry.id, name: configEntry.name })
      .from(configEntry)
      .where(
        and(
          inArray(configEntry.list, ['QUOTE_REVISION_REASON', 'LOSS_REASON']),
          inArray(configEntry.id, [...ids]),
        ),
      )
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  /** Step-tagged files that reached the shelf (`owner_code` set on upload). */
  async fileCounts(
    handle: Db,
    quotationIds: readonly string[],
    contractCodes: readonly string[],
  ): Promise<StepFileCount[]> {
    if (quotationIds.length + contractCodes.length === 0) return []
    return handle
      .select({
        step: documentStep.stepKind,
        quotationId: documentStep.quotationId,
        contractCode: documentStep.contractCode,
        n: count(),
      })
      .from(documentStep)
      .innerJoin(attachment, eq(attachment.id, documentStep.attachmentId))
      .where(
        and(
          isNotNull(attachment.ownerCode),
          or(
            quotationIds.length > 0
              ? inArray(documentStep.quotationId, [...quotationIds])
              : undefined,
            contractCodes.length > 0
              ? inArray(documentStep.contractCode, [...contractCodes])
              : undefined,
          ),
        ),
      )
      .groupBy(documentStep.stepKind, documentStep.quotationId, documentStep.contractCode)
  }
}
