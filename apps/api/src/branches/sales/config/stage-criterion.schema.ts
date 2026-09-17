import { boolean, check, index, integer, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { StageKey } from '@pv/contracts'
import { sales } from '../sales.schema'

/** A stage gate's exit criteria — the checklist a deal must clear before it may
 *  move past a column (rule: `packages/contracts/src/sales/stage-gate.ts`).
 *
 *  NOT a seventh `config_entry` list: the gate is a rule about a fixed axis
 *  (`StageKey`, five values, closed), not vocabulary a person grows. Each row
 *  here also needs an `active` flag that participates in an enforcement
 *  decision (`opportunity-gate.service.ts` reads it to compute "may this deal
 *  advance"), which is a second kind of question `config_entry` was never
 *  built to answer for its six lists. */
export const stageCriterion = sales.table(
  'stage_criterion',
  {
    /** 'SC-01'. Minted by whoever writes the row, same shape as
     *  `config_entry.id` and for the same reason: bare `text`, no sequence, so
     *  a create door can read the current max within its own transaction. */
    id: text('id').primaryKey(),

    stage: text('stage').$type<StageKey>().notNull(),

    /** Display label — Vietnamese is correct here, it is content the seller
     *  reads on a checklist, not a stored code. */
    label: text('label').notNull(),

    /** Checklist order within the stage. Business meaning, like
     *  `config_entry.ord` — not re-sorted alphabetically on read. */
    ord: integer('ord').notNull(),

    /** Off, never deleted: a criterion retired mid-quarter must not erase the
     *  ticks already recorded against deals that cleared it. */
    active: boolean('active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** The five `StageKey` values, hand-copied — the same call every other
     *  CHECK in this branch makes: a sixth stage is a migration somebody
     *  reads, not a line that silently widens. */
    check(
      'stage_criterion_stage_known',
      sql`"stage" IN ('new', 'discovery', 'demo-done', 'quoted', 'awaiting-signature')`,
    ),
    /** Two criteria of one stage cannot share a label — the checklist a
     *  seller reads would show the same line twice. */
    unique('stage_criterion_stage_label').on(t.stage, t.label),
    /** "The checklist of this stage, in order" — the query the gate and the
     *  admin screen both run; nothing else asks about this table. */
    index('stage_criterion_stage_ord_idx').on(t.stage, t.ord),
  ],
)

export type StageCriterionRowDb = typeof stageCriterion.$inferSelect
