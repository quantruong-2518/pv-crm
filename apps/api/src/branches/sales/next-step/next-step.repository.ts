import { and, arrayContains, eq, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { lead, type LeadRowDb } from '../lead/lead.schema'
import { nextStep, type NextStepValues } from './next-step.schema'

/** The step as read: the doer's name joined from `actor` at read time. */
export type NextStepRead = { text: string; due: string; doerId: string; doerName: string }

/** One lead's step with what grading it needs: the lead state and today. */
export type NextStepSlot = { state: LeadRowDb['state']; today: string; step: NextStepRead | null }

/** The Vietnam calendar day off the database clock — `campaign.repository`'s
 *  reading, so the app and the SQL agree on when a day turns. */
const VIETNAM_TODAY = sql<string>`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text`

/** SQL of `sales.next_step`. Decides nothing, knows no permission.
 *
 *  Writers take `tx` from outside: the service knows a "done" is a touch plus a
 *  replace-or-delete, and one transaction must wrap all of it. Deleting goes
 *  through `dropStep` in `next-step.handover.ts`, one copy for every door. */
@Injectable()
export class NextStepRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Null = no such lead. Left joins: a lead with no step still answers. */
  async slot(code: string, handle: Db = this.db): Promise<NextStepSlot | null> {
    const [row] = await handle
      .select({
        state: lead.state,
        today: VIETNAM_TODAY,
        text: nextStep.text,
        due: nextStep.due,
        doerId: nextStep.doerId,
        doerName: actor.name,
      })
      .from(lead)
      .leftJoin(nextStep, eq(nextStep.subjectCode, lead.code))
      .leftJoin(actor, eq(actor.id, nextStep.doerId))
      .where(eq(lead.code, code))
      .limit(1)
    if (!row) return null

    const { state, today, text, due, doerId, doerName } = row
    const step =
      text === null || due === null || doerId === null || doerName === null
        ? null
        : { text, due, doerId, doerName }
    return { state, today, step }
  }

  /** The lead row under lock: every write on its step is serialised behind it,
   *  so two "done" presses cannot both find the same step and both log a touch. */
  async lockLead(tx: Db, code: string): Promise<Pick<LeadRowDb, 'state' | 'ownerId'> | null> {
    const [row] = await tx
      .select({ state: lead.state, ownerId: lead.ownerId })
      .from(lead)
      .where(eq(lead.code, code))
      .limit(1)
      .for('update')
    return row ?? null
  }

  /** The FK only knows "in the book"; a doer must also be unlocked and in Sales. */
  async isLiveSalesActor(tx: Db, id: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: actor.id })
      .from(actor)
      .where(
        and(eq(actor.id, id), isNull(actor.disabledAt), arrayContains(actor.branches, ['Sales'])),
      )
      .limit(1)
    return row !== undefined
  }

  /** Replacing keeps `created_*`: they describe the row, and no trigger moves `updated_at`. */
  async put(tx: Db, values: NextStepValues): Promise<void> {
    await tx
      .insert(nextStep)
      .values(values)
      .onConflictDoUpdate({
        target: nextStep.subjectCode,
        set: { text: values.text, due: values.due, doerId: values.doerId, updatedAt: sql`now()` },
      })
  }
}
