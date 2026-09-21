import { check, index, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { LeadState, StageKey, WorkstreamCloseReason, WorkstreamStandKind } from '@pv/contracts'
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

    /** WHICH OBJECT OF THE RUN IS LIVE — the lead, a deal, or the signature.
     *
     *  NO WRITE DOOR SETS THIS. Migration 0056's trigger does, off
     *  `sales.workstream_stand()`, which is now the ONLY definition of the
     *  rung; a repository that writes it by hand is a second definition and
     *  will drift. It is materialized so the board can filter and `GROUP BY`
     *  a column instead of folding pages in Node.
     *
     *  The three stored values are `WorkstreamStandKind` VERBATIM, Vietnamese
     *  spelling and all. Law 2 wants a stored key in English; the project
     *  owner took that debt knowingly rather than keep two spellings of one
     *  concept, and paying it is a rename on both ends at once. */
    standKind: text('stand_kind').$type<WorkstreamStandKind>().notNull().default('LD'),

    /** The rung's MACHINE key inside that object: a `StageKey` when the run
     *  stands on a deal, a `LeadState` on a lead, `'signed'` on a contract.
     *
     *  Never `phaseLabel`: a label is translatable text owned by
     *  `config_entry`, so a board grouped on it splits or merges columns the
     *  day somebody renames a catalogue row.
     *
     *  The DEFAULT pair is `('LD','new')` because a run is INSERTed one
     *  statement before the lead that anchors it — see the column's note in
     *  0056. */
    standKey: text('stand_key').$type<StageKey | LeadState | 'signed'>().notNull().default('new'),

    /** The CODE of that live object — a deal, a contract or the lead itself.
     *
     *  It exists so the book can ask a scope question in SQL: does this reader
     *  stand in `opportunity_owner` of THAT deal. Without it the answer needs
     *  the deal list of every row, which is the fold that had to move into SQL
     *  in the first place.
     *
     *  NULLABLE IN THE COLUMN, never null in a committed row. A run is
     *  INSERTed one statement before the lead that gives it an object, and
     *  there is no truthful code to invent in between; `NOT NULL` would refuse
     *  the intake door. Migration 0056's deferred constraint trigger refuses
     *  the same rows at COMMIT, with the same SQLSTATE. */
    standCode: text('stand_code'),

    /** The lead's OWN lifecycle rung, computed even while the run stands on a
     *  deal or a signature.
     *
     *  This is where a card falls back for an `ownOnly` reader who may not
     *  open the live deal: the board still groups them, and it groups them on
     *  the rung `standOf` prints on the table view today, rather than leaking
     *  the ladder position of a deal they cannot see. */
    standLeadKey: text('stand_lead_key').$type<LeadState>().notNull().default('new'),

    /** When the rung the run stands on falls due — so `overdueBy` is one
     *  subtraction the book can put in an `ORDER BY`.
     *
     *  `stage_since + limitDays` for a deal, `state_since + limitDays` for a
     *  lead, and NULL wherever `pipelinePosition` answers null: a run on a
     *  contract (no contract ladder exists), a lead with no tier, a rung with
     *  no clock configured. The limit is paired to `config_entry` BY ORDINAL
     *  POSITION behind the same fence `ladder.ts` holds — which is why editing
     *  a rung re-derives this column for the whole book (migration 0056).
     *
     *  The ladder's other two derived rungs stayed OUT: reading them would
     *  have put a trigger on `platform.approval` and on `comms.message`, and
     *  `platform` does not get to know a branch. */
    standDueAt: timestamp('stand_due_at', { withTimezone: true }),
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

    /** "Which OPEN runs stand at this rung, and how many in the WHOLE book" —
     *  one board column, paged and counted. Partial because the board never
     *  draws a finished run, so `status=closed` pays a scan instead. */
    index('workstream_stand_idx')
      .on(t.standKind, t.standKey)
      .where(sql`"closed_at" IS NULL`),

    /** Copied out by hand, for `workstream_close_reason_known`'s reason. Two
     *  constraints so a refused row names the half it broke: an unknown kind
     *  falls through the pair check's `ELSE` and is caught here. */
    check('workstream_stand_kind_known', sql`"stand_kind" IN ('LD', 'OP', 'HĐ')`),
    check(
      'workstream_stand_key_known',
      sql`CASE "stand_kind"
            WHEN 'HĐ' THEN "stand_key" = 'signed'
            WHEN 'OP' THEN "stand_key" IN ('new', 'discovery', 'demo-done', 'quoted', 'awaiting-signature')
            WHEN 'LD' THEN "stand_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                                           'converted', 'disqualified', 'archived')
            ELSE true
          END`,
    ),

    /** A `LeadState` whatever the run stands on. The trigger only ever writes
     *  the five backbone rungs; the domain is the contract's. `stand_code` is
     *  fenced by a DEFERRED constraint trigger instead — see its column. */
    check(
      'workstream_stand_lead_key_known',
      sql`"stand_lead_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                               'converted', 'disqualified', 'archived')`,
    ),
  ],
)

/** Code sequence for `WS-nnnn`.
 *
 *  STARTS AT 1, unlike every other code sequence in this branch, and the
 *  difference is the whole reason this note exists. `lead`, `opportunity`,
 *  `contract` and `account` all start high because the frozen fixture already
 *  OWNS a block of their codes and a sequence starting at 1 would walk into it
 *  years later. No fixture owns a `WS-` block, so there is none to clear —
 *  and inventing headroom for a collision that cannot happen is inventing
 *  data. Migrations 0045/0048, seed and the lead write doors all mint off this
 *  one sequence. */
export const workstreamCodeSeq = sales.sequence('workstream_code_seq', {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
})

export type WorkstreamRowDb = typeof workstream.$inferSelect
