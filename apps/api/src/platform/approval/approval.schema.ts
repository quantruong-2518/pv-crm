import {
  boolean,
  check,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ApprovalKind, ApprovalState } from '@pv/contracts'
import type { ChainLink } from '@pv/engines'
import { actor, objectRef, platform } from '../db/platform.schema'

/** Where a request waiting on a person lives — the durable half of E3.
 *
 *  ------------------------------------------------------------------
 *  `platform`, NOT `sales`
 *  ------------------------------------------------------------------
 *  An older note in `config.approval.ts` called this table `sales.approval`.
 *  That was written when Sales was the only branch with anything to approve.
 *  Nine of the eleven pipelines end at a person saying yes, and a
 *  branch-local table would
 *  mean a purchase order approved through a different mechanism than a discount
 *  — which is the one thing an approval inbox exists to prevent. So it sits in
 *  `platform`, next to `actor` and `object`, and every branch asks it.
 *
 *  ------------------------------------------------------------------
 *  THE BRANCH'S PAYLOAD IS OPAQUE HERE, AND THAT IS THE BOUNDARY
 *  ------------------------------------------------------------------
 *  `payload` is `jsonb` that this layer never reads. Sales puts a `ConfigChange`
 *  in it; Supply will one day put something else. The moment `platform` grows a
 *  column that only one branch fills, every other branch inherits a column it
 *  must leave NULL, and the table stops being a platform table.
 *
 *  What platform DOES insist on is `consequence`: a sentence, written when the
 *  request is raised, saying what happens if it is approved. Somebody has to be
 *  able to decide without the screen decoding a payload it does not own — the
 *  reason `ConfigChange` exists on the Sales side rather than a raw patch.
 *
 *  ------------------------------------------------------------------
 *  THE CHAIN IS A COLUMN, NOT A CHILD TABLE
 *  ------------------------------------------------------------------
 *  A chain is read whole, decided whole and written whole: `decideOn` in
 *  `@pv/engines` takes the array and gives a new array back. A child table
 *  would buy per-link queries that nothing asks for, and cost a join plus an
 *  ordering column on every read. The one query that looks inside — "what is
 *  waiting on this person" — is a containment test, which is what the GIN index
 *  below serves. */
export const approval = platform.table(
  'approval',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<ApprovalKind>().notNull(),
    state: text('state').$type<ApprovalState>().notNull().default('waiting'),

    /** Who asked. The id keeps the book honest, the name is a snapshot for the
     *  screen — the same pair, for the same reason, as `sales.touch.by`: a
     *  decision trail that adopts today's names cannot be audited. */
    raisedById: text('raised_by_id')
      .notNull()
      .references(() => actor.id),
    raisedBy: text('raised_by').notNull(),
    raisedAt: timestamp('raised_at', { withTimezone: true }).notNull().defaultNow(),

    /** Rule 9 at the table. An AI proposal without its grounds is refused by
     *  `approval_ai_has_basis` below, not by whichever door remembered. */
    fromAi: boolean('from_ai').notNull().default(false),
    basis: text('basis'),

    /** What the approver reads instead of the payload. Vietnamese: it is
     *  addressed to a person. */
    consequence: text('consequence').notNull(),

    /** The branch's own description of the change. Never read here. */
    payload: jsonb('payload').notNull(),

    chain: jsonb('chain').$type<ChainLink[]>().notNull(),

    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: text('decided_by'),
    /** Why it was turned down. Required on a refusal and forbidden otherwise —
     *  "why was this refused" is the question asked a month later, while "why
     *  was this allowed" is already answered by `consequence`. */
    decidedReason: text('decided_reason'),
  },
  (t) => [
    /** The inbox's only question: what is still waiting. Partial, because a
     *  decided request is never in anybody's inbox again and there is no point
     *  carrying it in the index that answers that. */
    index('approval_waiting_idx')
      .on(t.raisedAt.desc())
      .where(sql`"state" = 'waiting'`),
    /** "Waiting on ME" is `chain @> '[{"person":…,"state":"waiting"}]'`. */
    index('approval_chain_idx').using('gin', t.chain),

    check('approval_state_known', sql`"state" IN ('waiting', 'approved', 'rejected')`),
    /** One kind today. Copied rather than generated, the same call
     *  `touch_kind_known` makes: widening it must be a migration somebody reads. */
    check('approval_kind_known', sql`"kind" IN ('config-change')`),
    /** Rule 9: AI never acts, and never asks without saying on what grounds. */
    check('approval_ai_has_basis', sql`"from_ai" = false OR "basis" IS NOT NULL`),
    /** Decided exactly when it is no longer waiting. Without this the two halves
     *  of "is this settled" can disagree, and the inbox and the audit line then
     *  tell different stories about the same row. */
    check(
      'approval_decided_when_settled',
      sql`("state" = 'waiting') = ("decided_at" IS NULL AND "decided_by" IS NULL)`,
    ),
    /** A request nobody is waiting on is a request that cannot move. */
    check('approval_chain_not_empty', sql`jsonb_array_length("chain") > 0`),
    /** A refusal carries its reason, an approval carries none. */
    check(
      'approval_reason_only_on_refusal',
      sql`("state" = 'rejected') = ("decided_reason" IS NOT NULL)`,
    ),
  ],
)

/** Which object a request hangs off — zero, one or many.
 *
 *  Zero is normal and is why this is a table rather than a column: a change to
 *  the sales department's vocabulary touches no object at all, while a discount
 *  approval touches exactly one deal and a batch action could touch several.
 *  A column would have forced the first case to invent an object.
 *
 *  `object_label` is a snapshot for the same reason `raised_by` is: the object
 *  can be renamed after the request was raised, and the approver has to read
 *  what it was called when the question was asked. */
export const approvalLink = platform.table(
  'approval_link',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => approval.id, { onDelete: 'cascade' }),
    objectCode: text('object_code')
      .notNull()
      .references(() => objectRef.code),
    objectLabel: text('object_label').notNull(),
  },
  (t) => [
    primaryKey({ name: 'approval_link_pk', columns: [t.requestId, t.objectCode] }),
    /** "What is pending on this object" — the deal screen's question. */
    index('approval_link_object_idx').on(t.objectCode),
  ],
)

export type ApprovalRowDb = typeof approval.$inferSelect
export type ApprovalValues = typeof approval.$inferInsert
export type ApprovalLinkRowDb = typeof approvalLink.$inferSelect
