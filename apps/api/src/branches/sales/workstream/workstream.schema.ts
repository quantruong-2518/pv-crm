import { check, index, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { WorkstreamCloseReason } from '@pv/contracts'
import { account } from '../account/account.schema'
import { sales } from '../sales.schema'

/** One customer JOURNEY — the lead, the opportunities raised off it and the
 *  contract that came out of a single run at a single company.
 *
 *  WHY THIS IS NOT `sales.account`. An account is a company for ever; a
 *  workstream is ONE run at it. Folding the two makes the 2024 purchase and
 *  the 2026 purchase the same row, and every "how long did winning take"
 *  then measures the gap between two unrelated events.
 *
 *  NO `platform.object` MIRROR, AND THAT IS ON PURPOSE. `ObjectKind` in
 *  `@pv/engines` has no `'WS'`, so there is no legal mirror row to write and
 *  a foreign key on `code` would refuse every insert — the exact trap
 *  `touch.schema.ts` spells out for `subject_code`. Giving E1 a `WS` kind is
 *  an engine change, not a table change, and it is not this migration. */
export const workstream = sales.table(
  'workstream',
  {
    /** `WS-0042`. Minted by the repository off `workstream_code_seq`, never by
     *  a column DEFAULT — the same split `lead.code` argues at length, and the
     *  same one `nextCode()` already implements for lead, deal and account. */
    code: text('code').primaryKey(),

    /** The company this run belongs to, once somebody has said which.
     *
     *  NULLABLE, and it has to be, for the reason `lead.account_code` gives:
     *  a run starts at the intake door, and the intake door must never be
     *  able to refuse a row over a company nobody has resolved yet. It is
     *  also what makes the backfill possible at all — see migration 0045. */
    accountCode: text('account_code').references(() => account.code),

    /** When the run started. NOT NULL, and with NO `defaultNow()`.
     *
     *  A default would quietly answer a question only the writer can answer:
     *  the journey of a lead imported today may have opened last quarter, and
     *  `now()` would date every backfilled and every imported run to the
     *  moment the row was written. `lead.created_at` carries a default
     *  because it means "when the ROW was made"; this column does not mean
     *  that. */
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),

    /** When the run ENDED. NULL = still running.
     *
     *  This is the column the whole table exists for. Without it a company
     *  has one endless row and "the second time they bought" is not a
     *  question the data can answer; with it, two runs at one account are two
     *  rows that never collapse into each other.
     *
     *  A mark rather than a boolean, the convention `exited_at`, `closed_at`
     *  and `disabled_at` already hold across this repo: what anybody asks
     *  about a finished run is WHEN it finished. */
    closedAt: timestamp('closed_at', { withTimezone: true }),

    /** Which way it ended — `WON` · `LOST` · `CHURNED`. NULL = still running.
     *
     *  Three values, not two: `CHURNED` is a customer who bought and did not
     *  come back, which is neither a deal lost nor a run won, and it is the
     *  one of the three no column in this database can derive today.
     *
     *  Spelled UPPER_SNAKE to match `WorkstreamCloseReason` in
     *  `@pv/contracts` — a stored key, never a label. The Vietnamese words
     *  the screen prints are the mapper's business, not this column's. */
    closeReason: text('close_reason').$type<WorkstreamCloseReason>(),
  },
  (t) => [
    /** "Which runs has this company had, and is one of them still open" — the
     *  question that separates a repeat customer from a first-time one, and a
     *  sequential scan without this. */
    index('workstream_account_idx').on(t.accountCode),

    /** Both directions of one fact: an ended run says how it ended, a running
     *  one claims nothing. Modelled on `lead_exit_pair`. */
    check('workstream_close_pair', sql`("closed_at" IS NULL) = ("close_reason" IS NULL)`),

    /** A run cannot end before it started. Caught here rather than on the
     *  screen: a negative duration looks like nothing on its own row and
     *  only shows up as a wrong average, three screens away. */
    check('workstream_closed_after_opened', sql`"closed_at" IS NULL OR "closed_at" >= "opened_at"`),

    /** The three values, copied out by hand rather than generated: the day a
     *  fourth way of ending is invented, that has to be a migration somebody
     *  reads, not a line that changes under the rows already written. */
    check(
      'workstream_close_reason_known',
      sql`"close_reason" IS NULL OR "close_reason" IN ('WON', 'LOST', 'CHURNED')`,
    ),
  ],
)

/** Code sequence for `WS-nnnn`.
 *
 *  STARTS AT 1, unlike every other code sequence in this branch, and the
 *  difference is the whole reason this note exists. `lead`, `opportunity`,
 *  `contract` and `account` all start high because the frozen fixture already
 *  OWNS a block of their codes and a sequence starting at 1 would walk into it
 *  years later. No fixture, no seed and no migration mints a `WS-` code, so
 *  there is no block to clear — and inventing headroom for a collision that
 *  cannot happen is inventing data. The backfill in 0045 takes the first run
 *  of codes off this same sequence, exactly as 0026 did for `AC-`. */
export const workstreamCodeSeq = sales.sequence('workstream_code_seq', {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
})

export type WorkstreamRowDb = typeof workstream.$inferSelect
