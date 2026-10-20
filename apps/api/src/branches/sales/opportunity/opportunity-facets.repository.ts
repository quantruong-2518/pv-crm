import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { type OpportunityFacetsQuery, type OpportunityOwnerRole } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { readsUnderFloor } from '@api/platform/db/fuzzy'
import { actor } from '@api/platform/db/platform.schema'
import { dealHeld } from '../hold/hold.sql'
import { lead } from '../lead/lead.schema'
import { opportunity, opportunityOwner } from './opportunity.schema'
import { OpportunityRepository, opportunityProbe } from './opportunity.repository'

/** `GET /sales/opportunities/facets` in SQL: the choices that occur among the
 *  deals the book would show — the book's own filters (`filtersOf`, minus
 *  `state`) and scope (`scopeOf`), so a facet never offers a choice the book
 *  then answers with nothing — plus a count per state, all DISTINCT in SQL.
 *  A held deal is off the book (`onBoard`), so it is counted in `held` alone. */
@Injectable()
export class OpportunityFacetsRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly deals: OpportunityRepository,
  ) {}

  async facets(who: Actor, q: OpportunityFacetsQuery) {
    const scope = this.deals.scopeOf(who, true)
    const filtered = and(...(await this.deals.filtersOf(q, who.id)), scope)
    const where = and(filtered, this.deals.onBoard(q))
    const signed = this.deals.signed()
    /* The state counts run on the book's deals, `held` on every filtered one: one scan. */
    const board = this.deals.onBoard(q) ?? sql`true`
    const [saleOwners, bdOwners, accounts, [counts]] = await readsUnderFloor(
      this.db,
      q.q,
      opportunityProbe,
      [
        (db) => this.lane(db, where, 'SALE'),
        (db) => this.lane(db, where, 'BD'),
        (db) =>
          db
            .selectDistinct({ name: lead.company })
            .from(opportunity)
            .innerJoin(lead, eq(lead.code, opportunity.leadCode))
            .where(where)
            .orderBy(asc(lead.company)),
        (db) =>
          db
            .select({
              open: sql<number>`count(*) FILTER (WHERE ${board} AND ${opportunity.state} = 'open' AND NOT ${signed})::int`,
              lost: sql<number>`count(*) FILTER (WHERE ${board} AND ${opportunity.state} = 'lost' AND NOT ${signed})::int`,
              won: sql<number>`count(*) FILTER (WHERE ${board} AND ${signed})::int`,
              held: sql<number>`count(*) FILTER (WHERE ${dealHeld(opportunity.code)})::int`,
            })
            .from(opportunity)
            .innerJoin(lead, eq(lead.code, opportunity.leadCode))
            .where(filtered),
      ] as const,
    )
    return {
      saleOwners,
      bdOwners,
      accounts: accounts.map((a) => a.name),
      byState: { open: counts?.open ?? 0, lost: counts?.lost ?? 0, won: counts?.won ?? 0 },
      held: counts?.held ?? 0,
    }
  }

  private lane(db: Db, where: SQL | undefined, role: OpportunityOwnerRole) {
    return db
      .selectDistinct({ id: actor.id, name: actor.name })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .innerJoin(
        opportunityOwner,
        and(
          eq(opportunityOwner.opportunityCode, opportunity.code),
          eq(opportunityOwner.role, role),
        ),
      )
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(where)
      .orderBy(asc(actor.name), asc(actor.id))
  }
}
