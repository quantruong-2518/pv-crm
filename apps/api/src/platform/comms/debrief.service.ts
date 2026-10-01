import { Inject, Injectable, Optional } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  DebriefCountsResponse,
  DebriefView,
  PendingDebriefResponse,
  type DebriefClose,
  type PendingDebriefQuery,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { COMM_DEBRIEF_HOOK, type CommDebriefHook } from './comm-debrief.hook'
import { anyInReach, toDebriefView, toThread } from './comms.mapper'
import { DebriefRepository } from './debrief.repository'
import { ThreadRepository } from './thread.repository'

/** Comm close-out (ADR 0074): the owner's queue, the managers' counts, and the
 *  close itself.
 *
 *  The OWNER fence replaces thread reach here: the owner was in the conversation,
 *  so a hand-over that moves the thread out of their reach must not strand their
 *  debrief. Linked codes are still the in-reach ones only (`anyInReach`), so
 *  neither the queue nor the branch hook is handed a colleague's object, and an
 *  owner with none left closes without a step.
 *
 *  Closing is validated by the branch (`CommDebriefHook.prepare`) BEFORE the
 *  transaction, because the branch reads on the pool and PGlite has one
 *  connection; the debrief, its answers, the audit line and the branch's step
 *  write then commit together. */
@Injectable()
export class DebriefService {
  constructor(
    private readonly repo: DebriefRepository,
    private readonly threads: ThreadRepository,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Optional() @Inject(COMM_DEBRIEF_HOOK) private readonly hook?: CommDebriefHook,
  ) {}

  async pending(who: Actor, q: PendingDebriefQuery): Promise<PendingDebriefResponse> {
    const open = await this.repo.openOf(who.id)
    const codesOf = await this.reachableCodes(
      who,
      open.map((d) => d.row.threadId),
    )
    const page = open.slice((q.page - 1) * q.size, q.page * q.size)

    const turns = await this.repo.turnsCovered(page.map((d) => d.row.id))
    const rows = await Promise.all(
      page.map(async (d) => {
        const tally = await this.threads.threadById(d.row.threadId)
        if (!tally) throw new Error(`comms.debrief ${d.row.id}: thread vanished`)
        const linkedCodes = codesOf.get(d.row.threadId) ?? []
        return {
          id: d.row.id,
          thread: toThread(tally.row, tally.messageCount),
          anchorMessageId: d.row.messageId,
          anchorAt: d.anchorAt.toISOString(),
          turnsCovered: turns.get(d.row.id) ?? 0,
          linkedCodes,
          stepTargets: this.hook ? await this.hook.targets(who, linkedCodes) : [],
        }
      }),
    )

    return PendingDebriefResponse.parse({
      rows,
      total: open.length,
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
    /* Fail closed: the checks on answers, kind and target live in the branch. */
    if (!hook) throw new Error('comms: COMM_DEBRIEF_HOOK is not bound; refusing to close unchecked')

    const found = await this.repo.byId(id)
    if (!found) throw notFound('phiên chốt comm', id)
    if (found.row.ownerId !== who.id) {
      throw denied('permission-denied', 'Chỉ người đã ghi comm này mới chốt được.')
    }
    if (found.row.closedAt) throw conflict('Comm này đã được chốt rồi.')

    const linkedCodes =
      (await this.reachableCodes(who, [found.row.threadId])).get(found.row.threadId) ?? []
    const prepared = await hook.prepare(who, {
      linkedCodes,
      answers: body.answers,
      step: body.step,
    })

    const answers = await this.repo.run(async (tx) => {
      if (!(await this.repo.lockOpen(tx, id))) throw conflict('Comm này đã được chốt rồi.')

      const step = prepared.step
      await this.repo.close(tx, id, {
        summary: body.summary,
        nextSubjectCode: step?.subjectCode ?? null,
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
          ...(step ? { code: step.subjectCode } : {}),
          note: `comms.debrief ${id} closed · thread ${found.row.threadId} · ${prepared.answers.length} answer(s)${step ? ` · step ${step.kind.id}` : ''}`,
        },
        tx,
      )
      await hook.apply(tx, who, prepared)

      return this.repo.answersOf(id, tx)
    })

    const closed = await this.repo.byId(id)
    if (!closed) throw new Error(`comms.debrief ${id}: row vanished after close`)
    return DebriefView.parse(toDebriefView(this.access, who, closed, answers))
  }

  /** Thread id → the link codes this caller can see, asked per object with
   *  `anyInReach`, the check `ThreadService` applies to a whole thread. */
  private async reachableCodes(who: Actor, threadIds: readonly string[]) {
    const codesOf = await this.repo.linkCodesOf([...new Set(threadIds)])
    const all = [...new Set([...codesOf.values()].flat())]
    const objects = new Map((await this.threads.objectsByCodes(all)).map((o) => [o.code, o]))

    const reachable = new Map<string, string[]>()
    for (const [threadId, codes] of codesOf) {
      reachable.set(
        threadId,
        codes.filter((c) => {
          const o = objects.get(c)
          return o !== undefined && anyInReach(this.access, who, [o])
        }),
      )
    }
    return reachable
  }
}
