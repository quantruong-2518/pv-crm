import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { LeadAiFillField, LeadAiJob, LeadAiJobList } from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { ContactService } from '../contact/contact.service'
import { byOf, TouchService } from '../touch/touch.service'
import { LeadAiFillRepository } from './lead-ai-fill.repository'
import { LeadAiJobRepository, type LeadAiJobJoined } from './lead-ai-job.repository'
import { notHeld } from './lead-ai-fill.words'
import { isPerson, pastUndo, toLeadAiJob, undoable } from './lead-ai-job.mapper'
import { settleIndustries } from './lead-industry.sql'
import { LEAD_NOTE } from './lead-write.mapper'

/** `sales/ai-jobs` — the tray's read and its three actions (ADR 0131 §5–7).
 *
 *  A job is its presser's alone: every door answers 404 for anyone else's, as
 *  the scan batch does. Undo takes back only what still holds this job's value
 *  and mark (`undoable`), so a field a person edited since is never touched;
 *  it locks contact then lead, the order every contact write takes, and writes
 *  one touch and one audit line. */

const JOB = 'việc AI'
const PAST_UNDO = 'Việc này không còn hoàn tác được.'

@Injectable()
export class LeadAiJobService {
  constructor(
    private readonly jobs: LeadAiJobRepository,
    private readonly fills: LeadAiFillRepository,
    private readonly contacts: ContactService,
    private readonly audit: AuditRepository,
    private readonly touch: TouchService,
  ) {}

  async list(who: Actor): Promise<LeadAiJobList> {
    return this.shape(await this.jobs.listFor(who))
  }

  async undo(who: Actor, id: string): Promise<LeadAiJob> {
    const found = await this.jobs.mine(who, id)
    if (!found) throw notFound(JOB, id)
    const { job } = found
    if (job.state !== 'DONE') throw conflict('Việc này chưa xong nên chưa hoàn tác được.')
    if (job.undoneAt) throw conflict('Việc này đã được hoàn tác.')
    if (pastUndo(job)) throw conflict(PAST_UNDO)
    const code = job.leadCode
    /* Person fields are compared again under the contact lock; this only picks them. */
    const industries = (await this.jobs.industriesOf([code])).get(code) ?? []
    const planned = undoable(job, found.lead, industries)

    await this.jobs.run(async (tx) => {
      const expected = Object.fromEntries(
        job.result!.filled.flatMap((f) =>
          isPerson(f.field) && planned.includes(f.field) ? [[f.field, f.value as string]] : [],
        ),
      )
      const cleared = Object.keys(expected).length
        ? await this.contacts.clearPrimaryIf(tx, code, expected, job.finishedAt!.toISOString(), who)
        : []
      const locked = await this.fills.lock(tx, who, code)
      if (!locked) throw notFound('lead', code)
      /* Rolls back the person clear above too. */
      if (!locked.holds) throw notHeld(code)
      const held = (await this.jobs.industriesOf([code], tx)).get(code) ?? []
      const own = undoable(job, locked.row, held).filter((f) => !isPerson(f))
      await this.clearOwn(tx, code, own, locked.row.categoryId)

      const fields = cleared.length + own.length
      if (fields === 0) throw conflict('Các ô AI điền đã được sửa nên không còn gì để hoàn tác.')
      const note = LEAD_NOTE.aiUndone(fields)
      await this.touch.record(tx, [
        { subjectCode: code, subjectKind: 'lead', kind: 'field-filled', ...byOf(who), note },
      ])
      await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
      if (!(await this.jobs.markUndone(tx, id))) throw conflict(PAST_UNDO)
    })
    const [after] = await this.shape([(await this.jobs.mine(who, id))!])
    return after!
  }

  /** Industries before the category: `settleIndustries` reads the category they sit in. */
  private async clearOwn(
    tx: Db,
    code: string,
    fields: readonly LeadAiFillField[],
    categoryId: string | null,
  ): Promise<void> {
    if (fields.length === 0) return
    if (fields.includes('industries')) {
      await settleIndustries(tx, { code, categoryId, want: [], recategorised: false })
    }
    await this.fills.clear(tx, code, fields)
  }

  async dismiss(who: Actor, id: string): Promise<void> {
    if ((await this.jobs.dismiss(who.id, id)) > 0) return
    const found = await this.jobs.mine(who, id)
    if (!found) throw notFound(JOB, id)
    if (!found.job.finishedAt) throw conflict('Việc này đang chạy nên chưa xoá được.')
  }

  async dismissFinished(who: Actor): Promise<void> {
    await this.jobs.dismiss(who.id)
  }

  /** `canUndo` needs each DONE lead's industries: one read for the whole list. */
  private async shape(rows: readonly LeadAiJobJoined[]): Promise<LeadAiJob[]> {
    const open = rows.filter(({ job }) => job.state === 'DONE' && !job.undoneAt)
    const industries = await this.jobs.industriesOf([...new Set(open.map((r) => r.job.leadCode))])
    return rows.map(({ job, lead }) => {
      const canUndo = undoable(job, lead, industries.get(job.leadCode) ?? []).length > 0
      return toLeadAiJob(job, lead.company, canUndo)
    })
  }
}
