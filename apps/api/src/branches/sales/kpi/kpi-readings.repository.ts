import { and, arrayContains, asc, isNull, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiMetricDef, KpiMetricKey, KpiScope, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { toVndSql } from '../money'
import { dealLost, dealWon } from '../open-deal'
import type { PeriodSpan } from '../performance/performance-period'

/** Every KPI figure, computed on read from the books' own tables — there is
 *  no snapshot to drift (`kpi.schema.ts`).
 *
 *  Each metric is ONE fragment answering `(actor_id, value)`: an `own` one is
 *  grouped by actor, a `room` one is a single row. A read welds the fragments
 *  it needs with UNION ALL, so a whole room of scorecards is one round trip
 *  and never a query per person per metric.
 *
 *  Raw SQL with private aliases, `open-deal.ts`'s reason: the fragments nest,
 *  and an unaliased table would capture an outer column. Month edges are
 *  Vietnam days cut in SQL, the fence `performance.repository.ts` uses.
 *
 *  A lead switched off takes its deals and contracts with it (`leadLive`),
 *  spelled `LIVE` here because the builder's `lead` cannot carry an alias. */

/** Appends "and only this actor" on `me`; nothing when the whole room is read. */
type Only = (column: SQL) => SQL
type Fragment = (only: Only) => SQL

const within = (column: SQL): SQL =>
  sql`${column} >= (SELECT lo FROM span) AND ${column} < (SELECT hi FROM span)`

const LIVE = sql`JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL`
const contractVnd = toVndSql(sql`k.amount`, sql`k.currency`)
const installmentVnd = toVndSql(sql`i.amount`, sql`k.currency`)
/** "Won" has ONE reading in KPI: the deal has a contract row. */
const WON = dealWon(sql`k.code`)
const LOST = dealLost(sql`k.code`, sql`k.state`)
const WIN_RATE = sql`(count(*) FILTER (WHERE ${WON}))::float8
                     / NULLIF(count(*) FILTER (WHERE ${WON} OR ${LOST}), 0)`
const median = (seconds: SQL, per: number): SQL =>
  sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ${seconds}) / ${sql.raw(String(per))})`

const OVERDUE = sql`FROM sales.contract_installment i
  JOIN sales.contract k ON k.code = i.contract_code ${LIVE}
  WHERE i.paid_at IS NULL AND i.due < now()`

/** A meeting or debrief hangs off a lead (`LD-`) or a deal (`OP-`); either
 *  way it is off when that lead is switched off. */
const subjectLive = (subject: SQL): SQL => sql`NOT EXISTS (
  SELECT 1 FROM sales.lead sl
   WHERE sl.disabled_at IS NOT NULL AND sl.code = COALESCE(
     (SELECT so.lead_code FROM sales.opportunity so WHERE so.code = ${subject}), ${subject}))`

/** The marketing cohort: leads created in the period, by who sourced them. */
const sourced = (value: SQL): Fragment => {
  return (only) => sql`SELECT k.marketing_owner_id AS actor_id, ${value} AS value
    FROM sales.lead k
    WHERE k.disabled_at IS NULL AND k.marketing_owner_id IS NOT NULL
      AND ${within(sql`k.created_at`)}${only(sql`k.marketing_owner_id`)}
    GROUP BY 1`
}

/** Deals with the actor on one lane (`null` = either), fenced on one of the
 *  deal's own dates. */
const onLane = (lane: 'BD' | 'SALE' | null, date: SQL, value: SQL): Fragment => {
  const seat = lane ? sql`w.role = ${lane} AND ` : sql``
  return (only) => sql`SELECT w.actor_id, ${value} AS value
    FROM sales.opportunity_owner w
    JOIN sales.opportunity k ON k.code = w.opportunity_code ${LIVE}
    WHERE ${seat}${within(date)}${only(sql`w.actor_id`)}
    GROUP BY 1`
}

/** A lead "reaches" an actor at the first hand-over to them, else at the
 *  `created` touch naming them, else at its creation when they hold it. A lead
 *  not answered yet counts with `now − reach`: ignoring one must not improve
 *  the figure. */
const firstResponse: Fragment = (only) => sql`
  SELECT r.actor_id, ${median(sql`(COALESCE(f.at, now()) - r.at)`, 3600)} AS value
  FROM (
    SELECT t.subject_code AS lead_code, t.to_actor_id AS actor_id,
           COALESCE(min(t.at) FILTER (WHERE t.kind = 'handed-over'), min(t.at)) AS at
      FROM sales.touch t
     WHERE t.subject_kind = 'lead' AND t.kind IN ('handed-over', 'created')
       AND t.to_actor_id IS NOT NULL
     GROUP BY 1, 2
    UNION ALL
    SELECT o.code, o.owner_id, o.created_at
      FROM sales.lead o
     WHERE o.owner_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM sales.touch t
        WHERE t.subject_code = o.code AND t.subject_kind = 'lead'
          AND t.kind IN ('handed-over', 'created') AND t.to_actor_id = o.owner_id)
  ) r
  JOIN sales.lead l ON l.code = r.lead_code AND l.disabled_at IS NULL
  LEFT JOIN LATERAL (
    SELECT min(t.at) AS at FROM sales.touch t
     WHERE t.subject_code = r.lead_code AND t.subject_kind = 'lead'
       AND t.kind IN ('contacted', 'exchange-logged')
       AND t.actor_id = r.actor_id AND t.at >= r.at
  ) f ON true
  WHERE ${within(sql`r.at`)}${only(sql`r.actor_id`)}
  GROUP BY 1`

const OWN: Partial<Record<KpiMetricKey, Fragment>> = {
  'leads-sourced': sourced(sql`count(*)`),
  'lead-to-opportunity-rate': sourced(sql`(count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM sales.opportunity o WHERE o.lead_code = k.code)))::float8 / count(*)`),
  'sourced-signed-value': (only) => sql`
    SELECT l.marketing_owner_id AS actor_id, COALESCE(SUM(${contractVnd}), 0) AS value
    FROM sales.contract k ${LIVE}
    WHERE l.marketing_owner_id IS NOT NULL
      AND ${within(sql`k.signed_at`)}${only(sql`l.marketing_owner_id`)}
    GROUP BY 1`,
  'opportunities-opened': onLane('BD', sql`k.created_at`, sql`count(*)`),
  'opportunity-accept-rate': onLane(
    'BD',
    sql`k.created_at`,
    sql`count(k.accepted_at)::float8 / count(*)`,
  ),
  'first-response-hours': firstResponse,
  'demos-joined': (only) => sql`
    SELECT a.actor_id, count(DISTINCT m.id) AS value
    FROM sales.meeting_attendee a JOIN sales.meeting m ON m.id = a.meeting_id
    WHERE a.actor_id IS NOT NULL AND a.attended IS TRUE AND ${subjectLive(sql`m.subject_code`)}
      AND ${within(sql`m.held_at`)}${only(sql`a.actor_id`)}
    GROUP BY 1`,
  'signed-value': (only) => sql`
    SELECT k.owner_id AS actor_id, COALESCE(SUM(${contractVnd}), 0) AS value
    FROM sales.contract k ${LIVE}
    WHERE k.owner_id IS NOT NULL AND ${within(sql`k.signed_at`)}${only(sql`k.owner_id`)}
    GROUP BY 1`,
  'win-rate': onLane('SALE', sql`k.closed_at`, WIN_RATE),
  'debriefs-closed': (only) => sql`
    SELECT d.owner_id AS actor_id, count(*) AS value
    FROM comms.debrief d
    WHERE ${subjectLive(sql`d.subject_code`)}
      AND ${within(sql`d.closed_at`)}${only(sql`d.owner_id`)}
    GROUP BY 1`,
  'overdue-receivables': (only) => sql`
    SELECT k.owner_id AS actor_id, COALESCE(SUM(${installmentVnd}), 0) AS value
    ${OVERDUE} AND k.owner_id IS NOT NULL${only(sql`k.owner_id`)}
    GROUP BY 1`,
  'accept-lag-days': (only) => sql`
    SELECT k.accepted_by_id AS actor_id, ${median(sql`(k.accepted_at - k.created_at)`, 86400)} AS value
    FROM sales.opportunity k ${LIVE}
    WHERE k.accepted_by_id IS NOT NULL
      AND ${within(sql`k.accepted_at`)}${only(sql`k.accepted_by_id`)}
    GROUP BY 1`,
}

/** Counted from the deal itself, never through `opportunity_owner`: a deal
 *  with two people on it is still one deal of the room. */
const ROOM: Partial<Record<KpiMetricKey, Fragment>> = {
  'signed-value': () => sql`
    SELECT NULL AS actor_id, COALESCE(SUM(${contractVnd}), 0) AS value
    FROM sales.contract k ${LIVE} WHERE ${within(sql`k.signed_at`)}`,
  'win-rate': () => sql`
    SELECT NULL AS actor_id, ${WIN_RATE} AS value
    FROM sales.opportunity k ${LIVE} WHERE ${within(sql`k.closed_at`)}`,
  'overdue-receivables': () => sql`
    SELECT NULL AS actor_id, COALESCE(SUM(${installmentVnd}), 0) AS value ${OVERDUE}`,
  'collected-value': () => sql`
    SELECT NULL AS actor_id, COALESCE(SUM(${installmentVnd}), 0) AS value
    FROM sales.contract_installment i
    JOIN sales.contract k ON k.code = i.contract_code ${LIVE}
    WHERE ${within(sql`i.paid_at`)}`,
  'approval-turnaround-hours': () => sql`
    SELECT NULL AS actor_id, ${median(sql`(a.decided_at - a.raised_at)`, 3600)} AS value
    FROM platform.approval a WHERE ${within(sql`a.decided_at`)}`,
}

const FRAGMENTS: Record<KpiScope, Partial<Record<KpiMetricKey, Fragment>>> = {
  own: OWN,
  room: ROOM,
}

/** Where one role reads a shared key differently. The account executive
 *  stands on the SALE lane, so "deals I opened" is either lane for that seat. */
const BY_ROLE: Partial<Record<RoleId, Partial<Record<KpiMetricKey, Fragment>>>> = {
  'account-executive': {
    'opportunities-opened': onLane(null, sql`k.created_at`, sql`count(DISTINCT k.code)`),
  },
}

/** One metric as one role carries it. */
export type KpiSeat = { role: RoleId; def: KpiMetricDef }

/** The name of the series a seat reads: the key, or key@role when overridden. */
const seriesOf = ({ role, def }: KpiSeat): string =>
  BY_ROLE[role]?.[def.key] ? `${def.key}@${role}` : def.key

const address = (series: string, scope: KpiScope, actorId: string): string =>
  `${series}|${scope}|${scope === 'room' ? '' : actorId}`

/** The address of one figure; a room figure belongs to no actor. */
export const valueKey = (seat: KpiSeat, actorId: string): string =>
  address(seriesOf(seat), seat.def.scope, actorId)

export type KpiValues = ReadonlyMap<string, number | null>

@Injectable()
export class KpiReadingsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The figures behind `defs` for one month, in one statement. An actor with
   *  no row is absent from the map — what absence means is the mapper's call. */
  async values(seats: readonly KpiSeat[], span: PeriodSpan, actorId?: string): Promise<KpiValues> {
    const only: Only = (column) => (actorId ? sql` AND ${column} = ${actorId}` : sql``)
    const wanted = new Map(seats.map((s) => [`${seriesOf(s)}|${s.def.scope}`, s]))
    const parts = [...wanted.values()].map((s) => {
      const d = s.def
      const fragment = BY_ROLE[s.role]?.[d.key] ?? FRAGMENTS[d.scope][d.key]
      /* A metric added to the catalog without a definition is a bug to hear
         about, not a figure to print as zero. */
      if (!fragment) throw new Error(`kpi: no ${d.scope} definition for ${d.key}`)
      return sql`SELECT ${seriesOf(s)}::text AS series, ${d.scope}::text AS scope,
                        q.actor_id::text AS actor_id, q.value::float8 AS value
                 FROM (${fragment(only)}) q`
    })
    if (parts.length === 0) return new Map()

    const r = (await this.db.execute(sql`
      WITH span AS (
        SELECT (${span.from}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AS lo,
               (${span.to}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AS hi
      )
      ${sql.join(parts, sql` UNION ALL `)}
    `)) as {
      rows: { series: string; scope: KpiScope; actor_id: string | null; value: number | null }[]
    }

    return new Map(
      r.rows.map((row) => [address(row.series, row.scope, row.actor_id ?? ''), row.value]),
    )
  }

  /** Everyone a Sales scorecard can belong to: enabled and licensed for the branch. */
  people(): Promise<Pick<typeof actor.$inferSelect, 'id' | 'name' | 'roleIds'>[]> {
    return this.db
      .select({ id: actor.id, name: actor.name, roleIds: actor.roleIds })
      .from(actor)
      .where(and(isNull(actor.disabledAt), arrayContains(actor.branches, ['Sales'])))
      .orderBy(asc(actor.name))
  }
}
