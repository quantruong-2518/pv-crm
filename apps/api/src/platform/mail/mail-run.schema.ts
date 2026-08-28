import { check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { MailRunState } from '@pv/contracts'
import { platform } from '@api/platform/db/platform.schema'

/** The CHECK's value list, and the guard that keeps it honest.
 *
 *  ------------------------------------------------------------------
 *  WHY A RECORD AND NOT `MailRunState.options`
 *  ------------------------------------------------------------------
 *  Reading the array straight off the zod enum would be the obvious spelling,
 *  and it does not work here: `drizzle-kit generate` loads every `*.schema.ts`
 *  through its own CommonJS transpiler, and `@pv/contracts` is an ESM package
 *  whose `export *` barrel does not survive that loader — the import arrives
 *  as `undefined` and generation dies on `.options`. The three schema files
 *  that already import from that package (`lead`, `config`, `contract`) get
 *  away with it because every one of them imports TYPES ONLY, which are erased
 *  before the loader ever sees them. So: type-only import here too.
 *
 *  `satisfies Record<MailRunState, true>` is what stops the list drifting
 *  anyway. It demands one key per state — a state added to the contract and
 *  forgotten here is a compile error, not a CHECK that quietly rejects a
 *  perfectly valid row months later. Same idiom, same reason, as
 *  `SOURCE_KIND_TONE` in `leads.tsx`.
 *
 *  `sql.raw` for the same reason `MAIL_STATE_LIST` uses it — a DDL statement
 *  has no bind parameters, so ordinary interpolation would emit `$1, $2, …`
 *  into the generated `.sql` with nothing to substitute them.
 *
 *  ------------------------------------------------------------------
 *  WHY ONLY `mail_run` LIVES IN THIS FILE
 *  ------------------------------------------------------------------
 *  A dependency rule rather than a filing preference: `email_delivery` points
 *  at a run, `mail_event` points back at a delivery. Keeping the run here and
 *  the event beside the ledger leaves the import arrow running one way —
 *  `mail.schema.ts` → this file — with no cycle for the loader to resolve. */
const MAIL_RUN_STATE_SET = {
  DRAFT: true,
  SCHEDULED: true,
  SENDING: true,
  SENT: true,
  CANCELLED: true,
} as const satisfies Record<MailRunState, true>

const MAIL_RUN_STATE_LIST = sql.raw(
  Object.keys(MAIL_RUN_STATE_SET)
    .map((s) => `'${s}'`)
    .join(', '),
)

/** ONE BATCH OF OUTBOUND MAIL — and the unit every screen counts by.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS A PLATFORM TABLE AND NOT `sales.campaign_run`
 *  ------------------------------------------------------------------
 *  `email_delivery` lives in `platform`, and it needs a foreign key to whatever
 *  groups its rows. Pointing that key at a `sales` table would invert the one
 *  dependency this codebase enforces hardest: `platform/` must never know
 *  `branches/`. The lint rule catches that in TypeScript; it cannot catch it in
 *  DDL, so the shape has to be right here instead.
 *
 *  So the batch itself is a platform concept — "N letters posted together" —
 *  and knows nothing about campaigns. `sales.campaign_run` is a separate join
 *  row pointing THIS way (sales → platform, the allowed direction), added only
 *  when the batch happens to belong to a campaign. A quick send from the lead
 *  book creates a `mail_run` with no campaign row at all.
 *
 *  The payoff is that the lead-detail timeline reads exactly one table for
 *  "which batches has this lead been in", whether the mail came from a
 *  campaign or from someone ticking eight checkboxes in the lead book. Two
 *  sources for one question is two answers that disagree by next quarter.
 *
 *  ------------------------------------------------------------------
 *  CONTENT IS SNAPSHOTTED HERE, NOT REFERENCED
 *  ------------------------------------------------------------------
 *  `subject`/`body` are copies taken at the moment the batch was created, not
 *  a pointer into `sales.mail_template`. Editing a template must not rewrite
 *  what was already sent last week — a sent mail is a historical fact, and the
 *  archive of it has to survive the template it came from.
 *
 *  Per-recipient substitution does NOT live here: it is on
 *  `email_delivery.merge`, one small object per row, written by the Sales
 *  branch which is the half allowed to read `sales.lead`. */
export const mailRun = platform.table(
  'mail_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** What a human calls this batch — shown as the timeline marker on the
     *  lead profile and in the campaign's wave chain. */
    label: text('label').notNull(),

    /** Which `sales.mail_template` seeded the content, kept for reporting
     *  only. NULL means the sender typed it from scratch, which is a first
     *  class case, not a missing value — hence no foreign key: a template
     *  deleted next year must not orphan a batch already sent. */
    templateCode: text('template_code'),

    subject: text('subject').notNull(),
    body: text('body').notNull(),

    /** Optional call to action. Both columns or neither — same pair idiom as
     *  `lead_money_pair`, because a label with no destination renders a button
     *  that goes nowhere and a URL with no label renders nothing at all. */
    ctaLabel: text('cta_label'),
    ctaUrl: text('cta_url'),

    /** Resolved at creation, not at send time. The marketing subdomain is a
     *  deployment fact that can change between the click and the send, and a
     *  batch has to keep going out from the address it was reviewed under. */
    fromAddress: text('from_address').notNull(),
    replyTo: text('reply_to'),

    state: text('state').$type<MailRunState>().notNull(),

    /** NULL = go as soon as the relay sees it. A value = the relay leaves the
     *  rows alone until then; the wait is expressed on each delivery's
     *  `next_attempt_at`, so scheduling needs no second scanner. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),

    /** How many recipients survived preflight. Stored rather than counted so
     *  the batch can still say how big it was meant to be after rows are
     *  pruned by retention. */
    audienceCount: integer('audience_count').notNull().default(0),

    /** The actor who pressed send. `platform.audit` carries the full trail;
     *  this column is what the run list shows without a join. */
    createdBy: text('created_by').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** The relay's question is always "which scheduled batches are due", so
     *  the index leads with state and carries the clock. */
    index('mail_run_due_idx').on(t.state, t.scheduledAt),
    check('mail_run_state_valid', sql`${t.state} IN (${MAIL_RUN_STATE_LIST})`),
    check('mail_run_cta_pair', sql`(${t.ctaLabel} IS NULL) = (${t.ctaUrl} IS NULL)`),
  ],
)

export type MailRunRow = typeof mailRun.$inferSelect
