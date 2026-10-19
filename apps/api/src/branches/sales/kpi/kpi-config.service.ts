import { Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiAlertSettingResponse,
  KpiEffectiveCatalogResponse,
  KpiRoleMetricsResponse,
  RoleId,
  type ConfigProposalReceipt,
  type KpiAlertPatch,
  type KpiRoleMetricsPatch,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { SettingService } from '@api/platform/setting/setting.service'
import { SalesConfigService } from '../config/config.service'
import { KpiConfigRepository } from './kpi-config.repository'
import { catalogOf, resolvedMetrics, type KpiCatalog } from './kpi-config.overlay'

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

  /** The catalog every KPI reader groups by. Pass `tx` inside a write. */
  async effectiveCatalog(handle?: Db): Promise<KpiCatalog> {
    const { catalog, faults } = catalogOf(await this.repo.overrides(handle))
    for (const fault of faults) this.log.error(`KPI metric config: ${fault}`)
    return catalog
  }

  async catalog(): Promise<KpiEffectiveCatalogResponse> {
    return KpiEffectiveCatalogResponse.parse({ roles: await this.effectiveCatalog() })
  }

  async metrics(): Promise<KpiRoleMetricsResponse> {
    const all = resolvedMetrics(await this.repo.overrides())
    return KpiRoleMetricsResponse.parse({
      roles: RoleId.options.map((role) => ({ role, metrics: all[role] })),
    })
  }

  /** The contract already holds "every catalog metric, one enabled primary". */
  proposeMetrics(who: Actor, body: KpiRoleMetricsPatch): Promise<ConfigProposalReceipt> {
    return this.config.propose(who, { kind: 'kpi-metrics', value: body })
  }

  /** The pace tolerance as the ratio `verdictOf` takes. Read once per request. */
  async tolerance(): Promise<number> {
    return (await this.settings.value('kpi.pace.tolerance-percent')).value / 100
  }

  /** `isDefault` = no key has a row; otherwise the latest of the writes. */
  async alert(): Promise<KpiAlertSettingResponse> {
    const { rows } = await this.settings.list()
    const slip = rows.find((r) => r.key === 'kpi.alert.slip-percent')
    const hit = rows.find((r) => r.key === 'kpi.alert.hit-percent')
    const tolerance = rows.find((r) => r.key === 'kpi.pace.tolerance-percent')
    const written = [slip, hit, tolerance].filter((r) => r && !r.isDefault)
    const last = written.sort((a, b) => (b?.updatedAt ?? '').localeCompare(a?.updatedAt ?? ''))[0]
    const names = await this.repo.names(last?.updatedBy ? [last.updatedBy] : [])
    const by = last?.updatedBy
    return KpiAlertSettingResponse.parse({
      slipPercent: slip?.value,
      hitPercent: hit?.value,
      tolerancePercent: tolerance?.value,
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
