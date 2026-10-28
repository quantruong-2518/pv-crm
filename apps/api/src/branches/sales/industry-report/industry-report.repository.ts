import { Inject, Injectable } from '@nestjs/common'
import { asc, inArray, sql } from 'drizzle-orm'
import { LEAD_OPEN_STATES } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { configEntry } from '../config/config.schema'
import { contractTerminated } from '../open-deal'

/** One grain's counts. `key` is a category id, an industry id, or null: the
 *  leads with no category on the `category` grain, the one row of `total`. */
export type IndustryTally = {
  grain: 'category' | 'industry' | 'total'
  key: string | null
  open: number
  fresh: number
  deals: number
  won: number
  converted: number
}

const OPEN_STATES = sql.join(
  LEAD_OPEN_STATES.map((s) => sql`${s}`),
  sql`, `,
)

/** SQL of the industry report. Decides nothing.
 *
 *  One fact row per live lead (`f`), then one `GROUP BY` per grain welded with
 *  `UNION ALL`, `source.repository.ts`'s one-grain rule in one round trip:
 *  joining deals and contracts before grouping would multiply rows. A lead with
 *  several industries lands in each industry row, never twice in `total`.
 *  Period edges are Vietnam midnights, `book-filter.ts`'s spelling. */
@Injectable()
export class IndustryReportRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Both lists, retired rows included: a lead may still name one. */
  catalogue() {
    return this.db
      .select({
        id: configEntry.id,
        list: configEntry.list,
        name: configEntry.name,
        active: configEntry.active,
        parentId: configEntry.parentId,
      })
      .from(configEntry)
      .where(inArray(configEntry.list, ['CATEGORY', 'INDUSTRY']))
      .orderBy(asc(configEntry.ord), asc(configEntry.id))
  }

  async tallies(from: string, to: string): Promise<IndustryTally[]> {
    const start = sql`(${from}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`
    const end = sql`(${to}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`
    const sums = sql`sum(f.open)::int AS open, sum(f.fresh)::int AS fresh, sum(f.deals)::int AS deals,
      sum(f.won)::int AS won, sum(f.converted)::int AS converted`
    const result = (await this.db.execute(sql`
      WITH f AS (
        SELECT l.code, l.category_id,
          (l.state IN (${OPEN_STATES}))::int AS open,
          (l.created_at >= ${start} AND l.created_at < ${end})::int AS fresh,
          (SELECT count(*) FROM sales.opportunity o
            WHERE o.lead_code = l.code AND o.created_at >= ${start} AND o.created_at < ${end}) AS deals,
          (SELECT count(*) FROM sales.contract c
            WHERE c.lead_code = l.code AND c.signed_at >= ${start} AND c.signed_at < ${end}
              AND NOT ${contractTerminated(sql`c.code`)}) AS won,
          (l.created_at >= ${start} AND l.created_at < ${end}
            AND EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = l.code))::int AS converted
          FROM sales.lead l
         WHERE l.disabled_at IS NULL
      )
      SELECT 'category' AS grain, f.category_id AS key, ${sums} FROM f GROUP BY f.category_id
      UNION ALL
      SELECT 'industry', li.industry_id, ${sums}
        FROM f JOIN sales.lead_industry li ON li.lead_code = f.code GROUP BY li.industry_id
      UNION ALL
      SELECT 'total', NULL, ${sums} FROM f
    `)) as unknown as { rows: IndustryTally[] }
    return result.rows
  }
}
