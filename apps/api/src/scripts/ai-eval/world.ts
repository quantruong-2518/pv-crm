import { resolve } from 'node:path'
import { Global, Module, type DynamicModule } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { createAccessControl, type AccessControl } from '@pv/engines'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { SalesAssistantModule } from '@api/branches/sales/assistant/sales-assistant.module'
import { SalesAssistantTools } from '@api/branches/sales/assistant/sales-assistant-tools'
import { ContractService } from '@api/branches/sales/contract/contract.service'
import { LeadService } from '@api/branches/sales/lead/lead.service'
import { OpportunityService } from '@api/branches/sales/opportunity/opportunity.service'
import { SearchService } from '@api/branches/sales/search/search.service'
import type { AssistantTool } from '@api/platform/assistant/assistant-tools'
import { AuditRepository } from '@api/platform/audit/audit.repository'
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
      imports: [MemoryPlatformModule.over(handle, env), SalesAssistantModule],
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
  audits: AuditRepository
  leads: LeadService
  opportunities: OpportunityService
  contracts: ContractService
  searches: SearchService
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
    audits: new AuditRepository(handle.db),
    leads: app.get(LeadService, { strict: false }),
    opportunities: app.get(OpportunityService, { strict: false }),
    contracts: app.get(ContractService, { strict: false }),
    searches: app.get(SearchService, { strict: false }),
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
