import { sql } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import { leadHeld } from '../hold/hold.sql'

/** Flow C5 (ADR 0097 §6): which audience leads a closing campaign parks again.
 *  SQL only — the sweeper decides, `LeadStateWriter.parked` writes.
 *
 *  "Since the campaign started" = its first wave's `mail_run.created_at`: the
 *  campaign row stores no start moment, and the first wave is what `/start` writes.
 *
 *  A real exchange is read off the PRIMARY facts, not `exchange-logged`: that
 *  kind is also what a mail sent writes, and a call on a lead already `working`
 *  writes no touch at all. So: a confirmed call or a reply on the trail, a turn
 *  logged in comms on any channel but our own desk — outbound email excluded —
 *  or a meeting marked held. */

/** One lead to park, with the campaign that parks it and who hears of it. */
export type SilentMember = { code: string; campaignCode: string; ownerId: string }

@Injectable()
export class CampaignParkRepository {
  /** Leads to park, locked `FOR UPDATE`: added while `nurturing`, `working`
   *  now, holder set, not on hold, no real exchange since the start, and not
   *  taken back by a person since then (a `resumed` row by someone, or a hold
   *  ended by resume or by an exchange). A lead in two closing campaigns parks
   *  once, under the first code. */
  async silentMembers(tx: Db, campaignCodes: readonly string[]): Promise<SilentMember[]> {
    if (campaignCodes.length === 0) return []
    const codes = sql.join(
      campaignCodes.map((c) => sql`${c}`),
      sql`, `,
    )
    const r = (await tx.execute(sql`
      WITH started AS (
        SELECT cr."subject_code" AS campaign_code, min(r."created_at") AS at
          FROM "sales"."mail_sequence_run" cr
          JOIN "platform"."mail_run" r ON r."id" = cr."mail_run_id"
         WHERE cr."subject_type" = 'campaign' AND cr."subject_code" IN (${codes})
         GROUP BY cr."subject_code"
      )
      SELECT l."code", cm."campaign_code" AS "campaignCode", l."owner_id" AS "ownerId"
        FROM "sales"."campaign_member" cm
        JOIN started s ON s.campaign_code = cm."campaign_code"
        JOIN "sales"."lead" l ON l."code" = cm."lead_code"
       WHERE cm."state" = 'ACTIVE' AND cm."added_while_nurturing"
         AND l."disabled_at" IS NULL AND l."state" = 'working' AND l."owner_id" IS NOT NULL
         AND NOT ${leadHeld(sql`l."code"`)}
         AND NOT EXISTS (SELECT 1 FROM "sales"."touch" t
                          WHERE t."subject_code" = l."code" AND t."at" >= s.at
                            AND (t."kind" IN ('contacted', 'customer-replied')
                              OR (t."kind" = 'resumed' AND t."actor_id" IS NOT NULL)))
         AND NOT EXISTS (SELECT 1 FROM "sales"."hold" h
                          WHERE h."subject_type" = 'lead' AND h."subject_code" = l."code"
                            AND h."end_kind" IN ('resumed', 'touch') AND h."ended_at" >= s.at)
         AND NOT EXISTS (SELECT 1 FROM "comms"."link" k
                           JOIN "comms"."thread" th ON th."id" = k."thread_id"
                           JOIN "comms"."message" m ON m."thread_id" = k."thread_id"
                          WHERE k."object_code" = l."code" AND m."at" >= s.at
                            AND th."channel" <> 'in-app'
                            AND NOT (th."channel" = 'email' AND m."direction" = 'out'))
         AND NOT EXISTS (SELECT 1 FROM "sales"."meeting" mt
                          WHERE mt."subject_code" = l."code" AND mt."held_at" >= s.at)
       ORDER BY l."code", cm."campaign_code"
         FOR UPDATE OF l
    `)) as { rows: SilentMember[] }
    const seen = new Set<string>()
    return r.rows.filter((row) => !seen.has(row.code) && !!seen.add(row.code))
  }
}
