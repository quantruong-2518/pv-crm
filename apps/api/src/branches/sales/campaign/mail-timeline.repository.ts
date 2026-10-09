import { sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { SALES_INBOX, type MailRunState, type MailSubjectKind } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { stillEditable } from '@api/platform/mail/mail-run.repository'

/** One letter filed on a subject, in the driver's own spelling — see
 *  `MasRecipientRead` for why moments are `Date | string`. */
export type SubjectLetterRead = {
  run_id: string
  subject: string
  run_state: MailRunState
  kind: 'bulk' | 'group'
  scheduled_at: Date | string | null
  sent_at: Date | string | null
  delivery_state: string
  recipient: string
  recipient_name: string | null
  run_cc: string[]
  created_by: string
  created_by_name: string | null
  transport: 'resend' | 'gmail'
  from_address: string
  thread_id: string | null
  error_code: string | null
  error_summary: string | null
  open_count: number
  reply_count: number
  editable: boolean
  campaign_wave: boolean
  addresses: { role: 'to' | 'cc'; address: string; name: string | null }[]
}

/** A reply that came from OUTSIDE the company: not the shared inbox, not an
 *  internal copy on the run, not a live colleague's mailbox. `reply` is a
 *  `platform.mail_reply` alias; `runCc` the run's `cc_addresses` (NULL for a
 *  letter with no run). Inbound `from` may read `Name <addr>`, hence the cut.
 *  Shared by the activity line and the G6 gate — one rule, one place. */
export function fromCustomer(reply: SQL, runCc: SQL): SQL {
  const from = sql`${reply}."from_address"`
  const addr = sql`lower(btrim(COALESCE(substring(${from} from '<([^>]+)>'), ${from})))`
  return sql`(${addr} <> ${SALES_INBOX}
    AND ${addr} <> ALL (COALESCE(${runCc}, '{}'::text[]))
    AND NOT EXISTS (SELECT 1 FROM "platform"."actor" ia
                     WHERE lower(btrim(ia."email")) = ${addr} AND ia."disabled_at" IS NULL))`
}

/** THE ACTIVITY LINE'S LETTERS (G8) for any subject — the generalisation of
 *  `LeadRepository.mailTimeline` to the three detail doors.
 *
 *  Same two filters for that statement's reasons: `mail_run_id IS NOT NULL`
 *  keeps internal alerts off a customer's line, and no scope cut here because
 *  `MailTimelineService` settled it on the object before this runs. Plus
 *  `role = 'recipient'`: a run's archive copy is filed on the run, not on a
 *  customer. `editable` splices the same `stillEditable` the edit gate uses.
 *  An address dropped as suppressed never received the letter, so it is not
 *  listed — unless the whole letter was suppressed, where it names who it was for. */
@Injectable()
export class MailTimelineRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async of(kind: MailSubjectKind, code: string): Promise<SubjectLetterRead[]> {
    const r = (await this.db.execute(sql`
      SELECT r."id"                              AS run_id,
             r."subject"                         AS subject,
             r."state"                           AS run_state,
             r."kind"                            AS kind,
             r."scheduled_at"                    AS scheduled_at,
             d."accepted_at"                     AS sent_at,
             d."state"                           AS delivery_state,
             d."recipient"                       AS recipient,
             d."merge"->>'contact_name'          AS recipient_name,
             r."cc_addresses"                    AS run_cc,
             r."created_by"                      AS created_by,
             a."name"                            AS created_by_name,
             r."transport"                       AS transport,
             r."from_address"                    AS from_address,
             d."provider_thread_id"              AS thread_id,
             d."last_error_code"                 AS error_code,
             d."last_error_summary"              AS error_summary,
             COALESCE(e.open_count, 0)::int      AS open_count,
             COALESCE(p.reply_count, 0)::int     AS reply_count,
             ${stillEditable(sql`r."id"`, sql`r."state"`)} AS editable,
             EXISTS (SELECT 1 FROM "sales"."mail_sequence_run" s
                      WHERE s."mail_run_id" = r."id" AND s."subject_type" = 'campaign') AS campaign_wave,
             COALESCE((SELECT json_agg(json_build_object('role', x."role", 'address', x."address",
                                                         'name', x."display_name")
                                       ORDER BY x."role" DESC, x."position")
                         FROM "platform"."email_delivery_address" x
                        WHERE x."delivery_id" = d."id"
                          AND (x."outcome" <> 'dropped_suppressed' OR d."state" = 'suppressed')),
                      '[]'::json) AS addresses
        FROM "platform"."email_delivery" d
        JOIN "platform"."mail_run" r ON r."id" = d."mail_run_id"
        LEFT JOIN "platform"."actor" a ON a."id" = r."created_by"
        LEFT JOIN LATERAL (
              SELECT count(*) FILTER (WHERE m."kind" = 'OPEN')::int AS open_count
                FROM "platform"."mail_event" m
               WHERE m."delivery_id" = d."id"
             ) e ON true
        LEFT JOIN LATERAL (
              SELECT count(*)::int AS reply_count
                FROM "platform"."mail_reply" p
               WHERE p."delivery_id" = d."id"
                 AND ${fromCustomer(sql.raw('p'), sql`r."cc_addresses"`)}
             ) p ON true
       WHERE d."aggregate_type" = ${kind}
         AND d."aggregate_id" = ${code}
         AND d."mail_run_id" IS NOT NULL
         AND d."role" = 'recipient'
       ORDER BY r."created_at" DESC, r."id" DESC
    `)) as { rows: SubjectLetterRead[] }

    return r.rows
  }
}
