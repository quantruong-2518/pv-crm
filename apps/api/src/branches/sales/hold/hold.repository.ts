import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { HoldSubjectType, LeadState, StageKey } from '@pv/contracts'
import { HOLD_DUE_NEAR_DAYS } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { opportunity } from '../opportunity/opportunity.schema'
import { ACCEPTOR_NAME } from '../opportunity/opportunity.repository'
import { hold } from './hold.schema'
import type { HoldRead } from './hold.sql'

/** SQL of the hold doors and list (ADR 0097 §3). Decides nothing: the
 *  service judged the subject under its own row lock before any write here.
 *  The open-hold reads every other module shares live in `hold.sql.ts`. */

const holder = alias(actor, 'holder')

/** The hold columns every list row reads, as `HoldRead` before the type is set. */
const HOLD_COLUMNS = {
  code: hold.subjectCode,
  untilDay: hold.untilDay,
  note: hold.note,
  setById: hold.setBy,
  setByName: actor.name,
  setAt: hold.setAt,
}

type HoldColumns = {
  code: string
  untilDay: string
  note: string | null
  setById: string
  setByName: string
  setAt: Date
}

const readOf = (type: HoldSubjectType, r: HoldColumns): HoldRead => ({
  subjectType: type,
  code: r.code,
  untilDay: r.untilDay,
  note: r.note,
  setBy: { id: r.setById, name: r.setByName },
  setAt: r.setAt,
})

export type LeadHoldListed = HoldRead & {
  name: string
  customer: string
  state: LeadState
  holder: { id: string; name: string } | null
}

export type DealHoldListed = HoldRead & {
  name: string
  customer: string
  stage: StageKey | null
  acceptedById: string | null
  acceptorName: string | null
}

@Injectable()
export class HoldRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  async insert(
    tx: Db,
    row: { type: HoldSubjectType; code: string; until: string; note: string | null; by: string },
  ): Promise<void> {
    await tx.insert(hold).values({
      subjectType: row.type,
      subjectCode: row.code,
      untilDay: row.until,
      note: row.note,
      setBy: row.by,
    })
  }

  /** Change the open hold's date and/or note. A new date clears the day stamp;
   *  the warning stamp is set when the date lands inside the warning window
   *  (no instant "soon" bell), cleared when it lands beyond. `false` = no open hold. */
  async patch(
    tx: Db,
    type: HoldSubjectType,
    code: string,
    patch: { until?: string | undefined; note?: string | null | undefined },
  ): Promise<boolean> {
    const rows = await tx
      .update(hold)
      .set({
        ...(patch.until !== undefined
          ? {
              untilDay: patch.until,
              remindedSoonAt: sql`CASE WHEN ${patch.until}::date
                <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + ${HOLD_DUE_NEAR_DAYS}::int
                THEN now() END`,
              remindedDueAt: null,
            }
          : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      })
      .where(and(eq(hold.subjectType, type), eq(hold.subjectCode, code), isNull(hold.endedAt)))
      .returning({ id: hold.id })
    return rows.length > 0
  }

  /** Resume stops the clock it paused: `state_since` moves on by the held time,
   *  counted from the later of the hold and the state — a lead that moved while
   *  held (a care plan) must not land with a clock in the future. */
  async shiftLeadClock(tx: Db, code: string, ended: { setAt: Date; endedAt: Date }): Promise<void> {
    await tx
      .update(lead)
      .set({
        stateSince: sql`${lead.stateSince} + GREATEST(interval '0',
          ${ended.endedAt.toISOString()}::timestamptz - GREATEST(${ended.setAt.toISOString()}::timestamptz, ${lead.stateSince}))`,
      })
      .where(eq(lead.code, code))
  }

  /** Open holds on live leads within `scope` (the lead book's axis), by date. */
  async leadRows(scope: SQL | undefined): Promise<LeadHoldListed[]> {
    const rows = await this.db
      .select({
        ...HOLD_COLUMNS,
        name: lead.contactName,
        customer: lead.company,
        state: lead.state,
        holderId: holder.id,
        holderName: holder.name,
      })
      .from(hold)
      .innerJoin(actor, eq(actor.id, hold.setBy))
      .innerJoin(lead, eq(lead.code, hold.leadCode))
      .leftJoin(holder, eq(holder.id, lead.ownerId))
      .where(and(isNull(hold.endedAt), leadLive, scope))
      .orderBy(asc(hold.untilDay), asc(hold.subjectCode))
    return rows.map((r) => ({
      ...readOf('lead', r),
      name: r.name,
      customer: r.customer,
      state: r.state,
      holder: r.holderId && r.holderName ? { id: r.holderId, name: r.holderName } : null,
    }))
  }

  /** Open holds on deals of live leads within `scope` (the deal book's axis). */
  async dealRows(scope: SQL | undefined): Promise<DealHoldListed[]> {
    const rows = await this.db
      .select({
        ...HOLD_COLUMNS,
        name: opportunity.name,
        customer: lead.company,
        stage: opportunity.stage,
        acceptedById: opportunity.acceptedById,
        acceptorName: ACCEPTOR_NAME,
      })
      .from(hold)
      .innerJoin(actor, eq(actor.id, hold.setBy))
      .innerJoin(opportunity, eq(opportunity.code, hold.opportunityCode))
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(and(isNull(hold.endedAt), leadLive, scope))
      .orderBy(asc(hold.untilDay), asc(hold.subjectCode))
    return rows.map((r) => ({
      ...readOf('opportunity', r),
      name: r.name,
      customer: r.customer,
      stage: r.stage,
      acceptedById: r.acceptedById,
      acceptorName: r.acceptorName,
    }))
  }
}
