import { sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type {
  SalesMoneyEntry,
  SalesMoneyFigureKind,
  SalesMoneyFigures,
  SalesPenaltyFigure,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { VN_TODAY_START } from '../contract/contract.repository'
import { toVndSql } from '../money'
import { contractTerminated } from '../open-deal'
import { collectedMoves } from './collected-moves'
import type { PeriodSpan } from './performance-period'

/** The overview's money: what came in, what fell due unpaid, and penalties.
 *
 *  Each figure is a set of ROWS (`moves`) and the bucket figure is their sum,
 *  so the entries behind a figure are the rows it counted, never a second query
 *  that could disagree. Bucket edges are Vietnam days, `performance.repository.ts`'s
 *  fence. Collected is KPI's own reading (`collectedMoves`); the rest skip a
 *  switched-off lead the same way. Private `pm_` aliases nest under `s`. */

type Fence = (at: SQL) => SQL
const vnInstant = (day: string): SQL =>
  sql`((${day}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
const vnDay = (at: SQL): SQL => sql`((${at} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text`

const LIVE = sql`JOIN sales.contract pm_k ON pm_k.code = pm_x.contract_code
  JOIN sales.lead pm_l ON pm_l.code = pm_k.lead_code AND pm_l.disabled_at IS NULL`

/** Rows of `(contract_code, kind, installment_no, label, at, vnd, pending,
 *  signed_at)`. Due-unpaid keeps an installment with an approved overdue
 *  reason (unlike KPI): this is money not in, whatever the excuse. */
const moves = (kind: SalesMoneyFigureKind, fence: Fence): SQL => {
  if (kind === 'collected') {
    return sql`SELECT c.contract_code,
                      CASE WHEN c.installment_no IS NULL THEN 'refund' ELSE 'installment-paid' END AS kind,
                      c.installment_no, c.label, c.at, c.vnd, false AS pending, c.signed_at
                 FROM (${collectedMoves(fence)}) c`
  }
  if (kind === 'due-unpaid') {
    return sql`SELECT pm_k.code AS contract_code, 'due-unpaid' AS kind, pm_x.no AS installment_no,
                      pm_x.label, pm_x.due AS at, ${toVndSql(sql`pm_x.amount`, sql`pm_k.currency`)} AS vnd,
                      false AS pending, pm_k.signed_at
                 FROM sales.contract_installment pm_x ${LIVE}
                WHERE pm_x.paid_at IS NULL AND pm_x.due < ${VN_TODAY_START}
                  AND NOT ${contractTerminated(sql`pm_k.code`)} AND ${fence(sql`pm_x.due`)}`
  }
  const direction = kind === 'penalty-in' ? 'customer-pays' : 'company-pays'
  return sql`SELECT pm_k.code AS contract_code, ${kind}::text AS kind, NULL::int AS installment_no,
                    NULL::text AS label, pm_x.terminated_at AS at,
                    ${toVndSql(sql`pm_x.penalty_amount`, sql`pm_k.currency`)} AS vnd,
                    pm_x.penalty_settled_on IS NULL AS pending, pm_k.signed_at
               FROM sales.contract_termination pm_x ${LIVE}
              WHERE pm_x.penalty_direction = ${direction} AND ${fence(sql`pm_x.terminated_at`)}`
}

const inBucket: Fence = (at) => sql`${at} >= s."lo" AND ${at} < s."hi"`

/** A penalty figure's four columns, prefixed so two sit in one row. */
const penaltyCols = (p: string): SQL =>
  sql.raw(`COALESCE(SUM(m.vnd), 0)::bigint AS ${p}_vnd, count(*)::int AS ${p}_count,
    count(*) FILTER (WHERE m.pending)::int AS ${p}_pending,
    count(*) FILTER (WHERE m.signed_at < f.first)::int AS ${p}_earlier`)

/** What the SQL counts; `actualVnd` is derived from these in the service. */
export type MovedFigures = Omit<SalesMoneyFigures, 'actualVnd'>

type Row = Record<string, number | string> & { key: string }
const penaltyOf = (r: Row, p: string): SalesPenaltyFigure => ({
  amountVnd: Number(r[`${p}_vnd`]),
  count: Number(r[`${p}_count`]),
  pending: Number(r[`${p}_pending`]),
  fromEarlier: Number(r[`${p}_earlier`]),
})

@Injectable()
export class PerformanceMoneyRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Figures by bucket key, every bucket back, empty ones as zeros. `period`
   *  is the whole span, the edge `fromEarlier` is cut on. */
  async figures(period: PeriodSpan, buckets: PeriodSpan[]): Promise<Map<string, MovedFigures>> {
    const values = sql.join(
      buckets.map((b) => sql`(${b.key}::text, ${vnInstant(b.from)}, ${vnInstant(b.to)})`),
      sql`, `,
    )
    const r = (await this.db.execute(sql`
      WITH span("key", "lo", "hi") AS (VALUES ${values}),
           f AS (SELECT ${vnInstant(period.from)} AS first)
      SELECT s."key", c.*, u.*, pi.*, po.*
        FROM span s
        CROSS JOIN f
        LEFT JOIN LATERAL (SELECT COALESCE(SUM(m.vnd), 0)::bigint AS collected_vnd
                             FROM (${moves('collected', inBucket)}) m) c ON true
        LEFT JOIN LATERAL (SELECT COALESCE(SUM(m.vnd), 0)::bigint AS due_unpaid_vnd
                             FROM (${moves('due-unpaid', inBucket)}) m) u ON true
        LEFT JOIN LATERAL (SELECT ${penaltyCols('pin')}
                             FROM (${moves('penalty-in', inBucket)}) m) pi ON true
        LEFT JOIN LATERAL (SELECT ${penaltyCols('pout')}
                             FROM (${moves('penalty-out', inBucket)}) m) po ON true
    `)) as { rows: Row[] }

    /* `bigint` is a string from node-postgres and a number from PGlite. */
    return new Map(
      r.rows.map((row) => [
        row.key,
        {
          collectedVnd: Number(row.collected_vnd),
          dueUnpaidVnd: Number(row.due_unpaid_vnd),
          penaltyIn: penaltyOf(row, 'pin'),
          penaltyOut: penaltyOf(row, 'pout'),
        },
      ]),
    )
  }

  /** The rows behind one bucket's figure, the same `moves` it summed. A row
   *  with no convertible amount reads 0, which is what the SUM gave it. */
  async entries(
    period: PeriodSpan,
    bucket: PeriodSpan,
    kind: SalesMoneyFigureKind,
  ): Promise<SalesMoneyEntry[]> {
    const fence: Fence = (at) =>
      sql`${at} >= ${vnInstant(bucket.from)} AND ${at} < ${vnInstant(bucket.to)}`
    const r = (await this.db.execute(sql`
      SELECT m.contract_code, m.kind, m.installment_no,
             CASE WHEN m.installment_no IS NULL THEN NULL ELSE (
               SELECT count(*)::int FROM sales.contract_installment pm_n
                WHERE pm_n.contract_code = m.contract_code) END AS installment_count,
             m.label, ${vnDay(sql`m.at`)} AS day, COALESCE(m.vnd, 0)::bigint AS vnd,
             m.pending, ${vnDay(sql`m.signed_at`)} AS signed_on,
             m.signed_at < ${vnInstant(period.from)} AS from_earlier
        FROM (${moves(kind, fence)}) m
       ORDER BY day, m.contract_code, m.installment_no
    `)) as { rows: EntryRow[] }
    return r.rows.map((e) => ({
      contractCode: e.contract_code,
      kind: e.kind,
      installmentNo: e.installment_no,
      installmentCount: e.installment_count,
      label: e.label,
      day: e.day,
      amountVnd: Number(e.vnd),
      pending: e.pending,
      signedOn: e.signed_on,
      fromEarlier: e.from_earlier,
    }))
  }
}

type EntryRow = {
  contract_code: string
  kind: SalesMoneyEntry['kind']
  installment_no: number | null
  installment_count: number | null
  label: string | null
  day: string
  vnd: number | string
  pending: boolean
  signed_on: string
  from_earlier: boolean
}
