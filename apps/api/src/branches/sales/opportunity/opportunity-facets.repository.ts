import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { OWNER_NONE, type OpportunityFacetsQuery, type OpportunityOwnerRole } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { opportunity, opportunityOwner } from './opportunity.schema'
import { OpportunityRepository } from './opportunity.repository'

/** `GET /sales/opportunities/facets` in SQL: the choices that occur among the
 *  deals the book would show — the book's own filters (`filtersOf`, minus
 *  `state`) and scope (`scopeOf`), so a facet never offers a choice the book
 *  then answers with nothing — plus a count per state, all DISTINCT in SQL.
 *  `quick` counts each chip through `filtersOf` itself, over the query WITHOUT
 *  the chip fields, so one chip turned on does not zero the others. */
@Injectable()
export class OpportunityFacetsRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly deals: OpportunityRepository,
  ) {}

  async facets(who: Actor, q: OpportunityFacetsQuery) {
    const scope = this.deals.scopeOf(who, true)
    const where = and(...(await this.deals.filtersOf(q)), scope)
    const signed = this.deals.signed()
    const [saleOwners, bdOwners, accounts, [states], quick] = await Promise.all([
      this.lane(where, 'SALE'),
      this.lane(where, 'BD'),
      this.db
        .selectDistinct({ name: lead.company })
        .from(opportunity)
        .innerJoin(lead, eq(lead.code, opportunity.leadCode))
        .where(where)
        .orderBy(asc(lead.company)),
      this.db
        .select({
          open: sql<number>`count(*) FILTER (WHERE ${opportunity.state} = 'open' AND NOT ${signed})::int`,
          lost: sql<number>`count(*) FILTER (WHERE ${opportunity.state} = 'lost' AND NOT ${signed})::int`,
          won: sql<number>`count(*) FILTER (WHERE ${signed})::int`,
        })
        .from(opportunity)
        .innerJoin(lead, eq(lead.code, opportunity.leadCode))
        .where(where),
      this.quick(q, scope),
    ])
    return {
      saleOwners,
      bdOwners,
      accounts: accounts.map((a) => a.name),
      byState: states ?? { open: 0, lost: 0, won: 0 },
      quick,
    }
  }

  /** The three chips' counts. Each chip is the book's own filter for it, so the
   *  number is exactly what its click returns on top of the rest of the query. */
  private async quick(q: OpportunityFacetsQuery, scope: SQL | undefined) {
    const { stage: _s, accepted: _a, sale: _o, overdue: _d, ...rest } = q
    const chip = async (on: OpportunityFacetsQuery) =>
      and(...(await this.deals.filtersOf(on))) ?? sql`true`
    const [base, awaitingAccept, noSeller, overdue] = await Promise.all([
      this.deals.filtersOf(rest),
      chip({ stage: 'new' }),
      chip({ accepted: true, sale: OWNER_NONE }),
      chip({ overdue: true }),
    ])
    const [row] = await this.db
      .select({
        awaitingAccept: sql<number>`count(*) FILTER (WHERE ${awaitingAccept})::int`,
        noSeller: sql<number>`count(*) FILTER (WHERE ${noSeller})::int`,
        overdue: sql<number>`count(*) FILTER (WHERE ${overdue})::int`,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(and(...base, scope))
    return row ?? { awaitingAccept: 0, noSeller: 0, overdue: 0 }
  }

  private lane(where: SQL | undefined, role: OpportunityOwnerRole) {
    return this.db
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
