import type { Type } from '@nestjs/common'
import type { ModuleRef } from '@nestjs/core'
import {
  GetPerformanceInput,
  IndustryReportQuery,
  salesPeriodOf,
  vnDayOf,
  type SalesPeriodKey,
} from '@pv/contracts'
import type { Actor, Permission } from '@pv/engines'
import {
  defineTool,
  door,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { invalid } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { IndustryReportController } from '../industry-report/industry-report.controller'
import { IndustryReportService } from '../industry-report/industry-report.service'
import { PerformanceMoneyService } from '../performance/performance-money.service'
import { PerformanceController } from '../performance/performance.controller'
import { PerformanceService } from '../performance/performance.service'
import { exitsRead, figuresRead, industriesRead, moneyRead } from './get-performance-shape'

/** `get_performance`: the overview's room-wide figures of one period (ADR 0155).
 *
 *  One tool, four doors, and `part` picks exactly one: a call checks that door's need
 *  alone, and a stored answer replays under the same permission (`reveals` reads the
 *  input). Each service is the one its controller calls, with the same argument, so the
 *  door's own refusals hold: money refuses an own-only asker whole.
 *  The industry report reads only the running month, quarter or year, so a week or an
 *  `at` is bad input there. The leaderboard and the money entries are never called. */

/** Each door's need, spelled once for `reveals` (a replay has no gate to ask). */
const NEED = {
  figures: 'performance.view',
  exits: 'performance.view',
  money: 'contract.view',
  industries: 'campaign.view',
} as const satisfies Record<GetPerformanceInput['part'], Permission>

type Services = {
  performance: () => Pick<PerformanceService, 'read' | 'exits'>
  money: () => Pick<PerformanceMoneyService, 'read'>
  industries: () => Pick<IndustryReportService, 'read'>
}

/** Fetched by class at call time, as the KPI services are: no module imports needed. */
export const performanceServices = (modules: ModuleRef): Services => {
  const lazy =
    <T>(token: Type<T>) =>
    () =>
      modules.get(token, { strict: false })
  return {
    performance: lazy(PerformanceService),
    money: lazy(PerformanceMoneyService),
    industries: lazy(IndustryReportService),
  }
}

async function run(services: Services, who: Actor, input: GetPerformanceInput): Promise<ToolRead> {
  if (input.part === 'industries') {
    if (input.grain === 'week' || input.at !== undefined) {
      throw invalid({ grain: ['Báo cáo ngành chỉ đọc tháng, quý hoặc năm đang chạy.'] })
    }
    const q = zod(IndustryReportQuery).transform({ period: input.grain })
    return industriesRead(await services.industries().read(q.period))
  }
  const period: SalesPeriodKey = input.at ?? salesPeriodOf(input.grain, vnDayOf(new Date()))
  if (input.part === 'figures') return figuresRead(await services.performance().read(period))
  if (input.part === 'exits') return exitsRead(await services.performance().exits(period))
  return moneyRead(await services.money().read(who, period))
}

export const getPerformance = (services: Services): AssistantTool =>
  defineTool({
    name: 'get_performance',
    description:
      'The room-wide figures of one period, as the overview screen shows them. part figures: leads, first contacts, opportunities, contracts, signed amount and won, lost and terminated deals, with the period before and per slice; exits: why leads and deals left and why contracts ended; money: money collected, expected and overdue, and penalties; industries: leads, deals and won per industry for the running month, quarter or year. grain is week, month, quarter or year; at is a period of that grain and absent means the current one; industries takes no at and no week.',
    input: GetPerformanceInput,
    doors: {
      figures: door(PerformanceController, 'read'),
      exits: door(PerformanceController, 'exits'),
      money: door(PerformanceController, 'moneyRead'),
      industries: door(IndustryReportController, 'read'),
    },
    doorFor: (input) => input.part,
    reveals: (input) => NEED[input.part],
    /* Money is refused to an own-only asker, so a stored money answer is a wide reader's. */
    scopeCut: (input) => input.part === 'money',
    run: (who, input) => run(services, who, input),
  })
