import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { MAIL_PERSONAL_WINDOW_HOURS, type MailRunState, type MailSubjectKind } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { emailSuppression } from '@api/platform/mail/mail.schema'
import { account } from '../account/account.schema'
import { contact } from '../contact/contact.schema'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { opportunity } from '../opportunity/opportunity.schema'

/** The object a group letter is about, resolved to the lead that carries its
 *  scope and the company whose contacts may be addressed. */
export type LetterSubject = {
  leadCode: string
  accountCode: string | null
  company: string
}

/** One picked contact with every fact the verdict needs and no verdict.
 *  `belongs` = the contact sits under the subject's company (or, for a lead
 *  with no company yet, under the lead itself). */
export type LetterContact = {
  code: string
  name: string
  email: string | null
  belongs: boolean
  suppressedReason: string | null
}

/** A group letter already filed under one client `letterId`. */
export type FiledLetter = {
  runId: string
  state: MailRunState
  createdBy: string
  toCount: number
  subject: string
  body: string
  ctaLabel: string | null
  ctaUrl: string | null
  templateCode: string | null
  scheduledAt: Date | string | null
  /** Refs of the address rows, prefix cut: `contact:CT-1` → `CT-1`. */
  toCodes: string[]
  ccActorIds: string[]
}

type FiledLetterRow = {
  run_id: string
  state: MailRunState
  created_by: string
  subject: string
  body: string
  cta_label: string | null
  cta_url: string | null
  template_code: string | null
  scheduled_at: Date | string | null
  to_codes: string[]
  cc_ids: string[]
}

/** SQL of the group letter (G1/G7). Decides nothing — `MailLetterService` does.
 *
 *  Reads `platform.email_suppression` by join and `platform.actor` directly,
 *  the allowed direction, for the reasons `MasRepository`'s docblock gives. */
@Injectable()
export class MailLetterRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get readonlyHandle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Door + code → its lead and company. A deal and a contract are written to
   *  through their lead (`lead_code` is NOT NULL on both). */
  async subjectOf(door: MailSubjectKind, code: string): Promise<LetterSubject | null> {
    const facts = {
      leadCode: lead.code,
      accountCode: lead.accountCode,
      company: sql<string>`COALESCE(${account.name}, ${lead.company})`,
    }
    const base =
      door === 'lead'
        ? this.db
            .select(facts)
            .from(lead)
            .where(and(eq(lead.code, code), leadLive))
            .$dynamic()
        : door === 'opportunity'
          ? this.db
              .select(facts)
              .from(opportunity)
              .innerJoin(lead, eq(lead.code, opportunity.leadCode))
              .where(and(eq(opportunity.code, code), leadLive))
              .$dynamic()
          : this.db
              .select(facts)
              .from(contract)
              .innerJoin(lead, eq(lead.code, contract.leadCode))
              .where(and(eq(contract.code, code), leadLive))
              .$dynamic()
    const [row] = await base.leftJoin(account, eq(account.code, lead.accountCode)).limit(1)
    return row ?? null
  }

  /** The picked contacts, whoever's they are — `belongs` is a fact, so a code
   *  from another company is refused by name instead of silently vanishing. */
  async contacts(
    handle: Db,
    subject: LetterSubject,
    codes: readonly string[],
  ): Promise<LetterContact[]> {
    if (codes.length === 0) return []
    const home = sql`${contact.leadCode} = ${subject.leadCode}`
    const belongs = subject.accountCode
      ? sql<boolean>`(${home} OR ${lead.accountCode} = ${subject.accountCode})`
      : sql<boolean>`(${home})`
    return handle
      .select({
        code: contact.code,
        name: contact.name,
        email: sql<string | null>`NULLIF(lower(trim(${contact.email})), '')`,
        belongs,
        suppressedReason: emailSuppression.reason,
      })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .leftJoin(
        emailSuppression,
        and(
          eq(emailSuppression.recipient, sql`lower(trim(${contact.email}))`),
          isNull(emailSuppression.releasedAt),
        ),
      )
      .where(and(inArray(contact.code, [...codes]), leadLive))
  }

  /** Colleagues to copy in — active accounts only, address normalised the way
   *  `email_delivery_address` stores it. */
  async colleagues(
    handle: Db,
    ids: readonly string[],
  ): Promise<{ id: string; name: string; email: string }[]> {
    if (ids.length === 0) return []
    return handle
      .select({ id: actor.id, name: actor.name, email: sql<string>`lower(trim(${actor.email}))` })
      .from(actor)
      .where(and(inArray(actor.id, [...ids]), isNull(actor.disabledAt)))
  }

  /** Addresses (To + CC rows) this actor's Gmail letters put in one rolling
   *  window around `at`, by SEND time (schedule, else filing) — the busier of
   *  the window ending at `at` and the one starting there, so letters filed on
   *  many days for one morning cannot pile up. The locked inbox is not a row;
   *  a cancelled run counts only if its letter had already left.
   *  `lock` queues one actor's sends so two cannot both read the same total. */
  async gmailAddressesUsed(handle: Db, actorId: string, at: Date, lock: boolean): Promise<number> {
    if (lock) {
      await handle.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`gmail-quota:${actorId}`}))`)
    }
    const r = (await handle.execute(sql`
      SELECT GREATEST(count(*) FILTER (WHERE w.send_at > w.t - w.span AND w.send_at <= w.t),
                      count(*) FILTER (WHERE w.send_at >= w.t AND w.send_at < w.t + w.span))::int AS used
        FROM (SELECT COALESCE(r."scheduled_at", r."created_at") AS send_at,
                     ${at.toISOString()}::timestamptz AS t,
                     make_interval(hours => ${MAIL_PERSONAL_WINDOW_HOURS}) AS span
                FROM "platform"."email_delivery_address" a
                JOIN "platform"."email_delivery" d ON d."id" = a."delivery_id"
                JOIN "platform"."mail_run" r ON r."id" = d."mail_run_id"
               WHERE r."transport" = 'gmail'
                 AND r."created_by" = ${actorId}
                 AND (r."state" <> 'CANCELLED' OR d."accepted_at" IS NOT NULL)) w
    `)) as { rows: { used: number }[] }
    return r.rows[0]?.used ?? 0
  }

  /** The letter a client `letterId` already filed, found by its event key — a
   *  retried POST answers with it instead of mailing the customer twice. */
  async filedLetter(eventKey: string): Promise<FiledLetter | null> {
    const r = (await this.db.execute(sql`
      SELECT r."id" AS run_id, r."state" AS state, r."created_by" AS created_by,
             r."subject" AS subject, r."body" AS body, r."cta_label" AS cta_label,
             r."cta_url" AS cta_url, r."template_code" AS template_code,
             r."scheduled_at" AS scheduled_at,
             ARRAY(SELECT substring(a."ref" from '^contact:(.*)$')
                     FROM "platform"."email_delivery_address" a
                    WHERE a."delivery_id" = d."id" AND a."role" = 'to') AS to_codes,
             ARRAY(SELECT substring(a."ref" from '^actor:(.*)$')
                     FROM "platform"."email_delivery_address" a
                    WHERE a."delivery_id" = d."id" AND a."role" = 'cc') AS cc_ids
        FROM "platform"."email_delivery" d
        JOIN "platform"."mail_run" r ON r."id" = d."mail_run_id"
       WHERE d."event_key" = ${eventKey}
       LIMIT 1
    `)) as { rows: FiledLetterRow[] }
    const row = r.rows[0]
    return row
      ? {
          runId: row.run_id,
          state: row.state,
          createdBy: row.created_by,
          toCount: row.to_codes.length,
          subject: row.subject,
          body: row.body,
          ctaLabel: row.cta_label,
          ctaUrl: row.cta_url,
          templateCode: row.template_code,
          scheduledAt: row.scheduled_at,
          toCodes: row.to_codes,
          ccActorIds: row.cc_ids,
        }
      : null
  }
}
