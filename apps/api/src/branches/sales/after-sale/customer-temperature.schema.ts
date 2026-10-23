import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CustomerTemperature } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { debrief } from '@api/platform/comms/comms.schema'
import { lead } from '../lead/lead.schema'
import { workstream } from '../workstream/workstream.schema'
import { sales } from '../sales.schema'

/** One temperature reading of a paid-up customer (ADR 0121 §3), written by the
 *  comm close-out that took it, in that close-out's transaction.
 *
 *  One row per close-out: the current temperature is the LATEST row of the
 *  journey. Only its own record's owner edit rewrites a row (ADR 0122).
 *  Nothing marks a row stale when the journey leaves `growth` — that state is
 *  derived on read, and a returning customer's old reading is still history. */
export const customerTemperature = sales.table(
  'customer_temperature',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The journey the book lists — the row's real owner. A plain FK: a
     *  close-out only reaches here for a journey it has already read. */
    workstreamCode: text('workstream_code')
      .notNull()
      .references(() => workstream.code),
    /** The journey's lead, copied so the close-out's step and its reading
     *  name the same lead. Not a pair FK with `workstream_code`: that needs a
     *  new UNIQUE on `sales.lead`, paid on every lead insert, for one writer. */
    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code),
    temperature: text('temperature').$type<CustomerTemperature>().notNull(),
    /** UNIQUE: one close-out gives one reading. CASCADE for
     *  `debrief_answer.debrief_id`'s reason: only an open debrief is ever
     *  deleted (a dropped booking), and an open one has no reading yet. */
    debriefId: uuid('debrief_id')
      .notNull()
      .unique('customer_temperature_debrief_uq')
      .references(() => debrief.id, { onDelete: 'cascade' }),
    /** A real FK, `setting.updated_by`'s reason: only the signed-in owner
     *  closes a debrief, so there is no machine writer to leave NULL for. */
    recordedBy: text('recorded_by')
      .notNull()
      .references(() => actor.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Answers "the current temperature of journey X" (the book and the
     *  sweeper): latest row per journey, filter and order in one. */
    index('customer_temperature_workstream_idx').on(t.workstreamCode, t.recordedAt.desc()),
    /** `CustomerTemperature`, copied by hand for `touch_kind_known`'s reason. */
    check('customer_temperature_known', sql`"temperature" IN ('hot', 'warm', 'cold')`),
  ],
)

export type CustomerTemperatureRowDb = typeof customerTemperature.$inferSelect
export type CustomerTemperatureValues = typeof customerTemperature.$inferInsert
