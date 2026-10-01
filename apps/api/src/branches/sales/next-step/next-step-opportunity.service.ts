import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  NextStepResponse,
  type NextStepDoneBody,
  type NextStepSetBody,
  type ObjectCode,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { byOf, TouchService } from '../touch/touch.service'
import { dropStep } from './next-step.handover'
import { doneNote, toContract } from './next-step.mapper'
import { NextStepRepository } from './next-step.repository'
import { assertNextDiffers, liveKind } from './next-step.rules'
import type { StepWrite } from './next-step.service'
import { OpportunityStepRepository, type DealSlot } from './next-step-opportunity.repository'

/** The next step of an OPPORTUNITY (ADR 0069 §10): the lead door's four verbs on
 *  the same `sales.next_step` table and 3-level ladder.
 *
 *  A code out of scope answers the same 404 as a missing one, as every
 *  opportunity door does. Writes re-ask scope and liveness on the LOCKED deal
 *  row. A step belongs to an open deal: a stopped or signed one refuses writes
 *  and reads null — the stop and sign doors clear the row with `dropStep`. */
@Injectable()
export class OpportunityStepService {
  constructor(
    private readonly steps: NextStepRepository,
    private readonly deals: OpportunityStepRepository,
    private readonly touch: TouchService,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly actors: ActorRepository,
  ) {}

  async get(who: Actor, code: ObjectCode): Promise<NextStepResponse> {
    const slot = await this.deals.slot(who, code)
    if (!slot?.inScope) throw notFound('cơ hội', code)
    return answer(slot)
  }

  async set(who: Actor, code: ObjectCode, body: NextStepSetBody): Promise<NextStepResponse> {
    const reach = await this.reaches(body.doerId)
    const slot = await this.steps.run(async (tx) => {
      await this.write(tx, who, code, { next: body }, reach)
      return this.deals.slot(who, code, tx)
    })
    return answer(slot)
  }

  async done(who: Actor, code: ObjectCode, body: NextStepDoneBody): Promise<NextStepResponse> {
    assertNextDiffers(body.closing, body.next)
    const reach = await this.reaches(body.next?.doerId)
    const slot = await this.steps.run(async (tx) => {
      await this.write(tx, who, code, body, reach)
      return this.deals.slot(who, code, tx)
    })
    return answer(slot)
  }

  /** `NextStepService.write` on a deal, same contract: `closing` must be the
   *  step under the lock, so a doubled press logs one touch. Runs in the
   *  caller's `tx` — a door's own, or the comm close-out's (ADR 0074 §7). */
  async write(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    op: StepWrite,
    reach: DoerReach | null,
  ): Promise<void> {
    await this.lockOpen(tx, who, code)
    if (op.closing) {
      const current = (await this.deals.slot(who, code, tx))?.step
      if (!current || current.text !== op.closing.text || current.due !== op.closing.due) {
        throw conflict(
          `Việc tiếp theo của cơ hội ${code} đã được đánh dấu xong hoặc đã đổi — tải lại để xem việc hiện tại.`,
        )
      }
      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'opportunity',
          kind: 'next-step-done',
          ...byOf(who),
          note: doneNote(current.text),
        },
      ])
    }
    if (op.next) await this.put(tx, who, code, op.next, reach)
    else await dropStep(tx, code)
  }

  /** Idempotent: clearing a deal that has no step is not an error. */
  async clear(who: Actor, code: ObjectCode): Promise<NextStepResponse> {
    await this.steps.run(async (tx) => {
      await this.lockOpen(tx, who, code)
      await dropStep(tx, code)
    })
    return { step: null }
  }

  /** `doerId` absent = the deal's holder (`holderOf`: a seller, else the
   *  acceptor, else a BD), or the caller when nobody holds it. Another person
   *  must be a live Sales actor who can open the deal: an owner, or anyone when
   *  neither side is `ownOnly`. */
  private async put(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    body: NextStepSetBody,
    reach: DoerReach | null,
  ): Promise<void> {
    const holderId = (await this.deals.holderOf(code, tx)) ?? who.id
    const doerId = body.doerId ?? holderId
    if (!(await this.steps.isLiveSalesActor(tx, doerId))) {
      throw invalid(
        { doerId: ['Người làm phải là nhân sự Sales đang hoạt động — chọn lại người làm.'] },
        'Người làm không hợp lệ.',
      )
    }
    if (doerId !== holderId && doerId !== who.id) {
      const owns = await this.deals.isOwner(tx, code, doerId)
      const open = reach !== null && reach.canView && (owns || (!reach.ownOnly && !who.ownOnly))
      if (!open) {
        throw invalid(
          {
            doerId: [
              'Người này không mở được cơ hội này — chọn người đứng tên cơ hội hoặc thêm họ vào cơ hội trước.',
            ],
          },
          'Người làm không mở được cơ hội này.',
        )
      }
    }
    if (body.kindId !== undefined) await liveKind(this.steps, body.kindId, tx)
    await this.steps.put(tx, {
      subjectCode: code,
      text: body.text,
      due: body.due,
      doerId,
      createdBy: who.id,
      kindId: body.kindId ?? null,
    })
  }

  /** What the doer's role allows, asked BEFORE the transaction: `ActorRepository`
   *  reads on the pool, and inside the tx that waits on PGlite's one connection.
   *  Whether they stand on the deal is asked inside, under the lock. */
  async reaches(doerId: string | undefined): Promise<DoerReach | null> {
    if (doerId === undefined) return null
    const doer = (await this.actors.byId(doerId))?.actor
    if (!doer) return null
    return {
      ownOnly: doer.ownOnly === true,
      canView: this.access.check(doer, { branch: 'Sales', permission: 'opportunity.view' }).ok,
    }
  }

  /** Exists, in scope, still open — refused in that order. */
  private async lockOpen(tx: Db, who: Actor, code: ObjectCode): Promise<void> {
    const row = await this.deals.lock(tx, who, code)
    if (!row?.inScope) throw notFound('cơ hội', code)
    if (!row.open) {
      throw conflict(
        `Cơ hội ${code} ${row.signed ? 'đã thành hợp đồng' : 'đã dừng'} — chỉ cơ hội đang chạy mới có việc tiếp theo.`,
      )
    }
  }
}

export type DoerReach = { ownOnly: boolean; canView: boolean }

/** A step left on a deal that has stopped or signed is not shown. */
function answer(slot: DealSlot | null): NextStepResponse {
  const step = slot?.step && slot.open ? toContract(slot.step, slot.today) : null
  return NextStepResponse.parse({ step })
}
