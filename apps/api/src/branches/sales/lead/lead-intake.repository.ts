import { and, desc, eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { LeadIntakeQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { lead } from './lead.schema'
import { leadIntake, type LeadIntakeStatus } from './lead-intake.schema'

export type IntakeClient = {
  ipHash: string
  origin?: string
  referrer?: string
  userAgent?: string
}

/** What the internal alert mail is written from.
 *
 *  Read at SEND time, not captured at enqueue time — see `MailIntent`: the job
 *  carries two identifiers and nothing else, so nobody's name or mailbox sits
 *  in a queue row waiting to be read by whoever can see the database. */
export type LeadMailProfile = {
  leadCode: string
  company: string
  contactName: string
  email: string
  phone: string | null
  pain: string | null
  landingPage: string
  receivedAt: Date
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
}

export type IntakeAttempt = IntakeClient & {
  query: LeadIntakeQuery
  status: LeadIntakeStatus
  leadCode?: string
}

type RatePolicy = {
  scope: 'ip' | 'page'
  minute: number
  day: number
  blockMinutes: number
}

@Injectable()
export class LeadIntakeRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Atomically spend one shared rate-limit token and return seconds to wait. */
  async consume(keyHash: string, policy: RatePolicy): Promise<number> {
    const result = (await this.db.execute(sql`
      INSERT INTO "sales"."lead_intake_rate" (
        "key_hash", "scope", "minute_started_at", "minute_count",
        "day_started_at", "day_count", "blocked_until", "updated_at"
      ) VALUES (
        ${keyHash}, ${policy.scope}, now(), 1, date_trunc('day', now()), 1, NULL, now()
      )
      ON CONFLICT ("key_hash") DO UPDATE SET
        "scope" = EXCLUDED."scope",
        "minute_count" = CASE
          WHEN "lead_intake_rate"."minute_started_at" <= now() - interval '1 minute' THEN 1
          ELSE "lead_intake_rate"."minute_count" + 1
        END,
        "minute_started_at" = CASE
          WHEN "lead_intake_rate"."minute_started_at" <= now() - interval '1 minute' THEN now()
          ELSE "lead_intake_rate"."minute_started_at"
        END,
        "day_count" = CASE
          WHEN "lead_intake_rate"."day_started_at" < date_trunc('day', now()) THEN 1
          ELSE "lead_intake_rate"."day_count" + 1
        END,
        "day_started_at" = CASE
          WHEN "lead_intake_rate"."day_started_at" < date_trunc('day', now())
            THEN date_trunc('day', now())
          ELSE "lead_intake_rate"."day_started_at"
        END,
        "blocked_until" = CASE
          WHEN "lead_intake_rate"."blocked_until" > now()
            THEN "lead_intake_rate"."blocked_until"
          WHEN (CASE
            WHEN "lead_intake_rate"."day_started_at" < date_trunc('day', now()) THEN 1
            ELSE "lead_intake_rate"."day_count" + 1
          END) > ${policy.day}
            THEN date_trunc('day', now()) + interval '1 day'
          WHEN (CASE
            WHEN "lead_intake_rate"."minute_started_at" <= now() - interval '1 minute' THEN 1
            ELSE "lead_intake_rate"."minute_count" + 1
          END) > ${policy.minute}
            THEN now() + (${policy.blockMinutes} * interval '1 minute')
          ELSE NULL
        END,
        "updated_at" = now()
      RETURNING "blocked_until"
    `)) as { rows: { blocked_until: Date | string | null }[] }

    const blocked = result.rows[0]?.blocked_until
    if (!blocked) return 0
    return Math.max(1, Math.ceil((new Date(blocked).getTime() - Date.now()) / 1_000))
  }

  async writeAttempt(tx: Db, attempt: IntakeAttempt): Promise<void> {
    await tx.insert(leadIntake).values({
      status: attempt.status,
      leadCode: attempt.leadCode ?? null,
      landingPage: attempt.query.landingPage,
      ipHash: attempt.ipHash,
      origin: attempt.origin ?? null,
      referrer: attempt.referrer ?? null,
      userAgent: attempt.userAgent ?? null,
      utmSource: attempt.query.utm_source ?? null,
      utmMedium: attempt.query.utm_medium ?? null,
      utmCampaign: attempt.query.utm_campaign ?? null,
      utmContent: attempt.query.utm_content ?? null,
      utmTerm: attempt.query.utm_term ?? null,
    })
  }

  /** The lead as the landing page delivered it, joined to the submission that
   *  brought it in.
   *
   *  `ORDER BY received_at DESC` because a lead can have several accepted rows
   *  over its life — a mail about the submission that happened is worth more
   *  than a mail about the first one ever. Returns null when there is no
   *  accepted submission, which is the honest answer for a lead typed in by
   *  hand: this template describes a form, and there was no form. */
  async profileFor(leadCode: string): Promise<LeadMailProfile | null> {
    const [row] = await this.db
      .select({
        leadCode: lead.code,
        company: lead.company,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        pain: lead.pain,
        landingPage: leadIntake.landingPage,
        receivedAt: leadIntake.receivedAt,
        utmSource: leadIntake.utmSource,
        utmMedium: leadIntake.utmMedium,
        utmCampaign: leadIntake.utmCampaign,
        utmContent: leadIntake.utmContent,
        utmTerm: leadIntake.utmTerm,
      })
      .from(lead)
      .innerJoin(leadIntake, eq(leadIntake.leadCode, lead.code))
      .where(and(eq(lead.code, leadCode), eq(leadIntake.status, 'accepted')))
      .orderBy(desc(leadIntake.receivedAt))
      .limit(1)

    return row ?? null
  }

  get handle(): Db {
    return this.db
  }
}
