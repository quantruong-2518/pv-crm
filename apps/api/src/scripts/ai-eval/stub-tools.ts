import { Controller, Get } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { Need } from '@api/platform/access/need.decorator'
import { defineTool, door, type ToolRead } from '@api/platform/assistant/assistant-tools'
import type { Db } from '@api/platform/db/db.module'

/** Tools the real doors cannot act as: a door that reports `hidden`, a result big
 *  enough to hit the cap, a read that takes time. Each stands behind a real `@Need`
 *  on a fake controller, so the gate treats it exactly as it treats a real one.
 *  The controller is never mounted. */

@Controller('ai-eval-stub')
class StubDoors {
  @Get('read')
  @Need({ branch: 'Sales', permission: 'lead.view' })
  read() {}

  @Get('figures')
  @Need({ branch: 'Sales', permission: 'performance.view' })
  figures() {}
}

const Input = z.object({ tag: z.string().optional() }).strict()

export const stubRead = (
  name: string,
  run: (who: Actor, input: z.infer<typeof Input>) => Promise<ToolRead>,
  handler: 'read' | 'figures' = 'read',
) =>
  defineTool({
    name,
    description: 'Stub.',
    input: Input,
    doors: { only: door(StubDoors, handler) },
    doorFor: () => 'only',
    run,
  })

export const STUB_READ: ToolRead = {
  data: { trusted: { code: 'LD-0000' } },
  codes: ['LD-0000'],
  rowCount: 1,
  hidden: null,
}

/** A clock on the real one plus what a scenario added: it starts at now and only
 *  moves forward, because the gateway's deadline reads the real `Date.now()`. */
export function movableClock() {
  let ahead = 0
  return {
    now: () => Date.now() + ahead,
    advance: (ms: number) => {
      ahead += ms
    },
  }
}

export const deferred = () => {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  return { held, release }
}

/** Runs `work` with a route changed, and always puts it back: one route left off
 *  turns every later scenario into a quiet pass or a false failure. */
export async function withRoute<T>(
  db: Db,
  change: ReturnType<typeof sql>,
  work: () => Promise<T>,
): Promise<T> {
  const [row] = (
    (await db.execute(
      sql`SELECT to_jsonb(r) AS saved FROM platform.ai_route r WHERE task = 'assistant'`,
    )) as unknown as { rows: { saved: object }[] }
  ).rows
  await db.execute(sql`UPDATE platform.ai_route SET ${change} WHERE task = 'assistant'`)
  try {
    return await work()
  } finally {
    await restoreRoute(db, row?.saved ?? {})
  }
}

const restoreRoute = async (db: Db, saved: object): Promise<void> => {
  const r = saved as Record<string, unknown>
  await db.execute(sql`UPDATE platform.ai_route SET
    enabled = ${r.enabled as boolean},
    primary_model = ${r.primary_model as string},
    fallback_model = ${r.fallback_model as string},
    daily_calls_per_user = ${r.daily_calls_per_user as number}
    WHERE task = 'assistant'`)
}
