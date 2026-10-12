import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/** THE one reading of "a real exchange happened on this lead" (ADR 0088 §21),
 *  asked by the funnel's `firstContacts` and KPI `first-response-hours` alike.
 *
 *  Rows of `(actor_id, at)`, each fact off its own ledger:
 *   · a call or message logged on the lead, either direction, credited to the
 *     member who sent it (an inbound turn credits nobody). Not the `meeting`
 *     channel: booking a meeting opens a turn there.
 *   · a run letter to the lead that the provider took (`accepted_at`, the
 *     rule of `LeadMailSentHook`), credited to nobody, as its state move is.
 *   · a meeting HELD, credited to its booker at its start.
 *   · the state machine's `exchange-logged` row: only written when the STATE
 *     moved, so never enough alone, but it holds what predates the ledgers.
 *  No other touch kind: `contacted`/`first-meeting` are written at BOOKING.
 *
 *  `leadCode` is the OUTER column. */
export const realExchanges = (leadCode: SQLWrapper): SQL => sql`
  SELECT rx_i.actor_id, rx_g.at
    FROM comms.link rx_k
    JOIN comms.thread rx_h ON rx_h.id = rx_k.thread_id AND rx_h.channel <> 'meeting'
    JOIN comms.message rx_g ON rx_g.thread_id = rx_h.id
    JOIN comms.identity rx_i ON rx_i.id = rx_g.from_identity_id
   WHERE rx_k.object_code = ${leadCode}
  UNION ALL
  SELECT NULL::text, rx_d.accepted_at
    FROM platform.email_delivery rx_d
   WHERE rx_d.aggregate_type = 'lead' AND rx_d.aggregate_id = ${leadCode}
     AND rx_d.role = 'recipient' AND rx_d.mail_run_id IS NOT NULL
     AND rx_d.accepted_at IS NOT NULL
  UNION ALL
  SELECT rx_m.created_by, rx_m.at
    FROM sales.meeting rx_m
   WHERE rx_m.subject_code = ${leadCode} AND rx_m.held_at IS NOT NULL
  UNION ALL
  SELECT rx_t.actor_id, rx_t.at
    FROM sales.touch rx_t
   WHERE rx_t.subject_code = ${leadCode} AND rx_t.subject_kind = 'lead'
     AND rx_t.kind = 'exchange-logged'`
