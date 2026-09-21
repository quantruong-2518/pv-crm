import {
  and,
  asc,
  count,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type {
  LeadSourceKind,
  LeadState,
  MailRunListQuery,
  MailRunState,
  MailTemplateRow,
  MasAudience,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { audit } from '@api/platform/db/platform.schema'
import { mailRun } from '@api/platform/mail/mail-run.schema'
import { emailSuppression } from '@api/platform/mail/mail.schema'
import { lead } from '../lead/lead.schema'
import { opportunity, opportunityOwner } from '../opportunity/opportunity.schema'
import {
  mailSequence,
  mailSequenceRun,
  type MailSequenceRow,
  type MailSequenceRunRow,
} from '../mail-sequence.schema'
import { campaign, mailTemplate } from './campaign.schema'

/** One picked SUBJECT — a lead or an opportunity — with every FACT the
 *  preflight needs and no verdict.
 *
 *  `code` is the subject's own code, so it is an opportunity code on the
 *  opportunity branch; every other field comes off the lead either way,
 *  because the mailbox does (`opportunity.lead_code` is `NOT NULL`).
 *
 *  `email` arrives as `NULLIF(trim(…), '')` rather than as the raw column, so
 *  "has no mailbox" is one shape here instead of three at the call site. It is
 *  typed nullable even though `sales.lead.email` is `NOT NULL` with a
 *  `lead_no_blank` CHECK behind it — see the note on `audience()`.
 *
 *  `suppressed` is a fact from `platform.email_suppression`; `DUPLICATE` is
 *  deliberately NOT here, because it is not a fact about one row at all. */
export type MasSubjectRow = {
  code: string
  company: string
  contactName: string
  contactTitle: string | null
  email: string | null
  sourceKind: LeadSourceKind | null
  suppressed: boolean
  /** The lead's lifecycle state (ADR 0058). A FACT and not a filter: a lead
   *  cut in SQL comes back in no row at all, and the preflight would then
   *  report "40 picked, 37 sendable" with three that vanished for a reason the
   *  screen never names. A `disqualified` or `archived` lead is one this caller
   *  is fully entitled to see; it just must not be written to — so it comes
   *  back whole, and `MasService.decide` turns it into `EXITED`. */
  state: LeadState
}

/** Which book owns a wave chain. Read off the column rather than written out
 *  again, so the day `mail_sequence_run` accepts a fourth book this file
 *  follows the migration instead of contradicting it. */
export type SequenceSubject = MailSequenceRunRow['subjectType']

/** Everything about a recipient that comes off the LEAD, whichever book the
 *  pick came from — a deal has no mailbox of its own (see `audience()`). Named
 *  once so the two branches cannot select two different sets of facts. */
const LEAD_FACTS = {
  company: lead.company,
  contactName: lead.contactName,
  contactTitle: lead.contactTitle,
  email: sql<string | null>`NULLIF(trim(${lead.email}), '')`,
  sourceKind: lead.sourceKind,
  suppressed: sql<boolean>`(${emailSuppression.recipient} IS NOT NULL)`,
  state: lead.state,
}

/** The block list, on the SAME normal form `rowOf()` writes — see the class
 *  docblock for why the predicate is repeated here rather than asked one
 *  address at a time. */
const SUPPRESSED_ON = and(
  eq(emailSuppression.recipient, sql`lower(trim(${lead.email}))`),
  isNull(emailSuppression.releasedAt),
)

/** One letter of a run, in the DRIVER's own spelling — `snake_case` keys and
 *  `Date` objects, because `db.execute` hands back what postgres sent without a
 *  select list to rename anything. `toRunRecipient` in `mas.service.ts` is the
 *  one place that turns it into the contract's shape. */
export type MasRecipientRead = {
  lead_code: string
  company: string | null
  contact_name: string | null
  email: string
  delivery_state: string
  /** `Date | string` on every moment, not `Date`: the two drivers behind this
   *  one raw statement disagree — pg hands back a `Date`, PGlite a postgres
   *  string. Same declaration and same reason as `LeadMailTimelineRead`. */
  sent_at: Date | string | null
  delivered_at: Date | string | null
  fail_reason: string | null
  open_count: number
  last_open_at: Date | string | null
  click_count: number
  last_click_at: Date | string | null
}

/** Which runs this caller may see, and how many the scope axis took away. */
export type RunScope = {
  /** Ids to hand `MailRunRepository.list()`. `undefined` = no id filter at all
   *  (the caller sees everything and asked for no campaign). */
  onlyIds: string[] | undefined
  /** Rows the filter matched and the scope axis removed — `MailRunListResponse.hidden`. */
  hidden: number
}

export type RunSequenceContext = {
  mailRunId: string
  waveNo: number
  phase: string
  sequenceId?: string
  sequenceName?: string
  campaignCode?: string
  campaignName?: string
}

export type ExistingSequenceWave = {
  mailRunId: string
  waveNo: number
  phase: string
  label: string
  templateCode: string | null
  subject: string
  body: string
  ctaLabel: string | null
  ctaUrl: string | null
  bookingUrl: string | null
  ccAddresses: string[]
  scheduledAt: Date | null
  audienceCount: number
  trackEngagement: boolean
  state: MailRunState
}

/** THE ONLY SQL OF THE MAS FEATURE. Decides nothing — per `apps/api/CLAUDE.md`.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS FILE READS TWO `platform` TABLES DIRECTLY
 *  ------------------------------------------------------------------
 *  `platform.email_suppression` is joined here rather than asked one address at
 *  a time through `MailLedger.isSuppressed()`, and `platform.mail_run` is
 *  counted here rather than through `MailRunRepository`. Three reasons, in
 *  order of weight:
 *
 *   1 · The branch does not hold `MAIL_LEDGER` and must not — `mail.module.ts`
 *       hands a branch the narrow `MAIL_ENQUEUE` token precisely so it can
 *       promise a mail without being able to send one. `isSuppressed()` is on
 *       the wide token.
 *   2 · A batch is 200 recipients. One round trip per address to answer a
 *       question one `LEFT JOIN` answers is 200 round trips inside one request.
 *   3 · The import direction is the allowed one — `branches/` may read
 *       `platform/`, never the reverse — and this branch already does it
 *       elsewhere (`lead.repository.ts` reads `platform.actor`,
 *       `campaign.schema.ts` references `platform.mail_run`).
 *
 *  What is NOT duplicated is the predicate: `released_at IS NULL` below is the
 *  same one `MailRepository.isSuppressed()` uses, against the same normal form
 *  (`lower(trim(…))`) that `rowOf()` writes into `email_delivery.recipient`. A
 *  batch that skipped the lower-casing would be a batch the block list silently
 *  fails to stop. */
@Injectable()
export class MasRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The pool handle, for reads that open nothing. Named rather than exposed as
   *  `db` so each caller reads as a statement about itself — same idiom as
   *  `LeadWriteRepository.readonlyHandle`. */
  get readonlyHandle(): Db {
    return this.db
  }

  /** One unit of work. A run, its `mail_sequence_run` link and its N ledger
   *  rows land together or not at all. */
  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The picked subjects, as the server sees them — SCOPE CUT IN SQL.
   *
   *  ------------------------------------------------------------------
   *  AN OPPORTUNITY IS MAILED THROUGH ITS LEAD, AND HAS NO ADDRESS OF ITS OWN
   *  ------------------------------------------------------------------
   *  `sales.opportunity` carries no mailbox and no contact: `lead_code` is
   *  `NOT NULL` with a foreign key behind it, so the lead IS the deal's
   *  customer record and the join is total — a deal cannot come back without
   *  one. What changes on that branch is the `code` (the deal's, so the ledger
   *  files the letter against the deal) and the scope axis, which becomes
   *  `opportunity_owner` — the deal's own axis, copied from
   *  `OpportunityRepository.scopeOf`; cutting on `lead.owner_id` instead would
   *  hide a deal from the seller who holds it.
   *
   *  ------------------------------------------------------------------
   *  A LEAD OUTSIDE THE CALLER'S SCOPE IS ABSENT, NOT MARKED
   *  ------------------------------------------------------------------
   *  `scoped && who.ownOnly` puts `owner_id = :actor` in the WHERE clause, so a
   *  row this caller may not hold never leaves the database. Filtering in Node
   *  instead would mean the company name, the contact name and the mailbox of
   *  somebody else's lead had already crossed the process boundary — the exact
   *  leak `lead.repository.ts#book` spells out at length, and worse here
   *  because a preflight is how one would enumerate the book.
   *
   *  The consequence is that such a lead comes back in NO row rather than in a
   *  row marked "not yours": `MasRecipientBlock` has three values and none of
   *  them means that, and `MasRecipient.company`/`contactName` are required, so
   *  the only way to report it would be to invent the two fields this caller is
   *  not allowed to read.
   *
   *  ------------------------------------------------------------------
   *  `email` IS TREATED AS OPTIONAL AGAINST A `NOT NULL` COLUMN, ON PURPOSE
   *  ------------------------------------------------------------------
   *  `sales.lead.email` is `NOT NULL` and `lead_no_blank` refuses `''`, so
   *  `NO_EMAIL` cannot fire from today's schema — the block reason exists
   *  because `MasRecipient.email` was written "deliberately defensive rather
   *  than merely mirrored" (see `@pv/contracts`), against the day a lead
   *  reaches the book without a mailbox. `NULLIF(trim(…), '')` is what keeps
   *  that door honest at a cost of one function call: a column that loosens
   *  later produces a blocked recipient, not a letter addressed to `''`.
   *
   *  ------------------------------------------------------------------
   *  `state` IS SELECTED, NOT FILTERED — AND THAT IS THE POINT
   *  ------------------------------------------------------------------
   *  A lead that left the funnel must not be written to, and the obvious fix is
   *  `AND state NOT IN ('disqualified', 'archived')` in the WHERE clause. It is the wrong one: the
   *  row would then be absent exactly like a row the scope axis cut, the
   *  preflight would say "40 picked · 37 sendable" and account for none of the
   *  other three, and the sender would go looking for a data problem that is
   *  not there. The column comes back as a FACT and `MasService.decide` turns
   *  it into `EXITED`, so the panel can name it. Same rule as `suppressed`
   *  right above it — see the note on `MasSubjectRow.state`. */
  async audience(
    handle: Db,
    who: Actor,
    scoped: boolean,
    subjectType: MasAudience['subjectType'],
    codes: readonly string[],
  ): Promise<MasSubjectRow[]> {
    if (codes.length === 0) return []

    if (subjectType === 'opportunity') {
      return handle
        .select({ code: opportunity.code, ...LEAD_FACTS })
        .from(opportunity)
        .innerJoin(lead, eq(lead.code, opportunity.leadCode))
        .leftJoin(emailSuppression, SUPPRESSED_ON)
        .where(and(inArray(opportunity.code, [...codes]), this.dealScopeOf(who, scoped)))
        .orderBy(asc(opportunity.code))
    }

    return handle
      .select({ code: lead.code, ...LEAD_FACTS })
      .from(lead)
      .leftJoin(emailSuppression, SUPPRESSED_ON)
      .where(and(inArray(lead.code, [...codes]), this.scopeOf(who, scoped)))
      .orderBy(asc(lead.code))
  }

  /** The picker's catalogue, inactive rows included.
   *
   *  Not paged and not filtered by `active`, both per `MailTemplateListResponse`:
   *  a dropdown that pages is a dropdown missing options, and a run that names a
   *  retired template must still be able to print its name. Active first so the
   *  usable rows are at the top of the list without the screen having to sort. */
  async templates(): Promise<MailTemplateRow[]> {
    const rows = await this.db
      .select({
        code: mailTemplate.code,
        name: mailTemplate.name,
        subject: mailTemplate.subject,
        body: mailTemplate.body,
        ctaLabel: mailTemplate.ctaLabel,
        ctaUrl: mailTemplate.ctaUrl,
        bookingUrl: mailTemplate.bookingUrl,
        active: mailTemplate.active,
      })
      .from(mailTemplate)
      .orderBy(sql`${mailTemplate.active} DESC`, asc(mailTemplate.name))

    /* Two nullable columns become one optional object, because that is the
       shape the CHECK already guarantees (`mail_template_cta_pair`: both or
       neither) and the shape the panel needs. Both halves are tested rather
       than just one — a CHECK is a promise about the TABLE, not about what this
       query selected, and the day someone reads these two columns through a
       LEFT JOIN the promise no longer covers the result.
       There used to be a second method here, `templateCta`, which the SEND path
       called to copy the button out of the template at the last moment. It is
       gone: the sender must review the link that goes out in their name, so the
       pair travels to the panel with the rest of the row and comes back on
       `MasSendRequest.cta`. */
    return rows.map(({ ctaLabel, ctaUrl, bookingUrl, ...row }) => ({
      ...row,
      ...(ctaLabel && ctaUrl ? { cta: { label: ctaLabel, url: ctaUrl } } : {}),
      ...(bookingUrl ? { bookingUrl } : {}),
    }))
  }

  /** One template by its code, in the same wire shape `templates()` returns —
   *  the read every write below finishes with, so the screen is handed the row
   *  as it now stands rather than the row it asked for. */
  async templateByCode(code: string): Promise<MailTemplateRow | undefined> {
    const [row] = await this.db
      .select({
        code: mailTemplate.code,
        name: mailTemplate.name,
        subject: mailTemplate.subject,
        body: mailTemplate.body,
        ctaLabel: mailTemplate.ctaLabel,
        ctaUrl: mailTemplate.ctaUrl,
        bookingUrl: mailTemplate.bookingUrl,
        active: mailTemplate.active,
      })
      .from(mailTemplate)
      .where(eq(mailTemplate.code, code))

    if (!row) return undefined
    const { ctaLabel, ctaUrl, bookingUrl, ...rest } = row
    return {
      ...rest,
      ...(ctaLabel && ctaUrl ? { cta: { label: ctaLabel, url: ctaUrl } } : {}),
      ...(bookingUrl ? { bookingUrl } : {}),
    }
  }

  async createTemplate(input: {
    code: string
    name: string
    subject: string
    body: string
    ctaLabel: string | null
    ctaUrl: string | null
    bookingUrl: string | null
  }): Promise<void> {
    await this.db.insert(mailTemplate).values(input)
  }

  /** `undefined` leaves a column alone, `null` clears it — the three states
   *  `MailTemplatePatch` carries, passed straight through. Drizzle omits keys
   *  whose value is `undefined`, so spreading the input is what makes "absent"
   *  mean "absent" instead of "write NULL". */
  async patchTemplate(
    code: string,
    input: {
      name?: string
      subject?: string
      body?: string
      ctaLabel?: string | null
      ctaUrl?: string | null
      bookingUrl?: string | null
      active?: boolean
    },
  ): Promise<void> {
    await this.db
      .update(mailTemplate)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(mailTemplate.code, code))
  }

  /** Does this campaign exist? THE ONLY FENCE, not a friendlier first one:
   *  `mail_sequence_run.subject_code` is polymorphic and carries no foreign
   *  key (migration 0053), so nothing downstream would refuse a wave naming a
   *  campaign nobody owns. Asked inside the send's transaction, so a `false`
   *  is a 404 naming the code the caller typed and no run is written. */
  async campaignExists(handle: Db, code: string): Promise<boolean> {
    const [row] = await handle
      .select({ one: sql`1` })
      .from(campaign)
      .where(eq(campaign.code, code))
      .limit(1)
    return row !== undefined
  }

  /** Insert-once header for a non-campaign sequence, then return the canonical
   * row. The service compares every immutable field before it appends a wave. */
  async ensureSequence(tx: Db, input: typeof mailSequence.$inferInsert): Promise<MailSequenceRow> {
    await tx.insert(mailSequence).values(input).onConflictDoNothing({ target: mailSequence.id })
    const [row] = await tx
      .select()
      .from(mailSequence)
      .where(eq(mailSequence.id, input.id))
      .limit(1)
      .for('update')
    if (!row) throw new Error(`Không đọc lại được mail_sequence ${input.id}.`)
    return row
  }

  /** Existing wave under the locked sequence header. Used to make a repeated
   * POST return the original batch instead of mailing the audience twice. */
  async sequenceWave(
    tx: Db,
    sequenceId: string,
    waveNo: number,
  ): Promise<ExistingSequenceWave | undefined> {
    const [row] = await tx
      .select({
        mailRunId: mailSequenceRun.mailRunId,
        waveNo: mailSequenceRun.waveNo,
        phase: mailSequenceRun.phase,
        label: mailRun.label,
        templateCode: mailRun.templateCode,
        subject: mailRun.subject,
        body: mailRun.body,
        ctaLabel: mailRun.ctaLabel,
        ctaUrl: mailRun.ctaUrl,
        bookingUrl: mailRun.bookingUrl,
        ccAddresses: mailRun.ccAddresses,
        scheduledAt: mailRun.scheduledAt,
        audienceCount: mailRun.audienceCount,
        trackEngagement: mailRun.trackEngagement,
        state: mailRun.state,
      })
      .from(mailSequenceRun)
      .innerJoin(mailRun, eq(mailRun.id, mailSequenceRun.mailRunId))
      .where(
        and(
          eq(mailSequenceRun.subjectType, 'sequence'),
          eq(mailSequenceRun.subjectCode, sequenceId),
          eq(mailSequenceRun.waveNo, waveNo),
        ),
      )
      .limit(1)

    return row
  }

  /** Wave numbers of ONE subject, one past the highest so far.
   *
   *  Read inside `tx`, and the primary key `(subject_type, subject_code,
   *  wave_no)` is what makes that safe rather than merely hopeful: two sends
   *  racing on one subject both read wave 3, and Postgres refuses the second
   *  insert instead of silently producing two "wave 3"s. A sequence would not
   *  help — waves are numbered per subject, and a global counter would print
   *  wave 47 on a campaign's second send. */
  async nextWaveNo(tx: Db, subjectType: SequenceSubject, subjectCode: string): Promise<number> {
    const [row] = await tx
      .select({ next: sql<number>`COALESCE(max(${mailSequenceRun.waveNo}), 0)::int + 1` })
      .from(mailSequenceRun)
      .where(
        and(
          eq(mailSequenceRun.subjectType, subjectType),
          eq(mailSequenceRun.subjectCode, subjectCode),
        ),
      )

    return row?.next ?? 1
  }

  /** The join row — sales → platform, the allowed direction. */
  async linkSequenceWave(
    tx: Db,
    link: {
      subjectType: SequenceSubject
      subjectCode: string
      mailRunId: string
      waveNo: number
      phase: string
    },
  ): Promise<void> {
    await tx.insert(mailSequenceRun).values(link)
  }

  /** WHO STOPPED THIS BATCH — one append-only line in `platform.audit`.
   *
   *  Inside `tx`, not through `AuditRepository.write`, and for the first of the
   *  two reasons `LeadWriteRepository.writeBatchNote` gives: that repository
   *  writes through the pool, so it cannot join the transaction that is
   *  cancelling the run, and a rollback would leave a record of a cancellation
   *  that did not happen. The mirror failure is worse and is the one this
   *  guards: two hundred letters withheld with nothing saying who withheld
   *  them. `mail_run` has only `created_by`; there is no `cancelled_by` column,
   *  so this row is the whole answer.
   *
   *  `action: 'edit'` because the vocabulary is E2's five verbs and stopping a
   *  batch is a change to it, not a new object and not a reading. The run id
   *  goes in `code`, which is what makes the line findable from the run. */
  async writeCancelNote(tx: Db, entry: { actorId: string; runId: string }): Promise<void> {
    await tx.insert(audit).values({
      actorId: entry.actorId,
      action: 'edit',
      code: entry.runId,
      note: 'huỷ lô gửi MAS — thư chưa gửi bị giữ lại',
    })
  }

  /** Which batches belong to one campaign.
   *
   *  This is the half `MailRunRepository.list()` refuses to do for itself: the
   *  answer lives in `sales.mail_sequence_run` and `platform/` may not read it,
   *  so that method throws when `query.campaign` arrives without `onlyIds`
   *  rather than quietly returning every run in the system. An empty array is a
   *  complete answer meaning "that campaign has never been fired".
   *
   *  `subject_type = 'campaign'` is load-bearing since 0053: the table now also
   *  holds lead and opportunity chains, and a lead whose code happened to match
   *  would otherwise hand this campaign somebody else's batch. */
  async runIdsOfCampaign(campaignCode: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: mailSequenceRun.mailRunId })
      .from(mailSequenceRun)
      .where(
        and(
          eq(mailSequenceRun.subjectType, 'campaign'),
          eq(mailSequenceRun.subjectCode, campaignCode),
        ),
      )

    return rows.map((r) => r.id)
  }

  /** Sales context for a page of platform runs. One bounded query restores the
   * chain name and explicit phase without teaching platform about Sales. */
  async sequenceContexts(mailRunIds: readonly string[]): Promise<Map<string, RunSequenceContext>> {
    if (mailRunIds.length === 0) return new Map()

    const rows = await this.db
      .select({
        mailRunId: mailSequenceRun.mailRunId,
        waveNo: mailSequenceRun.waveNo,
        phase: mailSequenceRun.phase,
        subjectType: mailSequenceRun.subjectType,
        subjectCode: mailSequenceRun.subjectCode,
        sequenceName: mailSequence.name,
        campaignName: campaign.name,
      })
      .from(mailSequenceRun)
      .leftJoin(
        mailSequence,
        and(
          eq(mailSequenceRun.subjectType, 'sequence'),
          sql`${mailSequence.id}::text = ${mailSequenceRun.subjectCode}`,
        ),
      )
      .leftJoin(
        campaign,
        and(
          eq(mailSequenceRun.subjectType, 'campaign'),
          eq(campaign.code, mailSequenceRun.subjectCode),
        ),
      )
      .where(inArray(mailSequenceRun.mailRunId, [...mailRunIds]))

    return new Map(
      rows.map((row) => [
        row.mailRunId,
        {
          mailRunId: row.mailRunId,
          waveNo: row.waveNo,
          phase: row.phase,
          ...(row.subjectType === 'sequence'
            ? { sequenceId: row.subjectCode, sequenceName: row.sequenceName ?? undefined }
            : {}),
          ...(row.subjectType === 'campaign'
            ? { campaignCode: row.subjectCode, campaignName: row.campaignName ?? undefined }
            : {}),
        },
      ]),
    )
  }

  /** WHO this run went to, one row per letter — the named half of the counters
   *  on `MailRunRow`.
   *
   *  ------------------------------------------------------------------
   *  THE SAME AGGREGATE AS THE LEAD TIMELINE, READ FROM THE RUN'S SIDE
   *  ------------------------------------------------------------------
   *  `LeadRepository.mailTimeline` asks "every run this lead was in"; this asks
   *  "every lead this run went to". One statement is the transpose of the
   *  other, down to the correlated subquery over `mail_event` — kept a LATERAL
   *  rather than a second join for the reason stated there and at
   *  `MailRunRepository.list`: joining events beside the delivery multiplies the
   *  delivery row by its events and inflates anything counted next to them.
   *
   *  `count(*)` and not `count(DISTINCT …)`: the question here is per PERSON —
   *  how many times did THIS recipient open it — so six opens is a six. The run
   *  list counts the same events per audience and must not, which is why the
   *  two live in different statements.
   *
   *  ------------------------------------------------------------------
   *  THE JOIN TO `sales.lead` IS LEFT, AND THE LEDGER WINS ON `email`
   *  ------------------------------------------------------------------
   *  `email` comes off `email_delivery.recipient` — the address the letter was
   *  actually posted to — while the two names come off the lead as it reads
   *  today. That split is deliberate: a corrected typo is exactly the case
   *  somebody opens this screen for, and it is the OLD address that explains
   *  the bounce, while the current company name is what the reader recognises.
   *  The join is LEFT so a lead deleted out from under a sent run still reports
   *  its letter; `merge` is the ledger's own snapshot of the two names and
   *  covers that case without a second query.
   *
   *  The `aggregate_type` filter is not belt-and-braces either. `email_delivery`
   *  is ONE ledger for every flow, and `MailRunRecipientRow.leadCode` is a
   *  `ObjectCode` — so the day something other than a MAS letter is filed against
   *  a run, an aggregate id not shaped like `LD-0042` would fail the contract's
   *  own `.parse()` and take the whole list out with a 500. The two values are
   *  exactly the two `MasService.intentOf` writes: a batch aimed at the deal
   *  book files its letters against `OP-…` codes, and naming only `'lead'` here
   *  would answer "sent to nobody" for a run that went out perfectly.
   *
   *  No scope axis in this SQL, matching `mailTimeline` and for the same
   *  reason: `MasService.recipients` settles the entitlement on the RUN before
   *  this runs, and cutting a second time on `lead.owner_id` would answer a
   *  refusal with an empty list — a run somebody else's leads are in would read
   *  "sent to nobody". */
  async recipients(runId: string): Promise<MasRecipientRead[]> {
    const r = (await this.db.execute(sql`
      SELECT d."aggregate_id"                                AS lead_code,
             COALESCE(l."company", d."merge"->>'account')    AS company,
             COALESCE(l."contact_name", d."merge"->>'contact_name') AS contact_name,
             d."recipient"                                   AS email,
             d."state"                                       AS delivery_state,
             d."accepted_at"                                 AS sent_at,
             d."delivered_at"                                AS delivered_at,
             d."last_error_summary"                          AS fail_reason,
             COALESCE(e.open_count, 0)::int                  AS open_count,
             e.last_open_at                                  AS last_open_at,
             COALESCE(e.click_count, 0)::int                 AS click_count,
             e.last_click_at                                 AS last_click_at
        FROM "platform"."email_delivery" d
        LEFT JOIN "sales"."lead" l ON l."code" = d."aggregate_id"
        LEFT JOIN LATERAL (
              SELECT count(*) FILTER (WHERE m."kind" = 'OPEN')::int   AS open_count,
                     max(m."at") FILTER (WHERE m."kind" = 'OPEN')     AS last_open_at,
                     count(*) FILTER (WHERE m."kind" = 'CLICK')::int  AS click_count,
                     max(m."at") FILTER (WHERE m."kind" = 'CLICK')    AS last_click_at
                FROM "platform"."mail_event" m
               WHERE m."delivery_id" = d."id"
             ) e ON true
       WHERE d."mail_run_id" = ${runId}
         AND d."aggregate_type" IN ('lead', 'opportunity')
       ORDER BY d."created_at" ASC, d."aggregate_id" ASC
    `)) as { rows: MasRecipientRead[] }

    return r.rows
  }

  /** THE SCOPE AXIS OF THE RUN LIST — resolved here, because `hidden` is not a
   *  platform decision.
   *
   *  ------------------------------------------------------------------
   *  A RUN IS SCOPED BY WHO PRESSED SEND
   *  ------------------------------------------------------------------
   *  `mail_run.created_by` is the only person a batch belongs to — it has no
   *  owner column and no lead of its own, because its audience is a set. So an
   *  `ownOnly` caller sees the batches they sent, which is the same reach the
   *  Quick MAS permission already gives them over the leads that went into one.
   *
   *  ------------------------------------------------------------------
   *  TWO QUERIES, AND NEITHER RUNS FOR A CALLER THE AXIS DOES NOT CUT
   *  ------------------------------------------------------------------
   *  Same economy as `lead.repository.ts#book`: for someone who sees the whole
   *  book, `hidden` is always 0 and there is nothing to resolve, so this returns
   *  the campaign ids untouched without going near the database. Paying for two
   *  extra statements on every list call just to print a zero is paying for an
   *  answer nobody asked for.
   *
   *  When the axis DOES cut, the id list is bounded by how many batches ONE
   *  person has ever sent — a run is a hand-composed act, not a row a machine
   *  produces — which is why passing them through `onlyIds` is affordable where
   *  passing every run in the system would not be. The filters below mirror the
   *  `where` of `MailRunRepository.list()`; they are stated twice because the
   *  alternative is a scope parameter on a platform repository that has already
   *  written down why permissions are not its business. */
  async visibleRuns(
    who: Actor,
    query: MailRunListQuery,
    campaignIds: readonly string[] | undefined,
  ): Promise<RunScope> {
    if (!who.ownOnly) {
      return { onlyIds: campaignIds ? [...campaignIds] : undefined, hidden: 0 }
    }

    const filters = this.listFilters(query, campaignIds)

    const [mine, [hidden]] = await Promise.all([
      this.db
        .select({ id: mailRun.id })
        .from(mailRun)
        .where(and(filters, eq(mailRun.createdBy, who.id))),
      this.db
        .select({ n: count() })
        .from(mailRun)
        .where(and(filters, ne(mailRun.createdBy, who.id))),
    ])

    return { onlyIds: mine.map((r) => r.id), hidden: hidden?.n ?? 0 }
  }

  /** Trục 3 · phạm vi, over `sales.lead`. `undefined` = the axis cuts nothing,
   *  which is what Drizzle reads as "no condition" inside `and(...)`. Compares
   *  by `id`, never by display name — same rule, same reason, as
   *  `LeadRepository.scopeOf`. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    return scoped && who.ownOnly ? eq(lead.ownerId, who.id) : undefined
  }

  /** The same axis over a DEAL, which has no owner column: standing is a row in
   *  `opportunity_owner`, so the predicate is the `EXISTS` copied from
   *  `OpportunityRepository.scopeOf` — one axis per book, never the lead's. */
  private dealScopeOf(who: Actor, scoped: boolean): SQL | undefined {
    if (!scoped || !who.ownOnly) return undefined
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(opportunityOwner)
        .where(
          and(
            eq(opportunityOwner.opportunityCode, opportunity.code),
            eq(opportunityOwner.actorId, who.id),
          ),
        ),
    )
  }

  private listFilters(
    query: MailRunListQuery,
    campaignIds: readonly string[] | undefined,
  ): SQL | undefined {
    return and(
      query.state ? eq(mailRun.state, query.state) : undefined,
      query.q
        ? or(ilike(mailRun.label, contains(query.q)), ilike(mailRun.subject, contains(query.q)))
        : undefined,
      campaignIds
        ? campaignIds.length > 0
          ? inArray(mailRun.id, [...campaignIds])
          : sql`false`
        : undefined,
    )
  }
}
