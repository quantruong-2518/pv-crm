import { and, eq, inArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { toVndSql } from '../money'
import { kpiMonthClose } from './kpi-close.schema'
import { dealOpen } from '../open-deal'
import {
  kpiForecastCommit,
  kpiForecastCommitLine,
  kpiUnitCommit,
} from './kpi-forecast-commit.schema'

/** SQL of the weekly commits (ADR 0158). Decides nothing: the week, who may
 *  commit and what a refusal says are the service's.
 *
 *  Writers take `tx` from outside, so a commit and its audit line are one transaction. */

export type CandidateRow = {
  code: string
  name: string
  customer: string
  value: number
  expectedClose: string | null
}
export type PersonCommit = {
  actorId: string
  amount: number
  savedAt: Date
  codes: string[]
}
export type UnitCommit = { amount: number; byName: string; at: Date }

@Injectable()
export class KpiForecastCommitRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** A closed month takes no commit, even when the date check were bent by a pinned clock. */
  async isClosed(period: string, handle: Db = this.db): Promise<boolean> {
    const [row] = await handle
      .select({ period: kpiMonthClose.period })
      .from(kpiMonthClose)
      .where(eq(kpiMonthClose.period, period))
    return row !== undefined
  }

  /** Open deals whose primary SALE owner is `actorId`, the pipeline's own ownership and
   *  live-lead join, without its date window or probability: "sure to sign" is the
   *  person's word. A deal with no amount carries no value to commit, so it is left out. */
  async candidates(actorId: string, handle: Db = this.db): Promise<CandidateRow[]> {
    const vnd = toVndSql(sql`k.amount::numeric`, sql`k.currency`)
    const r = (await handle.execute(sql`
      SELECT k.code::text AS code, k.name::text AS name, COALESCE(a.name, k.name)::text AS customer,
             round(${vnd})::float8 AS value, k.expected_close::text AS expected_close
        FROM sales.opportunity k
        JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL
        LEFT JOIN sales.account a ON a.code = k.account_code
       WHERE ${dealOpen(sql`k.code`, sql`k.state`)} AND ${vnd} IS NOT NULL
         AND EXISTS (SELECT 1 FROM sales.opportunity_owner w
                      WHERE w.opportunity_code = k.code AND w.role = 'SALE' AND w.is_primary
                        AND w.actor_id = ${actorId})
       ORDER BY k.expected_close ASC NULLS LAST, k.code ASC`)) as {
      rows: {
        code: string
        name: string
        customer: string
        value: number
        expected_close: string | null
      }[]
    }
    return r.rows.map((x) => ({
      code: x.code,
      name: x.name,
      customer: x.customer,
      value: Math.round(Number(x.value)),
      expectedClose: x.expected_close,
    }))
  }

  /** Each person's commit for `week`, with its lines, for whoever of `actorIds` saved one. */
  async commitsOf(
    week: string,
    actorIds: readonly string[],
    handle: Db = this.db,
  ): Promise<Map<string, PersonCommit>> {
    if (actorIds.length === 0) return new Map()
    const rows = await handle
      .select()
      .from(kpiForecastCommit)
      .where(
        and(
          eq(kpiForecastCommit.weekStart, week),
          inArray(kpiForecastCommit.actorId, [...actorIds]),
        ),
      )
    const lines =
      rows.length === 0
        ? []
        : await handle
            .select()
            .from(kpiForecastCommitLine)
            .where(
              inArray(
                kpiForecastCommitLine.commitId,
                rows.map((x) => x.id),
              ),
            )
    return new Map(
      rows.map((x) => [
        x.actorId,
        {
          actorId: x.actorId,
          amount: x.amount,
          savedAt: x.savedAt,
          codes: lines
            .filter((l) => l.commitId === x.id)
            .map((l) => l.opportunityCode)
            .sort(),
        },
      ]),
    )
  }

  /** Upsert the commit row, then replace its lines whole, so a later save cannot leave
   *  a deal behind that the person has since dropped. */
  async replaceCommit(
    tx: Db,
    input: {
      period: string
      week: string
      actorId: string
      lines: readonly { code: string; value: number }[]
    },
  ): Promise<void> {
    const amount = input.lines.reduce((s, l) => s + l.value, 0)
    const [row] = await tx
      .insert(kpiForecastCommit)
      .values({ period: input.period, weekStart: input.week, actorId: input.actorId, amount })
      .onConflictDoUpdate({
        target: [kpiForecastCommit.actorId, kpiForecastCommit.weekStart],
        set: { amount, savedAt: sql`now()` },
      })
      .returning({ id: kpiForecastCommit.id })
    if (!row) throw new Error('kpi: forecast commit upsert returned no row')
    await tx.delete(kpiForecastCommitLine).where(eq(kpiForecastCommitLine.commitId, row.id))
    if (input.lines.length > 0)
      await tx
        .insert(kpiForecastCommitLine)
        .values(
          input.lines.map((l) => ({ commitId: row.id, opportunityCode: l.code, value: l.value })),
        )
  }

  async unitCommit(unitId: string, week: string, handle: Db = this.db): Promise<UnitCommit | null> {
    const [row] = await handle
      .select({ amount: kpiUnitCommit.amount, byName: actor.name, at: kpiUnitCommit.committedAt })
      .from(kpiUnitCommit)
      .innerJoin(actor, eq(actor.id, kpiUnitCommit.committedBy))
      .where(and(eq(kpiUnitCommit.unitId, unitId), eq(kpiUnitCommit.weekStart, week)))
    return row ?? null
  }

  async upsertUnitCommit(
    tx: Db,
    input: { period: string; week: string; unitId: string; amount: number; by: string },
  ): Promise<void> {
    await tx
      .insert(kpiUnitCommit)
      .values({
        period: input.period,
        weekStart: input.week,
        unitId: input.unitId,
        amount: input.amount,
        committedBy: input.by,
      })
      .onConflictDoUpdate({
        target: [kpiUnitCommit.unitId, kpiUnitCommit.weekStart],
        set: { amount: input.amount, committedBy: input.by, committedAt: sql`now()` },
      })
  }
}
