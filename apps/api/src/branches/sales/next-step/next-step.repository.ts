import { and, arrayContains, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { LEAD_OPEN_STATES } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { contact } from '../contact/contact.schema'
import { contract } from '../contract/contract.schema'
import { leadScope } from '../lead/lead-scope'
import { lead, type LeadRowDb } from '../lead/lead.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { dealOpen } from '../open-deal'
import { nextStep, type NextStepValues } from './next-step.schema'

/** The step as read: doer and kind names joined at read time, so a rename
 *  shows on every standing step. */
export type NextStepRead = {
  text: string
  due: string
  doerId: string
  doerName: string
  kindId: string | null
  kindName: string | null
}

/** The columns of a step read, shared by every reader of the table. */
export const STEP_COLUMNS = {
  text: nextStep.text,
  due: nextStep.due,
  doerId: nextStep.doerId,
  doerName: actor.name,
  kindId: nextStep.kindId,
  kindName: configEntry.name,
}

/** One object's step out of a batch. */
export type NextStepBatchRead = NextStepRead & { subjectCode: string }

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
      .select({ state: lead.state, today: VIETNAM_TODAY, ...STEP_COLUMNS })
      .from(lead)
      .leftJoin(nextStep, eq(nextStep.subjectCode, lead.code))
      .leftJoin(actor, eq(actor.id, nextStep.doerId))
      .leftJoin(configEntry, eq(configEntry.id, nextStep.kindId))
      .where(eq(lead.code, code))
      .limit(1)
    if (!row) return null

    const { state, today, ...step } = row
    return { state, today, step: stepOf(step) }
  }

  /** The Vietnam calendar day, for a reader that grades several things at once.
   *  Drizzle needs a FROM; `actor` is never empty for a caller with a session. */
  async today(): Promise<string> {
    const [row] = await this.db.select({ today: VIETNAM_TODAY }).from(actor).limit(1)
    return row?.today ?? new Date().toISOString().slice(0, 10)
  }

  /** Many objects' steps in one statement — the journey detail reads every
   *  deal of a run at once. An object with no step is absent from the map. */
  async stepsOf(codes: readonly string[]): Promise<Map<string, NextStepBatchRead>> {
    if (codes.length === 0) return new Map()
    const rows = await this.db
      .select({ subjectCode: nextStep.subjectCode, ...STEP_COLUMNS })
      .from(nextStep)
      .innerJoin(actor, eq(actor.id, nextStep.doerId))
      .leftJoin(configEntry, eq(configEntry.id, nextStep.kindId))
      .where(inArray(nextStep.subjectCode, [...codes]))
    return new Map(rows.map((r) => [r.subjectCode, r]))
  }

  /** Leads among `codes` still in the funnel and in the caller's scope
   *  (`leadScope`), with holder and step — what a comm close-out may target. */
  async openLeads(who: Actor, codes: readonly string[]) {
    if (codes.length === 0) return []
    return this.db
      .select({ code: lead.code, ownerId: lead.ownerId, text: nextStep.text, due: nextStep.due })
      .from(lead)
      .leftJoin(nextStep, eq(nextStep.subjectCode, lead.code))
      .where(
        and(
          inArray(lead.code, [...codes]),
          inArray(lead.state, [...LEAD_OPEN_STATES]),
          leadScope(who, true),
        ),
      )
  }

  /** An open lead or deal by the book alone — whoever asks, whatever their grants. */
  async isOpenSubject(code: string): Promise<boolean> {
    const [row] = await this.db
      .select({ code: lead.code })
      .from(lead)
      .where(and(eq(lead.code, code), inArray(lead.state, [...LEAD_OPEN_STATES])))
      .unionAll(
        this.db
          .select({ code: opportunity.code })
          .from(opportunity)
          .where(and(eq(opportunity.code, code), dealOpen(opportunity.code, opportunity.state))),
      )
    return row !== undefined
  }

  /** The lead, deals and contracts of one sales run — the subjects a comm
   *  record of that run can hang on (ADR 0075 §5, the per-run comm tree). */
  async runSubjects(workstreamCode: string): Promise<string[]> {
    const rows = await this.db
      .select({ code: lead.code })
      .from(lead)
      .where(eq(lead.workstreamCode, workstreamCode))
      .unionAll(
        this.db
          .select({ code: opportunity.code })
          .from(opportunity)
          .where(eq(opportunity.workstreamCode, workstreamCode)),
      )
      .unionAll(
        this.db
          .select({ code: contract.code })
          .from(contract)
          .where(eq(contract.workstreamCode, workstreamCode)),
      )
    return rows.map((r) => r.code)
  }

  /** A comm record's counterpart (`CommDebriefHook.contactOf`): a contact
   *  only when it hangs on the subject's lead, else the lead's own person. */
  async contactOf(subjectCode: string, contactCode: string | undefined) {
    const leadCode = await this.leadOf(subjectCode)
    if (!leadCode) return null
    const [row] = contactCode
      ? await this.db
          .select({ code: contact.code, phone: contact.phone, email: contact.email })
          .from(contact)
          .where(and(eq(contact.code, contactCode), eq(contact.leadCode, leadCode)))
      : await this.db
          .select({ code: lead.code, phone: lead.phone, email: lead.email })
          .from(lead)
          .where(eq(lead.code, leadCode))
    if (!row) return null
    const kin = await this.db
      .select({ code: contact.code })
      .from(contact)
      .where(eq(contact.leadCode, leadCode))
    return { ...row, sameLead: [leadCode, ...kin.map((k) => k.code)] }
  }

  /** The lead a lead, deal or contract grew from; null for any other code. */
  private async leadOf(code: string): Promise<string | null> {
    const [row] = await this.db
      .select({ code: lead.code })
      .from(lead)
      .where(eq(lead.code, code))
      .unionAll(
        this.db
          .select({ code: opportunity.leadCode })
          .from(opportunity)
          .where(eq(opportunity.code, code)),
      )
      .unionAll(
        this.db.select({ code: contract.leadCode }).from(contract).where(eq(contract.code, code)),
      )
    return row?.code ?? null
  }

  /** A `STEP_KIND` row, off ones included — the caller judges `active`. */
  async stepKind(id: string, handle: Db = this.db) {
    const [row] = await handle
      .select({ id: configEntry.id, name: configEntry.name, active: configEntry.active })
      .from(configEntry)
      .where(and(eq(configEntry.id, id), eq(configEntry.list, 'STEP_KIND')))
      .limit(1)
    return row ?? null
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
        set: {
          text: values.text,
          due: values.due,
          doerId: values.doerId,
          kindId: values.kindId ?? null,
          updatedAt: sql`now()`,
        },
      })
  }
}

/** Left joins answer NULLs for an object with no step; any NULL key = no step. */
export function stepOf(
  row: Partial<Record<keyof NextStepRead, string | null>>,
): NextStepRead | null {
  const { text, due, doerId, doerName } = row
  if (!text || !due || !doerId || !doerName) return null
  return { text, due, doerId, doerName, kindId: row.kindId ?? null, kindName: row.kindName ?? null }
}
