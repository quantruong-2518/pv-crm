import { and, arrayContains, asc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiMetricDef, KpiMetricKey, KpiScope, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { toVndSql } from '../money'
import { dealLost, dealWon } from '../open-deal'
import type { PeriodSpan } from '../performance/performance-period'
import { realExchanges } from '../performance/real-exchange'
import { kpiMonthClose, kpiMonthValue } from './kpi-close.schema'

/** Every KPI figure, computed on read from the books' own tables, except a
 *  closed month's, which `monthValues` reads from its frozen copy (ADR 0100).
 *
 *  Each metric is a BASIS — one row per record it counts, `(actor_id, kind,
 *  code, at, value, tag)` — and a TOTAL folding those rows into the figure. The
 *  card reads the total and the contributions list (ADR 0099 §5) the basis, so
 *  a record listed is a record counted. A read welds metrics with UNION ALL:
 *  a whole room is one round trip, never a query per person per metric.
 *
 *  Raw SQL with private aliases, `open-deal.ts`'s reason: the fragments nest,
 *  and an unaliased table would capture an outer column. Month edges are
 *  Vietnam days cut in SQL, the fence `performance.repository.ts` uses. A lead
 *  switched off takes its deals and contracts with it (`leadLive`), spelled
 *  `LIVE` here because the builder's `lead` cannot carry an alias. */

/** Appends "and only this actor" on `me`; nothing when the whole room is read. */
export type Only = (column: SQL) => SQL
type Basis = (only: Only) => SQL
/** `total` folds the basis rows, aliased `b`, into the one figure. */
export type KpiMetricSql = { basis: Basis; total: SQL }

const COUNT = sql`count(*)`
const SUM = sql`COALESCE(SUM(b.value), 0)`
/** A share's rows carry 1 or 0, so the denominator is exactly the rows. */
const SHARE = sql`(count(*) FILTER (WHERE b.value = 1))::float8 / NULLIF(count(*), 0)`
const MEDIAN = sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY b.value)`

const within = (column: SQL): SQL =>
  sql`${column} >= (SELECT lo FROM span) AND ${column} < (SELECT hi FROM span)`

const LIVE = sql`JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL`
const contractVnd = toVndSql(sql`k.amount`, sql`k.currency`)
const installmentVnd = toVndSql(sql`i.amount`, sql`k.currency`)
/** "Won" has ONE reading in KPI: the deal has a contract row. */
const WON = dealWon(sql`k.code`)
const LOST = dealLost(sql`k.code`, sql`k.state`)
const seconds = (span: SQL, per: number): SQL =>
  sql`EXTRACT(EPOCH FROM ${span}) / ${sql.raw(String(per))}`

/** The `(value, tag)` tail of a basis row: a bare count, an amount, or a
 *  yes/no answer of a share. Casts, because a bare `$n` in a CASE has no type. */
const tally = (tag: string): SQL => sql`NULL::float8 AS value, ${tag}::text AS tag`
const worth = (value: SQL, tag: string): SQL => sql`${value} AS value, ${tag}::text AS tag`
const flag = (yes: SQL, on: string, off: string): SQL =>
  sql`CASE WHEN ${yes} THEN 1 ELSE 0 END::float8 AS value,
      CASE WHEN ${yes} THEN ${on}::text ELSE ${off}::text END AS tag`

/** Overdue AS OF the span's `as_of` day (`spanned`): due on a Vietnam day
 *  strictly before it (`dueLevelOf`: due today is not overdue), and not paid by
 *  the end of it. An approved reason for THIS due date lifts the installment. */
const OVERDUE = sql`FROM sales.contract_installment i
  JOIN sales.contract k ON k.code = i.contract_code ${LIVE}
  WHERE (i.due AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < (SELECT as_of FROM span)
    AND (i.paid_at IS NULL
         OR i.paid_at >= (((SELECT as_of FROM span) + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
    AND NOT EXISTS (
      SELECT 1 FROM sales.installment_overdue_reason r
       WHERE r.contract_code = i.contract_code AND r.installment_no = i.no
         AND r.state = 'approved' AND r.due = i.due)`

/** An installment has no code of its own; `contract/no` is its page's address. */
const INSTALLMENT = sql`'installment' AS kind, k.code || '/' || i.no AS code`

/** A meeting or debrief hangs off a lead (`LD-`) or a deal (`OP-`); either
 *  way it is off when that lead is switched off. */
const subjectLive = (subject: SQL): SQL => sql`NOT EXISTS (
  SELECT 1 FROM sales.lead sl
   WHERE sl.disabled_at IS NOT NULL AND sl.code = COALESCE(
     (SELECT so.lead_code FROM sales.opportunity so WHERE so.code = ${subject}), ${subject}))`

/** The marketing cohort: leads created in the period, by who sourced them. */
const sourced =
  (tail: SQL): Basis =>
  (only) => sql`
    SELECT k.marketing_owner_id AS actor_id, 'lead' AS kind, k.code, k.created_at AS at, ${tail}
    FROM sales.lead k
    WHERE k.disabled_at IS NULL AND k.marketing_owner_id IS NOT NULL
      AND ${within(sql`k.created_at`)}${only(sql`k.marketing_owner_id`)}`

/** Contracts signed in the period, credited to `credit`; `null` = the room. */
const signed =
  (credit: SQL | null): Basis =>
  (only) => sql`
    SELECT ${credit ?? sql`NULL`} AS actor_id, 'contract' AS kind, k.code, k.signed_at AS at,
           ${worth(contractVnd, 'signed')}
    FROM sales.contract k ${LIVE}
    WHERE ${credit ? sql`${credit} IS NOT NULL AND ` : sql``}${within(sql`k.signed_at`)}${credit ? only(credit) : sql``}`

/** Accepted at birth (ADR 0088 §18): the deal ENTERED the board at `assigned`,
 *  by the person recorded as its acceptor — the row both the create and the
 *  import door write for an accept-holder. The `by_id` tie keeps out a deal
 *  that entered at a pre-0071 column since renamed `assigned`, opened by
 *  somebody else and credited to a head by 0072's backfill. */
const BORN_ACCEPTED = sql`EXISTS (
  SELECT 1 FROM sales.opportunity_stage_event ba
   WHERE ba.opportunity_code = k.code AND ba.from_stage IS NULL
     AND ba.to_stage = 'assigned' AND ba.by_id = k.accepted_by_id)`

/** Deals with the actor on one lane (`null` = either), fenced on one of the
 *  deal's own dates; `also` narrows which deals count. DISTINCT: a person on
 *  both lanes of one deal is still one deal. */
const onLane = (lane: 'BD' | 'SALE' | null, date: SQL, tail: SQL, also?: SQL): Basis => {
  const seat = lane ? sql`w.role = ${lane} AND ` : sql``
  const kept = also ? sql`${also} AND ` : sql``
  return (
    only,
  ) => sql`SELECT DISTINCT w.actor_id, 'opportunity' AS kind, k.code, ${date} AS at, ${tail}
    FROM sales.opportunity_owner w
    JOIN sales.opportunity k ON k.code = w.opportunity_code ${LIVE}
    WHERE ${seat}${kept}${within(date)}${only(sql`w.actor_id`)}`
}

/** A lead "reaches" an actor at the first hand-over to them, else at the
 *  `created` touch naming them, else at its creation when they hold it. A lead
 *  not answered yet counts up to now, or to the month's end once it has closed,
 *  so ignoring one cannot improve the figure and a closed month stops moving.
 *  The answer is the actor's first real exchange (`realExchanges`). */
const firstResponse: Basis = (only) => sql`
  SELECT r.actor_id, 'lead' AS kind, r.lead_code AS code, r.at,
         ${seconds(sql`(COALESCE(f.at, LEAST(now(), (SELECT hi FROM span))) - r.at)`, 3600)} AS value,
         CASE WHEN f.at IS NULL THEN 'unanswered' ELSE 'answered' END AS tag
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
    SELECT min(x.at) AS at FROM (${realExchanges(sql`r.lead_code`)}) x
     WHERE x.actor_id = r.actor_id AND x.at >= r.at
  ) f ON true
  WHERE ${within(sql`r.at`)}${only(sql`r.actor_id`)}`

/** A debrief is listed under the record it closes on — the one it belongs to. */
const DEBRIEF_SUBJECT = sql`(SELECT CASE ob.kind WHEN 'LD' THEN 'lead' WHEN 'OP' THEN 'opportunity'
  WHEN 'HĐ' THEN 'contract' END FROM platform.object ob WHERE ob.code = d.subject_code)`

const OWN: Partial<Record<KpiMetricKey, KpiMetricSql>> = {
  'leads-sourced': { basis: sourced(tally('sourced')), total: COUNT },
  'lead-to-opportunity-rate': {
    basis: sourced(
      flag(
        sql`EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = k.code)`,
        'converted',
        'not-converted',
      ),
    ),
    total: SHARE,
  },
  'sourced-signed-value': { basis: signed(sql`l.marketing_owner_id`), total: SUM },
  'opportunities-opened': {
    basis: onLane('BD', sql`k.created_at`, tally('opened')),
    total: COUNT,
  },
  'opportunity-accept-rate': {
    basis: onLane(
      'BD',
      sql`k.created_at`,
      flag(sql`k.accepted_at IS NOT NULL`, 'accepted', 'not-accepted'),
      sql`NOT ${BORN_ACCEPTED}`,
    ),
    total: SHARE,
  },
  'first-response-hours': { basis: firstResponse, total: MEDIAN },
  'demos-joined': {
    basis: (only) => sql`
      SELECT DISTINCT a.actor_id, 'meeting' AS kind, m.id::text AS code, m.held_at AS at,
             ${tally('attended')}
      FROM sales.meeting_attendee a JOIN sales.meeting m ON m.id = a.meeting_id
      WHERE a.actor_id IS NOT NULL AND a.attended IS TRUE AND ${subjectLive(sql`m.subject_code`)}
        AND ${within(sql`m.held_at`)}${only(sql`a.actor_id`)}`,
    total: COUNT,
  },
  'signed-value': { basis: signed(sql`k.owner_id`), total: SUM },
  'win-rate': {
    basis: onLane('SALE', sql`k.closed_at`, flag(WON, 'won', 'lost'), sql`(${WON} OR ${LOST})`),
    total: SHARE,
  },
  /* A comm closed as "unreached" talked to nobody (owner's call 15/10/2026). */
  'debriefs-closed': {
    basis: (only) => sql`
      SELECT d.owner_id AS actor_id, ${DEBRIEF_SUBJECT} AS kind, d.subject_code AS code,
             d.closed_at AS at, ${tally('closed')}
      FROM comms.debrief d
      WHERE NOT d.unreached AND ${subjectLive(sql`d.subject_code`)}
        AND ${within(sql`d.closed_at`)}${only(sql`d.owner_id`)}`,
    total: COUNT,
  },
  'overdue-receivables': {
    basis: (only) => sql`
      SELECT k.owner_id AS actor_id, ${INSTALLMENT}, i.due AS at, ${worth(installmentVnd, 'overdue')}
      ${OVERDUE} AND k.owner_id IS NOT NULL${only(sql`k.owner_id`)}`,
    total: SUM,
  },
  'accept-lag-days': {
    basis: (only) => sql`
      SELECT k.accepted_by_id AS actor_id, 'opportunity' AS kind, k.code, k.accepted_at AS at,
             ${worth(seconds(sql`(k.accepted_at - k.created_at)`, 86400), 'took')}
      FROM sales.opportunity k ${LIVE}
      WHERE k.accepted_by_id IS NOT NULL AND NOT ${BORN_ACCEPTED}
        AND ${within(sql`k.accepted_at`)}${only(sql`k.accepted_by_id`)}`,
    total: MEDIAN,
  },
}

/** Counted from the deal itself, never through `opportunity_owner`: a deal
 *  with two people on it is still one deal of the room. */
const ROOM: Partial<Record<KpiMetricKey, KpiMetricSql>> = {
  'signed-value': { basis: signed(null), total: SUM },
  'win-rate': {
    basis: () => sql`
      SELECT NULL AS actor_id, 'opportunity' AS kind, k.code, k.closed_at AS at,
             ${flag(WON, 'won', 'lost')}
      FROM sales.opportunity k ${LIVE}
      WHERE (${WON} OR ${LOST}) AND ${within(sql`k.closed_at`)}`,
    total: SHARE,
  },
  'overdue-receivables': {
    basis: () => sql`
      SELECT NULL AS actor_id, ${INSTALLMENT}, i.due AS at, ${worth(installmentVnd, 'overdue')}
      ${OVERDUE}`,
    total: SUM,
  },
  'collected-value': {
    basis: () => sql`
      SELECT NULL AS actor_id, ${INSTALLMENT}, i.paid_at AS at, ${worth(installmentVnd, 'collected')}
      FROM sales.contract_installment i
      JOIN sales.contract k ON k.code = i.contract_code ${LIVE}
      WHERE ${within(sql`i.paid_at`)}`,
    total: SUM,
  },
  'approval-turnaround-hours': {
    basis: () => sql`
      SELECT NULL AS actor_id, 'approval' AS kind, a.id::text AS code, a.decided_at AS at,
             ${worth(seconds(sql`(a.decided_at - a.raised_at)`, 3600), 'decided')}
      FROM platform.approval a WHERE ${within(sql`a.decided_at`)}`,
    total: MEDIAN,
  },
}

const METRICS: Record<KpiScope, Partial<Record<KpiMetricKey, KpiMetricSql>>> = {
  own: OWN,
  room: ROOM,
}

/** Where one role reads a shared key differently. The account executive
 *  stands on the SALE lane, so "deals I opened" is either lane for that seat. */
const BY_ROLE: Partial<Record<RoleId, Partial<Record<KpiMetricKey, KpiMetricSql>>>> = {
  'account-executive': {
    'opportunities-opened': {
      basis: onLane(null, sql`k.created_at`, tally('opened')),
      total: COUNT,
    },
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

/** Seats with one key read one series: the unit a read deduplicates on. */
export const seriesKey = (seat: KpiSeat): string => `${seriesOf(seat)}|${seat.def.scope}`

/** The basis and total of a seat. A metric added to the catalog without a
 *  definition is a bug to hear about, not a figure to print as zero. */
export function metricSql(seat: KpiSeat): KpiMetricSql {
  const d = seat.def
  const found = BY_ROLE[seat.role]?.[d.key] ?? METRICS[d.scope][d.key]
  if (!found) throw new Error(`kpi: no ${d.scope} definition for ${d.key}`)
  return found
}

export const onlyFor =
  (actorId?: string): Only =>
  (column) =>
    actorId ? sql` AND ${column} = ${actorId}` : sql``

/** `body` under the month's Vietnam-day edges, the `span` every basis reads.
 *  `as_of` is the last Vietnam day a snapshot figure is read at: today for the
 *  running month, the month's last day once it ended. */
export const spanned = (span: PeriodSpan, body: SQL): SQL => sql`
  WITH span AS (
    SELECT (${span.from}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AS lo,
           (${span.to}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AS hi,
           LEAST((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, ${span.to}::date - 1) AS as_of
  )
  ${body}`

export type KpiValues = ReadonlyMap<string, number | null>

@Injectable()
export class KpiReadingsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The figures behind `defs` for one month, in one statement. An actor with
   *  no row is absent from the map — what absence means is the mapper's call. */
  async values(seats: readonly KpiSeat[], span: PeriodSpan, actorId?: string): Promise<KpiValues> {
    const only = onlyFor(actorId)
    const wanted = new Map(seats.map((s) => [seriesKey(s), s]))
    const parts = [...wanted.values()].map((s) => {
      const { basis, total } = metricSql(s)
      const fold =
        s.def.scope === 'own'
          ? sql`SELECT b.actor_id, ${total} AS value FROM (${basis(only)}) b GROUP BY 1`
          : sql`SELECT NULL AS actor_id, ${total} AS value FROM (${basis(only)}) b`
      return sql`SELECT ${seriesOf(s)}::text AS series, ${s.def.scope}::text AS scope,
                        q.actor_id::text AS actor_id, q.value::float8 AS value
                 FROM (${fold}) q`
    })
    if (parts.length === 0) return new Map()

    const r = (await this.db.execute(spanned(span, sql.join(parts, sql` UNION ALL `)))) as {
      rows: { series: string; scope: KpiScope; actor_id: string | null; value: number | null }[]
    }

    return new Map(
      r.rows.map((row) => [address(row.series, row.scope, row.actor_id ?? ''), row.value]),
    )
  }

  /** `values`, except that a closed month answers from its frozen copy, which
   *  is why every reader of a month's cards uses this one. A seat with no
   *  stored row is absent, as an actor with no row is in the live read.
   *  The weekly series and the close itself call `values`: they need live data. */
  async monthValues(
    seats: readonly KpiSeat[],
    span: PeriodSpan,
    actorId?: string,
  ): Promise<KpiValues> {
    const [closed] = await this.db
      .select({ period: kpiMonthClose.period })
      .from(kpiMonthClose)
      .where(eq(kpiMonthClose.period, span.key))
    if (!closed) return this.values(seats, span, actorId)

    const rows = await this.db
      .select()
      .from(kpiMonthValue)
      .where(
        and(
          eq(kpiMonthValue.period, span.key),
          actorId
            ? or(eq(kpiMonthValue.actorId, actorId), isNull(kpiMonthValue.actorId))
            : undefined,
        ),
      )
    const bySeat = new Map(seats.map((s) => [`${s.role}|${s.def.key}`, s]))
    return new Map(
      rows.flatMap((r) => {
        const seat = bySeat.get(`${r.role}|${r.metricKey}`)
        return seat
          ? [[valueKey(seat, r.actorId ?? ''), r.value === null ? null : Number(r.value)]]
          : []
      }),
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
