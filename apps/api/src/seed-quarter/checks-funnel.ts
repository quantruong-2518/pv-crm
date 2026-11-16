import { sql, type SQL } from 'drizzle-orm'

/** Guarantee checks of the `funnel` emitter: key as in `scenarios.ts`, value a
 *  `SELECT count(*)` over the seeded rows. `FUNNEL_SAFETY` is the other way
 *  round: every query there must count ZERO, or the worker would act on a row. */

const count = (table: string, where = 'true'): SQL =>
  sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)

const delivery = (state: string): SQL =>
  count('platform.email_delivery', `state = '${state}' AND recipient LIKE '%.example'`)

export const CHECKS_FUNNEL: Record<string, SQL> = {
  'campaign:DRAFT': count('sales.campaign', `state = 'DRAFT'`),
  'campaign:RUNNING': count('sales.campaign', `state = 'RUNNING'`),
  'campaign:STOPPED': count('sales.campaign', `state = 'STOPPED'`),
  'campaign:DONE': count('sales.campaign', `state = 'DONE'`),
  'mail_run:SENT': count('platform.mail_run', `state = 'SENT' AND finished_at IS NOT NULL`),
  'mail_run:DRAFT': count('platform.mail_run', `state = 'DRAFT'`),
  'email_delivery:delivered': delivery('delivered'),
  'email_delivery:bounced': delivery('bounced'),
  'email_delivery:suppressed': delivery('suppressed'),
  'email_delivery:complained': delivery('complained'),
  'email_delivery:failed_permanent': delivery('failed_permanent'),
  'email_delivery:withheld': delivery('withheld'),
  'mail_event:OPEN': count('platform.mail_event', `kind = 'OPEN'`),
  'mail_event:CLICK': count('platform.mail_event', `kind = 'CLICK' AND url IS NOT NULL`),
  'mail_event:UNSUBSCRIBE': count('platform.mail_event', `kind = 'UNSUBSCRIBE'`),
  mail_reply: count('platform.mail_reply'),
  email_suppression: count('platform.email_suppression'),
  source_event: count('sales.source_event'),
  source_cost: count('sales.source_cost'),
}

export const FUNNEL_GUARANTEES: string[] = Object.keys(CHECKS_FUNNEL)

export const FUNNEL_SAFETY: Record<string, SQL> = {
  'safety:email_delivery-in-flight': count(
    'platform.email_delivery',
    `state IN ('pending', 'sending', 'delayed', 'accepted')`,
  ),
  'safety:mail_run-in-flight': count('platform.mail_run', `state IN ('SCHEDULED', 'SENDING')`),
  'safety:mail_run-sent-without-finish': count(
    'platform.mail_run',
    `state = 'SENT' AND finished_at IS NULL`,
  ),
  'safety:gated-run-without-release': count(
    'platform.mail_run',
    `awaits_release AND released_at IS NULL AND state = 'SENT'`,
  ),
  'safety:gmail-provider': count('platform.email_delivery', `provider = 'gmail'`),
  'safety:real-recipient': count(
    'platform.email_delivery',
    `recipient NOT LIKE '%.example' AND mail_run_id IN (SELECT mail_run_id FROM sales.mail_sequence_run WHERE subject_type = 'campaign')`,
  ),
  'safety:event-before-delivery': count(
    'platform.mail_event e JOIN platform.email_delivery d ON d.id = e.delivery_id',
    `e.at < COALESCE(d.delivered_at, d.accepted_at)`,
  ),
}
