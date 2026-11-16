import { Module } from '@nestjs/common'
import { AuditModule } from '@api/platform/audit/audit.module'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { SettingModule } from '@api/platform/setting/setting.module'
import { SalesConfigModule } from '../config/config.module'
import { ContractModule } from '../contract/contract.module'
import { KpiAbsenceController } from './kpi-absence.controller'
import { KpiAbsenceService } from './kpi-absence.service'
import { KpiAlertRepository } from './kpi-alert.repository'
import { KpiAlertService } from './kpi-alert.service'
import { KpiAlertSweeper } from './kpi-alert.sweeper'
import { KpiAllocationCounterService } from './kpi-allocation-counter.service'
import { KpiAllocationController } from './kpi-allocation.controller'
import { KpiAllocationRepository } from './kpi-allocation.repository'
import { KpiAllocationService } from './kpi-allocation.service'
import { KpiAssignmentBells } from './kpi-assignment-bells'
import { KpiAssignmentController } from './kpi-assignment.controller'
import { KpiAssignmentReader } from './kpi-assignment-read.service'
import { KpiAssignmentRepository } from './kpi-assignment.repository'
import { KpiAssignmentService } from './kpi-assignment.service'
import { KpiAssignmentSweeper } from './kpi-assignment-sweep'
import { KpiAssignmentSuggester } from './kpi-assignment-suggest'
import { KpiAssignmentTargets } from './kpi-assignment-targets'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiCloseGateService } from './kpi-close-gate.service'
import { KpiCloseService } from './kpi-close.service'
import { KpiConfigController } from './kpi-config.controller'
import { KpiConfigRepository } from './kpi-config.repository'
import { KpiConfigService } from './kpi-config.service'
import { KpiCompanyDeskService } from './kpi-company-desk.service'
import { KpiContributionsController } from './kpi-contributions.controller'
import { KpiContributionsRepository } from './kpi-contributions.repository'
import { KpiContributionsService } from './kpi-contributions.service'
import { KpiController } from './kpi.controller'
import { KpiDeskController } from './kpi-desk.controller'
import { KpiDeskRepository } from './kpi-desk.repository'
import { KpiDeskService } from './kpi-desk.service'
import { KpiForecastController } from './kpi-forecast.controller'
import { KpiForecastService } from './kpi-forecast.service'
import { KpiForecastCommitController } from './kpi-forecast-commit.controller'
import { KpiForecastCommitRepository } from './kpi-forecast-commit.repository'
import { KpiForecastCommitService } from './kpi-forecast-commit.service'
import { KpiHistoryController } from './kpi-history.controller'
import { KpiHistoryService } from './kpi-history.service'
import { KpiQuarterController } from './kpi-quarter.controller'
import { KpiOneOnOneController } from './kpi-one-on-one.controller'
import { KpiOneOnOneRepository } from './kpi-one-on-one.repository'
import { KpiOneOnOneService } from './kpi-one-on-one.service'
import { KpiPlanController } from './kpi-plan.controller'
import { KpiPlanRepository } from './kpi-plan.repository'
import { KpiPlanService } from './kpi-plan.service'
import { KpiQuarterService } from './kpi-quarter.service'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { KpiReconcileRepository } from './kpi-reconcile.repository'
import { KpiReconcileService } from './kpi-reconcile.service'
import { KpiScoreController } from './kpi-score.controller'
import { KpiScoreReader } from './kpi-score.reader'
import { KpiSeatModule } from './kpi-seat.module'
import { KpiBudgetService } from './kpi-board-budget.service'
import { KpiBoardController } from './kpi-board.controller'
import { KpiBoardRepository } from './kpi-board.repository'
import { KpiBoardService } from './kpi-board.service'
import { KpiService } from './kpi.service'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { KpiTeamController } from './kpi-team.controller'
import { KpiTeamService } from './kpi-team.service'
import { KpiTeamViewController } from './kpi-team-view.controller'
import { KpiTeamViewService } from './kpi-team-view.service'
import { KpiYearController } from './kpi-year.controller'

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
 *  the overdue reasons the close gate lists (ADR 0116). `KpiSeatModule` for the
 *  seat rule (ADR 0117). The tiered sets (ADR 0120) are the `KpiAssignment*`
 *  providers; their sweeper rides the worker's tick. `exports` names the reconcile pass (ADR 0115):
 *  callable from an application context (acceptance runs call it). */
@Module({
  imports: [
    AuditModule,
    EnginesModule,
    SettingModule,
    SalesConfigModule,
    NotificationModule,
    ContractModule,
    KpiSeatModule,
  ],
  controllers: [
    KpiController,
    KpiQuarterController,
    KpiYearController,
    KpiForecastCommitController,
    KpiPlanController,
    KpiScoreController,
    KpiOneOnOneController,
    KpiDeskController,
    KpiAllocationController,
    KpiForecastController,
    KpiConfigController,
    KpiHistoryController,
    KpiContributionsController,
    KpiTeamController,
    KpiTeamViewController,
    KpiAbsenceController,
    KpiAssignmentController,
    KpiBoardController,
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
    KpiQuarterService,
    KpiConfigService,
    KpiConfigRepository,
    KpiHistoryService,
    KpiAlertService,
    KpiAlertRepository,
    KpiAlertSweeper,
    KpiContributionsService,
    KpiContributionsRepository,
    KpiTeamService,
    KpiTeamViewService,
    KpiReconcileRepository,
    KpiReconcileService,
    KpiAbsenceService,
    KpiAssignmentRepository,
    KpiAssignmentReader,
    KpiAssignmentService,
    KpiAssignmentTargets,
    KpiAssignmentBells,
    KpiAssignmentSweeper,
    KpiForecastCommitService,
    KpiForecastCommitRepository,
    KpiScoreReader,
    KpiPlanService,
    KpiPlanRepository,
    KpiAssignmentSuggester,
    KpiOneOnOneService,
    KpiOneOnOneRepository,
    KpiDeskService,
    KpiCompanyDeskService,
    KpiDeskRepository,
    KpiBoardService,
    KpiBoardRepository,
    KpiBudgetService,
  ],
  exports: [KpiReconcileService],
})
export class KpiModule {}
