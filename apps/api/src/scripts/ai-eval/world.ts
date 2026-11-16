import { resolve } from 'node:path'
import { Global, Module, type DynamicModule } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { createAccessControl, type AccessControl } from '@pv/engines'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { SalesAssistantModule } from '@api/branches/sales/assistant/sales-assistant.module'
import { SalesAssistantTools } from '@api/branches/sales/assistant/sales-assistant-tools'
import { AccountService } from '@api/branches/sales/account/account.service'
import { AfterSaleService } from '@api/branches/sales/after-sale/after-sale.service'
import { ContractService } from '@api/branches/sales/contract/contract.service'
import { LeadService } from '@api/branches/sales/lead/lead.service'
import { OpportunityService } from '@api/branches/sales/opportunity/opportunity.service'
import { CampaignService } from '@api/branches/sales/campaign/campaign.service'
import { ContactService } from '@api/branches/sales/contact/contact.service'
import { HoldService } from '@api/branches/sales/hold/hold.service'
import { MeetingService } from '@api/branches/sales/meeting/meeting.service'
import { WorkstreamService } from '@api/branches/sales/workstream/workstream.service'
import { ApprovalService } from '@api/platform/approval/approval.service'
import { HoldModule } from '@api/branches/sales/hold/hold.module'
import { KpiForecastService } from '@api/branches/sales/kpi/kpi-forecast.service'
import { IndustryReportModule } from '@api/branches/sales/industry-report/industry-report.module'
import { IndustryReportService } from '@api/branches/sales/industry-report/industry-report.service'
import { LeadOriginModule } from '@api/branches/sales/lead-origin/lead-origin.module'
import { LeadOriginService } from '@api/branches/sales/lead-origin/lead-origin.service'
import { PerformanceMoneyService } from '@api/branches/sales/performance/performance-money.service'
import { PerformanceModule } from '@api/branches/sales/performance/performance.module'
import { PerformanceService } from '@api/branches/sales/performance/performance.service'
import { KpiModule } from '@api/branches/sales/kpi/kpi.module'
import { KpiQuarterService } from '@api/branches/sales/kpi/kpi-quarter.service'
import { KpiService } from '@api/branches/sales/kpi/kpi.service'
import { KpiTeamService } from '@api/branches/sales/kpi/kpi-team.service'
import { KpiTeamViewService } from '@api/branches/sales/kpi/kpi-team-view.service'
import { NextStepDebriefHook } from '@api/branches/sales/next-step/comm-debrief.hook'
import { NextStepModule } from '@api/branches/sales/next-step/next-step.module'
import { LeadModule } from '@api/branches/sales/lead/lead.module'
import { OpportunityModule } from '@api/branches/sales/opportunity/opportunity.module'
import { SalesCommsHook } from '@api/branches/sales/opportunity/opportunity-comms.hook'
import { SearchService } from '@api/branches/sales/search/search.service'
import type { ProposalWriter } from '@api/platform/assistant/assistant-proposal'
import type { AssistantTool } from '@api/platform/assistant/assistant-tools'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { CommsModule } from '@api/platform/comms/comms.module'
import { DebriefService } from '@api/platform/comms/debrief.service'
import { ENV, loadEnv, type Env } from '@api/platform/config/env'
import { createDb, type DbHandle } from '@api/platform/db/create-db'
import { DB, DB_HANDLE, type Db } from '@api/platform/db/db.module'
import { assertMemoryUrl, MEMORY_URL } from './safety'
import { seedWorld, type Seeded } from './seed'

/** The eval's process: migrations on an in-memory PGlite, and the REAL door services
 *  in a Nest context, so a tool under test reads through the same fences a screen does.
 *
 *  `DbModule` and `ConfigModule` are replaced rather than imported: `ENV` is parsed
 *  from an explicit object, so no variable of the shell reaches anything that opens
 *  a connection, and `DB` is the handle made here. */

const MIGRATIONS = resolve(__dirname, '../../../drizzle')

/** Tables a read turn may write; every other table of the database must not move. */
const TURN_TABLES = new Set([
  'audit',
  'ai_call',
  'assistant_session',
  'assistant_message',
  'assistant_tool_call',
  'assistant_proposal',
])

@Global()
@Module({})
class MemoryPlatformModule {
  static over(handle: DbHandle, env: Env): DynamicModule {
    return {
      module: MemoryPlatformModule,
      providers: [
        { provide: ENV, useValue: env },
        { provide: DB_HANDLE, useValue: handle },
        { provide: DB, useValue: handle.db },
      ],
      exports: [ENV, DB, DB_HANDLE],
    }
  }
}

@Module({})
class EvalRootModule {
  static over(handle: DbHandle, env: Env): DynamicModule {
    return {
      module: EvalRootModule,
      imports: [
        MemoryPlatformModule.over(handle, env),
        SalesAssistantModule,
        /* The KPI doors are not reached by the module above yet; their services are asked for by type. */
        KpiModule,
        /* `get_performance` and `count_records` ask ModuleRef for these services by class. */
        PerformanceModule,
        IndustryReportModule,
        LeadOriginModule,
        /* `list_my_work` asks ModuleRef for the hold service; no other module here brings it. */
        HoldModule,
        /* The same wiring `app.module.ts` gives comms: the history tool asks ModuleRef for
           this service, and a world without it would pass on a lookup that fails in production. */
        CommsModule.withHook({
          imports: [LeadModule, OpportunityModule, NextStepModule],
          hook: SalesCommsHook,
          debriefHook: NextStepDebriefHook,
        }),
      ],
    }
  }
}

export type World = {
  db: Db
  seeded: Seeded
  /** The gate's E2. The oracle holds its own, so a broken gate cannot fool it. */
  gateAccess: AccessControl
  doorAccess: AccessControl
  tools: readonly AssistantTool[]
  /** The step hook the press runs; the world has no platform module to inject it. */
  proposals: ProposalWriter
  audits: AuditRepository
  accounts: AccountService
  afterSales: AfterSaleService
  leads: LeadService
  opportunities: OpportunityService
  contracts: ContractService
  searches: SearchService
  debriefs: DebriefService
  kpi: KpiService
  kpiQuarters: KpiQuarterService
  kpiForecasts: KpiForecastService
  kpiTeams: KpiTeamService
  kpiTeamViews: KpiTeamViewService
  contacts: ContactService
  campaigns: CampaignService
  workstreams: WorkstreamService
  approvals: ApprovalService
  holds: HoldService
  meetings: MeetingService
  performance: PerformanceService
  performanceMoney: PerformanceMoneyService
  industries: IndustryReportService
  leadOrigins: LeadOriginService
  close: () => Promise<void>
}

export async function openWorld(): Promise<World> {
  assertMemoryUrl(process.env.DATABASE_URL)
  const env = loadEnv({ DATABASE_URL: MEMORY_URL, NODE_ENV: 'test' })
  assertMemoryUrl(env.DATABASE_URL)

  const handle = await createDb(MEMORY_URL)
  if (handle.kind !== 'pglite') throw new Error('ai-eval refused: the handle is not PGlite')
  await migrate(handle.db as never, { migrationsFolder: MIGRATIONS })

  const app = await NestFactory.createApplicationContext(EvalRootModule.over(handle, env), {
    logger: false,
  })
  const source = app.get(SalesAssistantTools, { strict: false })
  return {
    db: handle.db,
    seeded: await seedWorld(handle.db),
    gateAccess: createAccessControl(),
    doorAccess: createAccessControl(),
    tools: source.tools(),
    proposals: source.proposals(),
    audits: new AuditRepository(handle.db),
    accounts: app.get(AccountService, { strict: false }),
    afterSales: app.get(AfterSaleService, { strict: false }),
    leads: app.get(LeadService, { strict: false }),
    opportunities: app.get(OpportunityService, { strict: false }),
    contracts: app.get(ContractService, { strict: false }),
    searches: app.get(SearchService, { strict: false }),
    debriefs: app.get(DebriefService, { strict: false }),
    kpi: app.get(KpiService, { strict: false }),
    kpiQuarters: app.get(KpiQuarterService, { strict: false }),
    kpiForecasts: app.get(KpiForecastService, { strict: false }),
    kpiTeams: app.get(KpiTeamService, { strict: false }),
    kpiTeamViews: app.get(KpiTeamViewService, { strict: false }),
    contacts: app.get(ContactService, { strict: false }),
    campaigns: app.get(CampaignService, { strict: false }),
    workstreams: app.get(WorkstreamService, { strict: false }),
    approvals: app.get(ApprovalService, { strict: false }),
    holds: app.get(HoldService, { strict: false }),
    meetings: app.get(MeetingService, { strict: false }),
    performance: app.get(PerformanceService, { strict: false }),
    performanceMoney: app.get(PerformanceMoneyService, { strict: false }),
    industries: app.get(IndustryReportService, { strict: false }),
    leadOrigins: app.get(LeadOriginService, { strict: false }),
    close: async () => {
      await app.close()
      await handle.close()
    },
  }
}

type RowCount = { schema: string; table: string; n: number; sum: string }

/** Row count and checksum of every table a turn may not touch. Read from the
 *  catalogue, so a table added later is covered without anyone remembering. */
export async function businessChecksum(db: Db): Promise<Map<string, string>> {
  const tables = await db.execute(sql`
    SELECT table_schema AS schema, table_name AS table
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')`)
  const sums = new Map<string, string>()
  for (const t of (tables as unknown as { rows: RowCount[] }).rows) {
    if (t.schema === 'platform' && TURN_TABLES.has(t.table)) continue
    const name = sql.raw(`"${t.schema}"."${t.table}"`)
    const result = await db.execute(sql`
      SELECT count(*)::int AS n,
             md5(coalesce(string_agg(row_to_json(x)::text, '|' ORDER BY row_to_json(x)::text), '')) AS sum
      FROM ${name} x`)
    const [row] = (result as unknown as { rows: RowCount[] }).rows
    sums.set(`${t.schema}.${t.table}`, `${row?.n}:${row?.sum}`)
  }
  return sums
}

export function moved(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...after].filter(([table, sum]) => before.get(table) !== sum).map(([table]) => table)
}
