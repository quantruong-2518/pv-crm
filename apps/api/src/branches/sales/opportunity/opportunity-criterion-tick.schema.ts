import { primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { actor } from '@api/platform/db/platform.schema'
import { stageCriterion } from '../config/stage-criterion.schema'
import { sales } from '../sales.schema'
import { opportunity } from './opportunity.schema'

/** One ticked box on one deal's stage checklist. A row existing IS "ticked" —
 *  unticking deletes it, there is no boolean to flip. That keeps "who ticked
 *  it and when" from ever going stale: a boolean would need its own
 *  `ticked_at`/`ticked_by` pair anyway, so the row already carries everything
 *  a boolean plus two columns would, with no unticked-but-still-dated state
 *  possible.
 *
 *  Primary key is the pair itself, not a surrogate id: "is this criterion
 *  ticked for this deal" is the only question asked of a single row, and the
 *  pair answers it without a lookup index of its own. */
export const opportunityCriterionTick = sales.table(
  'opportunity_criterion_tick',
  {
    opportunityCode: text('opportunity_code')
      .notNull()
      .references(() => opportunity.code, { onDelete: 'cascade' }),
    criterionId: text('criterion_id')
      .notNull()
      .references(() => stageCriterion.id),

    tickedAt: timestamp('ticked_at', { withTimezone: true }).notNull().defaultNow(),

    /** Both the id and the name, same reason `opportunity_stage_event.by`/`by_id`
     *  are a pair: the id is the fence a report can group by, the name is the
     *  snapshot so an old tick keeps reading correctly after the person
     *  renames or leaves. */
    tickedById: text('ticked_by_id')
      .notNull()
      .references(() => actor.id),
    tickedBy: text('ticked_by').notNull(),
  },
  (t) => [
    primaryKey({
      name: 'opportunity_criterion_tick_pk',
      columns: [t.opportunityCode, t.criterionId],
    }),
  ],
)

export type OpportunityCriterionTickRowDb = typeof opportunityCriterionTick.$inferSelect
