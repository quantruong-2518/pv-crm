import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { SalesPeriodFigures } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { toVndSql } from '../money'
import type { PeriodSpan } from './performance-period'

type Row = {
  key: string
  leads: number
  first_meetings: number
  opportunities: number
  contracts: number
  signed_count: number
  signed_amount_vnd: number | string
  blank_amount: number
}

/** The only SQL of the module: every span of one period read in ONE statement.
 *
 *  It reads the three books' tables directly, the ordinary thing inside one
 *  branch and the call `leaderboard.repository.ts` already made: no one of the
 *  three owns a figure that sets leads beside signatures.
 *
 *  The signing side is the first query of `ContractRepository.summary` with a
 *  fence added. The cohort links a meeting, deal or contract to its lead the
 *  way `LeadRepository.scorecard` does, but counts LEADS where that one counts
 *  rows — `SalesCohort` says why the two differ.
 *
 *  Month edges are Vietnam calendar days, the form `createdWithin` spells
 *  (`platform/db/book-filter.ts`): the tiles sit beside the lead and contract
 *  books, whose date filters cut there. `ContractRepository.trend` does not. */
@Injectable()
export class PerformanceRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Figures by span key. Every span asked for comes back, empty ones as zeros:
   *  the spans are the driving table and everything else hangs off them. */
  async figures(spans: PeriodSpan[]): Promise<Map<string, SalesPeriodFigures>> {
    const values = sql.join(
      spans.map(
        (s) => sql`(${s.key}::text,
          (${s.from}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
          (${s.to}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      ),
      sql`, `,
    )

    /* Each step asks EXISTS per lead, so a lead with three deals is one and no
       step outgrows `leads`. A contract's deal is NOT NULL, so `contracts`
       cannot pass `opportunities` either. */
    const r = (await this.db.execute(sql`
      WITH span("key", "lo", "hi") AS (VALUES ${values})
      SELECT s."key", c.*, g.*
      FROM span s
      LEFT JOIN LATERAL (
        SELECT count(*)::int                                                    AS leads,
               count(*) FILTER (WHERE l."code" LIKE 'LD-%' AND EXISTS (
                 SELECT 1 FROM "sales"."meeting" m
                  WHERE m."subject_code" = l."code"))::int                      AS first_meetings,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM "sales"."opportunity" o
                  WHERE o."lead_code" = l."code"))::int                         AS opportunities,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM "sales"."contract" k
                  WHERE k."lead_code" = l."code"))::int                         AS contracts
          FROM "sales"."lead" l
         WHERE l."disabled_at" IS NULL
           AND l."created_at" >= s."lo" AND l."created_at" < s."hi"
      ) c ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int                                                    AS signed_count,
               COALESCE(SUM(${toVndSql(contract.amount, contract.currency)}), 0)::bigint
                                                                                AS signed_amount_vnd,
               count(*) FILTER (WHERE ${contract.amount} IS NULL)::int          AS blank_amount
          FROM ${contract} JOIN ${lead} ON ${lead.code} = ${contract.leadCode} AND ${leadLive}
         WHERE ${contract.signedAt} >= s."lo" AND ${contract.signedAt} < s."hi"
      ) g ON true
    `)) as { rows: Row[] }

    /* `bigint` is a string from node-postgres and a number from PGlite. */
    return new Map(
      r.rows.map((row) => [
        row.key,
        {
          cohort: {
            leads: row.leads,
            firstMeetings: row.first_meetings,
            opportunities: row.opportunities,
            contracts: row.contracts,
          },
          signedCount: row.signed_count,
          signedAmountVnd: Number(row.signed_amount_vnd),
          blankAmount: row.blank_amount,
        },
      ]),
    )
  }
}
