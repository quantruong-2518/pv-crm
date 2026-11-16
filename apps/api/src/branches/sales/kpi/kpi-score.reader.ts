import { Injectable, Inject } from '@nestjs/common'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { isTieredPeriod, type KpiMonthScore, type KpiPeriodKey, type RoleId } from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import { DB, type Db } from '@api/platform/db/db.module'
import { targetSources } from './kpi-allocation.mapper'
import { KpiAllocationRepository } from './kpi-allocation.repository'
import { KpiAssignmentTargets } from './kpi-assignment-targets'
import { KpiCloseRepository } from './kpi-close.repository'
import { kpiMonthValue } from './kpi-close.schema'
import { KpiConfigService } from './kpi-config.service'
import { monthScoreOf, type ScoreInput } from './kpi-score'
import { basisDefs, settingsOfBasis } from './kpi-score-basis'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { agreedIn } from './kpi.mapper'

/** Month scores read from the frozen close only (ADR 0158 §3, ADR 0115).
 *
 *  Actuals are `kpi_month_value`, the card's figure frozen at close (earlier
 *  months' adjustments landed in it). The catalog and bands are the close's
 *  `score_basis`; a month closed before it reads its own month's catalog and set. The close
 *  keeps no target: it is read from the agreed rows the closed card reads, which
 *  nothing may write once the month is over (`stillOpen`). A month with no close
 *  answers an empty map. */
@Injectable()
export class KpiScoreReader {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly closes: KpiCloseRepository,
    private readonly config: KpiConfigService,
    private readonly readings: KpiReadingsRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly allocations: KpiAllocationRepository,
    private readonly assigned: KpiAssignmentTargets,
  ) {}

  async monthScores(
    period: KpiPeriodKey,
    actorIds: readonly string[],
    handle: Db = this.db,
  ): Promise<Map<string, KpiMonthScore>> {
    const out = new Map<string, KpiMonthScore>()
    if (actorIds.length === 0 || (await this.closes.of(period, handle)) === null) return out

    const [basis, current, bands, people, frozen] = await Promise.all([
      this.closes.scoreBasisOf(period, handle),
      this.config.effectiveCatalog(period, handle),
      this.config.scoreSettings(),
      this.readings.people(),
      handle
        .select()
        .from(kpiMonthValue)
        .where(
          and(
            eq(kpiMonthValue.period, period),
            or(inArray(kpiMonthValue.actorId, [...actorIds]), isNull(kpiMonthValue.actorId)),
          ),
        ),
    ])
    const settings = basis ? settingsOfBasis(basis) : bands
    const defsOf = (role: RoleId) => (basis ? basisDefs(basis, period, role) : current[role])
    const tiered = isTieredPeriod(period) ? await this.assigned.sources(period, actorIds) : null
    const sources =
      tiered ??
      targetSources(
        await this.targets.ofPeriod(period, handle),
        await this.allocations.agreedLines(period, actorIds),
      )
    /* A room seat's row has no actor: it is the role's company-wide figure. */
    const actual = new Map(
      frozen.map((r) => [`${r.actorId ?? ''}|${r.role}|${r.metricKey}`, r.value]),
    )

    for (const person of people.filter((p) => actorIds.includes(p.id))) {
      const slots = sources.slotsFor(person.id)
      /* A person holding two roles is scored on the first role that has a judged line. */
      for (const role of person.roleIds.map(toContractRole)) {
        const inputs = defsOf(role).map((def): ScoreInput => {
          const agreed = agreedIn(slots, role, def.key)
          const seat = def.scope === 'room' ? '' : person.id
          const value = actual.get(`${seat}|${role}|${def.key}`)
          return {
            key: def.key,
            actual: value === undefined || value === null ? null : Number(value),
            target: agreed ? Number(agreed.value) : null,
            lowerIsBetter: !def.higherIsBetter,
            primary: def.primary,
            weight: def.weight,
          }
        })
        const score = monthScoreOf(period, inputs, settings)
        if (score) {
          out.set(person.id, score)
          break
        }
      }
    }
    return out
  }
}
