import { and, count, eq, exists, inArray, isNotNull, isNull, not, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { RoleId as EngineRoleId } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { dongOf } from '../money'
import { opportunity, opportunityOwner } from '../opportunity/opportunity.schema'

/** One person's row, with the role still spelled the way the database and E2
 *  spell it. The mapper is where it becomes the ASCII wire spelling. */
export type LeaderboardTally = {
  actorId: string
  name: string
  roleId: EngineRoleId
  leadsOwned: number
  opsOpen: number
  opsOpenAmountVnd: number
  opsBlank: number
  won: number
  lost: number
  signedCount: number
  signedAmountVnd: number
}

/** The only SQL of the module. Three books tallied per person, then welded.
 *
 *  It reads `sales.lead`, `sales.opportunity` and `sales.contract` directly
 *  rather than through their services, which is the ordinary thing inside one
 *  branch — the cross-branch rule is what forbids reaching through a table.
 *  None of the three owns this question: a row here is exactly the join of all
 *  three, so parking it in any one module would make the other two reach across
 *  for it. */
@Injectable()
export class LeaderboardRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Ordered by signed money, then by name.
   *
   *  Four round trips: three tallies that do not depend on each other, then the
   *  people behind whichever ids came back. The order cannot be a SQL `ORDER
   *  BY` because the column it sorts on only exists after the three are merged.
   *
   *  `SUM` is `bigint`, which node-postgres returns as a STRING and PGlite as a
   *  number — `Number()` takes both, and an `::int` cast would overflow. */
  async rows(): Promise<LeaderboardTally[]> {
    const opsVnd = dongOf(opportunity.amount, opportunity.currency)
    const contractVnd = dongOf(contract.amount, contract.currency)
    /* Standing in one of the five columns, read from `stage` and not from
       `state`: both terminal states leave the board, and a signed deal whose
       `state` still says `nego` would be counted open. */
    const open = sql`${opportunity.stage} IS NOT NULL`
    const signed = this.dealSigned()

    const [leads, ops, contracts] = await Promise.all([
      this.db
        .select({ actorId: lead.ownerId, n: count() })
        .from(lead)
        /* "Still running" = not exited and not signed, the same branch
           `lead.repository.ts#statusFilter` takes. Leads this person used to
           hold do not count: the column answers what is on the desk today. */
        .where(and(isNotNull(lead.ownerId), isNull(lead.exitReason), not(this.leadSigned())))
        .groupBy(lead.ownerId),
      /* Joined through `opportunity_owner` filtered to SALE, so a deal with a
         Sale and a BD on it lands once, on the Sale. */
      this.db
        .select({
          actorId: opportunityOwner.actorId,
          open: sql<number>`count(*) FILTER (WHERE ${open})::int`,
          openAmountVnd: sql<
            number | string
          >`COALESCE(SUM(${opsVnd}) FILTER (WHERE ${open}), 0)::bigint`,
          blank: sql<number>`count(*) FILTER (WHERE ${open} AND ${opportunity.amount} IS NULL)::int`,
          won: sql<number>`count(*) FILTER (WHERE ${signed})::int`,
          /* Lost = the column says lost AND nothing was signed, so won and lost
             never count one deal twice — the same tie-break the scorecard uses,
             where a contract beats whatever `state` still reads. */
          lost: sql<number>`count(*) FILTER (WHERE ${opportunity.state} = 'close-lost' AND NOT ${signed})::int`,
        })
        .from(opportunityOwner)
        .innerJoin(opportunity, eq(opportunity.code, opportunityOwner.opportunityCode))
        .where(eq(opportunityOwner.role, 'SALE'))
        .groupBy(opportunityOwner.actorId),
      /* The whole book, no period: the overview has no period axis of its own,
         and inventing one here would disagree with the Performance screen's. */
      this.db
        .select({
          actorId: contract.ownerId,
          n: count(),
          amountVnd: sql<number | string>`COALESCE(SUM(${contractVnd}), 0)::bigint`,
        })
        .from(contract)
        .where(isNotNull(contract.ownerId))
        .groupBy(contract.ownerId),
    ])

    /* Who is on the desk: holding something NOW. A person whose only trace is a
       deal they lost has nothing on their hands and no row here — which is why
       the opportunity side is admitted on `open`, not on having any deal. */
    const ids = new Set<string>()
    for (const r of leads) if (r.actorId) ids.add(r.actorId)
    for (const r of ops) if (r.open > 0) ids.add(r.actorId)
    for (const r of contracts) if (r.actorId) ids.add(r.actorId)
    if (ids.size === 0) return []

    const byLead = new Map(leads.map((r) => [r.actorId, r]))
    const byOps = new Map(ops.map((r) => [r.actorId, r]))
    const byContract = new Map(contracts.map((r) => [r.actorId, r]))

    const people = await this.db
      .select({ id: actor.id, name: actor.name, roleId: actor.roleId })
      .from(actor)
      .where(inArray(actor.id, [...ids]))

    return people
      .map((p) => {
        const o = byOps.get(p.id)
        const c = byContract.get(p.id)

        return {
          actorId: p.id,
          name: p.name,
          roleId: p.roleId,
          leadsOwned: byLead.get(p.id)?.n ?? 0,
          opsOpen: o?.open ?? 0,
          opsOpenAmountVnd: Number(o?.openAmountVnd ?? 0),
          opsBlank: o?.blank ?? 0,
          won: o?.won ?? 0,
          lost: o?.lost ?? 0,
          signedCount: c?.n ?? 0,
          signedAmountVnd: Number(c?.amountVnd ?? 0),
        }
      })
      .sort((a, b) => b.signedAmountVnd - a.signedAmountVnd || a.name.localeCompare(b.name, 'vi'))
  }

  /* Both predicates ask `sales.contract` with an `EXISTS` written here rather
     than borrowed from the two books that already ask it. That is the shape the
     other repositories settled on and for the same reason: an `EXISTS` has to
     ride inside the query that needs it, and calling across for one would be a
     second round trip per row. */

  /** Does this deal have a contract behind it? Matches BOTH columns, the pair
     `contract_opportunity_fk` anchors. */
  private dealSigned(): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(contract)
        .where(
          and(
            eq(contract.opportunityCode, opportunity.code),
            eq(contract.leadCode, opportunity.leadCode),
          ),
        ),
    )
  }

  /** Has this lead been signed? One column here — a contract knows its lead. */
  private leadSigned(): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(contract)
        .where(eq(contract.leadCode, lead.code)),
    )
  }
}
