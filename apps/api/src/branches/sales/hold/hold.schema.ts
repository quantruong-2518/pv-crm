import {
  check,
  date,
  foreignKey,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { sales } from '../sales.schema'

/** A hold (ADR 0088 §10) — an OVERLAY on a lead or a deal, not a state.
 *
 *  An overlay because the subject keeps its own state underneath: a held lead
 *  is still `working`, a held deal still sits at `quotation`, and resuming puts
 *  it back exactly there. A new state value would have to remember where to go.
 *
 *  One row per hold, kept after it ends: the timeline and the clock shift on
 *  resume (`stage_since += ended_at - set_at`) both need the closed rows.
 *
 *  Unlike `touch.subject_code`, the code IS fenced: two generated key halves
 *  point at `sales.lead` and `sales.opportunity` themselves, not at the
 *  `platform.object` mirror, and neither table ever deletes a row. Spec: §2 of
 *  the care-lists turn. */
export const hold = sales.table(
  'hold',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type').$type<'lead' | 'opportunity'>().notNull(),
    subjectCode: text('subject_code').notNull(),
    /** Key halves only, `next_step.kind_list`'s trick. When `subject_type` is
     *  unknown both are NULL and MATCH SIMPLE skips both keys — so
     *  `hold_subject_type_known` is the one fence left, not a nicety. */
    leadCode: text('lead_code').generatedAlwaysAs(
      (): SQL => sql`CASE WHEN "subject_type" = 'lead' THEN "subject_code" END`,
    ),
    opportunityCode: text('opportunity_code').generatedAlwaysAs(
      (): SQL => sql`CASE WHEN "subject_type" = 'opportunity' THEN "subject_code" END`,
    ),

    /** The see-again day — a day, not an instant: the reminder ladder counts days. */
    untilDay: date('until_day').notNull(),
    note: text('note'),

    /** A real FK, `setting.updated_by`'s reason: only a signed-in person sets a hold. */
    setBy: text('set_by')
      .notNull()
      .references(() => actor.id),
    setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),

    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** NULL even on an ended row: a customer reply ends a hold with nobody pressing anything. */
    endedBy: text('ended_by').references(() => actor.id),
    endKind: text('end_kind').$type<'resumed' | 'to-waiting' | 'touch' | 'stopped' | 'converted'>(),

    /** Stamped by the sweep so each of the two bells rings once. */
    remindedSoonAt: timestamp('reminded_soon_at', { withTimezone: true }),
    remindedDueAt: timestamp('reminded_due_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ name: 'hold_lead_fk', columns: [t.leadCode], foreignColumns: [lead.code] }),
    foreignKey({
      name: 'hold_opportunity_fk',
      columns: [t.opportunityCode],
      foreignColumns: [opportunity.code],
    }),
    /** "Is this subject held right now" — every door, profile and book tab asks
     *  it; partial, so a closed hold never blocks the next one. */
    uniqueIndex('hold_open_subject_uq')
      .on(t.subjectType, t.subjectCode)
      .where(sql`"ended_at" IS NULL`),
    /** "Which open holds reach their date by day D" — the reminder sweep — and
     *  the `/sales/holds` list sorted by date. Closed rows are never asked for. */
    index('hold_open_until_idx')
      .on(t.untilDay)
      .where(sql`"ended_at" IS NULL`),
    check('hold_subject_type_known', sql`"subject_type" IN ('lead', 'opportunity')`),
    /** Copied by hand: a new way to end a hold must be a migration somebody reads.
     *  No `handover` — a handover moves the subject WITH its hold, never ends it.
     *  No `disqualified` since 0130: every park ends a hold as `to-waiting`. */
    check(
      'hold_end_kind_known',
      sql`"end_kind" IS NULL OR "end_kind" IN ('resumed', 'to-waiting', 'touch', 'stopped',
                                              'converted')`,
    ),
    /** An end has a moment and a kind or neither; a person only once it ended. */
    check(
      'hold_end_pair',
      sql`("ended_at" IS NULL) = ("end_kind" IS NULL)
          AND ("ended_by" IS NULL OR "ended_at" IS NOT NULL)`,
    ),
    check('hold_no_blank', sql`"subject_code" <> '' AND ("note" IS NULL OR "note" <> '')`),
  ],
)

export type HoldRowDb = typeof hold.$inferSelect
export type HoldValues = typeof hold.$inferInsert
