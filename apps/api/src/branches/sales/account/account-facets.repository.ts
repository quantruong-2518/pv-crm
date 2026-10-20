import { and, asc, count, isNotNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { AccountFacetsQuery, LeadCategory } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { readsUnderFloor } from '@api/platform/db/fuzzy'
import { AccountRepository, HAS_SIGNED, accountProbe } from './account.repository'
import { account } from './account.schema'

/** `GET /sales/accounts/facets` in SQL: choices over the WHOLE book. Each list
 *  drops its own filter before counting, so picking one province still offers
 *  the others; the customer tabs drop `customer` for the same reason. */
@Injectable()
export class AccountFacetsRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accounts: AccountRepository,
  ) {}

  async facets(q: AccountFacetsQuery) {
    const without = (key: keyof AccountFacetsQuery) =>
      this.accounts.filtersOf({ ...q, [key]: undefined })

    const [provinces, categories, [tally]] = await readsUnderFloor(this.db, q.q, accountProbe, [
      (db) =>
        db
          .select({ value: account.province, count: count() })
          .from(account)
          .where(and(without('province'), isNotNull(account.province)))
          .groupBy(account.province)
          .orderBy(asc(account.province)),
      (db) =>
        db
          .select({ value: account.category, count: count() })
          .from(account)
          .where(and(without('category'), isNotNull(account.category)))
          .groupBy(account.category)
          .orderBy(asc(account.category)),
      /* One EXISTS per account: `unsigned` is the rest of the same count, not a second scan. */
      (db) =>
        db
          .select({
            total: sql<number>`count(*)::int`,
            signed: sql<number>`count(*) FILTER (WHERE ${HAS_SIGNED})::int`,
          })
          .from(account)
          .where(without('customer')),
    ] as const)

    return {
      provinces: provinces.flatMap((p) => (p.value === null ? [] : [{ ...p, value: p.value }])),
      categories: categories.flatMap((c) =>
        c.value === null ? [] : [{ ...c, value: c.value as LeadCategory }],
      ),
      byCustomer: {
        signed: tally?.signed ?? 0,
        unsigned: (tally?.total ?? 0) - (tally?.signed ?? 0),
      },
    }
  }
}
