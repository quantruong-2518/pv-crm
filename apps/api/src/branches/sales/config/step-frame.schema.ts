import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { StageKey, StepLeadState } from '@pv/contracts'
import { sales } from '../sales.schema'
import { configEntry } from './config.schema'

/** The journey frame (ADR 0080): next-step templates and the free-entry flag,
 *  both hung on one (object kind, state).
 *
 *  Not `config_entry`, for `motion_policy`'s reason: that table is one flat
 *  vocabulary per list, while these rows are keyed by a state of a CLOSED set
 *  and carry a foreign key of their own. They travel the same approval door.
 *
 *  The state sets stay enums in code (ADR 0080 §6), so both tables copy them
 *  into a CHECK by hand: a state added to the contract must be a migration
 *  somebody reads. A stage's deadline is NOT here — `limit_days` on `STAGE`. */

type FrameKind = 'lead' | 'opportunity'
type FrameState = StepLeadState | StageKey

/** Two implications rather than one OR, so an unknown kind fails only
 *  `*_object_kind_known` and each refusal names exactly one constraint. */
const stateKnown = (): SQL =>
  sql`("object_kind" <> 'lead' OR "state_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing'))
      AND ("object_kind" <> 'opportunity' OR "state_key" IN ('new', 'assigned', 'engaged', 'quotation'))`

export const stepTemplate = sales.table(
  'step_template',
  {
    /** A uuid, not a `config_entry`-style code: nothing reads a template id
     *  aloud, and a random id needs no "largest code so far" read to mint. */
    id: uuid('id').primaryKey().defaultRandom(),
    objectKind: text('object_kind').$type<FrameKind>().notNull(),
    /** Lead: the OPEN states only (`StepLeadState`) — a template on `converted`
     *  could never be picked. Opportunity: the four `StageKey` columns. */
    stateKey: text('state_key').$type<FrameState>().notNull(),
    /** Copied into `next_step.text` when picked, hence that column's bound. */
    name: text('name').notNull(),
    /** NOT NULL, unlike `next_step.kind_id`: the comm close-out door refuses a
     *  kindless step, so a kindless template would fail the moment it is picked. */
    kindId: text('kind_id').notNull(),
    /** Key half of the FK, `next_step.kind_list`'s trick. A constant, not that
     *  column's CASE: the CASE only exists because its `kind_id` may be NULL. */
    kindList: text('kind_list')
      .notNull()
      .generatedAlwaysAs((): SQL => sql`'STEP_KIND'`),
    /** NULL means nobody set one — the picker then leaves the date empty.
     *  No default: a default here would be an invented policy number. */
    dueDays: integer('due_days'),
    /** Order within ONE (kind, state), from 1. Not unique: a reorder is a
     *  permutation, and uniqueness would need `config_ord_uniq`'s hand patch. */
    ord: integer('ord').notNull(),
    /** Switched off, never deleted — steps and touches keep pointing at it,
     *  which is what lets both `template_id` foreign keys be plain ones. */
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('step_template_object_kind_known', sql`"object_kind" IN ('lead', 'opportunity')`),
    check('step_template_state_known', stateKnown()),
    /** `next_step_text_bounded`'s rule: `textInput(200)` at the door, repeated
     *  here so no writer can bypass it. */
    check('step_template_name_bounded', sql`btrim("name") <> '' AND char_length("name") <= 200`),
    /** The contract's typo fence (`limitDays`: 1..365), not a policy. */
    check(
      'step_template_due_days_bounded',
      sql`"due_days" IS NULL OR ("due_days" >= 1 AND "due_days" <= 365)`,
    ),
    check('step_template_ord_positive', sql`"ord" > 0`),
    /** Real, not discipline: config rows are never deleted, and the list half
     *  keeps a loss reason from standing in as a step kind. */
    foreignKey({
      name: 'step_template_kind_fk',
      columns: [t.kindId, t.kindList],
      foreignColumns: [configEntry.id, configEntry.list],
    }),
    /** `config_name_live`'s rule per state: case-insensitive, and an off
     *  template keeps its name without blocking a new one of the same name. */
    uniqueIndex('step_template_name_live')
      .on(t.objectKind, t.stateKey, sql`lower("name")`)
      .where(sql`"active"`),
    /** Answers the picker's read: "active templates of one (kind, state), in
     *  `ord`". The config screen reads the whole table and needs none. */
    index('step_template_picker_idx')
      .on(t.objectKind, t.stateKey, t.ord)
      .where(sql`"active"`),
  ],
)

export const stateRule = sales.table(
  'state_rule',
  {
    objectKind: text('object_kind').$type<FrameKind>().notNull(),
    stateKey: text('state_key').$type<FrameState>().notNull(),
    /** May a seller type a step outside the list. No DEFAULT and no seeded
     *  rows: a MISSING row is the default (`FREE_ENTRY_DEFAULT`), resolved at
     *  read, so the contract's constant stays the only copy of it. */
    freeEntry: boolean('free_entry').notNull(),
  },
  (t) => [
    primaryKey({ name: 'state_rule_pk', columns: [t.objectKind, t.stateKey] }),
    check('state_rule_object_kind_known', sql`"object_kind" IN ('lead', 'opportunity')`),
    check('state_rule_state_known', stateKnown()),
  ],
)

export type StepTemplateRowDb = typeof stepTemplate.$inferSelect
export type StepTemplateValues = typeof stepTemplate.$inferInsert
export type StateRuleRowDb = typeof stateRule.$inferSelect
