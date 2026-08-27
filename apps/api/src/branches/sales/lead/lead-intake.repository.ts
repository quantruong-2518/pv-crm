import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { LeadIntakeQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { leadIntake, type LeadIntakeStatus } from './lead-intake.schema'

export type IntakeClient = {
  ipHash: string
  origin?: string
  referrer?: string
  userAgent?: string
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

  get handle(): Db {
    return this.db
  }
}
