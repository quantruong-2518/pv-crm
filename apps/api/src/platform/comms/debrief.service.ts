import { Inject, Injectable, Optional } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  CommRecordCreateResponse,
  DebriefCountsResponse,
  DebriefListResponse,
  DebriefTargetResponse,
  DebriefView,
  PendingDebriefResponse,
  type CommRecordCreateBody,
  type DebriefClose,
  type DebriefListQuery,
  type DebriefTargetQuery,
  type PendingDebriefQuery,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { ObjectRow } from '@api/platform/db/platform.schema'
import { ACCESS } from '@api/platform/engines/tokens'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { COMM_DEBRIEF_HOOK, unconfirmable, type CommDebriefHook } from './comm-debrief.hook'
import { CommRecordService } from './comm-record.service'
import { refuseNonSubject, toDebriefView, toObjectRef, toThread } from './comms.mapper'
import { DebriefRepository, type DebriefRead } from './debrief.repository'
import { MESSAGE_LOGGED_HOOK, type MessageLoggedHook } from './message-logged.hook'
import { ThreadRepository } from './thread.repository'

/** Comm records (ADR 0074, 0075): the button door, the subject's timeline,
 *  one record, the owner's queue, the managers' counts, and the confirm.
 *
 *  Two fences. Reading a record takes the OWNER or reach on its subject: the
 *  owner was in the conversation, so a hand-over must not strand their record.
 *  Changing one — confirm, files — takes the owner alone (ADR 0074 §4).
 *
 *  Confirming is validated by the branch (`CommDebriefHook.prepare`) BEFORE
 *  the transaction, because the branch reads on the pool and PGlite has one
 *  connection; the debrief, its answers, the audit line and the branch's step
 *  write then commit together. */
@Injectable()
export class DebriefService {
  constructor(
    private readonly repo: DebriefRepository,
    private readonly threads: ThreadRepository,
    private readonly records: CommRecordService,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Optional() @Inject(COMM_DEBRIEF_HOOK) private readonly hook?: CommDebriefHook,
    @Optional() @Inject(MESSAGE_LOGGED_HOOK) private readonly logged?: MessageLoggedHook,
  ) {}

  /** The call / Zalo / mail buttons and the mobile log: a comm owned by the
   *  caller, always empty (its text is the confirm summary). Refused up front
   *  when the caller could never confirm it. On a lead it is an exchange, so the
   *  lead moves exactly as a logged turn moves it (`MESSAGE_LOGGED_HOOK`). */
  async create(who: Actor, body: CommRecordCreateBody): Promise<CommRecordCreateResponse> {
    const hook = this.hook
    if (!hook) throw new Error('comms: COMM_DEBRIEF_HOOK is not bound; no contact to file under')
    const subject = await this.inReach(who, body.subjectCode, 'subjectCode')
    if (!(await hook.slot(who, subject.code)).confirmable) throw unconfirmable(subject.code)
    const contact = await hook.contactOf(subject.code, body.contactCode)
    if (!contact) {
      throw invalid({
        contactCode: [`${body.contactCode ?? ''} không phải người liên hệ của ${subject.code}.`],
      })
    }
    if (body.contactCode) await this.inReach(who, body.contactCode)
    const logged = this.logged
    const moveLead =
      subject.kind === 'LD' && logged
        ? (tx: Db) =>
            logged.afterLogged(tx, { subjectKind: 'LD', subjectCode: subject.code, actor: who })
        : undefined
    const opened = await this.records.open(
      {
        channel: body.channel,
        subjectCode: subject.code,
        ownerId: who.id,
        contactCode: contact.code,
        addresses: contact,
        sameLead: contact.sameLead,
      },
      moveLead,
    )
    return CommRecordCreateResponse.parse({
      debriefId: opened.debriefId,
      threadId: opened.threadId,
    })
  }

  /** What a confirm on this subject would ask, read before anything is written. */
  async target(who: Actor, q: DebriefTargetQuery): Promise<DebriefTargetResponse> {
    await this.inReach(who, q.subjectCode)
    const slot = this.hook ? await this.hook.slot(who, q.subjectCode) : null
    return DebriefTargetResponse.parse(slot ?? { stepTarget: null, confirmable: false })
  }

  async list(who: Actor, q: DebriefListQuery): Promise<DebriefListResponse> {
    let reads: DebriefRead[]
    if (q.subjectCode) {
      await this.inReach(who, q.subjectCode)
      reads = await this.repo.bySubject(q.subjectCode)
    } else {
      reads = await this.repo.bySubjects(await this.runInReach(who, q.workstreamCode ?? ''))
    }
    return DebriefListResponse.parse({
      rows: await this.views(who, reads, q.summary !== 'none'),
    })
  }

  async one(who: Actor, id: string): Promise<DebriefView> {
    const [view] = await this.views(who, [await this.readable(who, id)])
    if (!view) throw new Error(`comms.debrief ${id}: view lost`)
    return view
  }

  async pending(who: Actor, q: PendingDebriefQuery): Promise<PendingDebriefResponse> {
    const codes = q.workstreamCode
      ? ((await this.hook?.subjectsOfRun(q.workstreamCode)) ?? [])
      : undefined
    const { rows, total } =
      codes?.length === 0 ? { rows: [], total: 0 } : await this.repo.pending(who.id, codes, q)
    const turns = await this.repo.turnsCovered(rows.map((d) => d.row.id))
    const targets = await this.targetsOf(who, rows)

    return PendingDebriefResponse.parse({
      rows: rows.map((d) => ({
        id: d.row.id,
        thread: toThread(d.thread, d.messageCount),
        anchorMessageId: d.row.messageId,
        anchorAt: d.anchorAt.toISOString(),
        createdAt: d.row.createdAt.toISOString(),
        turnsCovered: turns.get(d.row.id) ?? 0,
        state: d.state,
        late: d.late,
        subject: { code: d.row.subjectCode, label: d.subjectLabel },
        stepTarget: targets.get(d.row.subjectCode) ?? null,
      })),
      total,
      hidden: 0,
    })
  }

  /** Counts are not row data, but an `ownOnly` seat reading colleagues' backlog
   *  would still be reading past its own axis, so it gets its own row only. */
  async counts(who: Actor): Promise<DebriefCountsResponse> {
    const rows = await this.repo.counts(who.ownOnly ? who.id : undefined)
    return DebriefCountsResponse.parse({
      rows: rows.map((r) => ({ ...r, oldestAt: r.oldestAt.toISOString() })),
    })
  }

  async close(who: Actor, id: string, body: DebriefClose): Promise<DebriefView> {
    const hook = this.hook
    /* Fail closed: the checks on answers, kind and subject live in the branch. */
    if (!hook) throw new Error('comms: COMM_DEBRIEF_HOOK is not bound; refusing to close unchecked')

    const found = await this.owned(who, id, true)
    const subjectCode = found.row.subjectCode
    const prepared = await hook.prepare(who, {
      subjectCode,
      answers: body.answers,
      step: body.step,
    })

    await this.repo.run(async (tx) => {
      if (!(await this.repo.lockOpen(tx, id))) throw conflict(DONE)

      const step = prepared.step
      await this.repo.close(tx, id, {
        title: body.title ?? null,
        summary: body.summary,
        nextKindId: step?.kind.id ?? null,
        nextKindName: step?.kind.name ?? null,
        nextText: step?.text ?? null,
        nextDue: step?.due ?? null,
      })
      await this.repo.insertAnswers(
        tx,
        prepared.answers.map((a) => ({ debriefId: id, ...a })),
      )
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code: subjectCode,
          note: `comms.debrief ${id} confirmed · thread ${found.row.threadId} · ${prepared.answers.length} answer(s)${step ? ` · step ${step.kind.id}` : ''}`,
        },
        tx,
      )
      await hook.apply(tx, who, prepared)
    })

    return this.one(who, id)
  }

  /** The owner, or anyone who reaches the subject. 404 before 403. */
  async readable(who: Actor, id: string): Promise<DebriefRead> {
    const found = await this.repo.byId(id)
    if (!found) throw notFound('liên hệ', id)
    if (found.row.ownerId !== who.id) await this.inReach(who, found.row.subjectCode)
    return found
  }

  /** The owner only; `open` also refuses a confirmed record. */
  async owned(who: Actor, id: string, open: boolean): Promise<DebriefRead> {
    const found = await this.repo.byId(id)
    if (!found) throw notFound('liên hệ', id)
    if (found.row.ownerId !== who.id) {
      throw denied('permission-denied', 'Chỉ người tạo liên hệ này mới sửa hoặc xác nhận được.')
    }
    if (open && found.row.closedAt) throw conflict(DONE)
    return found
  }

  /** `withSummary: false` withholds every summary, so nothing is read or audited. */
  private async views(
    who: Actor,
    reads: readonly DebriefRead[],
    withSummary = true,
  ): Promise<DebriefView[]> {
    const answers = await this.repo.answersOf(reads.map((r) => r.row.id))
    const targets = await this.targetsOf(who, reads)
    const views = reads.map((r) =>
      DebriefView.parse({
        ...toDebriefView(
          this.access,
          who,
          r,
          answers.get(r.row.id) ?? [],
          r.row.closedAt ? null : (targets.get(r.row.subjectCode) ?? null),
        ),
        ...(withSummary || r.row.summary === null ? {} : { summary: { state: 'hidden' } }),
      }),
    )
    /* A summary is content: revealing one leaves `trailContentRead`'s one line. */
    const shown = views.filter((v) => v.summary.state === 'visible')
    for (const code of new Set(shown.map((v) => v.subject.code))) {
      const ofCode = shown.filter((v) => v.subject.code === code)
      await this.audit.write({
        actorId: who.id,
        action: 'view',
        code,
        note: `comms.debrief · read summary of ${ofCode.length} record(s): ${ofCode.map((v) => v.id).join(', ')}`,
      })
    }
    return views
  }

  /** The branch's step slot per subject of the OPEN records; none without a hook. */
  private async targetsOf(who: Actor, reads: readonly DebriefRead[]) {
    const codes = [...new Set(reads.filter((r) => !r.row.closedAt).map((r) => r.row.subjectCode))]
    return this.hook && codes.length > 0 ? this.hook.targets(who, codes) : new Map()
  }

  /** The run's subjects the caller may view; the rest are left out, not refused,
   *  because a seat can reach the lead of a run whose contract it cannot. A run
   *  has no object row (no mirror), so reach is asked per subject only. */
  private async runInReach(who: Actor, workstreamCode: string): Promise<string[]> {
    const codes = (await this.hook?.subjectsOfRun(workstreamCode)) ?? []
    if (codes.length === 0) throw notFound('hành trình', workstreamCode)
    const rows = await Promise.all(codes.map((c) => this.threads.objectByCode(c)))
    return rows.flatMap((row) =>
      row && this.access.check(who, { ref: toObjectRef(row), action: 'view' }).ok ? [row.code] : [],
    )
  }

  /** E2 `view` on one object code; 404 and 403 apart, as `ThreadService` keeps
   *  them. `subjectField` also refuses a non-subject kind, before reach. */
  private async inReach(who: Actor, code: string, subjectField?: string): Promise<ObjectRow> {
    const row = await this.threads.objectByCode(code)
    if (!row) throw notFound('object', code)
    if (subjectField) refuseNonSubject(row, subjectField)
    const verdict = this.access.check(who, { ref: toObjectRef(row), action: 'view' })
    if (!verdict.ok) throw denied(verdict.reason, verdict.note)
    return row
  }
}

const DONE = 'Liên hệ này đã hoàn thiện.'
