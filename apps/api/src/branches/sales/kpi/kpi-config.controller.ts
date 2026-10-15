import { Body, Controller, Get, HttpCode, Patch, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiAlertPatch, KpiRoleMetricsPatch } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiConfigService } from './kpi-config.service'

/** KPI configuration doors (ADR 0099 §1–3).
 *
 *  The two config pairs sit under `/sales/config` on the permissions every
 *  other config door uses: read `config.view`, write `config.propose`, and a
 *  write answers 202 with a receipt — the change lands only when the director
 *  approves it (`config.approval.ts`). Static paths, so Fastify prefers them
 *  over `SalesConfigController`'s `:list`.
 *
 *  The effective catalog is on `kpi.view`, not `config.view`: every role reads
 *  its own card grouped by it, and `presales` and `account-executive` hold no
 *  config right. */
@Controller('sales')
export class KpiConfigController {
  constructor(private readonly config: KpiConfigService) {}

  @Get('kpi/catalog')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  catalog() {
    return this.config.catalog()
  }

  @Get('config/kpi-metrics')
  @Need({ branch: 'Sales', permission: 'config.view' })
  metrics() {
    return this.config.metrics()
  }

  /** `PUT`: the body replaces the role's whole overlay. */
  @Put('config/kpi-metrics')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  proposeMetrics(
    @CurrentActor() who: Actor,
    @Body(zod(KpiRoleMetricsPatch)) body: KpiRoleMetricsPatch,
  ) {
    return this.config.proposeMetrics(who, body)
  }

  @Get('config/kpi-alert')
  @Need({ branch: 'Sales', permission: 'config.view' })
  alert() {
    return this.config.alert()
  }

  /** Both thresholds in one body, so slip < hit is judged on the pair. */
  @Patch('config/kpi-alert')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  proposeAlert(@CurrentActor() who: Actor, @Body(zod(KpiAlertPatch)) body: KpiAlertPatch) {
    return this.config.proposeAlert(who, body)
  }
}
