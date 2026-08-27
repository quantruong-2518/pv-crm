import { check, index, integer, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { platform } from '../db/platform.schema'

/** ONE ROW PER OUTBOUND GATE, AND THE ROW IS THE SHARED BUDGET.
 *
 *  Resend counts requests per TEAM, not per process. A token bucket held in a
 *  worker's memory therefore grants three budgets on three machines and the
 *  provider is the one who notices. The counter has to live where every worker
 *  can see the same number, which on this stack means a Postgres row updated by
 *  a single atomic statement — the same shape `sales.lead_intake_rate` already
 *  uses for the public intake door.
 *
 *  The park columns sit in the same row on purpose. A 429 is not one job's
 *  problem: the correct reaction is for every worker to stop calling the
 *  provider until `parked_until`, and a second table would mean two round trips
 *  and two chances for the two facts to disagree. */
export const mailGate = platform.table(
  'mail_gate',
  {
    /** The gate being spent, i.e. the queue name. One row today, but the key
     *  keeps a second outbound channel (Zalo, SMS) from having to invent its
     *  own table. */
    key: text('key').primaryKey(),

    /** Fixed window, one second wide — the unit `PV_EMAIL_RATE_PER_SECOND` is
     *  expressed in. Fixed rather than sliding because a fixed window is one
     *  `INSERT … ON CONFLICT DO UPDATE`, and an atomic statement is the whole
     *  reason the counter is here instead of in memory. */
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    windowCount: integer('window_count').notNull(),

    /** Set when the provider answers 429. Until this passes, no worker calls
     *  the provider at all. */
    parkedUntil: timestamp('parked_until', { withTimezone: true }),
    /** Provider error code that closed the gate — the runbook's first question
     *  is always "parked by what". */
    parkedReason: text('parked_reason'),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('mail_gate_parked_idx').on(t.parkedUntil),
    check('mail_gate_count_positive', sql`${t.windowCount} > 0`),
  ],
)

export type MailGateRow = typeof mailGate.$inferSelect
