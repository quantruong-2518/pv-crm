import { like, or } from 'drizzle-orm'
import { audit } from '@api/platform/db/platform.schema'
import type { World } from './world'

/* Prefixes typed here, not imported: the two services keep their notes private, and a
 * rewording that silences a line must fail this side rather than follow it. */
export const SUMMARY_LINE = 'comms.debrief · read summary of'
export const TRANSCRIPT_LINE = 'sales.meeting · read transcript of'

/** The content-read lines the doors wrote while `run` ran, whoever they were tagged to:
 *  the turn id marks only the gate's own lines, never the ones a service writes. */
export async function contentLines<T>(
  world: World,
  run: () => Promise<T>,
): Promise<{ result: T; lines: string[] }> {
  const found = () =>
    world.db
      .select({ id: audit.id, note: audit.note })
      .from(audit)
      .where(or(like(audit.note, `${SUMMARY_LINE}%`), like(audit.note, `${TRANSCRIPT_LINE}%`)))
  const before = new Set((await found()).map((r) => r.id))
  const result = await run()
  const lines = (await found()).filter((r) => !before.has(r.id)).map((r) => r.note ?? '')
  return { result, lines }
}
