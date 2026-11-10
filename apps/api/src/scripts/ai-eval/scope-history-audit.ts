import { like, or } from 'drizzle-orm'
import { audit } from '@api/platform/db/platform.schema'
import type { World } from './world'

/* Prefixes typed here, not imported: the services keep their notes private, and a
 * rewording that silences a line must fail this side rather than follow it. */
export const SUMMARY_LINE = 'comms.debrief · read summary of'
export const TRANSCRIPT_LINE = 'sales.meeting · read transcript of'
export const SESSION_LINE = 'assistant · session'
export const PAGE_LINE = 'assistant · page'
export const REPORTS_LINE = 'assistant.reports · page'

export type Line = { action: string; code: string | null; note: string }

/** The audit lines starting with any of `prefixes` that `run` wrote, whoever they were
 *  tagged to: the turn id marks only the gate's own lines, never the ones a service writes. */
export async function newLines<T>(
  world: World,
  prefixes: readonly string[],
  run: () => Promise<T>,
): Promise<{ result: T; lines: Line[] }> {
  const found = () =>
    world.db
      .select({ id: audit.id, action: audit.action, code: audit.code, note: audit.note })
      .from(audit)
      .where(or(...prefixes.map((prefix) => like(audit.note, `${prefix}%`))))
  const before = new Set((await found()).map((r) => r.id))
  const result = await run()
  const lines = (await found())
    .filter((r) => !before.has(r.id))
    .map((r) => ({ action: r.action, code: r.code, note: r.note ?? '' }))
  return { result, lines }
}

/** The content-read lines the doors wrote while `run` ran. */
export async function contentLines<T>(
  world: World,
  run: () => Promise<T>,
): Promise<{ result: T; lines: string[] }> {
  const { result, lines } = await newLines(world, [SUMMARY_LINE, TRANSCRIPT_LINE], run)
  return { result, lines: lines.map((l) => l.note) }
}

export async function auditCount(world: World): Promise<number> {
  return (await world.db.select({ id: audit.id }).from(audit)).length
}
