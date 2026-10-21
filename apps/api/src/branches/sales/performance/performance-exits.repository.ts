import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import {
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type StageKey,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { LEAD_GONE_STATES } from '../lead/lead-state'
import { dealLost } from '../open-deal'
import type { PeriodSpan } from './performance-period'

type ExitRow = { key: string; label: string; count: number }
type StopRow = ExitRow & { stage: StageKey }

/** Why leads, deals and contracts left in one span (ADR 0088 §22, 0107).
 *
 *  Leads are counted where they STAND, off `lead.exit_reason`: a lead that
 *  left and was reopened is not an exit any more, and a nurture park never
 *  writes that column. `ConfigRepository.usage` counts stop EVENTS instead,
 *  to weigh a catalogue row; the two differ by design. A termination counts
 *  on `terminated_at`, the event, not on the deal's close moment.
 *
 *  A label comes off the catalogue row whether or not it is still active, so
 *  a retired reason keeps its name. `other` has no row and takes the
 *  contract's label; a key with no row at all prints as itself.
 *
 *  Vietnam-day edges and the `disabled_at` fence of `performance.repository.ts`.
 *  Ties break on the key, so PGlite and Neon order them alike. */
@Injectable()
export class PerformanceExitsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async leadExits(span: PeriodSpan): Promise<ExitRow[]> {
    const r = (await this.db.execute(sql`
      SELECT l."exit_reason" AS key, ${labelOf(sql`l."exit_reason"`)} AS label,
             count(*)::int AS count
        FROM "sales"."lead" l
        LEFT JOIN "sales"."config_entry" c
          ON c."id" = l."exit_reason" AND c."list" = 'EXIT_REASON'
       WHERE l."disabled_at" IS NULL AND l."state" IN (${GONE})
         AND ${within(sql`l."exited_at"`, span)}
       GROUP BY l."exit_reason"
       ORDER BY count(*) DESC, l."exit_reason" COLLATE "C"
    `)) as { rows: ExitRow[] }
    return r.rows
  }

  async dealStops(span: PeriodSpan): Promise<StopRow[]> {
    const r = (await this.db.execute(sql`
      SELECT o."stopped_at_stage" AS stage, o."stop_reason" AS key,
             ${labelOf(sql`o."stop_reason"`)} AS label, count(*)::int AS count
        FROM "sales"."opportunity" o
        JOIN "sales"."lead" l ON l."code" = o."lead_code" AND l."disabled_at" IS NULL
        LEFT JOIN "sales"."config_entry" c
          ON c."id" = o."stop_reason" AND c."list" = 'LOSS_REASON'
       WHERE ${dealLost(sql`o."code"`, sql`o."state"`)} AND ${within(sql`o."closed_at"`, span)}
       GROUP BY o."stopped_at_stage", o."stop_reason"
       ORDER BY count(*) DESC, o."stop_reason" COLLATE "C", o."stopped_at_stage"
    `)) as { rows: StopRow[] }
    return r.rows
  }

  async contractTerminations(span: PeriodSpan): Promise<ExitRow[]> {
    const r = (await this.db.execute(sql`
      SELECT t."reason_key" AS key, ${labelOf(sql`t."reason_key"`)} AS label,
             count(*)::int AS count
        FROM "sales"."contract_termination" t
        JOIN "sales"."contract" k ON k."code" = t."contract_code"
        JOIN "sales"."lead" l ON l."code" = k."lead_code" AND l."disabled_at" IS NULL
        LEFT JOIN "sales"."config_entry" c
          ON c."id" = t."reason_key" AND c."list" = 'CONTRACT_TERMINATION_REASON'
       WHERE ${within(sql`t."terminated_at"`, span)}
       GROUP BY t."reason_key"
       ORDER BY count(*) DESC, t."reason_key" COLLATE "C"
    `)) as { rows: ExitRow[] }
    return r.rows
  }
}

const GONE = sql.join(
  LEAD_GONE_STATES.map((s) => sql`${s}`),
  sql`, `,
)

const day = (d: string) => sql`(${d}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`

const within = (column: ReturnType<typeof sql>, span: PeriodSpan) =>
  sql`${column} >= ${day(span.from)} AND ${column} < ${day(span.to)}`

/** `max` only because the catalogue row is outside the GROUP BY: one key
 *  joins at most one row of its list. */
const labelOf = (key: ReturnType<typeof sql>) => sql`COALESCE(max(c."name"),
  CASE WHEN ${key} = ${OPPORTUNITY_STOP_REASON_OTHER}
       THEN ${OPPORTUNITY_STOP_REASON_OTHER_LABEL}::text ELSE ${key} END)`
