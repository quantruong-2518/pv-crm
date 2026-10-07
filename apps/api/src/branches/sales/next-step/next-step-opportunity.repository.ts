import { and, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { contract } from '../contract/contract.schema'
import { leadLive } from '../lead/lead-scope'
import { lead } from '../lead/lead.schema'
import { holderOf } from '../opportunity/opportunity.mapper'
import { opportunity, opportunityOwner } from '../opportunity/opportunity.schema'
import { dealOpen, dealStoodBy } from '../open-deal'
import { nextStep } from './next-step.schema'
import { STEP_COLUMNS, stepOf, type NextStepRead } from './next-step.repository'

/** One deal with what grading its step needs. `open` is `dealOpen`'s reading
 *  (not stopped, not signed); `signed` only picks the sentence of a refusal. */
export type DealSlot = {
  open: boolean
  signed: boolean
  inScope: boolean
  today: string
  step: NextStepRead | null
}

const signedOf = (code: SQLWrapper): SQL<boolean> =>
  sql<boolean>`EXISTS (SELECT 1 FROM ${contract} WHERE ${contract.opportunityCode} = ${code})`

const openOf = (): SQL<boolean> => sql<boolean>`${dealOpen(opportunity.code, opportunity.state)}`

/** A deal is off exactly when its lead is: no flag of its own. A subquery, not
 *  a join, so `lock()` keeps locking the deal row alone. */
const leadOn = sql`EXISTS (SELECT 1 FROM ${lead} WHERE ${lead.code} = ${opportunity.leadCode} AND ${leadLive})`

const VIETNAM_TODAY = sql<string>`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text`

/** SQL of a deal's step: the deal-side questions `NextStepRepository` asks of a
 *  lead. Reads the opportunity tables directly — the opportunity module exports
 *  no scope read, and a service import here would cycle with its sign door. */
@Injectable()
export class OpportunityStepRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Axis 3: `dealStoodBy`, the rule `OpportunityRepository.scopeOf` cuts on. */
  private inScope(who: Actor): SQL<boolean> {
    if (!who.ownOnly) return sql<boolean>`true`
    return sql<boolean>`COALESCE(${dealStoodBy(opportunity.code, who.id)}, false)`
  }

  /** Null = no such deal. Left joins: a deal with no step still answers. */
  async slot(who: Actor, code: string, handle: Db = this.db): Promise<DealSlot | null> {
    const [row] = await handle
      .select({
        open: openOf(),
        signed: signedOf(opportunity.code),
        inScope: this.inScope(who),
        today: VIETNAM_TODAY,
        ...STEP_COLUMNS,
      })
      .from(opportunity)
      .leftJoin(nextStep, eq(nextStep.subjectCode, opportunity.code))
      .leftJoin(actor, eq(actor.id, nextStep.doerId))
      .leftJoin(configEntry, eq(configEntry.id, nextStep.kindId))
      .where(and(eq(opportunity.code, code), leadOn))
      .limit(1)
    if (!row) return null

    const { open, signed, inScope, today, ...step } = row
    return { open, signed, inScope, today, step: stepOf(step) }
  }

  /** Deals among `codes` still open and in the caller's scope, with their step
   *  — what a comm close-out may target. */
  async openDeals(who: Actor, codes: readonly string[]) {
    if (codes.length === 0) return []
    return this.db
      .select({ code: opportunity.code, text: nextStep.text, due: nextStep.due })
      .from(opportunity)
      .leftJoin(nextStep, eq(nextStep.subjectCode, opportunity.code))
      .where(and(inArray(opportunity.code, [...codes]), openOf(), leadOn, this.inScope(who)))
  }

  /** The deal row under lock: it is the row the sign and stop doors lock too, so
   *  a step cannot be written on a deal that is being closed at that instant. */
  async lock(tx: Db, who: Actor, code: string) {
    const [row] = await tx
      .select({
        open: openOf(),
        signed: signedOf(opportunity.code),
        inScope: this.inScope(who),
      })
      .from(opportunity)
      .where(and(eq(opportunity.code, code), leadOn))
      .limit(1)
      .for('update')
    return row ?? null
  }

  /** The holder (ADR 0071 §5), by the deal module's one rule (`holderOf`):
   *  every owner and the acceptor are read, the rule picks among them. */
  async holderOf(code: string, handle: Db = this.db): Promise<string | null> {
    const owners = await handle
      .select({
        id: actor.id,
        name: actor.name,
        role: opportunityOwner.role,
        roleIds: actor.roleIds,
      })
      .from(opportunityOwner)
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(eq(opportunityOwner.opportunityCode, code))
    const [deal] = await handle
      .select({ id: actor.id, name: actor.name })
      .from(opportunity)
      .innerJoin(actor, eq(actor.id, opportunity.acceptedById))
      .where(eq(opportunity.code, code))
    return holderOf(owners, deal ?? null)?.id ?? null
  }

  /** The doer stands on or accepted the deal (`dealStoodBy`). */
  async isOwner(tx: Db, code: string, actorId: string): Promise<boolean> {
    const [row] = await tx
      .select({ yes: sql<boolean>`${dealStoodBy(sql`${code}`, actorId)}` })
      .from(sql`(SELECT 1) AS one`)
    return row?.yes === true
  }
}
