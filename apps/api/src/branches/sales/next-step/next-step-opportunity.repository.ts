import { and, eq, exists, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { contract } from '../contract/contract.schema'
import { holderOf } from '../opportunity/opportunity.mapper'
import { opportunity, opportunityOwner } from '../opportunity/opportunity.schema'
import { dealOpen } from '../open-deal'
import { nextStep } from './next-step.schema'
import type { NextStepRead } from './next-step.repository'

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

const VIETNAM_TODAY = sql<string>`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text`

/** SQL of a deal's step: the deal-side questions `NextStepRepository` asks of a
 *  lead. Reads the opportunity tables directly — the opportunity module exports
 *  no scope read, and a service import here would cycle with its sign door. */
@Injectable()
export class OpportunityStepRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Axis 3 as `OpportunityRepository.scopeOf` reads it: any owner role counts. */
  private inScope(who: Actor): SQL<boolean> {
    if (!who.ownOnly) return sql<boolean>`true`
    return sql<boolean>`COALESCE(${exists(
      this.db
        .select({ one: sql`1` })
        .from(opportunityOwner)
        .where(
          and(
            eq(opportunityOwner.opportunityCode, opportunity.code),
            eq(opportunityOwner.actorId, who.id),
          ),
        ),
    )}, false)`
  }

  /** Null = no such deal. Left joins: a deal with no step still answers. */
  async slot(who: Actor, code: string, handle: Db = this.db): Promise<DealSlot | null> {
    const [row] = await handle
      .select({
        open: openOf(),
        signed: signedOf(opportunity.code),
        inScope: this.inScope(who),
        today: VIETNAM_TODAY,
        text: nextStep.text,
        due: nextStep.due,
        doerId: nextStep.doerId,
        doerName: actor.name,
      })
      .from(opportunity)
      .leftJoin(nextStep, eq(nextStep.subjectCode, opportunity.code))
      .leftJoin(actor, eq(actor.id, nextStep.doerId))
      .where(eq(opportunity.code, code))
      .limit(1)
    if (!row) return null

    const { text, due, doerId, doerName, ...deal } = row
    const step =
      text === null || due === null || doerId === null || doerName === null
        ? null
        : { text, due, doerId, doerName }
    return { ...deal, step }
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
      .where(eq(opportunity.code, code))
      .limit(1)
      .for('update')
    return row ?? null
  }

  /** The holder (ADR 0071 §5), by the deal module's one rule (`holderOf`):
   *  every owner and the acceptor are read, the rule picks among them. */
  async holderOf(tx: Db, code: string): Promise<string | null> {
    const owners = await tx
      .select({
        id: actor.id,
        name: actor.name,
        role: opportunityOwner.role,
        roleId: actor.roleId,
      })
      .from(opportunityOwner)
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(eq(opportunityOwner.opportunityCode, code))
    const [deal] = await tx
      .select({ id: actor.id, name: actor.name })
      .from(opportunity)
      .innerJoin(actor, eq(actor.id, opportunity.acceptedById))
      .where(eq(opportunity.code, code))
    return holderOf(owners, deal ?? null)?.id ?? null
  }

  async isOwner(tx: Db, code: string, actorId: string): Promise<boolean> {
    const [row] = await tx
      .select({ one: sql`1` })
      .from(opportunityOwner)
      .where(and(eq(opportunityOwner.opportunityCode, code), eq(opportunityOwner.actorId, actorId)))
      .limit(1)
    return row !== undefined
  }
}
