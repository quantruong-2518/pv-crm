import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { kpiAbsence } from './kpi-absence.schema'
import { kpiForecastCommit, kpiUnitCommit } from './kpi-forecast-commit.schema'
import { kpiOneOnOne } from './kpi-one-on-one.schema'

/** SQL of the KPI desk reads (ADR 0159). Decides nothing: which tab, which unit and who
 *  may see it are the services'. Only what no other KPI repository answers lives here. */

export type AbsenceOn = { standInId: string; until: string }

@Injectable()
export class KpiDeskRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The handle the `kpi-accuracy.ts` functions take. */
  get handle(): Db {
    return this.db
  }

  /** Who is away on `day`, with the stand-in and the last away day: the absence
   *  repository's `awayOn` keeps no end date, and the tab prints it. */
  async absencesOn(day: string): Promise<Map<string, AbsenceOn>> {
    const rows = await this.db
      .select({
        actorId: kpiAbsence.actorId,
        standInId: kpiAbsence.standInId,
        until: kpiAbsence.toDay,
      })
      .from(kpiAbsence)
      .where(
        and(
          isNull(kpiAbsence.cancelledAt),
          lte(kpiAbsence.fromDay, day),
          gte(kpiAbsence.toDay, day),
        ),
      )
    return new Map(rows.map((r) => [r.actorId, { standInId: r.standInId, until: r.until }]))
  }

  /** The units among `unitIds` that committed a number for `week`. */
  async unitsCommitted(week: string, unitIds: readonly string[]): Promise<Set<string>> {
    if (unitIds.length === 0) return new Set()
    const rows = await this.db
      .select({ unitId: kpiUnitCommit.unitId })
      .from(kpiUnitCommit)
      .where(and(eq(kpiUnitCommit.weekStart, week), inArray(kpiUnitCommit.unitId, [...unitIds])))
    return new Set(rows.map((r) => r.unitId))
  }

  /** Per person, whether their 1:1 of `period` is acknowledged; absent = none written. */
  async oneOnOnesOf(
    period: string,
    actorIds: readonly string[],
  ): Promise<Map<string, { acknowledged: boolean }>> {
    if (actorIds.length === 0) return new Map()
    const rows = await this.db
      .select({ actorId: kpiOneOnOne.actorId, at: kpiOneOnOne.acknowledgedAt })
      .from(kpiOneOnOne)
      .where(and(eq(kpiOneOnOne.period, period), inArray(kpiOneOnOne.actorId, [...actorIds])))
    return new Map(rows.map((r) => [r.actorId, { acknowledged: r.at !== null }]))
  }

  /** The Mondays of `period` on which anyone, person or unit, committed a number. */
  async committedWeeks(period: string): Promise<string[]> {
    const [people, units] = await Promise.all([
      this.db
        .selectDistinct({ week: kpiForecastCommit.weekStart })
        .from(kpiForecastCommit)
        .where(eq(kpiForecastCommit.period, period)),
      this.db
        .selectDistinct({ week: kpiUnitCommit.weekStart })
        .from(kpiUnitCommit)
        .where(eq(kpiUnitCommit.period, period)),
    ])
    return [...new Set([...people, ...units].map((r) => r.week))].sort()
  }
}
