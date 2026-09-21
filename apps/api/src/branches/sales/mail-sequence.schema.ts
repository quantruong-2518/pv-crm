import { check, integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { mailRun } from '@api/platform/mail/mail-run.schema'
import { sales } from './sales.schema'

/** A reusable chain composed outside a campaign. Its audience fingerprint is
 * immutable: repeating the UUID with a different destination set must fail,
 * otherwise wave two could quietly target different people from wave one. */
export const mailSequence = sales.table(
  'mail_sequence',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    destinationType: text('destination_type').$type<'lead' | 'opportunity'>().notNull(),
    audienceFingerprint: text('audience_fingerprint').notNull(),
    audienceCount: integer('audience_count').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'mail_sequence_destination_type_known',
      sql`${t.destinationType} IN ('lead', 'opportunity')`,
    ),
    check('mail_sequence_audience_count_nonneg', sql`${t.audienceCount} >= 0`),
    check(
      'mail_sequence_no_blank',
      sql`btrim(${t.name}) <> '' AND btrim(${t.audienceFingerprint}) <> ''`,
    ),
  ],
)

/** ONE WAVE OF A MAIL SEQUENCE — and the sequence belongs to no one feature.
 *
 *  At the sales root rather than in `campaign/` because a lead and an
 *  opportunity now own sequences too: filing it under the feature that used to
 *  be the only sender would make the other two read across a feature boundary
 *  for their own table. Migration `0053` replaced `campaign_run` with it.
 *
 *  `platform.mail_run` is still the send unit and still knows nothing about any
 *  owner (ADR 0040). This row points sales → platform, the allowed direction. */
export const mailSequenceRun = sales.table(
  'mail_sequence_run',
  {
    /** Which book the code below is from. Read `subject_code`'s comment for why
     *  the pair exists at all instead of three nullable foreign keys. */
    subjectType: text('subject_type')
      .$type<'lead' | 'opportunity' | 'campaign' | 'sequence'>()
      .notNull(),

    /** Lead code, opportunity code, campaign code or sequence UUID. NO FOREIGN KEY, the same
     *  decision `sales.touch.subject_code` documents at length: one column that
     *  can point at several tables cannot be fenced by Postgres, and the two
     *  alternatives cost more than they buy — nullable owner columns turn
     *  every read into an OR across three indexes, and a key into
     *  `platform.object` would refuse a legitimate send because the opportunity
     *  mirror row is discipline rather than a fence.
     *
     *  What that costs is real: a wave naming a code nobody owns is accepted.
     *  The sender writes this row inside the transaction that writes the run,
     *  so a code that was never there means the run rolled back too. */
    subjectCode: text('subject_code').notNull(),

    /** Unique on its own: a batch belongs to at most one sequence. */
    mailRunId: uuid('mail_run_id')
      .notNull()
      .unique()
      .references(() => mailRun.id),
    waveNo: integer('wave_no').notNull(),
    /** Human phase name snapshotted with this wave. */
    phase: text('phase').notNull(),

    /** How many recipients were PROMISED for this wave — the number said out
     *  loud before send. Absent means nobody set an expectation, NOT zero: a
     *  wave aimed at zero leads is a send doing something else (a reminder, a
     *  document), a wave with no expectation is one nobody answers for.
     *
     *  Here and not on `mail_run`: an expectation is a sales matter, and
     *  `platform.mail_run` may not know what a sequence is. */
    expected: integer('expected'),
  },
  (t) => [
    /** No wave number claimed twice inside one subject — and the only index the
     *  table needs: both questions asked of it, "waves of subject X in order"
     *  and "what is the next wave number", are prefix reads of this key. */
    primaryKey({ columns: [t.subjectType, t.subjectCode, t.waveNo] }),
    /** The four owner kinds, copied out rather than generated. */
    check(
      'mail_sequence_run_subject_type_known',
      sql`"subject_type" IN ('lead', 'opportunity', 'campaign', 'sequence')`,
    ),
    check('mail_sequence_run_wave_positive', sql`${t.waveNo} > 0`),
    check('mail_sequence_run_expected_nonneg', sql`${t.expected} IS NULL OR ${t.expected} >= 0`),
    /** With no foreign key above, this is the whole of what the column can be
     *  checked against — an empty code points at nothing. */
    check('mail_sequence_run_no_blank', sql`"subject_code" <> ''`),
    check('mail_sequence_run_phase_no_blank', sql`btrim(${t.phase}) <> ''`),
  ],
)

export type MailSequenceRunRow = typeof mailSequenceRun.$inferSelect
export type MailSequenceRow = typeof mailSequence.$inferSelect
