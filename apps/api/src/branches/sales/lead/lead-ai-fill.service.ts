import { Inject, Injectable, Logger } from '@nestjs/common'
import { leadKeys, type Actor } from '@pv/engines'
import {
  LeadAiFillField,
  type LeadAiFillMarks,
  type LeadAiJob,
  type LeadAiJobResult,
  type ObjectCode,
} from '@pv/contracts'
import { AiUnavailableError } from '@api/platform/ai/ai-errors'
import { AiGateway } from '@api/platform/ai/ai-gateway'
import { AiRouteRepository } from '@api/platform/ai/ai-route.repository'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { isDbConstraint } from '@api/platform/http/db-error'
import { BusyError, conflict, notFound, rateLimited } from '@api/platform/http/problem'
import { AI_FILL_ENQUEUE, type AiFillEnqueue } from '@api/platform/queue/ai-fill-jobs'
import { ContactService } from '../contact/contact.service'
import { LeadAiFillRepository } from './lead-ai-fill.repository'
import { byOf, TouchService } from '../touch/touch.service'
import { aiFillBlock, emptyFillable } from './lead-ai-fill.rule'
import { AI_FILL_BLOCKED, AI_FILL_REFUSED, notHeld } from './lead-ai-fill.words'
import { LeadAiJobRepository } from './lead-ai-job.repository'
import { isPerson, PERSON_FIELDS, toLeadAiJob } from './lead-ai-job.mapper'
import type { LeadSuggestions } from './lead-enrich'
import { pickable, settleIndustries } from './lead-industry.sql'
import { LEAD_NOTE, type LeadValues } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'

/** `POST /sales/leads/:code/ai-fill` — the press, and the apply step the
 *  `lead.ai-fill` worker runs (ADR 0128, 0131).
 *
 *  The press asks what the old blocking fill asked (404, 403 `out-of-scope`,
 *  409 nothing to fill, the route's quota) and then only opens a job and
 *  enqueues it. `apply` is asked again under the lock: the job runs later, the
 *  lead may change hands. A registry-verified tax code another company already
 *  holds is a conflict (owner's decision); an unverified one is dropped. One
 *  transaction writes only the fields still empty — the person fields first,
 *  through the contact writer and its lock order — with provenance, one
 *  `field-filled` touch and one audit line. Logs carry counts, never values. */

type Conflict = LeadAiJobResult['conflicts'][number]

@Injectable()
export class LeadAiFillService {
  private readonly log = new Logger('LeadAiFill')

  constructor(
    private readonly leads: LeadRepository,
    private readonly repo: LeadAiFillRepository,
    private readonly jobs: LeadAiJobRepository,
    private readonly contacts: ContactService,
    private readonly audit: AuditRepository,
    private readonly touch: TouchService,
    private readonly ai: AiGateway,
    private readonly routes: AiRouteRepository,
    @Inject(AI_FILL_ENQUEUE) private readonly queue: AiFillEnqueue,
  ) {}

  async press(who: Actor, code: ObjectCode): Promise<LeadAiJob> {
    const before = await this.leads.byCode(who, code)
    if (!before) throw notFound('lead', code)
    if (!before.holds) throw notHeld(code)
    const block = aiFillBlock(before.row, before.industries.length)
    if (block) throw conflict(AI_FILL_BLOCKED[block])

    const job = await this.jobs.run(async (tx) => {
      await this.jobs.lockActor(tx, who.id)
      /* Before the quota: a press on a running lead opens the tray, never a 429. */
      const running = await this.jobs.activeFor(code, tx)
      if (running) throw alreadyRunning(running)
      await this.admit(tx, who.id)
      return this.open(tx, code, who.id)
    })
    /* After the insert committed: the worker must find the row it is handed. */
    try {
      await this.queue.enqueue(job.id)
    } catch (error) {
      this.log.error(`ai-fill ${job.id}: enqueue failed — ${String(error)}`)
      await this.jobs.fail(job.id, 'busy', NOT_SENT)
      throw new BusyError()
    }
    return toLeadAiJob(job, before.row.company, false)
  }

  /** The route's own check, then its per-person limit counting the presses not
   *  yet run: they have no ledger row, and the worker runs them as admitted.
   *  Two calls each, the most a fill makes. The token budget has no per-job
   *  figure to reserve, so it stays the gateway's check alone. */
  private async admit(tx: Db, actorId: string): Promise<void> {
    try {
      await this.ai.check('lead-enrich', actorId, tx)
    } catch (error) {
      if (error instanceof AiUnavailableError) throw refusal(error.reason)
      throw error
    }
    const perUser = (await this.routes.get('lead-enrich', tx))?.dailyCallsPerUser ?? 0
    if (perUser <= 0) return
    const calls = await this.routes.callsLastDay('lead-enrich', actorId, tx)
    const waiting = await this.jobs.activeCount(actorId, tx)
    if (calls + 2 * waiting >= perUser) throw refusal('user-limit')
  }

  /** The partial unique index is the fence two racing presses meet; the
   *  loser is told which job is already running, so the screen opens the tray. */
  private async open(tx: Db, code: string, actorId: string) {
    try {
      return await this.jobs.insert(tx, code, actorId)
    } catch (error) {
      if (!isDbConstraint(error, 'lead_ai_job_one_active_uq')) throw error
      throw alreadyRunning(await this.jobs.activeFor(code, tx))
    }
  }

  /** A tax code another company holds is never written. Only a verified one
   *  (sure = the registry confirmed it) is worth a duplicate-company line; an
   *  unverified one is dropped. Read before the tx: PGlite has one connection. */
  async clash(found: LeadSuggestions, own: string | null): Promise<Conflict[]> {
    const tax = found.taxCode
    const value = typeof tax?.value === 'string' ? tax.value : null
    const root = value ? leadKeys({ taxCode: value }, []).taxRoot : null
    const holder = root ? await this.repo.accountByTaxRoot(root, own) : null
    if (!holder || !value || !tax) return []
    delete found.taxCode
    if (tax.unsure) return []
    return [{ field: 'taxCode', value, accountCode: holder.code, accountName: holder.name }]
  }

  /** The fields written, in field order; `at` stamps every mark, and the job's
   *  `finished_at`, so Undo can tell this fill's marks from a later one's. */
  async apply(
    tx: Db,
    who: Actor,
    code: string,
    found: LeadSuggestions,
    at: Date,
  ): Promise<LeadAiFillField[]> {
    const person = Object.fromEntries(
      PERSON_FIELDS.flatMap((f) => (found[f] ? [[f, found[f].value as string]] : [])),
    )
    const personWritten = await this.contacts.fillPrimaryEmpty(tx, code, person, who)
    const locked = await this.repo.lock(tx, who, code)
    if (!locked) throw notFound('lead', code)
    /* Rolls back the person write above too. */
    if (!locked.holds) throw notHeld(code)

    const industries = await this.repo.industryCount(tx, code)
    const still = new Set([...emptyFillable(locked.row, industries), ...personWritten])
    const open = LeadAiFillField.options.filter((f) => found[f] && still.has(f))
    /* Industries re-judged under the lock against the category the row will hold,
       so a category or list changed meanwhile drops them instead of failing the fill. */
    const categoryId = open.includes('category')
      ? (found.category!.value as string)
      : locked.row.categoryId
    const named = open.includes('industries') ? (found.industries!.value as string[]) : []
    const live = categoryId ? await pickable(tx, categoryId, named) : new Set<string>()
    const picked = named.filter((id) => live.has(id))
    if (found.industries) found.industries.value = picked
    const fields = open.filter((f) => f !== 'industries' || picked.length > 0)
    if (fields.length === 0) return []
    const values: Record<string, unknown> = {}
    const marks: LeadAiFillMarks = {}
    for (const field of fields) {
      const { value, source, unsure } = found[field]!
      if (field === 'category') values.categoryId = value
      else if (!isPerson(field) && field !== 'industries') values[field] = value
      marks[field] = { source, unsure, at: at.toISOString() }
    }
    await this.repo.write(tx, code, values as Partial<LeadValues>, marks)
    if (picked.length > 0) {
      await settleIndustries(tx, { code, categoryId, want: picked, recategorised: false })
    }
    const note = LEAD_NOTE.aiFilled(fields.length)
    await this.touch.record(tx, [
      { subjectCode: code, subjectKind: 'lead', kind: 'field-filled', ...byOf(who), note },
    ])
    await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
    return fields
  }
}

const NOT_SENT = 'Chưa gửi được việc cho AI.'

const alreadyRunning = (jobId: string | null): Error =>
  Object.assign(conflict('AI đang điền lead này.'), { extra: { jobId } })

const refusal = (reason: AiUnavailableError['reason']): Error => {
  const { kind, error } = AI_FILL_REFUSED[reason]
  return kind === 'limit' ? rateLimited(error) : conflict(error)
}
