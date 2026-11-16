import { Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiAlertSettingResponse,
  KpiEffectiveCatalogResponse,
  KpiRoleMetricsResponse,
  RoleId,
  type ConfigProposalReceipt,
  type KpiAlertPatch,
  type KpiFunnelStep,
  type KpiPeriodKey,
  type KpiRoleMetricsPatch,
} from '@pv/contracts'
import type { SettingKey } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { invalid } from '@api/platform/http/problem'
import { SettingService } from '@api/platform/setting/setting.service'
import { SalesConfigService } from '../config/config.service'
import { KpiConfigRepository } from './kpi-config.repository'
import {
  assertFromAhead,
  assertMeasurable,
  datedOf,
  type KpiConfigChange,
} from './kpi-config.approval'
import type { ScoreSettings } from './kpi-score'
import { catalogOf, resolvedMetrics, setFromOf, type KpiCatalog } from './kpi-config.overlay'
import { vietnamToday } from './kpi-rules'

/** KPI configuration (ADR 0099 §1–3): the metric overlay per role and the
 *  slip/hit pair. Reads answer directly; writes are proposals through the
 *  sales config gate, applied by `applyKpiConfig` when the director approves.
 *
 *  `effectiveCatalog` is read fresh on every call — no cache: the worker is a
 *  second process (`SettingService`'s reason), and the table is a few rows. */
@Injectable()
export class KpiConfigService {
  private readonly log = new Logger('sales.kpi')

  constructor(
    private readonly repo: KpiConfigRepository,
    private readonly settings: SettingService,
    private readonly config: SalesConfigService,
  ) {}

  /** The catalog every KPI reader of month `period` groups by: that month's
   *  code catalog and its own set (ADR 0160 §1–2). Pass `tx` inside a write. */
  async effectiveCatalog(period: KpiPeriodKey, handle?: Db): Promise<KpiCatalog> {
    const { catalog, faults } = catalogOf(period, await this.repo.overrides(handle))
    for (const fault of faults) this.log.error(`KPI metric config ${period}: ${fault}`)
    return catalog
  }

  async catalog(period = vietnamToday().slice(0, 7)): Promise<KpiEffectiveCatalogResponse> {
    return KpiEffectiveCatalogResponse.parse({ roles: await this.effectiveCatalog(period) })
  }

  async metrics(period = vietnamToday().slice(0, 7)): Promise<KpiRoleMetricsResponse> {
    const [rows, funnel] = await Promise.all([this.repo.overrides(), this.repo.funnel()])
    const all = resolvedMetrics(period, rows)
    return KpiRoleMetricsResponse.parse({
      period,
      roles: RoleId.options.map((role) => {
        const fromPeriod = setFromOf(period, role, rows)
        const steps = funnel.filter((f) => f.role === role && f.fromPeriod === fromPeriod)
        return {
          role,
          fromPeriod,
          metrics: all[role],
          funnel: steps.map((f) => ({ step: f.stepKey, targetBp: f.ratioBp })),
        }
      }),
    })
  }

  /** Funnel step targets of `role`'s set in force for `period`, as a share 0..1
   *  of the step before; a step with no target is absent (ADR 0160 §7). */
  async funnelTargets(
    period: KpiPeriodKey,
    role: RoleId,
  ): Promise<ReadonlyMap<KpiFunnelStep, number>> {
    const [rows, funnel] = await Promise.all([this.repo.overrides(), this.repo.funnel()])
    const from = setFromOf(period, role, rows)
    return new Map(
      funnel
        .filter((f) => f.role === role && f.fromPeriod === from)
        .map((f) => [f.stepKey, f.ratioBp / 10_000]),
    )
  }

  /** The contract already holds "every catalog metric, one enabled primary";
   *  the request is dated and weighed here so the approver reads both.
   *  `wasOn` is read here so the approver's sentence names only what flips. */
  async proposeMetrics(who: Actor, body: KpiRoleMetricsPatch): Promise<ConfigProposalReceipt> {
    const value = datedOf(body)
    if (Array.isArray(value)) throw invalid({ metrics: value })
    assertFromAhead(value.from)
    assertMeasurable(value)
    const now = resolvedMetrics(value.from, await this.repo.overrides())[value.role]
    const wasOn = now.filter((m) => m.enabled).map((m) => m.metricKey)
    const change: KpiConfigChange = { kind: 'kpi-metrics', value, wasOn }
    return this.config.propose(who, change)
  }

  /** The pace tolerance as the ratio `verdictOf` takes. Read once per request. */
  async tolerance(): Promise<number> {
    return (await this.settings.value('kpi.pace.tolerance-percent')).value / 100
  }

  /** The three grade bands, in the shape the calculator takes. */
  async scoreSettings(): Promise<ScoreSettings> {
    const read = async (key: SettingKey) => (await this.settings.value(key)).value
    const [gradeA, gradeB, gradeC] = await Promise.all([
      read('kpi.score.grade-a'),
      read('kpi.score.grade-b'),
      read('kpi.score.grade-c'),
    ])
    return { gradeA, gradeB, gradeC }
  }

  /** `isDefault` = no key has a row; otherwise the latest of the writes. */
  async alert(): Promise<KpiAlertSettingResponse> {
    const { rows } = await this.settings.list()
    const slip = rows.find((r) => r.key === 'kpi.alert.slip-percent')
    const hit = rows.find((r) => r.key === 'kpi.alert.hit-percent')
    const tolerance = rows.find((r) => r.key === 'kpi.pace.tolerance-percent')
    const [gradeA, gradeB, gradeC] = ['a', 'b', 'c'].map((g) =>
      rows.find((r) => r.key === `kpi.score.grade-${g}`),
    )
    const written = [slip, hit, tolerance, gradeA, gradeB, gradeC].filter((r) => r && !r.isDefault)
    const last = written.sort((a, b) => (b?.updatedAt ?? '').localeCompare(a?.updatedAt ?? ''))[0]
    const names = await this.repo.names(last?.updatedBy ? [last.updatedBy] : [])
    const by = last?.updatedBy
    return KpiAlertSettingResponse.parse({
      slipPercent: slip?.value,
      hitPercent: hit?.value,
      tolerancePercent: tolerance?.value,
      gradeA: gradeA?.value,
      gradeB: gradeB?.value,
      gradeC: gradeC?.value,
      isDefault: !last,
      updatedBy: by ? { actorId: by, name: names.get(by) ?? by } : null,
      updatedAt: last?.updatedAt ?? null,
    })
  }

  /** The contract already holds each bound and slip < hit. */
  proposeAlert(who: Actor, body: KpiAlertPatch): Promise<ConfigProposalReceipt> {
    return this.config.propose(who, { kind: 'kpi-alert', value: body })
  }
}
