import { Module } from '@nestjs/common'
import { AuditModule } from '@api/platform/audit/audit.module'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { SettingModule } from '@api/platform/setting/setting.module'
import { SalesConfigModule } from '../config/config.module'
import { ContractModule } from '../contract/contract.module'
import { KpiAlertRepository } from './kpi-alert.repository'
import { KpiAlertService } from './kpi-alert.service'
import { KpiAlertSweeper } from './kpi-alert.sweeper'
import { KpiAllocationCounterService } from './kpi-allocation-counter.service'
import { KpiAllocationController } from './kpi-allocation.controller'
import { KpiAllocationRepository } from './kpi-allocation.repository'
import { KpiAllocationService } from './kpi-allocation.service'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiCloseGateService } from './kpi-close-gate.service'
import { KpiCloseService } from './kpi-close.service'
import { KpiConfigController } from './kpi-config.controller'
import { KpiConfigRepository } from './kpi-config.repository'
import { KpiConfigService } from './kpi-config.service'
import { KpiContributionsController } from './kpi-contributions.controller'
import { KpiContributionsRepository } from './kpi-contributions.repository'
import { KpiContributionsService } from './kpi-contributions.service'
import { KpiController } from './kpi.controller'
import { KpiForecastController } from './kpi-forecast.controller'
import { KpiForecastService } from './kpi-forecast.service'
import { KpiHistoryController } from './kpi-history.controller'
import { KpiHistoryService } from './kpi-history.service'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { KpiReconcileRepository } from './kpi-reconcile.repository'
import { KpiReconcileService } from './kpi-reconcile.service'
import { KpiService } from './kpi.service'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { KpiTeamController } from './kpi-team.controller'
import { KpiTeamRepository } from './kpi-team.repository'
import { KpiTeamService } from './kpi-team.service'
import { KpiTeamViewController } from './kpi-team-view.controller'
import { KpiTeamViewService } from './kpi-team-view.service'

/** KPI by role — scorecards computed on read, the agreed targets, and their
 *  per-person split (ADR 0098), in two tiers through team rosters (ADR 0101).
 *
 *  A repository per thing known: the books' fact tables (read only), the role
 *  targets, and the allocation packages with their lines and counters. The
 *  forecast owns no table: it reads through the first three.
 *
 *  `AuditModule` for every write. `EnginesModule` for permission questions
 *  (`kpi.view-all`, who approves overdue reasons). `SettingModule` for the
 *  forecast thresholds. `SalesConfigModule` for the config gate (ADR 0099 §2).
 *  `NotificationModule` for the bell (ADR 0093, 0099 §4). `ContractModule` for
 *  the overdue reasons the close gate lists (ADR 0116). `exports` names the
 *  reconcile pass (ADR 0115): callable from an application context (acceptance
 *  runs call it). */
@Module({
  imports: [
    AuditModule,
    EnginesModule,
    SettingModule,
    SalesConfigModule,
    NotificationModule,
    ContractModule,
  ],
  controllers: [
    KpiController,
    KpiAllocationController,
    KpiForecastController,
    KpiConfigController,
    KpiHistoryController,
    KpiContributionsController,
    KpiTeamController,
    KpiTeamViewController,
  ],
  providers: [
    KpiService,
    KpiReadingsRepository,
    KpiCloseRepository,
    KpiCloseService,
    KpiCloseGateService,
    KpiTargetsRepository,
    KpiAllocationRepository,
    KpiAllocationService,
    KpiAllocationCounterService,
    KpiForecastService,
    KpiConfigService,
    KpiConfigRepository,
    KpiHistoryService,
    KpiAlertService,
    KpiAlertRepository,
    KpiAlertSweeper,
    KpiContributionsService,
    KpiContributionsRepository,
    KpiTeamRepository,
    KpiTeamService,
    KpiTeamViewService,
    KpiReconcileRepository,
    KpiReconcileService,
  ],
  exports: [KpiReconcileService],
})
export class KpiModule {}
