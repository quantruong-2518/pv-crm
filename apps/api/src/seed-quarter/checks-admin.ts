import { RecareCycles, SETTING_REGISTRY } from '@pv/contracts'
import { sql, type SQL } from 'drizzle-orm'
import { careRuns, VN_TODAY } from '@api/branches/sales/after-sale/after-sale.sql'
import { contractTerminated, liveContractOwners } from '@api/branches/sales/open-deal'

/** Guarantee checks of the `admin` emitter: key as in `scenarios.ts`, value a
 *  `SELECT count(*)` over the seeded rows. `ADMIN_SAFETY` is the other kind:
 *  each query must return 0, or the worker would act on the first tick. */

const count = (table: string, where: string): SQL =>
  sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)

const NOTE = (where: string) => count('platform.notification', where)

export const CHECKS_ADMIN: Record<string, SQL> = {
  'notification:unread': NOTE(`read_at IS NULL`),
  'notification:read': NOTE(`read_at IS NOT NULL`),
  'notification:contract-installment-overdue': NOTE(`kind = 'contract-installment-overdue'`),
  'notification:customer-recare-due': NOTE(`kind = 'customer-recare-due'`),
  ai_call: count('platform.ai_call', `true`),
  'ai_call:error': count('platform.ai_call', `outcome = 'error'`),
  'lead_ai_job:DONE': count('sales.lead_ai_job', `state = 'DONE'`),
  'lead_ai_job:FAILED': count('sales.lead_ai_job', `state = 'FAILED'`),
  assistant_session: count('platform.assistant_session', `true`),
  'fx_rate:manual': count('platform.fx_rate', `source = 'manual'`),
}

export const ADMIN_GUARANTEES: string[] = Object.keys(CHECKS_ADMIN)

/** Same cycles as the registry defaults the stand-in setting door answers with. */
const CYCLES = RecareCycles.parse({
  hotDays: SETTING_REGISTRY['sales.after-sale.hot-days'].defaultValue,
  warmDays: SETTING_REGISTRY['sales.after-sale.warm-days'].defaultValue,
  coldDays: SETTING_REGISTRY['sales.after-sale.cold-days'].defaultValue,
})

const TODAY_START = sql`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`

export const ADMIN_SAFETY: Record<string, SQL> = {
  'overdue installment without its bell': sql`
    SELECT count(*)::int AS n
      FROM sales.contract_installment ci
      JOIN sales.contract k ON k.code = ci.contract_code
      JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL
      JOIN platform.actor a ON (a.id = k.owner_id OR a.id = k.collector_id) AND a.disabled_at IS NULL
     WHERE ci.paid_at IS NULL AND ci.due < ${TODAY_START}
       AND NOT ${contractTerminated(sql`k.code`)}
       AND NOT EXISTS (SELECT 1 FROM platform.notification n
             WHERE n.recipient_id = a.id
               AND n.event_key = 'contract-installment-overdue/' || k.code || '/' || ci.no || '/'
                   || to_char(ci.due AT TIME ZONE 'UTC', 'YYYY-MM-DD'))`,
  'due re-care cycle without its bell': sql`
    SELECT count(*)::int AS n FROM (
      SELECT care.code, care.base_day::text AS base_day, care.cycle_days,
             ((${VN_TODAY} - care.base_day) / care.cycle_days)::int AS cycle, a.id AS carer
        FROM ${careRuns(CYCLES)}
        JOIN platform.actor a ON a.id IN ${liveContractOwners(sql`care.lead_code`)} AND a.disabled_at IS NULL
       WHERE care.care_due) d
     WHERE NOT EXISTS (SELECT 1 FROM platform.notification n
             WHERE n.recipient_id = d.carer
               AND n.event_key = 'customer-recare-due/' || d.code || '/' || d.base_day || ':'
                   || d.cycle_days || ':' || d.cycle)`,
  'assistant message still running': count('platform.assistant_message', `state = 'running'`),
  'lead ai job not finished': count('sales.lead_ai_job', `state NOT IN ('DONE', 'FAILED')`),
}
