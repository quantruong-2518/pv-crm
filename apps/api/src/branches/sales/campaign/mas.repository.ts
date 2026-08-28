import { and, asc, count, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { LeadSourceKind, MailRunListQuery, MailTemplateRow } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { mailRun } from '@api/platform/mail/mail-run.schema'
import { emailSuppression } from '@api/platform/mail/mail.schema'
import { lead } from '../lead/lead.schema'
import { campaign, campaignRun, mailTemplate } from './campaign.schema'

/** One picked lead, with every FACT the preflight needs and no verdict.
 *
 *  `email` arrives as `NULLIF(trim(…), '')` rather than as the raw column, so
 *  "has no mailbox" is one shape here instead of three at the call site. It is
 *  typed nullable even though `sales.lead.email` is `NOT NULL` with a
 *  `lead_no_blank` CHECK behind it — see the note on `audience()`.
 *
 *  `suppressed` is a fact from `platform.email_suppression`; `DUPLICATE` is
 *  deliberately NOT here, because it is not a fact about one row at all. */
export type MasLeadRow = {
  code: string
  company: string
  contactName: string
  email: string | null
  sourceKind: LeadSourceKind | null
  suppressed: boolean
}

/** Which runs this caller may see, and how many the scope axis took away. */
export type RunScope = {
  /** Ids to hand `MailRunRepository.list()`. `undefined` = no id filter at all
   *  (the caller sees everything and asked for no campaign). */
  onlyIds: string[] | undefined
  /** Rows the filter matched and the scope axis removed — `MailRunListResponse.hidden`. */
  hidden: number
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

  /** One unit of work. A run, its `campaign_run` link and its N ledger rows
   *  land together or not at all. */
  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The picked leads, as the server sees them — SCOPE CUT IN SQL.
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
   *  later produces a blocked recipient, not a letter addressed to `''`. */
  async audience(
    handle: Db,
    who: Actor,
    scoped: boolean,
    codes: readonly string[],
  ): Promise<MasLeadRow[]> {
    if (codes.length === 0) return []

    return handle
      .select({
        code: lead.code,
        company: lead.company,
        contactName: lead.contactName,
        email: sql<string | null>`NULLIF(trim(${lead.email}), '')`,
        sourceKind: lead.sourceKind,
        suppressed: sql<boolean>`(${emailSuppression.recipient} IS NOT NULL)`,
      })
      .from(lead)
      .leftJoin(
        emailSuppression,
        and(
          eq(emailSuppression.recipient, sql`lower(trim(${lead.email}))`),
          isNull(emailSuppression.releasedAt),
        ),
      )
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
        active: mailTemplate.active,
      })
      .from(mailTemplate)
      .orderBy(sql`${mailTemplate.active} DESC`, asc(mailTemplate.name))

    return rows
  }

  /** One template's call-to-action pair, or `null` when the run names no
   *  template — or names one that no longer exists.
   *
   *  A missing row is NOT an error here, and that follows from
   *  `mail_run.template_code` deliberately carrying no foreign key: a template
   *  retired next year must not orphan a batch already sent, so the code is
   *  RECORDED whether or not a row answers to it. What is lost in that case is
   *  only the button. */
  async templateCta(handle: Db, code: string): Promise<{ label: string; url: string } | null> {
    const [row] = await handle
      .select({ label: mailTemplate.ctaLabel, url: mailTemplate.ctaUrl })
      .from(mailTemplate)
      .where(eq(mailTemplate.code, code))
      .limit(1)

    /* `mail_template_cta_pair` guarantees both columns or neither, so one
       check would do — both are tested because a CHECK is a promise about the
       table, not about this function's arguments. */
    return row?.label && row.url ? { label: row.label, url: row.url } : null
  }

  /** Does this campaign exist? Asked before the run is written rather than left
   *  to the foreign key: `campaign_run.campaign_code` would refuse the insert
   *  anyway, but it would do it as a constraint violation halfway through a
   *  transaction — a 500 where the honest answer is a 404 naming the code the
   *  caller typed. */
  async campaignExists(handle: Db, code: string): Promise<boolean> {
    const [row] = await handle
      .select({ one: sql`1` })
      .from(campaign)
      .where(eq(campaign.code, code))
      .limit(1)
    return row !== undefined
  }

  /** Wave numbers of a campaign, one past the highest so far.
   *
   *  Read inside `tx`, and the primary key `(campaign_code, wave_no)` is what
   *  makes that safe rather than merely hopeful: two sends racing on one
   *  campaign both read wave 3, and Postgres refuses the second insert instead
   *  of silently producing two "wave 3"s. A sequence would not help — waves are
   *  numbered per campaign, and a global counter would print wave 47 on a
   *  campaign's second send. */
  async nextWaveNo(tx: Db, campaignCode: string): Promise<number> {
    const [row] = await tx
      .select({ next: sql<number>`COALESCE(max(${campaignRun.waveNo}), 0)::int + 1` })
      .from(campaignRun)
      .where(eq(campaignRun.campaignCode, campaignCode))

    return row?.next ?? 1
  }

  /** The join row — sales → platform, the allowed direction. */
  async linkCampaign(
    tx: Db,
    link: { campaignCode: string; mailRunId: string; waveNo: number },
  ): Promise<void> {
    await tx.insert(campaignRun).values(link)
  }

  /** Which batches belong to one campaign.
   *
   *  This is the half `MailRunRepository.list()` refuses to do for itself: the
   *  answer lives in `sales.campaign_run` and `platform/` may not read it, so
   *  that method throws when `query.campaign` arrives without `onlyIds` rather
   *  than quietly returning every run in the system. An empty array is a
   *  complete answer meaning "that campaign has never been fired". */
  async runIdsOfCampaign(campaignCode: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: campaignRun.mailRunId })
      .from(campaignRun)
      .where(eq(campaignRun.campaignCode, campaignCode))

    return rows.map((r) => r.id)
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

  private listFilters(
    query: MailRunListQuery,
    campaignIds: readonly string[] | undefined,
  ): SQL | undefined {
    return and(
      query.state ? eq(mailRun.state, query.state) : undefined,
      query.q
        ? or(ilike(mailRun.label, `%${query.q}%`), ilike(mailRun.subject, `%${query.q}%`))
        : undefined,
      campaignIds
        ? campaignIds.length > 0
          ? inArray(mailRun.id, [...campaignIds])
          : sql`false`
        : undefined,
    )
  }
}
