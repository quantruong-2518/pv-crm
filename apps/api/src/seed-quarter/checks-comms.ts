import { sql, type SQL } from 'drizzle-orm'
import { VN_DAY } from './checks-day'

/** Guarantee checks of the `comms` emitter: key as in `scenarios.ts`, value a
 *  `SELECT count(*)` over the seeded rows. Same key as `checks.ts` overrides it.
 *
 *  `COMMS_SAFETY` keys are inverted: they read 1 when no row breaks the rule,
 *  because the report treats 0 as a missing guarantee. The run day and instant
 *  are the database's own (`checks-day.ts`). */

const TODAY = VN_DAY
const NOW = `now()`

const count = (from: string, where: string): SQL =>
  sql.raw(`SELECT count(*)::int AS n FROM ${from} WHERE ${where}`)
const none = (from: string, where: string): SQL =>
  sql.raw(`SELECT (count(*) = 0)::int AS n FROM ${from} WHERE ${where}`)

const meeting = (where: string): SQL => count('sales.meeting', where)
const debrief = (where: string): SQL => count('comms.debrief', where)

export const COMMS_GUARANTEES: string[] = [
  'meeting:held',
  'meeting:scheduled',
  'meeting:cancelled-lead-nurtured',
  'debrief:done',
  'debrief:unreached',
  'debrief:cancelled',
  'debrief:pending',
  'thread:archived',
  'message:in',
  'message:out',
]

export const COMMS_SAFETY: string[] = [
  'safety:meeting-not-synced',
  'safety:no-fresh-open-debrief',
  'safety:answers-match-question',
  'safety:guest-mail-example',
]

export const CHECKS_COMMS: Record<string, SQL> = {
  'meeting:today': meeting(
    `(at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${TODAY} AND held_at IS NULL AND cancelled_at IS NULL`,
  ),
  'meeting:cancelled-opportunity-lost': meeting(`cancel_cause = 'opportunity-lost'`),
  'meeting:held': meeting('held_at IS NOT NULL'),
  'meeting:scheduled': meeting('held_at IS NULL AND cancelled_at IS NULL'),
  'meeting:cancelled-lead-nurtured': meeting(`cancel_cause = 'lead-nurtured'`),
  'debrief:done': debrief('closed_at IS NOT NULL AND NOT unreached AND NOT cancelled'),
  'debrief:unreached': debrief('unreached'),
  'debrief:cancelled': debrief('cancelled'),
  'debrief:pending': debrief('closed_at IS NULL AND NOT booked'),
  'thread:archived': count('comms.thread', `state = 'archived'`),
  'message:in': count('comms.message', `direction = 'in'`),
  'message:out': count('comms.message', `direction = 'out'`),
  'safety:meeting-not-synced': none(
    'sales.meeting',
    'google_event_id IS NOT NULL OR calendar_dirty_at IS NOT NULL',
  ),
  'safety:no-fresh-open-debrief': none(
    'comms.debrief',
    `closed_at IS NULL AND NOT booked AND created_at >= ${NOW} - interval '72 hours'`,
  ),
  'safety:answers-match-question': none(
    'comms.debrief_answer a JOIN sales.config_entry e ON e.id = a.answer_id',
    `e.criterion_id IS DISTINCT FROM a.criterion_id`,
  ),
  'safety:guest-mail-example': none(
    'comms.identity',
    `side = 'guest' AND channel = 'email' AND address NOT LIKE '%.example'`,
  ),
}
