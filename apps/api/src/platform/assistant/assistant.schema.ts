import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type {
  AssistantEndedBy,
  AssistantMessageState,
  AssistantRecordKind,
  AssistantReportReason,
  AssistantRole,
  AssistantToolOutcome,
} from '@pv/contracts'
import { actor, platform } from '../db/platform.schema'

/** One conversation with the CRM assistant (ADR 0133 D8).
 *
 *  `platform`, not `sales`: the assistant is one agent across branches, and each
 *  branch only registers tools into it.
 *
 *  Deleting a session takes its message and tool-call rows with it. The spend
 *  stays, because `ai_call.turn_id` carries no FK. */
export const assistantSession = platform.table(
  'assistant_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** A real FK: a session opens only for a signed-in person, so the row exists. */
    ownerId: text('owner_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    title: text('title'),

    /** The record the chat was opened from. No FK, for `touch.subject_code`'s
     *  reason: the column names several kinds of row, in more than one table. */
    subjectKind: text('subject_kind').$type<AssistantRecordKind>(),
    subjectCode: text('subject_code'),

    /** Rolled-up text of the older turns, and the last `seq` it covers: read
     *  together, because a summary without its mark cannot say what to replay. */
    summary: text('summary'),
    summaryThrough: integer('summary_through'),

    /** Non-null = kept past the 90-day retention, until it is unpinned. */
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "My sessions, last opened first": the session list. */
    index('assistant_session_owner_idx').on(t.ownerId, t.lastOpenedAt.desc()),
    /** "Which unpinned sessions were last opened over 90 days ago": the purge. */
    index('assistant_session_unpinned_idx')
      .on(t.lastOpenedAt)
      .where(sql`"pinned_at" IS NULL`),
    check(
      'assistant_session_subject_pair',
      sql`("subject_kind" IS NULL) = ("subject_code" IS NULL)`,
    ),
    check(
      'assistant_session_subject_kind_known',
      sql`"subject_kind" IS NULL OR "subject_kind" IN ('lead', 'opportunity', 'contract')`,
    ),
    check('assistant_session_summary_pair', sql`("summary" IS NULL) = ("summary_through" IS NULL)`),
  ],
)

/** One line of a conversation. The assistant row IS the turn: `ai_call.turn_id`
 *  and the audit note both carry its id, so there is no separate turn table. */
export const assistantMessage = platform.table(
  'assistant_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => assistantSession.id, { onDelete: 'cascade' }),
    /** Cascades like `owner_id`: NO ACTION would refuse the delete before the
     *  session's cascade reached this row. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    /** Order within the session; a clock cannot order two rows of one transaction. */
    seq: integer('seq').notNull(),
    role: text('role').$type<AssistantRole>().notNull(),
    /** Empty until the first text; a turn that ends early keeps its partial text. */
    body: text('body').notNull().default(''),
    state: text('state').$type<AssistantMessageState>().notNull(),
    /** Why the turn ended. NULL while running and on `user` rows. */
    endedBy: text('ended_by').$type<AssistantEndedBy>(),
    /** The model the turn pinned to; a route edit mid-turn does not swap it. */
    model: text('model'),
    rounds: smallint('rounds').notNull().default(0),
    /** Tool-result tokens estimated for the turn's cap, not a vendor count. */
    toolTokens: integer('tool_tokens').notNull().default(0),
    firstTextMs: integer('first_text_ms'),
    promptVersion: text('prompt_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** NULL exactly while running, so `user` rows are written with it set. */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    unique('assistant_message_session_seq_uq').on(t.sessionId, t.seq),
    /** "Is a turn already running in this session": the 409, and the fence itself. */
    uniqueIndex('assistant_message_one_running_uq')
      .on(t.sessionId)
      .where(sql`"state" = 'running'`),
    /** "How many turns did this person start in the last hour": the 60-per-hour cap. */
    index('assistant_message_user_turns_idx')
      .on(t.actorId, t.createdAt.desc())
      .where(sql`"role" = 'user'`),
    /** The contract's enums, copied by hand: a new value must be a migration a
     *  person reads. */
    check('assistant_message_role_known', sql`"role" IN ('user', 'assistant')`),
    check(
      'assistant_message_state_known',
      sql`"state" IN ('running', 'done', 'failed', 'stopped')`,
    ),
    check('assistant_message_user_is_done', sql`"role" <> 'user' OR "state" = 'done'`),
    check(
      'assistant_message_running_unfinished',
      sql`("state" = 'running') = ("finished_at" IS NULL)`,
    ),
    /** The loop's round cap, copied by hand. */
    check('assistant_message_rounds_range', sql`"rounds" BETWEEN 0 AND 8`),
    check(
      'assistant_message_ended_by_known',
      sql`"ended_by" IS NULL OR "ended_by" IN ('answer', 'cap-rounds', 'cap-time', 'cap-tokens',
                                                'vendor', 'disabled', 'stopped', 'crash')`,
    ),
  ],
)

/** One tool call inside a turn: what was asked and how it went.
 *
 *  No output column, on purpose: a stored tool result is a stale copy of customer
 *  data. `codes` keeps which records came back, and `platform.audit` who read them. */
export const assistantToolCall = platform.table(
  'assistant_tool_call',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => assistantMessage.id, { onDelete: 'cascade' }),
    round: smallint('round').notNull(),
    /** Order within the round; the model's own call id differs per vendor. */
    position: smallint('position').notNull(),
    name: text('name').notNull(),
    /** Arguments as the model sent them. Bad input is kept: it is what gets debugged. */
    input: jsonb('input').notNull(),
    codes: text('codes').array().notNull().default([]),
    /** NULL when the tool never ran; `hidden` is passed through from the door. */
    rowCount: integer('row_count'),
    hidden: integer('hidden'),
    truncated: boolean('truncated').notNull().default(false),
    /** The call gave the model gated text. The stored answer may quote it, and the table keeps
     *  no output, so a re-read checks the tool's reveal permission against this flag. */
    revealsContent: boolean('reveals_content').notNull().default(false),
    toolTokens: integer('tool_tokens').notNull().default(0),
    outcome: text('outcome').$type<AssistantToolOutcome>().notNull(),
    latencyMs: integer('latency_ms'),
  },
  (t) => [
    unique('assistant_tool_call_slot_uq').on(t.messageId, t.round, t.position),
    check('assistant_tool_call_input_is_object', sql`jsonb_typeof("input") = 'object'`),
    /** Shape only: the registry owns the names, and a model can invent one. */
    check('assistant_tool_call_name_shape', sql`"name" ~ '^[a-z_]+$'`),
    /** The contract's enum, copied by hand for `assistant_message_role_known`'s reason. */
    check(
      'assistant_tool_call_outcome_known',
      sql`"outcome" IN ('ok', 'error', 'refused', 'over-cap', 'bad-input', 'unknown-tool')`,
    ),
  ],
)

/** One press of "report a wrong answer" on one assistant answer. One row per
 *  person per answer, so a second press updates the row rather than stacking one. */
export const assistantReport = platform.table(
  'assistant_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** A purged session takes its reports with it. */
    messageId: uuid('message_id')
      .notNull()
      .references(() => assistantMessage.id, { onDelete: 'cascade' }),
    /** Cascades for `assistant_message.actor_id`'s reason. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    reason: text('reason').$type<AssistantReportReason>().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Also answers "did I already report this answer", leading on `message_id`. */
    unique('assistant_report_message_actor_uq').on(t.messageId, t.actorId),
    /** "Which answers were reported, newest first": the admin list. */
    index('assistant_report_created_idx').on(t.createdAt.desc()),
    /** The contract's enum, copied by hand for `assistant_message_role_known`'s reason. */
    check(
      'assistant_report_reason_known',
      sql`"reason" IN ('wrong-figure', 'missing', 'off-target')`,
    ),
    check('assistant_report_note_length', sql`"note" IS NULL OR char_length("note") <= 500`),
  ],
)

export type AssistantSessionRowDb = typeof assistantSession.$inferSelect
export type AssistantSessionValues = typeof assistantSession.$inferInsert
export type AssistantMessageRowDb = typeof assistantMessage.$inferSelect
export type AssistantMessageValues = typeof assistantMessage.$inferInsert
export type AssistantToolCallRowDb = typeof assistantToolCall.$inferSelect
export type AssistantToolCallValues = typeof assistantToolCall.$inferInsert
export type AssistantReportRowDb = typeof assistantReport.$inferSelect
export type AssistantReportValues = typeof assistantReport.$inferInsert
