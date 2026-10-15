import { Module } from '@nestjs/common'
import { AuditModule } from '@api/platform/audit/audit.module'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { KpiController } from './kpi.controller'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { KpiService } from './kpi.service'
import { KpiTargetsRepository } from './kpi-targets.repository'

/** KPI by role — scorecards computed on read, plus the agreed targets.
 *
 *  Two repositories because they know different things: one reads the books'
 *  fact tables and writes nothing, the other owns the module's two tables.
 *
 *  `AuditModule` for the two target writes, `NotificationModule` for the
 *  bell each of them rings (ADR 0093). No `EnginesModule`: the doors ask
 *  E2 nothing beyond `@Need`, and the verdict is a pure function beside the
 *  service. `exports` is empty: no module asks this one. */
@Module({
  imports: [AuditModule, NotificationModule],
  controllers: [KpiController],
  providers: [KpiService, KpiReadingsRepository, KpiTargetsRepository],
})
export class KpiModule {}
