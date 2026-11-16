import { sql, type SQL } from 'drizzle-orm'
import { CHECKS_ADMIN } from './checks-admin'
import { CHECKS_COMMS } from './checks-comms'
import { CHECKS_CONTRACTS } from './checks-contracts'
import { CHECKS_DEALS } from './checks-deals'
import { CHECKS_FUNNEL } from './checks-funnel'
import { CHECKS_KPI } from './checks-kpi'
import { CHECKS_LEADS } from './checks-leads'

/** `CHECKS[guarantee]` is a `SELECT count(*) AS n …` that must come out above 0
 *  once the quarter is seeded. Only the ones whose SQL follows directly from a
 *  state column live here; semantic ones (merged, overdue by date, today) are
 *  left to the emitter that knows how it wrote them, in `checks-<domain>.ts`. */

const count = (table: string, where: string): SQL =>
  sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)

const TOUCH_KINDS = [
  'tier-raised',
  'nurtured',
  'demo-held',
  'site-visited',
  'handed-over',
  're-entered',
  'customer-replied',
] as const

const BASE: Record<string, SQL> = {
  'lead:new': count('sales.lead', `state = 'new'`),
  'lead:assigned': count('sales.lead', `state = 'assigned'`),
  'lead:working': count('sales.lead', `state = 'working'`),
  'lead:nurturing': count('sales.lead', `state = 'nurturing'`),
  'lead:disabled': count('sales.lead', `disabled_at IS NOT NULL`),
  'lead:new-replied': count('sales.lead', `state = 'new' AND replied_from_pool_at IS NOT NULL`),
  'lead:tier-sql': count('sales.lead', `tier = 'sql'`),
  'lead:motion-PARTNER': count('sales.lead', `motion = 'PARTNER'`),
  'lead:nurturing-EX-08': count('sales.lead', `state = 'nurturing' AND exit_reason = 'EX-08'`),
  'lead:nurturing-EX-09': count('sales.lead', `state = 'nurturing' AND exit_reason = 'EX-09'`),
  'opportunity:open-new': count('sales.opportunity', `state = 'open' AND stage = 'new'`),
  'opportunity:open-assigned': count('sales.opportunity', `state = 'open' AND stage = 'assigned'`),
  'opportunity:open-engaged': count('sales.opportunity', `state = 'open' AND stage = 'engaged'`),
  'opportunity:open-quotation': count(
    'sales.opportunity',
    `state = 'open' AND stage = 'quotation'`,
  ),
  'opportunity:lost-new': count('sales.opportunity', `state = 'lost' AND stopped_at_stage = 'new'`),
  'opportunity:lost-quotation': count(
    'sales.opportunity',
    `state = 'lost' AND stopped_at_stage = 'quotation'`,
  ),
  'opportunity:lost-other': count('sales.opportunity', `state = 'lost' AND stop_reason = 'other'`),
  'approval:approved': count('platform.approval', `state = 'approved'`),
  'approval:rejected': count('platform.approval', `state = 'rejected'`),
  'approval:waiting-contract-sign': count(
    'platform.approval',
    `state = 'waiting' AND kind = 'contract-sign'`,
  ),
  'installment_overdue_reason:waiting': count(
    'sales.installment_overdue_reason',
    `state = 'waiting'`,
  ),
  'installment_overdue_reason:approved': count(
    'sales.installment_overdue_reason',
    `state = 'approved'`,
  ),
  'installment_overdue_reason:rejected': count(
    'sales.installment_overdue_reason',
    `state = 'rejected'`,
  ),
  'quotation:pending': count('sales.quotation', `outcome = 'pending'`),
  'quotation:not-closed': count('sales.quotation', `outcome = 'not-closed'`),
  'hold:ended-to-waiting': count('sales.hold', `end_kind = 'to-waiting'`),
  'hold:ended-touch': count('sales.hold', `end_kind = 'touch'`),
  'meeting:cancelled-opportunity-lost': count('sales.meeting', `cancel_cause = 'opportunity-lost'`),
  'contract_document:missing': count('sales.contract_document', `state = 'missing'`),
  'customer_temperature:cold': count('sales.customer_temperature', `temperature = 'cold'`),
  'termination:customer-pays': count(
    'sales.contract_termination',
    `penalty_direction = 'customer-pays'`,
  ),
  'termination:company-pays-settled': count(
    'sales.contract_termination',
    `penalty_direction = 'company-pays' AND penalty_settled_on IS NOT NULL`,
  ),
  ...Object.fromEntries(
    TOUCH_KINDS.map((k) => [`touch:${k}`, count('sales.touch', `kind = '${k}'`)]),
  ),
  /* S23 is about a deal changing hands; lead hand-overs alone would pass it falsely. */
  'touch:handed-over': count(
    'sales.touch',
    `kind = 'handed-over' AND subject_kind = 'opportunity'`,
  ),
  'touch:resumed': count('sales.touch', `kind = 'resumed' AND subject_kind = 'lead'`),
}

export const CHECKS: Record<string, SQL> = {
  ...BASE,
  ...CHECKS_FUNNEL,
  ...CHECKS_LEADS,
  ...CHECKS_DEALS,
  ...CHECKS_CONTRACTS,
  ...CHECKS_COMMS,
  ...CHECKS_KPI,
  ...CHECKS_ADMIN,
}
