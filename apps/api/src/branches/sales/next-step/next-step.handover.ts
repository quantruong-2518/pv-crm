import { and, eq, inArray, sql } from 'drizzle-orm'
import { NEXT_STEP_SET } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import type { NotificationHub } from '@api/platform/notification/notification.hub'
import { nextStep } from './next-step.schema'

/** What other doors do to a step inside THEIR transaction: lead exit and
 *  convert, and a deal's stop and sign, drop it; an owner change hands it over.
 *
 *  Plain functions over `tx`, not a provider: the lead and deal modules call
 *  these, and `NextStepModule` imports `LeadModule`, so a provider here would
 *  be a module cycle. This file imports only the table. Both are idempotent and
 *  write no touch — the door that calls them writes its own. */

/** What a door hands over so the step's doer hears of it (ADR 0085): its hub,
 *  who pressed (absent = nobody at a keyboard) and the subject's display name. */
export type StepBell = { hub: NotificationHub; actorId?: string; label?: string | null }

/** `at` is the row's `updated_at`: `sales.next_step` has no id, and a step set
 *  again on the same subject for the same doer must ring again. */
export function ringDoer(
  tx: Db,
  bell: StepBell,
  subjectCode: string,
  doerId: string,
  at: Date,
): Promise<void> {
  return bell.hub.announce(tx, {
    event: {
      name: NEXT_STEP_SET,
      ref: { code: subjectCode },
      ...(bell.actorId ? { actorId: bell.actorId } : {}),
      audiences: { doer: [doerId] },
      occurrence: at.toISOString(),
    },
    subject: {
      kind: subjectCode.startsWith('OP-') ? 'opportunity' : 'lead',
      code: subjectCode,
      label: bell.label ?? null,
    },
  })
}

/** The clear-for-subject the opportunity module calls on stop and on sign
 *  (ADR 0069 §10), inside its own tx. Works on any `LD-`/`OP-` code. */
export async function dropStep(tx: Db, subjectCode: string): Promise<void> {
  await tx.delete(nextStep).where(eq(nextStep.subjectCode, subjectCode))
}

/** Many leads leaving at once (a deal opened on several): one DELETE, not one per code. */
export async function dropSteps(tx: Db, subjectCodes: readonly string[]): Promise<void> {
  if (subjectCodes.length === 0) return
  await tx.delete(nextStep).where(inArray(nextStep.subjectCode, [...subjectCodes]))
}

/** Only a step the old holder was doing follows the hand-over: one given to
 *  someone else stays theirs. `toId` null = released to the pool, so it goes.
 *  No reach or `isLiveSalesActor` check, unlike the PUT door: `toId` IS the new
 *  holder, already vetted by the owner assignment and `lead_owner_id_actor_id_fk`. */
export async function handStepOver(
  tx: Db,
  subjectCode: string,
  fromId: string,
  toId: string | null,
  bell: StepBell,
): Promise<void> {
  const mine = and(eq(nextStep.subjectCode, subjectCode), eq(nextStep.doerId, fromId))
  if (toId === null) {
    await tx.delete(nextStep).where(mine)
    return
  }
  const [moved] = await tx
    .update(nextStep)
    .set({ doerId: toId, updatedAt: sql`now()` })
    .where(mine)
    .returning({ updatedAt: nextStep.updatedAt })
  if (moved) await ringDoer(tx, bell, subjectCode, toId, moved.updatedAt)
}
