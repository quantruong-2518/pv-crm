import { Inject, Injectable } from '@nestjs/common'
import { sql, type SQL } from 'drizzle-orm'
import type { AfterSaleBookQuery, CustomerTemperature, RecareCycles } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { directHit } from '@api/platform/db/fuzzy'
import { contractReadBy, contractTerminated, liveContractOwners } from '../open-deal'
import { stepOf, type NextStepRead } from '../next-step/next-step.repository'
import { VN_TODAY, careRuns } from './after-sale.sql'

/** One book line before the mapper. Dates come back as the driver gives them. */
export type AfterSaleRead = {
  code: string
  leadCode: string
  customer: string
  temperature: CustomerTemperature | null
  temperatureAt: Date | string | null
  temperatureBy: { id: string; name: string } | null
  carers: { id: string; name: string }[]
  /** The reader is a carer or the lead's holder; the permission is the service's. */
  standsOn: boolean
  lastContactAt: Date | string | null
  nextCareOn: string
  careDue: boolean
  collectedVnd: number | string
  completedAt: Date | string
  step: NextStepRead | null
  today: string
}

/** One carer owed a re-care bell for one customer. */
export type RecareDue = {
  code: string
  customer: string
  baseDay: string
  cycleDays: number
  /** Cycles elapsed since `baseDay`; one bell per cycle (ADR 0121 §4). */
  cycle: number
  carerId: string
  /** The carer's own latest live contract: the bell's link, which they can open. */
  contractCode: string
}

type StepColumns = Partial<Record<keyof NextStepRead, string | null>>

/** SQL of the after-sale book and of its sweeper, both over `careRuns`. */
@Injectable()
export class AfterSaleRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async book(
    who: Actor,
    q: AfterSaleBookQuery,
    cycles: RecareCycles,
  ): Promise<{ rows: AfterSaleRead[]; total: number; hidden: number }> {
    const filters = this.filtersOf(q)
    const scope = scopeOf(who)
    const where = (parts: (SQL | undefined)[]) => {
      const kept = parts.filter((p): p is SQL => p !== undefined)
      return kept.length ? sql`WHERE ${sql.join(kept, sql` AND `)}` : sql``
    }
    const from = careRuns(cycles)
    /* One pass; the wide count only while the scope cuts, and never under
       `carer`: `hidden` there would tell how many customers a colleague cares for. */
    const wide = scope !== undefined && !q.carer
    const counts = (await this.db.execute(sql`
      SELECT count(*) FILTER (WHERE ${scope ?? sql`true`})::int AS total,
             ${wide ? sql`count(*)::int` : sql`NULL::int`} AS wide
        FROM ${from} ${where(filters)}
    `)) as { rows: { total: number; wide: number | null }[] }
    const total = counts.rows[0]?.total ?? 0
    const all = counts.rows[0]?.wide ?? null
    const page = (await this.db.execute(sql`
      SELECT care.code, care.lead_code AS "leadCode", care.customer, care.temperature,
             care.temperature_at AS "temperatureAt",
             CASE WHEN care.temperature_by IS NULL THEN NULL ELSE
               (SELECT json_build_object('id', a.id, 'name', a.name) FROM platform.actor a
                 WHERE a.id = care.temperature_by) END AS "temperatureBy",
             (SELECT coalesce(json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name), '[]')
                FROM platform.actor a
               WHERE a.id IN ${liveContractOwners(sql`care.lead_code`)}) AS carers,
             (care.lead_owner_id = ${who.id}
               OR ${who.id}::text IN ${liveContractOwners(sql`care.lead_code`)}) AS "standsOn",
             care.last_contact_at AS "lastContactAt", care.next_care_on::text AS "nextCareOn",
             care.care_due AS "careDue", care.collected_vnd AS "collectedVnd",
             care.completed_at AS "completedAt", ${VN_TODAY}::text AS today,
             s.text, s.due::text AS due, s.doer_id AS "doerId", d.name AS "doerName",
             s.kind_id AS "kindId", ke.name AS "kindName", s.template_id AS "templateId",
             s.created_by AS "createdBy"
        FROM ${from}
        LEFT JOIN sales.next_step s ON s.subject_code = care.lead_code
        LEFT JOIN platform.actor d ON d.id = s.doer_id
        LEFT JOIN sales.config_entry ke ON ke.id = s.kind_id
        ${where([...filters, scope])}
       ORDER BY CASE care.temperature WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
                care.next_care_on, care.code
       LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}
    `)) as { rows: (Omit<AfterSaleRead, 'step'> & StepColumns)[] }
    const rows = page.rows.map((r) => ({ ...r, step: stepOf(r) }))
    return { rows, total, hidden: all === null ? 0 : all - total }
  }

  /** One row per unlocked carer of a customer whose care day has come and
   *  who holds no line for this cycle yet. The anti-join is a saving; the
   *  ledger's UNIQUE (recipient, event key) refuses a duplicate. The key is
   *  spelled as E4's `plan` builds it (`<kind>/<code>/<occurrence>`): move both together. */
  async dueUntold(tx: Db, cycles: RecareCycles): Promise<RecareDue[]> {
    const r = (await tx.execute(sql`
      SELECT d.* FROM (
        SELECT care.code, care.customer, care.base_day::text AS "baseDay",
               care.cycle_days AS "cycleDays",
               ((${VN_TODAY} - care.base_day) / care.cycle_days)::int AS cycle,
               a.id AS "carerId",
               (SELECT k.code FROM sales.contract k
                 WHERE k.lead_code = care.lead_code AND k.owner_id = a.id
                   AND NOT ${contractTerminated(sql`k.code`)}
                 ORDER BY k.signed_at DESC, k.code DESC LIMIT 1) AS "contractCode"
          FROM ${careRuns(cycles)}
          JOIN platform.actor a
            ON a.id IN ${liveContractOwners(sql`care.lead_code`)} AND a.disabled_at IS NULL
         WHERE care.care_due
      ) d
       WHERE NOT EXISTS (SELECT 1 FROM platform.notification n
                          WHERE n.recipient_id = d."carerId"
                            AND n.event_key = 'customer-recare-due/' || d.code || '/'
                                || d."baseDay" || ':' || d."cycleDays" || ':' || d.cycle)
       ORDER BY d.code, d."carerId"
    `)) as { rows: RecareDue[] }
    return r.rows
  }

  private filtersOf(q: AfterSaleBookQuery): (SQL | undefined)[] {
    const day = (d: string, end: boolean) =>
      end
        ? sql`care.completed_at < ((${d}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
        : sql`care.completed_at >= (${d}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
    return [
      q.temperature === 'none'
        ? sql`care.temperature IS NULL`
        : q.temperature
          ? sql`care.temperature = ${q.temperature}`
          : undefined,
      q.carer ? sql`${q.carer}::text IN ${liveContractOwners(sql`care.lead_code`)}` : undefined,
      q.care === 'due'
        ? sql`care.care_due`
        : q.care === 'upcoming'
          ? sql`NOT care.care_due`
          : undefined,
      q.completedFrom ? day(q.completedFrom, false) : undefined,
      q.completedTo ? day(q.completedTo, true) : undefined,
      q.q
        ? sql`(${directHit(sql`care.code`, q.q)} OR ${directHit(sql`care.customer`, q.q)})`
        : undefined,
    ]
  }
}

/** E2 axis 3 (ADR 0121 §2): an `ownOnly` reader sees a run where they may
 *  open one of its live contracts (`contractReadBy`) — a carer always may. */
function scopeOf(who: Actor): SQL | undefined {
  if (!who.ownOnly) return undefined
  const reach = contractReadBy(
    {
      ownerId: sql`k.owner_id`,
      collectorId: sql`k.collector_id`,
      leadOwnerId: sql`care.lead_owner_id`,
      opportunityCode: sql`k.opportunity_code`,
    },
    who.id,
  )
  return sql`EXISTS (SELECT 1 FROM sales.contract k WHERE k.lead_code = care.lead_code
    AND NOT ${contractTerminated(sql`k.code`)} AND ${reach})`
}
