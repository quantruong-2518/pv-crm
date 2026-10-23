import { sql, type SQL } from 'drizzle-orm'
import type { RecareCycles } from '@pv/contracts'
import { toVndSql } from '../money'
import { contractTerminated, journeyInGrowth } from '../open-deal'

/** THE re-care clock (ADR 0121 §4), one copy for the after-sale book and its
 *  sweeper: one row per run in `growth`, with its completion, last contact,
 *  current temperature and next care day. Raw SQL with `as_` aliases for
 *  `open-deal.ts`'s reason: it rides inside both callers' outer queries.
 *
 *  Anchor = the latest RECORDED collection (`paid_recorded_at`, else `paid_at`),
 *  so a back-dated payment does not ring at once; `completed_at` is the money
 *  day the book prints. Contact = a comms turn on a thread with no debrief, or
 *  with one CLOSED that reached someone (a meeting thread counts when held),
 *  a held meeting, a `contacted` touch, or a one-to-one letter —
 *  no run, or a `group` run; campaign (`bulk`) mail and its opens never count. */

/** Every object a run's comms can hang on: the lead, its deals, its contracts. */
const SUBJECTS = sql`(SELECT as_l.code
   UNION ALL SELECT as_o.code FROM sales.opportunity as_o WHERE as_o.lead_code = as_l.code
   UNION ALL SELECT as_k.code FROM sales.contract as_k WHERE as_k.lead_code = as_l.code)`

const LAST_CONTACT = sql`(SELECT max(as_x.at) FROM (
    SELECT as_m.at FROM comms.message as_m
      JOIN comms.thread as_th ON as_th.id = as_m.thread_id
     WHERE as_th.channel <> 'meeting' AND as_m.at <= now()
       AND EXISTS (SELECT 1 FROM comms.link as_lk WHERE as_lk.thread_id = as_th.id AND as_lk.object_code IN ${SUBJECTS})
       AND (NOT EXISTS (SELECT 1 FROM comms.debrief as_d WHERE as_d.thread_id = as_th.id)
            OR EXISTS (SELECT 1 FROM comms.debrief as_d WHERE as_d.thread_id = as_th.id
                        AND as_d.closed_at IS NOT NULL AND NOT as_d.unreached AND NOT as_d.cancelled))
    UNION ALL
    SELECT as_mt.held_at FROM sales.meeting as_mt
     WHERE as_mt.held_at IS NOT NULL AND as_mt.subject_code IN ${SUBJECTS}
    UNION ALL
    SELECT as_t.at FROM sales.touch as_t
     WHERE as_t.kind = 'contacted' AND as_t.subject_code IN ${SUBJECTS}
    UNION ALL
    SELECT as_e.accepted_at FROM platform.email_delivery as_e
      LEFT JOIN platform.mail_run as_mr ON as_mr.id = as_e.mail_run_id
     WHERE as_e.accepted_at IS NOT NULL AND as_e.role = 'recipient'
       AND (as_e.mail_run_id IS NULL OR as_mr.kind = 'group')
       AND as_e.aggregate_id IN ${SUBJECTS}
  ) as_x)`

/** The Vietnam calendar day of the database clock. */
export const VN_TODAY = sql`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`

/** A FROM item (`(…) care`), every run in `growth` with its clock. Columns:
 *  `code` `lead_code` `customer` `lead_owner_id` `completed_at` `anchor_at`
 *  `collected_vnd` `temperature` `temperature_at`
 *  `temperature_by` `last_contact_at` `cycle_days` `base_day` `next_care_on` `care_due`. */
export function careRuns(cycles: RecareCycles): SQL {
  const cycle = sql`CASE as_g.temperature WHEN 'hot' THEN ${cycles.hotDays}::int
    WHEN 'warm' THEN ${cycles.warmDays}::int ELSE ${cycles.coldDays}::int END`
  return sql`(
    SELECT as_c.*, (as_c.base_day + as_c.cycle_days) AS next_care_on,
           (as_c.base_day + as_c.cycle_days) <= ${VN_TODAY} AS care_due
      FROM (
        SELECT as_g.*, ${cycle} AS cycle_days,
               ((greatest(as_g.anchor_at, as_g.last_contact_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS base_day
          FROM (
            SELECT as_w.code, as_l.code AS lead_code, coalesce(as_a.name, as_l.company) AS customer,
                   as_l.owner_id AS lead_owner_id, as_p.completed_at, as_p.anchor_at,
                   as_p.collected_vnd,
                   as_ct.temperature, as_ct.recorded_at AS temperature_at,
                   as_ct.recorded_by AS temperature_by, ${LAST_CONTACT} AS last_contact_at
              FROM sales.workstream as_w
              JOIN sales.lead as_l ON as_l.workstream_code = as_w.code AND as_l.disabled_at IS NULL
              LEFT JOIN sales.account as_a ON as_a.code = as_w.account_code
              JOIN LATERAL (
                SELECT max(as_ci.paid_at) AS completed_at,
                       max(coalesce(as_ci.paid_recorded_at, as_ci.paid_at)) AS anchor_at,
                       coalesce(sum(${toVndSql(sql`as_ci.amount`, sql`as_pk.currency`)}), 0)::bigint AS collected_vnd
                  FROM sales.contract as_pk
                  JOIN sales.contract_installment as_ci ON as_ci.contract_code = as_pk.code
                 WHERE as_pk.lead_code = as_l.code AND NOT ${contractTerminated(sql`as_pk.code`)}
              ) as_p ON true
              LEFT JOIN LATERAL (
                SELECT as_r.temperature, as_r.recorded_at, as_r.recorded_by
                  FROM sales.customer_temperature as_r
                 WHERE as_r.workstream_code = as_w.code
                 ORDER BY as_r.recorded_at DESC LIMIT 1
              ) as_ct ON true
             WHERE ${journeyInGrowth(sql`as_w.code`)}
          ) as_g
      ) as_c
  ) care`
}
