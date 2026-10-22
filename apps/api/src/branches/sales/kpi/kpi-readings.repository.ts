import { and, arrayContains, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import {
  isCumulative,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiScope,
  type RoleId,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { toVndSql } from '../money'
import { contractTerminated, dealLost, dealTerminated, dealWon } from '../open-deal'
import type { PeriodSpan } from '../performance/performance-period'
import { realExchanges } from '../performance/real-exchange'
import { kpiMonthClose, kpiMonthValue } from './kpi-close.schema'
import { adjustedByEnd, cumulativeByEnd } from './kpi-weekly.sql'

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

/** Appends "and only these actors"; nothing when the whole room is read. */
export type Only = (column: SQL) => SQL
/** One actor (`me`), a set (a team), or `undefined` for the whole room. */
export type Actors = string | readonly string[]
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
/** A terminated contract is no sale (ADR 0107): out of signed, collected and
 *  overdue. Only live readings move; a closed month reads its frozen copy. */
const KEPT = sql`NOT ${contractTerminated(sql`k.code`)}`
const contractVnd = toVndSql(sql`k.amount`, sql`k.currency`)
const installmentVnd = toVndSql(sql`i.amount`, sql`k.currency`)
/** "Won" has ONE reading in KPI: the deal has a live contract. Terminated sits
 *  in the win-rate denominator beside lost (ADR 0107 §3). */
const WON = dealWon(sql`k.code`)
const LOST = dealLost(sql`k.code`, sql`k.state`)
const TERMINATED = dealTerminated(sql`k.code`)
const CLOSED = sql`(${WON} OR ${LOST} OR ${TERMINATED})`
const seconds = (span: SQL, per: number): SQL =>
  sql`EXTRACT(EPOCH FROM ${span}) / ${sql.raw(String(per))}`

/** The `(value, tag)` tail of a basis row: a bare count, an amount, or a
 *  yes/no answer of a share. Casts, because a bare `$n` in a CASE has no type. */
const tally = (tag: string): SQL => sql`NULL::float8 AS value, ${tag}::text AS tag`
const worth = (value: SQL, tag: string): SQL => sql`${value} AS value, ${tag}::text AS tag`
const flag = (yes: SQL, on: string, off: string): SQL =>
  sql`CASE WHEN ${yes} THEN 1 ELSE 0 END::float8 AS value,
      CASE WHEN ${yes} THEN ${on}::text ELSE ${off}::text END AS tag`
/** A closed deal as a share row: won counts 1, lost and terminated 0. */
const OUTCOME = sql`CASE WHEN ${WON} THEN 1 ELSE 0 END::float8 AS value,
  CASE WHEN ${WON} THEN 'won' WHEN ${TERMINATED} THEN 'terminated' ELSE 'lost' END AS tag`

/** Overdue AS OF the span's `as_of` day (`spanned`): due on a Vietnam day
 *  strictly before it (`dueLevelOf`: due today is not overdue), and not paid by
 *  the end of it. An approved reason for THIS due date lifts the installment. */
const OVERDUE = sql`FROM sales.contract_installment i
  JOIN sales.contract k ON k.code = i.contract_code ${LIVE}
  WHERE ${KEPT} AND (i.due AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < (SELECT as_of FROM span)
    AND (i.paid_at IS NULL
         OR i.paid_at >= (((SELECT as_of FROM span) + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
    AND NOT EXISTS (
      SELECT 1 FROM sales.installment_overdue_reason r
       WHERE r.contract_code = i.contract_code AND r.installment_no = i.no
         AND r.state = 'approved' AND r.due = i.due)`

/** An installment has no code of its own; `contract/no` is its page's address. */
const INSTALLMENT = sql`'installment' AS kind, k.code || '/' || i.no AS code`

/** A meeting or debrief hangs off a lead (`LD-`), a deal (`OP-`) or, for a
 *  debrief, a contract; either way it is off when that lead is switched off. */
const subjectLive = (subject: SQL): SQL => sql`NOT EXISTS (
  SELECT 1 FROM sales.lead sl
   WHERE sl.disabled_at IS NOT NULL AND sl.code = COALESCE(
     (SELECT so.lead_code FROM sales.opportunity so WHERE so.code = ${subject}),
     (SELECT sk.lead_code FROM sales.contract sk WHERE sk.code = ${subject}), ${subject}))`

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
    WHERE ${KEPT} AND ${credit ? sql`${credit} IS NOT NULL AND ` : sql``}${within(sql`k.signed_at`)}${credit ? only(credit) : sql``}`

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
    basis: onLane('SALE', sql`k.closed_at`, OUTCOME, CLOSED),
    total: SHARE,
  },
  /* A comm closed as "unreached" talked to nobody (owner's call 15/10/2026);
     one closed "cancelled" was a meeting that never happened. */
  'debriefs-closed': {
    basis: (only) => sql`
      SELECT d.owner_id AS actor_id, ${DEBRIEF_SUBJECT} AS kind, d.subject_code AS code,
             d.closed_at AS at, ${tally('closed')}
      FROM comms.debrief d
      WHERE NOT d.unreached AND NOT d.cancelled AND ${subjectLive(sql`d.subject_code`)}
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
             ${OUTCOME}
      FROM sales.opportunity k ${LIVE}
      WHERE ${CLOSED} AND ${within(sql`k.closed_at`)}`,
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
      WHERE ${KEPT} AND ${within(sql`i.paid_at`)}`,
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

/** THE one answer to "does a closed month's change to this series become an
 *  adjustment" (ADR 0115 §3), read off the seat's own fold: a count or a sum
 *  splits record by record, a share or a median does not. The snapshot is out
 *  because its frozen figure is an as-of reading, not a sum of the month. */
export function additiveMeasure(seat: KpiSeat): 'count' | 'sum' | null {
  if (seat.def.snapshot) return null
  const { total } = metricSql(seat)
  return total === COUNT ? 'count' : total === SUM ? 'sum' : null
}

/** A seat's basis as its month's close froze it, in the live basis's shape.
 *  `value` stays numeric, so a sum folds exactly and is cast once after. */
export const frozenBasis =
  (period: string, seat: KpiSeat): Basis =>
  (only) => sql`
    SELECT fb.actor_id, fb.kind, fb.code, fb.at, fb.value, fb.tag
    FROM sales.kpi_month_basis fb
    WHERE fb.period = ${period} AND fb.series = ${seriesKey(seat)}${only(sql`fb.actor_id`)}`

/** The basis and total of a seat. A metric added to the catalog without a
 *  definition is a bug to hear about, not a figure to print as zero. */
export function metricSql(seat: KpiSeat): KpiMetricSql {
  const d = seat.def
  const found = BY_ROLE[seat.role]?.[d.key] ?? METRICS[d.scope][d.key]
  if (!found) throw new Error(`kpi: no ${d.scope} definition for ${d.key}`)
  return found
}

const idsOf = (actors?: Actors): readonly string[] | undefined =>
  typeof actors === 'string' ? (actors ? [actors] : undefined) : actors

/** `IN (...)` over bound parameters: drizzle cannot bind an array to `= ANY`. A
 *  single actor keeps the plain `=` it always had. */
export const onlyFor =
  (actors?: Actors): Only =>
  (column) => {
    const ids = idsOf(actors)
    if (!ids) return sql``
    if (ids.length === 1) return sql` AND ${column} = ${ids[0]}`
    if (ids.length === 0) return sql` AND false`
    return sql` AND ${column} IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})`
  }

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

/** Σ adjustment delta per `valueKey`: `applied` landed in the month, `sourced`
 *  came out of it (only a closed month has those). */
export type KpiAdjustmentSums = {
  applied: ReadonlyMap<string, number>
  sourced: ReadonlyMap<string, number>
}

/** What a caller already read, so `monthValues` need not read it again. */
export type KpiKnown = {
  closed?: boolean
  people?: readonly { id: string }[]
  adjustments?: KpiAdjustmentSums
}

/** `values` plus what adjustments landed in the month: a tally absent from
 *  `values` is a zero (`toReadings`' rule), so a delta alone is the figure. */
const plusApplied = (values: KpiValues, applied: ReadonlyMap<string, number>): KpiValues => {
  if (applied.size === 0) return values
  const sum = new Map(values)
  for (const [key, delta] of applied) sum.set(key, (sum.get(key) ?? 0) + delta)
  return sum
}

export type KpiPerson = Pick<typeof actor.$inferSelect, 'id' | 'name' | 'roleIds'>

/** Enabled and licensed for the branch. */
const salesPeople = and(isNull(actor.disabledAt), arrayContains(actor.branches, ['Sales']))

@Injectable()
export class KpiReadingsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The figures behind `defs` for one month, in one statement. An actor with
   *  no row is absent from the map — what absence means is the mapper's call.
   *  `frozen` folds the month's frozen basis instead of the books. */
  async values(
    seats: readonly KpiSeat[],
    span: PeriodSpan,
    actors?: Actors,
    { frozen = false, handle = this.db }: { frozen?: boolean; handle?: Db } = {},
  ): Promise<KpiValues> {
    const only = onlyFor(actors)
    const wanted = new Map(seats.map((s) => [seriesKey(s), s]))
    const parts = [...wanted.values()].map((s) => {
      const { basis: live, total } = metricSql(s)
      const basis = frozen ? frozenBasis(span.key, s) : live
      const fold =
        s.def.scope === 'own'
          ? sql`SELECT b.actor_id, ${total} AS value FROM (${basis(only)}) b GROUP BY 1`
          : sql`SELECT NULL AS actor_id, ${total} AS value FROM (${basis(only)}) b`
      return sql`SELECT ${seriesOf(s)}::text AS series, ${s.def.scope}::text AS scope,
                        q.actor_id::text AS actor_id, q.value::float8 AS value
                 FROM (${fold}) q`
    })
    if (parts.length === 0) return new Map()

    const r = (await handle.execute(spanned(span, sql.join(parts, sql` UNION ALL `)))) as {
      rows: { series: string; scope: KpiScope; actor_id: string | null; value: number | null }[]
    }

    return new Map(
      r.rows.map((row) => [address(row.series, row.scope, row.actor_id ?? ''), row.value]),
    )
  }

  /** What a close freezes, inside its transaction: the basis it has just
   *  stored, folded, plus what adjustments landed in the month while it ran —
   *  so the frozen card is exactly what its frozen list adds up to. */
  async closingValues(tx: Db, seats: readonly KpiSeat[], span: PeriodSpan): Promise<KpiValues> {
    const values = await this.values(seats, span, undefined, { frozen: true, handle: tx })
    return plusApplied(values, (await this.adjustments(seats, span.key, undefined, tx)).applied)
  }

  /** Σ adjustments landed in or sourced from `period`, per `valueKey`. A room
   *  series' rows carry no actor, so they pass any actor filter. */
  async adjustments(
    seats: readonly KpiSeat[],
    period: string,
    actors?: Actors,
    handle: Db = this.db,
  ): Promise<KpiAdjustmentSums> {
    const series = [...new Set(seats.map(seriesKey))]
    if (series.length === 0) return { applied: new Map(), sourced: new Map() }
    const r = (await handle.execute(sql`
      SELECT a.series, a.actor_id,
             COALESCE(sum(a.delta) FILTER (WHERE a.applied_period = ${period}), 0)::float8 AS applied,
             COALESCE(sum(a.delta) FILTER (WHERE a.source_period = ${period}), 0)::float8 AS sourced,
             count(*) FILTER (WHERE a.applied_period = ${period})::int AS applied_n,
             count(*) FILTER (WHERE a.source_period = ${period})::int AS sourced_n
      FROM sales.kpi_adjustment a
      WHERE (a.applied_period = ${period} OR a.source_period = ${period})
        AND a.series IN (${sql.join(
          series.map((s) => sql`${s}`),
          sql`, `,
        )})
        AND (a.actor_id IS NULL OR (true${onlyFor(actors)(sql`a.actor_id`)}))
      GROUP BY 1, 2`)) as {
      rows: {
        series: string
        actor_id: string | null
        applied: number
        sourced: number
        applied_n: number
        sourced_n: number
      }[]
    }
    const applied = new Map<string, number>()
    const sourced = new Map<string, number>()
    for (const row of r.rows) {
      const key = `${row.series}|${row.actor_id ?? ''}`
      if (row.applied_n > 0) applied.set(key, row.applied)
      if (row.sourced_n > 0) sourced.set(key, row.sourced)
    }
    return { applied, sourced }
  }

  /** Whether `period`'s close froze its basis — even an empty one. A month
   *  closed before 0136 did not, and its lists keep reading the books
   *  (ADR 0115, default 1). */
  async basisFrozen(period: string): Promise<boolean> {
    const [row] = await this.db
      .select({ frozen: kpiMonthClose.basisFrozen })
      .from(kpiMonthClose)
      .where(eq(kpiMonthClose.period, period))
    return row?.frozen === true
  }

  /** The month-to-date figure of one cumulative seat at each Vietnam-day end in
   *  `ends` (the weekly chart), plus the adjustments landed in the month by then,
   *  as the card adds them. An end with no row is absent. `frozen` reads the
   *  month's frozen basis, as a closed month's list does. */
  async cumulativeAt(
    seat: KpiSeat,
    span: PeriodSpan,
    ends: readonly string[],
    actors?: Actors,
    frozen = false,
  ): Promise<ReadonlyMap<string, number | null>> {
    if (!isCumulative(seat.def)) throw new Error(`kpi: ${seat.def.key} has no running total`)
    if (ends.length === 0) return new Map()
    const metric = metricSql(seat)
    const basis = frozen ? frozenBasis(span.key, seat) : metric.basis
    const only = onlyFor(actors)
    const body = cumulativeByEnd({ basis, total: metric.total }, only, ends)
    type Rows = { rows: { day: string; value: number | null }[] }
    const [r, adjusted] = (await Promise.all([
      this.db.execute(spanned(span, body)),
      this.db.execute(adjustedByEnd(span.key, seriesKey(seat), only, ends)),
    ])) as [Rows, Rows]
    const totals = new Map(r.rows.map((row) => [row.day, row.value]))
    for (const row of adjusted.rows)
      totals.set(row.day, (totals.get(row.day) ?? 0) + (row.value ?? 0))
    return totals
  }

  /** `values`, except that a closed month answers from its frozen copy, which
   *  is why every reader of a month's cards uses this one. A seat with no
   *  stored row reads null (no-data), never the zero a live tally defaults to.
   *  A month still open adds the adjustments that landed in it (ADR 0115 §4). */
  async monthValues(
    seats: readonly KpiSeat[],
    span: PeriodSpan,
    actors?: Actors,
    known: KpiKnown = {},
  ): Promise<KpiValues> {
    if (seats.length === 0) return new Map()
    const closed =
      known.closed ??
      (
        await this.db
          .select({ period: kpiMonthClose.period })
          .from(kpiMonthClose)
          .where(eq(kpiMonthClose.period, span.key))
      ).length > 0
    if (!closed) {
      const [values, sums] = await Promise.all([
        this.values(seats, span, actors),
        known.adjustments ?? this.adjustments(seats, span.key, actors),
      ])
      return plusApplied(values, sums.applied)
    }

    const ids = idsOf(actors)
    const rows = await this.db
      .select()
      .from(kpiMonthValue)
      .where(
        and(
          eq(kpiMonthValue.period, span.key),
          ids
            ? or(inArray(kpiMonthValue.actorId, [...ids]), isNull(kpiMonthValue.actorId))
            : undefined,
        ),
      )
    /* Explicit nulls first: the mapper reads an absent key as a live zero. A
       list gets them only for those still on the roster, as the whole room did. */
    const roster = async () => (known.people ?? (await this.people())).map((p) => p.id)
    const actorIds =
      typeof actors === 'string' && actors
        ? [actors]
        : seats.some((s) => s.def.scope !== 'room')
          ? (await roster()).filter((id) => !ids || ids.includes(id))
          : []
    const values = new Map<string, number | null>(
      seats.flatMap((seat) =>
        (seat.def.scope === 'room' ? [''] : actorIds).map((id): [string, null] => [
          valueKey(seat, id),
          null,
        ]),
      ),
    )
    const bySeat = new Map(seats.map((s) => [`${s.role}|${s.def.key}`, s]))
    for (const r of rows) {
      const seat = bySeat.get(`${r.role}|${r.metricKey}`)
      if (seat)
        values.set(valueKey(seat, r.actorId ?? ''), r.value === null ? null : Number(r.value))
    }
    return values
  }

  /** Everyone a Sales scorecard can belong to: enabled and licensed for the branch. */
  people(): Promise<KpiPerson[]> {
    return this.db
      .select({ id: actor.id, name: actor.name, roleIds: actor.roleIds })
      .from(actor)
      .where(salesPeople)
      .orderBy(asc(actor.name))
  }

  /** One of `people()`, by id. */
  async person(id: string): Promise<KpiPerson | undefined> {
    const [row] = await this.db
      .select({ id: actor.id, name: actor.name, roleIds: actor.roleIds })
      .from(actor)
      .where(and(eq(actor.id, id), salesPeople))
    return row
  }
}
