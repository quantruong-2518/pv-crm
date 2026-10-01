import { check, date, foreignKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { sales } from '../sales.schema'

/** The ONE next step on an open lead or deal (`NextStep` in `@pv/contracts`).
 *
 *  The subject code IS the key: "at most one step per object" is the primary
 *  key, not a rule a service remembers. Clearing deletes the row, so there is
 *  no `done`/`cleared` state — the trail of what was done is `sales.touch`
 *  (`next-step-done`), and this table only ever says what is next NOW.
 *
 *  `due_level` is not stored: it is graded against today at read time, and a
 *  stored grade is wrong by the next morning. */
export const nextStep = sales.table(
  'next_step',
  {
    /** A REAL foreign key, unlike `touch.subject_code`: the trap its docblock
     *  describes is gone — `sales.lead.code` (ADR 0043) and, since 0042,
     *  `sales.opportunity.code` both reference `platform.object`, so every LD
     *  and OP already has its mirror row by the time a step can be set. */
    subjectCode: text('subject_code')
      .primaryKey()
      .references(() => objectRef.code),
    text: text('text').notNull(),
    /** A calendar day, not an instant: the step is due ON a day, and the
     *  grade is taken against today in Asia/Ho_Chi_Minh, read off `now()`. */
    due: date('due').notNull(),
    /** Id only — the name is joined from `actor` at read. Unlike `touch.by`,
     *  this answers "who does it", which must follow a renamed person. */
    doerId: text('doer_id')
      .notNull()
      .references(() => actor.id),
    /** Always a signed-in person: no machine writer sets a step. */
    createdBy: text('created_by')
      .notNull()
      .references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** A `STEP_KIND` entry (ADR 0074 §8). NULL on every step set before 0075
     *  and from the step card, which does not ask for one yet. */
    kindId: text('kind_id'),
    /** Key half only, `lead.campaign_list`'s trick: folded into the FK so a
     *  step cannot carry a loss reason as its kind. A `CASE`, not a constant,
     *  because MATCH SIMPLE skips the check when either column is NULL. */
    kindList: text('kind_list').generatedAlwaysAs(
      (): SQL => sql`CASE WHEN "kind_id" IS NULL THEN NULL ELSE 'STEP_KIND' END`,
    ),
  },
  (t) => [
    /** Safe as a real key: config rows are never deleted, only turned off, so
     *  a kind disabled after the step was set still has its row. */
    foreignKey({
      name: 'next_step_kind_fk',
      columns: [t.kindId, t.kindList],
      foreignColumns: [configEntry.id, configEntry.list],
    }),

    /* No index beyond the primary key: the only read is "the step of object X".
       "My steps due this week" would want `(doer_id, due)`; no screen asks it yet. */

    /** Only leads and deals carry a step today. The prefix is copied by hand for
     *  `touch_kind_known`'s reason; `{4,}` because `%04d` pads, never truncates. */
    check('next_step_subject_known', sql`"subject_code" ~ '^(LD|OP)-[0-9]{4,}$'`),
    /** `textInput(200)` at the door, repeated here so no writer can bypass it.
     *  `char_length` counts code points, never more than zod's `.max`. */
    check('next_step_text_bounded', sql`btrim("text") <> '' AND char_length("text") <= 200`),
  ],
)

export type NextStepRowDb = typeof nextStep.$inferSelect
export type NextStepValues = typeof nextStep.$inferInsert
