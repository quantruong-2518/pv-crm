import { sql, type SQL } from 'drizzle-orm'
import type { KpiMetricKey } from '@pv/contracts'
import {
  CLOSED,
  contractVnd,
  COUNT,
  INSTALLMENT,
  installmentVnd,
  KEPT,
  LIVE,
  MEDIAN,
  onLane,
  OUTCOME,
  seconds,
  SHARE,
  sourced,
  SUM,
  tally,
  within,
  worth,
  type KpiMetricSql,
  type Only,
} from './kpi-metric-parts.sql'

/** The metrics only the v2 catalog carries (ADR 0160 §3). They run for months
 *  from `KPI_V2_FROM` only because no earlier catalog names them.
 *
 *  Two rates fold two kinds of row in one basis, told apart by `tag`, so the
 *  list still shows exactly what was counted. Presales money reads the signing
 *  snapshot and never `contract_credit`: full value per person, so a unit total
 *  of it is not the sum of its members (one contract, two Presales). */

const VN = (at: SQL): SQL => sql`(${at} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`

/** Per lead, the first touch that put it at `mql` or above, whatever its kind
 *  (`created` and import carry `to_tier` too), so down-and-up counts once and a
 *  lead jumping straight to `sql` counts as reaching MQL. */
const mqlRows = (only: Only): SQL => sql`
  SELECT l.marketing_owner_id AS actor_id, 'lead' AS kind, l.code, m.at, ${tally('mql')}
  FROM (SELECT t.subject_code, min(t.at) AS at FROM sales.touch t
         WHERE t.subject_kind = 'lead' AND t.to_tier IN ('mql', 'sql') GROUP BY 1) m
  JOIN sales.lead l ON l.code = m.subject_code AND l.disabled_at IS NULL
  WHERE l.marketing_owner_id IS NOT NULL
    AND ${within(sql`m.at`)}${only(sql`l.marketing_owner_id`)}`

/** Spend of the SOURCE rows a person owns, one row per cost line on its Vietnam
 *  day; a switched-off source keeps the money it spent (`SourceRepository`). */
const spendRows = (only: Only): SQL => sql`
  SELECT e.owner_id AS actor_id, 'source' AS kind, e.id AS code,
         (c.spent_on::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AS at,
         ${worth(sql`c.amount::float8`, 'spent')}
  FROM sales.source_cost c
  JOIN sales.config_entry e ON e.id = c.source_id AND e.list = 'SOURCE'
  WHERE e.owner_id IS NOT NULL
    AND ${within(sql`(c.spent_on::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`)}${only(sql`e.owner_id`)}`

const PRESALES_ON = sql`JOIN sales.contract_participant p
  ON p.contract_code = k.code AND p.role = 'PRESALES'`

const countOf = (tag: string): SQL => sql`count(*) FILTER (WHERE b.tag = ${tag})`

/** Due in the month up to `as_of`; on time = paid on or before its due Vietnam day. */
const ON_TIME = sql`i.paid_at IS NOT NULL AND ${VN(sql`i.paid_at`)} <= ${VN(sql`i.due`)}`

/** First touch of one kind on a deal. */
const firstTouch = (kind: string): SQL => sql`(SELECT min(t.at) FROM sales.touch t
  WHERE t.subject_kind = 'opportunity' AND t.subject_code = k.code AND t.kind = ${kind})`

export const OWN_V2: Partial<Record<KpiMetricKey, KpiMetricSql>> = {
  'mql-reached': { basis: mqlRows, total: COUNT },
  'lead-to-mql-rate': {
    basis: (only) => sql`${mqlRows(only)} UNION ALL ${sourced(tally('sourced'))(only)}`,
    total: sql`${countOf('mql')}::float8 / NULLIF(${countOf('sourced')}, 0)`,
  },
  /* No MQL, no reading; MQLs with nothing spent cost 0. */
  'cost-per-mql': {
    basis: (only) => sql`${spendRows(only)} UNION ALL ${mqlRows(only)}`,
    total: sql`COALESCE(SUM(b.value) FILTER (WHERE b.tag = 'spent'), 0)::float8
      / NULLIF(${countOf('mql')}, 0)`,
  },
  'presales-signed-value': {
    basis: (only) => sql`
      SELECT p.actor_id, 'contract' AS kind, k.code, k.signed_at AS at,
             ${worth(contractVnd, 'signed')}
      FROM sales.contract k ${LIVE} ${PRESALES_ON}
      WHERE ${KEPT} AND ${within(sql`k.signed_at`)}${only(sql`p.actor_id`)}`,
    total: SUM,
  },
  'on-time-collection-rate': {
    basis: (only) => sql`
      SELECT p.actor_id, ${INSTALLMENT}, i.due AS at, ${installmentVnd} AS value,
             CASE WHEN ${ON_TIME} THEN 'on-time' WHEN i.paid_at IS NOT NULL THEN 'late'
                  ELSE 'unpaid' END::text AS tag
      FROM sales.contract_installment i
      JOIN sales.contract k ON k.code = i.contract_code ${LIVE} ${PRESALES_ON}
      WHERE ${KEPT} AND ${within(sql`i.due`)}
        AND ${VN(sql`i.due`)} <= (SELECT as_of FROM span)${only(sql`p.actor_id`)}`,
    total: sql`COALESCE(SUM(b.value) FILTER (WHERE b.tag = 'on-time'), 0)::float8
      / NULLIF(SUM(b.value), 0)`,
  },
  /* A deal whose first site visit is not on or before its first solution is
     left out, not counted from somewhere else. */
  'solution-days': {
    basis: (only) => sql`
      SELECT DISTINCT w.actor_id, 'opportunity' AS kind, k.code, s.sent AS at,
             ${worth(seconds(sql`(s.sent - s.visited)`, 86400), 'solution-sent')}
      FROM sales.opportunity_owner w
      JOIN sales.opportunity k ON k.code = w.opportunity_code ${LIVE}
      CROSS JOIN LATERAL (SELECT ${firstTouch('solution-sent')} AS sent,
                                 ${firstTouch('site-visited')} AS visited) s
      WHERE w.role = 'PRESALES' AND s.visited <= s.sent
        AND ${within(sql`s.sent`)}${only(sql`w.actor_id`)}`,
    total: MEDIAN,
  },
}

/** Presales' win rate reads its own lane, under its own series key. */
export const PRESALES_V2: Partial<Record<KpiMetricKey, KpiMetricSql>> = {
  'win-rate': { basis: onLane('PRESALES', sql`k.closed_at`, OUTCOME, CLOSED), total: SHARE },
}
