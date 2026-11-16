import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql, type SQL } from 'drizzle-orm'
import { KPI_CATALOG_V2, type KpiFunnelStep, type KpiMetricKey, type RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import type { PeriodSpan } from '../performance/performance-period'
import { toVndSql } from '../money'
import { realExchanges } from '../performance/real-exchange'
import { kpiMarketingBudget } from './kpi-config.schema'
import { installmentVnd, KEPT, LIVE, within } from './kpi-metric-parts.sql'
import { frozenBasis, metricSql, onlyFor, spanned, type KpiSeat } from './kpi-readings.repository'

/** SQL behind the display-only board reads (ADR 0160 §9). Nothing here is scored.
 *
 *  A step that has a card metric folds that metric's own basis (`metricSql`), so
 *  the funnel cannot disagree with the card beside it. Steps with no card read
 *  their own events in the month, one distinct object each. */

const seatOf = (role: RoleId, key: KpiMetricKey): KpiSeat => ({
  role,
  def: KPI_CATALOG_V2[role].find((d) => d.key === key)!,
})

const basisCount = (role: RoleId, key: KpiMetricKey, actorId: string): SQL =>
  sql`SELECT count(*) FROM (${metricSql(seatOf(role, key)).basis(onlyFor(actorId))}) b`

/** Per lead, the first touch that put it at `tier`, fenced to the month. */
const firstAtTier = (tier: string): SQL => sql`(SELECT t.subject_code, min(t.at) AS at
  FROM sales.touch t WHERE t.subject_kind = 'lead' AND t.to_tier = ${tier} GROUP BY 1)`

const tieredLeads = (tier: string, owner: SQL, actorId: string): SQL => sql`
  SELECT count(*) FROM ${firstAtTier(tier)} m
  JOIN sales.lead l ON l.code = m.subject_code AND l.disabled_at IS NULL
  WHERE ${owner} = ${actorId} AND ${within(sql`m.at`)}`

/** Deals on the person's PRESALES lane that took one of `kinds` of touch in the month. */
const presalesTouched = (kinds: readonly string[], actorId: string): SQL => sql`
  SELECT count(DISTINCT k.code) FROM sales.opportunity_owner w
  JOIN sales.opportunity k ON k.code = w.opportunity_code ${LIVE}
  WHERE w.role = 'PRESALES' AND w.actor_id = ${actorId}
    AND EXISTS (SELECT 1 FROM sales.touch t
                 WHERE t.subject_kind = 'opportunity' AND t.subject_code = k.code
                   AND t.kind IN (${sql.join(
                     kinds.map((k) => sql`${k}`),
                     sql`, `,
                   )})
                   AND ${within(sql`t.at`)})`

const STEPS: Partial<Record<RoleId, (actorId: string) => Partial<Record<KpiFunnelStep, SQL>>>> = {
  marketing: (a) => ({
    lead: basisCount('marketing', 'leads-sourced', a),
    mql: basisCount('marketing', 'mql-reached', a),
    sql: tieredLeads('sql', sql`l.marketing_owner_id`, a),
    opportunity: sql`SELECT count(*) FROM sales.opportunity k
      JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL
      WHERE l.marketing_owner_id = ${a} AND ${within(sql`k.created_at`)}`,
  }),
  bd: (a) => ({
    'lead-received': sql`SELECT count(DISTINCT t.subject_code) FROM sales.touch t
      JOIN sales.lead l ON l.code = t.subject_code AND l.disabled_at IS NULL
      WHERE t.subject_kind = 'lead' AND t.kind IN ('handed-over', 'created')
        AND t.to_actor_id = ${a} AND ${within(sql`t.at`)}`,
    contacted: sql`SELECT count(*) FROM sales.lead l
      WHERE l.disabled_at IS NULL AND l.bd_owner_id = ${a}
        AND EXISTS (SELECT 1 FROM (${realExchanges(sql`l.code`)}) x
                     WHERE x.actor_id = ${a} AND ${within(sql`x.at`)})`,
    sql: tieredLeads('sql', sql`l.bd_owner_id`, a),
    opportunity: basisCount('bd', 'opportunities-opened', a),
    accepted: sql`SELECT count(DISTINCT k.code) FROM sales.opportunity_owner w
      JOIN sales.opportunity k ON k.code = w.opportunity_code ${LIVE}
      WHERE w.role = 'BD' AND w.actor_id = ${a} AND ${within(sql`k.accepted_at`)}`,
  }),
  presales: (a) => ({
    met: presalesTouched(['first-meeting', 'site-visited'], a),
    solution: presalesTouched(['demo-held', 'solution-sent'], a),
    quotation: presalesTouched(['quotation-sent'], a),
    signed: basisCount('presales', 'presales-signed-value', a),
  }),
}

export type SourceRow = {
  sourceCode: string
  name: string
  leads: number
  mql: number
  spent: number
}
export type CollectionRow = {
  contractCode: string
  customerName: string
  value: number
  collected: number
  overdue: number
}
export type SignedRow = { day: string; contractCode: string; amount: number }
export type ForecastLine = { value: number; expectedClose: string | null }
export type BudgetRow = { amount: number; setBy: string; setByName: string; setAt: Date }

@Injectable()
export class KpiBoardRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Each step's count of the role's funnel, by step; a role with none reads `{}`. */
  async funnel(
    role: RoleId,
    span: PeriodSpan,
    actorId: string,
  ): Promise<Map<KpiFunnelStep, number>> {
    const steps = Object.entries(STEPS[role]?.(actorId) ?? {}) as [KpiFunnelStep, SQL][]
    if (steps.length === 0) return new Map()
    const columns = steps.map(([step, q]) => sql`(${q})::int AS ${sql.identifier(step)}`)
    const r = (await this.db.execute(spanned(span, sql`SELECT ${sql.join(columns, sql`, `)}`))) as {
      rows: Record<string, number>[]
    }
    return new Map(steps.map(([step]) => [step, r.rows[0]?.[step] ?? 0]))
  }

  /** The SOURCE rows a person owns, with the month's leads, MQLs and spend. */
  async sources(span: PeriodSpan, actorId: string): Promise<SourceRow[]> {
    const codes = (key: KpiMetricKey) =>
      sql`(SELECT b.code FROM (${metricSql(seatOf('marketing', key)).basis(onlyFor(actorId))}) b)`
    const spentOn = sql`(c.spent_on::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT e.id AS "sourceCode", e.name,
                   (SELECT count(*)::int FROM sales.lead x
                     WHERE x.campaign_id = e.id AND x.code IN ${codes('leads-sourced')}) AS leads,
                   (SELECT count(*)::int FROM sales.lead x
                     WHERE x.campaign_id = e.id AND x.code IN ${codes('mql-reached')}) AS mql,
                   COALESCE((SELECT sum(c.amount) FROM sales.source_cost c
                              WHERE c.source_id = e.id AND ${within(spentOn)}), 0)::float8 AS spent
            FROM sales.config_entry e
            WHERE e.list = 'SOURCE' AND e.owner_id = ${actorId}
            ORDER BY e.name, e.id`,
      ),
    )) as { rows: SourceRow[] }
    return r.rows
  }

  /** Spend of the SOURCE rows owned by `owners`, by `spent_on` in the month. */
  async spentBy(span: PeriodSpan, owners: readonly string[]): Promise<number> {
    if (owners.length === 0) return 0
    const spentOn = sql`(c.spent_on::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT COALESCE(sum(c.amount), 0)::float8 AS spent
            FROM sales.source_cost c
            JOIN sales.config_entry e ON e.id = c.source_id AND e.list = 'SOURCE'
            WHERE ${within(spentOn)}${onlyFor(owners)(sql`e.owner_id`)}`,
      ),
    )) as { rows: { spent: number }[] }
    return r.rows[0]?.spent ?? 0
  }

  /** Leads that reached the BD in the month, split by who brought them (Marketing's, else the
   *  BD's own), with those that reached `sql` and the deals they became in the month. */
  async origins(span: PeriodSpan, actorId: string) {
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT x.origin, count(*)::int AS leads,
                   (count(*) FILTER (WHERE x.reached))::int AS sql, sum(x.deals)::int AS opportunities
            FROM (
              SELECT CASE WHEN l.marketing_owner_id IS NULL THEN 'self-sourced' ELSE 'marketing' END AS origin,
                     EXISTS (SELECT 1 FROM sales.touch t
                              WHERE t.subject_kind = 'lead' AND t.subject_code = l.code
                                AND t.to_tier = 'sql' AND ${within(sql`t.at`)}) AS reached,
                     (SELECT count(*) FROM sales.opportunity k
                       WHERE k.lead_code = l.code AND ${within(sql`k.created_at`)}) AS deals
                FROM sales.lead l
               WHERE l.disabled_at IS NULL AND l.bd_owner_id = ${actorId}
                 AND EXISTS (SELECT 1 FROM sales.touch h
                              WHERE h.subject_kind = 'lead' AND h.subject_code = l.code
                                AND h.kind IN ('handed-over', 'created') AND h.to_actor_id = ${actorId}
                                AND ${within(sql`h.at`)})
            ) x GROUP BY x.origin`,
      ),
    )) as {
      rows: {
        origin: 'marketing' | 'self-sourced'
        leads: number
        sql: number
        opportunities: number
      }[]
    }
    return r.rows
  }

  /** Value of the deals the person opened in the month, in dong. */
  async createdValue(span: PeriodSpan, actorId: string): Promise<number> {
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT COALESCE(sum(${toVndSql(sql`k.amount::numeric`, sql`k.currency`)}), 0)::float8 AS value
            FROM sales.opportunity k
            WHERE k.amount IS NOT NULL AND k.code IN
              (SELECT b.code FROM (${metricSql(seatOf('bd', 'opportunities-opened')).basis(onlyFor(actorId))}) b)`,
      ),
    )) as { rows: { value: number }[] }
    return r.rows[0]?.value ?? 0
  }

  /** Contracts the person made the solution for that have an installment due in the month,
   *  each with all its installments split by state at `as_of`. */
  async collection(span: PeriodSpan, actorId: string): Promise<CollectionRow[]> {
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT k.code AS "contractCode", COALESCE(l.company, k.code) AS "customerName",
                   COALESCE(sum(${installmentVnd}), 0)::float8 AS value,
                   COALESCE(sum(${installmentVnd}) FILTER (WHERE i.paid_at IS NOT NULL), 0)::float8 AS collected,
                   COALESCE(sum(${installmentVnd}) FILTER (WHERE i.paid_at IS NULL
                     AND (i.due AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < (SELECT as_of FROM span)), 0)::float8 AS overdue
            FROM sales.contract k ${LIVE}
            JOIN sales.contract_participant p
              ON p.contract_code = k.code AND p.role = 'PRESALES' AND p.actor_id = ${actorId}
            JOIN sales.contract_installment i ON i.contract_code = k.code
            WHERE ${KEPT}
              AND EXISTS (SELECT 1 FROM sales.contract_installment d
                           WHERE d.contract_code = k.code AND ${within(sql`d.due`)})
            GROUP BY k.code, l.company
            ORDER BY k.code`,
      ),
    )) as { rows: CollectionRow[] }
    return r.rows
  }

  /** The signed-value rows of the person by Vietnam day, ADR 0155 credit included. */
  async signedRows(
    seat: KpiSeat,
    span: PeriodSpan,
    actorId: string,
    frozen: boolean,
  ): Promise<SignedRow[]> {
    const basis = frozen ? frozenBasis(span.key, seat) : metricSql(seat).basis
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT to_char(b.at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
                   b.code AS "contractCode", COALESCE(b.value, 0)::float8 AS amount
            FROM (${basis(onlyFor(actorId))}) b ORDER BY b.at, b.code`,
      ),
    )) as { rows: SignedRow[] }
    return r.rows
  }

  /** The lines of the person's newest weekly commit of the month, with the deal's expected close. */
  async forecastLines(period: string, actorId: string): Promise<ForecastLine[]> {
    const r = (await this.db.execute(sql`
      SELECT li.value::float8 AS value, to_char(k.expected_close, 'YYYY-MM-DD') AS "expectedClose"
      FROM sales.kpi_forecast_commit c
      JOIN sales.kpi_forecast_commit_line li ON li.commit_id = c.id
      JOIN sales.opportunity k ON k.code = li.opportunity_code
      WHERE c.id = (SELECT c2.id FROM sales.kpi_forecast_commit c2
                     WHERE c2.actor_id = ${actorId} AND c2.period = ${period}
                     ORDER BY c2.week_start DESC LIMIT 1)`)) as { rows: ForecastLine[] }
    return r.rows
  }

  async budgetOf(unitId: string, period: string, handle: Db = this.db): Promise<BudgetRow | null> {
    const [row] = await handle
      .select({
        amount: kpiMarketingBudget.amount,
        setBy: kpiMarketingBudget.setBy,
        setByName: actor.name,
        setAt: kpiMarketingBudget.setAt,
      })
      .from(kpiMarketingBudget)
      .innerJoin(actor, eq(actor.id, kpiMarketingBudget.setBy))
      .where(and(eq(kpiMarketingBudget.unitId, unitId), eq(kpiMarketingBudget.period, period)))
    return row ?? null
  }

  async saveBudget(
    tx: Db,
    unitId: string,
    period: string,
    amount: number,
    by: string,
  ): Promise<void> {
    await tx
      .insert(kpiMarketingBudget)
      .values({ unitId, period, amount, setBy: by })
      .onConflictDoUpdate({
        target: [kpiMarketingBudget.unitId, kpiMarketingBudget.period],
        set: { amount, setBy: by, setAt: sql`now()` },
      })
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }
}
