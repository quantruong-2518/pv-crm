import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'

/** One Gmail-sent letter the reply sweep still has a question about. */
export type GmailWatch = {
  deliveryId: string
  threadId: string
  /** `mail_run.created_by` — whose mailbox holds the thread. */
  actorId: string
  /** `mail_run.from_address` as frozen at send click — the mailbox to read. */
  fromAddress: string
}

/** The reply sweep's one read. Its own file because `mail.repository.ts` is
 *  the ledger's write path and this is a worker-clock scan over it. */
@Injectable()
export class GmailSweepRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Letters Gmail accepted within `days` that have no reply yet and still
   *  have a To standing — once either stops being true there is nothing left
   *  to learn from the thread. `d."provider" = 'gmail'` is spelled literally:
   *  it is the predicate of the partial index `email_delivery_gmail_sweep_idx`.
   *  Ordered by actor so the caller opens each mailbox once. */
  async watchList(days: number): Promise<GmailWatch[]> {
    const r = (await this.db.execute(sql`
      SELECT d."id" AS delivery_id,
             d."provider_thread_id" AS thread_id,
             r."created_by" AS actor_id,
             r."from_address" AS from_address
        FROM "platform"."email_delivery" d
        JOIN "platform"."mail_run" r ON r."id" = d."mail_run_id"
       WHERE d."provider" = 'gmail'
         AND d."provider_thread_id" IS NOT NULL
         AND d."accepted_at" >= now() - make_interval(days => ${days}::int)
         AND NOT EXISTS (SELECT 1 FROM "platform"."mail_reply" y WHERE y."delivery_id" = d."id")
         AND EXISTS (SELECT 1 FROM "platform"."email_delivery_address" t
                      WHERE t."delivery_id" = d."id"
                        AND t."role" = 'to'
                        AND t."outcome" = 'queued')
       ORDER BY r."created_by", r."from_address", d."accepted_at"
    `)) as {
      rows: {
        delivery_id: string
        thread_id: string
        actor_id: string
        from_address: string
      }[]
    }
    return r.rows.map((row) => ({
      deliveryId: row.delivery_id,
      threadId: row.thread_id,
      actorId: row.actor_id,
      fromAddress: row.from_address,
    }))
  }
}
