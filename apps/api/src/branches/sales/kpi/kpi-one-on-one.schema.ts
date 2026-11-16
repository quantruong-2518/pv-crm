import { check, date, index, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { periodShape } from './kpi-allocation.schema'

/** The monthly 1:1 (ADR 0158): one note per person per month, written by the acting seat of
 *  the person's lowest unit, plus up to three dated actions. Editable until the person
 *  acknowledges it (`acknowledged_at` set). Both actor columns are real FKs: only live
 *  actors write or receive a 1:1. */
export const kpiOneOnOne = sales.table(
  'kpi_one_on_one',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: text('period').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    writerId: text('writer_id')
      .notNull()
      .references(() => actor.id),
    note: text('note').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (t) => [
    /** "This person's 1:1 for this month": one per person per month. */
    unique('kpi_one_on_one_period_actor_uq').on(t.period, t.actorId),
    check('kpi_one_on_one_period_shape', periodShape()),
    check('kpi_one_on_one_period_from', sql`"period" >= '2026-12'`),
    check('kpi_one_on_one_note_length', sql`char_length("note") BETWEEN 1 AND 2000`),
    /** A 1:1 with yourself is not a conversation. */
    check('kpi_one_on_one_not_self', sql`"writer_id" <> "actor_id"`),
  ],
)

/** Up to three actions per 1:1, each with a due day; deleted with their 1:1. */
export const kpiOneOnOneAction = sales.table(
  'kpi_one_on_one_action',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oneOnOneId: uuid('one_on_one_id')
      .notNull()
      .references(() => kpiOneOnOne.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    text: text('text').notNull(),
    due: date('due').notNull(),
    doneAt: timestamp('done_at', { withTimezone: true }),
    doneBy: text('done_by').references(() => actor.id),
  },
  (t) => [
    unique('kpi_one_on_one_action_position_uq').on(t.oneOnOneId, t.position),
    /** "Which actions of this 1:1 are still open": the open-actions read and the overdue sweep. */
    index('kpi_one_on_one_action_open_idx')
      .on(t.oneOnOneId)
      .where(sql`"done_at" IS NULL`),
    check('kpi_one_on_one_action_position_range', sql`"position" BETWEEN 1 AND 3`),
    check('kpi_one_on_one_action_text_length', sql`char_length("text") BETWEEN 1 AND 200`),
    /** Done means both when and by whom, or neither. */
    check('kpi_one_on_one_action_done_pair', sql`("done_at" IS NULL) = ("done_by" IS NULL)`),
  ],
)

export type KpiOneOnOneRowDb = typeof kpiOneOnOne.$inferSelect
export type KpiOneOnOneActionRowDb = typeof kpiOneOnOneAction.$inferSelect
