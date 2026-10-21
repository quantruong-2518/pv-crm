import { Injectable } from '@nestjs/common'
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { LEAD_OPEN_STATES, type UserHoldingsResponse } from '@pv/contracts'
import type { RoleId } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { dealOpen, dealSignWaiting, leadHasOpenDeal } from '../open-deal'
import { leadLive } from '../lead/lead-scope'
import { nextStep } from '../next-step/next-step.schema'
import { lead, type LeadRowDb } from '../lead/lead.schema'
import { ACCEPTOR_NAME } from '../opportunity/opportunity.repository'
import {
  opportunity,
  opportunityOwner,
  type OpportunityRowDb,
} from '../opportunity/opportunity.schema'

/** The leaver hand-over's SQL (ADR 0097 §7). Each predicate is written once
 *  and both `holdings` and the move read it, so the lock dialog's counts are
 *  exactly what moves, less what hangs off a switched-off lead: that moves
 *  too, so nothing stays on the leaver, but uncounted (owner, 15/10/2026). */

/** A lead the leaver holds that is still being worked: an open state (held
 *  ones included — a hold is an overlay), or `converted` with a live deal.
 *  No `leadLive`: a switched-off lead moves with the rest. */
const leadHeldBy = (userId: string): SQL =>
  sql`(${lead.ownerId} = ${userId}
       AND (${lead.state} IN (${sql.join(
         LEAD_OPEN_STATES.map((s) => sql`${s}`),
         sql`, `,
       )}) OR (${lead.state} = 'converted' AND ${leadHasOpenDeal(lead.code)})))`

/** The lead or deal at `code` is, or hangs off, a switched-off lead. */
const switchedOff = (code: SQL): SQL =>
  sql`EXISTS (SELECT 1 FROM "sales"."lead" ho_x
               WHERE ho_x."disabled_at" IS NOT NULL
                 AND (ho_x."code" = ${code}
                      OR ho_x."code" = (SELECT ho_d."lead_code" FROM "sales"."opportunity" ho_d
                                         WHERE ho_d."code" = ${code})))`

/** The leaver stands on the deal's SALE lane. */
const onSaleOf = (userId: string, code: SQL): SQL =>
  sql`EXISTS (SELECT 1 FROM "sales"."opportunity_owner" ho_w
               WHERE ho_w."opportunity_code" = ${code} AND ho_w."actor_id" = ${userId}
                 AND ho_w."role" = 'SALE')`

/** The leaver accepted the deal and its SALE lane is empty, so `holderOf`
 *  names them through `accepted_by_id`: the receiver takes the empty seat. */
const acceptedOnlyBy = (userId: string, code: SQL, acceptedBy: SQL): SQL =>
  sql`(${acceptedBy} = ${userId}
       AND NOT EXISTS (SELECT 1 FROM "sales"."opportunity_owner" ho_e
                        WHERE ho_e."opportunity_code" = ${code} AND ho_e."role" = 'SALE'))`

/** A deal whose SALE lane the hand-over would change, frozen by a waiting
 *  sign request (ADR 0086 §2): it stays on the leaver (ADR 0097 §7). */
const dealSignFrozenFor = (userId: string, code: SQL, state: SQL, acceptedBy: SQL): SQL =>
  sql`(${dealOpen(code, state)} AND ${dealSignWaiting(code)}
       AND (${onSaleOf(userId, code)} OR ${acceptedOnlyBy(userId, code, acceptedBy)}))`

/** An open deal the leaver stands on as SALE that `handDealsOver` can move. */
const dealOnSaleOf = (userId: string, code: SQL, state: SQL): SQL =>
  sql`(${dealOpen(code, state)} AND NOT ${dealSignWaiting(code)} AND ${onSaleOf(userId, code)})`

/** An open deal held only through the leaver's acceptance, movable. */
const dealAcceptedOf = (userId: string, code: SQL, state: SQL, acceptedBy: SQL): SQL =>
  sql`(${dealOpen(code, state)} AND NOT ${dealSignWaiting(code)}
       AND ${acceptedOnlyBy(userId, code, acceptedBy)})`

/** An open deal the leaver stands on as BD. The sign freeze is the SALE
 *  lane's only (ADR 0086 §2), so a waiting request does not keep these. */
const dealOnBdOf = (userId: string, code: SQL, state: SQL): SQL =>
  sql`(${dealOpen(code, state)}
       AND EXISTS (SELECT 1 FROM "sales"."opportunity_owner" ho_b
                    WHERE ho_b."opportunity_code" = ${code} AND ho_b."actor_id" = ${userId}
                      AND ho_b."role" = 'BD'))`

const [hoCode, hoState, hoAccepted] = [
  sql`ho_o."code"`,
  sql`ho_o."state"`,
  sql`ho_o."accepted_by_id"`,
]

/** Every deal the hand-over moves, in any seat, over the alias `ho_o`. */
const dealMovedBy = (userId: string): SQL =>
  sql`(${dealOnSaleOf(userId, hoCode, hoState)} OR ${dealOnBdOf(userId, hoCode, hoState)}
       OR ${dealAcceptedOf(userId, hoCode, hoState, hoAccepted)})`

/** A deal the hand-over moves or the sign freeze keeps: the set it locks. */
const dealTouchedBy = (userId: string): SQL =>
  sql`(${dealMovedBy(userId)} OR ${dealSignFrozenFor(userId, hoCode, hoState, hoAccepted)})`

export type LeaverLead = Pick<LeadRowDb, 'code' | 'state' | 'company'> & {
  ownedByLeaver: boolean
}

@Injectable()
export class HandoverRepository {
  /** The counts, also the receiver's bell line. Read after the move's locks,
   *  as a statement of its own: the locking ones judged their subqueries on
   *  the snapshot they took before waiting. */
  async holdings(tx: Db, userId: string): Promise<UserHoldingsResponse> {
    const r = (await tx.execute(sql`
      SELECT (SELECT count(*)::int FROM ${lead}
               WHERE ${leadHeldBy(userId)} AND ${leadLive}) AS "leads",
             (SELECT count(*)::int FROM ${lead}
               WHERE ${leadHeldBy(userId)} AND NOT ${leadLive}) AS "switchedOffLeads",
             (SELECT count(*)::int FROM "sales"."opportunity" ho_o
               WHERE ${dealMovedBy(userId)} AND NOT ${switchedOff(hoCode)}) AS "opportunities",
             (SELECT count(*)::int FROM "sales"."next_step" ho_s
               WHERE ho_s."doer_id" = ${userId}
                 AND NOT ${switchedOff(sql`ho_s."subject_code"`)}) AS "nextSteps",
             (SELECT count(*)::int FROM "sales"."opportunity" ho_o
               WHERE ${dealMovedBy(userId)} AND ${switchedOff(hoCode)})
             + (SELECT count(*)::int FROM "sales"."next_step" ho_s
                 WHERE ho_s."doer_id" = ${userId}
                   AND ${switchedOff(sql`ho_s."subject_code"`)}) AS "switchedOffOther"
    `)) as { rows: UserHoldingsResponse[] }
    const [row] = r.rows
    return (
      row ?? {
        leads: 0,
        opportunities: 0,
        nextSteps: 0,
        switchedOffLeads: 0,
        switchedOffOther: 0,
      }
    )
  }

  /** Every lead the move touches, locked by code before any deal: the leaver's
   *  own (`ownedByLeaver`), and the leads of their deals. The stop door's order. */
  lockLeads(tx: Db, userId: string): Promise<LeaverLead[]> {
    return tx
      .select({
        code: lead.code,
        state: lead.state,
        company: lead.company,
        ownedByLeaver: sql<boolean>`${leadHeldBy(userId)}`,
      })
      .from(lead)
      .where(
        sql`${leadHeldBy(userId)} OR ${lead.code} IN (
              SELECT ho_o."lead_code" FROM "sales"."opportunity" ho_o WHERE ${dealTouchedBy(userId)})`,
      )
      .orderBy(lead.code)
      .for('update')
  }

  /** Every deal the move changes or the sign freeze keeps, locked after the leads. */
  async lockDeals(tx: Db, userId: string): Promise<string[]> {
    const r = (await tx.execute(sql`
      SELECT ho_o."code" FROM "sales"."opportunity" ho_o
       WHERE ${dealTouchedBy(userId)}
       ORDER BY ho_o."code"
         FOR UPDATE
    `)) as { rows: { code: string }[] }
    return r.rows.map((row) => row.code)
  }

  /** The leaver's BD deals, locked after their leads. */
  lockBdDeals(
    tx: Db,
    userId: string,
  ): Promise<{ row: OpportunityRowDb; acceptorName: string | null }[]> {
    return tx
      .select({ row: opportunity, acceptorName: ACCEPTOR_NAME })
      .from(opportunity)
      .where(dealOnBdOf(userId, sql`${opportunity.code}`, sql`${opportunity.state}`))
      .orderBy(opportunity.code)
      .for('update')
  }

  /** The deals held only through the leaver's acceptance, locked after their leads. */
  lockAcceptedDeals(
    tx: Db,
    userId: string,
  ): Promise<{ row: OpportunityRowDb; acceptorName: string | null }[]> {
    return tx
      .select({ row: opportunity, acceptorName: ACCEPTOR_NAME })
      .from(opportunity)
      .where(
        dealAcceptedOf(
          userId,
          sql`${opportunity.code}`,
          sql`${opportunity.state}`,
          sql`${opportunity.acceptedById}`,
        ),
      )
      .orderBy(opportunity.code)
      .for('update')
  }

  /** The leaver's leads change holder in one UPDATE. Their state stays: a lead
   *  the leaver holds is never in a pool (`new` and `nurturing` have no holder,
   *  `lead_open_owner_matches`), so `ownerSet`'s state-follows-owner branch
   *  cannot fire. The caller re-puts the mirror. */
  async giveLeads(tx: Db, codes: readonly string[], toId: string): Promise<void> {
    await tx
      .update(lead)
      .set({ ownerId: toId })
      .where(inArray(lead.code, [...codes]))
  }

  /** The receiver takes the empty SALE lane as its primary: alone on the lane,
   *  `salePrimaryOf` could name nobody else. `accepted_by_id` stays: it is history. */
  async seatSale(tx: Db, codes: readonly string[], toId: string): Promise<void> {
    await tx.insert(opportunityOwner).values(
      codes.map((code) => ({
        opportunityCode: code,
        actorId: toId,
        role: 'SALE' as const,
        isPrimary: true,
      })),
    )
  }

  /** The leaver's BD seat becomes the receiver's; one row if they already sit there. */
  async swapBd(tx: Db, codes: readonly string[], fromId: string, toId: string): Promise<void> {
    await tx
      .delete(opportunityOwner)
      .where(
        and(
          inArray(opportunityOwner.opportunityCode, [...codes]),
          eq(opportunityOwner.actorId, fromId),
          eq(opportunityOwner.role, 'BD'),
        ),
      )
    await tx
      .insert(opportunityOwner)
      .values(codes.map((code) => ({ opportunityCode: code, actorId: toId, role: 'BD' as const })))
      .onConflictDoNothing()
  }

  /** Every step still on the leaver: the ones on the leads and deals that just
   *  moved, and those they do on somebody else's subject. One UPDATE; `holdings`
   *  counted them all. */
  async moveSteps(tx: Db, fromId: string, toId: string): Promise<void> {
    await tx
      .update(nextStep)
      .set({ doerId: toId, updatedAt: sql`now()` })
      .where(eq(nextStep.doerId, fromId))
  }

  async person(
    tx: Db,
    id: string,
  ): Promise<{ id: string; name: string; roleIds: RoleId[] } | undefined> {
    const [row] = await tx
      .select({ id: actor.id, name: actor.name, roleIds: actor.roleIds })
      .from(actor)
      .where(eq(actor.id, id))
    return row
  }
}
