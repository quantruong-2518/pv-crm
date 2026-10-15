import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { HOLD_DUE_NEAR_DAYS } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'

/** One hold whose reminder was just claimed, with who hears it. */
export type ClaimedReminder = {
  id: string
  subjectType: 'lead' | 'opportunity'
  subjectCode: string
  untilDay: string
  /** `true` = the day itself (or past it), `false` = the half-month warning. */
  due: boolean
  setBy: string
  label: string | null
  /** Lead: its holder. Deal: its primary Sale, else everyone on it (ADR 0097 §4). */
  holders: string[]
}

/** The reminder sweep's SQL. Claim and read are ONE statement: a data-modifying
 *  CTE stamps the rows it rings and joins their people, so a quiet pass costs
 *  one probe of `hold_open_until_idx` and nothing else. */
@Injectable()
export class HoldReminderRepository {
  /** Stamps and returns every open hold owed a bell today (Asia/Ho_Chi_Minh).
   *
   *  The two stages never overlap on `until_day`, so one UPDATE claims both.
   *  A hold set inside the warning window never gets the warning. A late pass
   *  still rings the day bell once. A switched-off lead, or a deal on one, is
   *  skipped unstamped: switched back on, it rings then. Two workers racing: the loser re-checks the
   *  WHERE after the winner's commit, sees the stamp and skips the row. */
  async claim(tx: Db): Promise<ClaimedReminder[]> {
    const r = (await tx.execute(sql`
      WITH day AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today),
      claimed AS (
        UPDATE "sales"."hold" h
           SET "reminded_due_at"  = CASE WHEN h."until_day" <= day.today THEN now() ELSE h."reminded_due_at" END,
               "reminded_soon_at" = CASE WHEN h."until_day" >  day.today THEN now() ELSE h."reminded_soon_at" END
          FROM day
         WHERE h."ended_at" IS NULL
           AND h."until_day" <= day.today + ${HOLD_DUE_NEAR_DAYS}::int
           AND NOT EXISTS (SELECT 1 FROM "sales"."lead" off
                            WHERE off."disabled_at" IS NOT NULL
                              AND off."code" = coalesce(h."lead_code",
                                    (SELECT o."lead_code" FROM "sales"."opportunity" o
                                      WHERE o."code" = h."opportunity_code")))
           AND ((h."until_day" <= day.today AND h."reminded_due_at" IS NULL)
             OR (h."until_day" > day.today AND h."reminded_soon_at" IS NULL
                 AND (h."set_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                     < h."until_day" - ${HOLD_DUE_NEAR_DAYS}::int))
        RETURNING h."id", h."subject_type", h."subject_code", h."lead_code",
                  h."opportunity_code", h."until_day", h."set_by", h."until_day" <= day.today AS due
      )
      SELECT c."id"::text AS "id", c."subject_type" AS "subjectType",
             c."subject_code" AS "subjectCode", c."until_day"::text AS "untilDay",
             c."due", c."set_by" AS "setBy", coalesce(l."company", o."name") AS "label",
             CASE WHEN c."subject_type" = 'lead'
                  THEN array_remove(ARRAY[l."owner_id"], NULL)
                  ELSE coalesce(
                    (SELECT array_agg(p."actor_id") FROM "sales"."opportunity_owner" p
                      WHERE p."opportunity_code" = c."opportunity_code"
                        AND p."role" = 'SALE' AND p."is_primary"),
                    (SELECT array_agg(DISTINCT p."actor_id") FROM "sales"."opportunity_owner" p
                      WHERE p."opportunity_code" = c."opportunity_code"),
                    '{}')
             END AS "holders"
        FROM claimed c
        LEFT JOIN "sales"."lead" l ON l."code" = c."lead_code"
        LEFT JOIN "sales"."opportunity" o ON o."code" = c."opportunity_code"
    `)) as { rows: ClaimedReminder[] }
    return r.rows
  }
}
