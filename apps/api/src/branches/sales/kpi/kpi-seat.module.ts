import { Module } from '@nestjs/common'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { KpiAbsenceRepository } from './kpi-absence.repository'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'

/** The seat rule (ADR 0117) on its own, so a module `KpiModule` imports —
 *  `ContractModule`, for the overdue-reason pool — can read it without a cycle.
 *  It must never import `ContractModule` or `KpiModule`.
 *
 *  The two repositories are exported as well: `KpiModule`'s services read them
 *  directly, and one provider per class keeps a single instance of each. */
@Module({
  imports: [NotificationModule],
  providers: [KpiSeatService, KpiAbsenceRepository, KpiTeamRepository],
  exports: [KpiSeatService, KpiAbsenceRepository, KpiTeamRepository],
})
export class KpiSeatModule {}
