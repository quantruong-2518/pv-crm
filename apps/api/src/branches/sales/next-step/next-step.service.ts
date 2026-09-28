import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  LEAD_OPEN_STATES,
  LEAD_STATE_LABEL,
  NextStepResponse,
  type LeadState,
  type NextStepDoneBody,
  type NextStepSetBody,
  type ObjectCode,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { LeadService } from '../lead/lead.service'
import { byOf, TouchService } from '../touch/touch.service'
import { dropStep } from './next-step.handover'
import { doneNote, toContract } from './next-step.mapper'
import { NextStepRepository, type NextStepSlot } from './next-step.repository'

/** The next step of a LEAD (flow G1–G3): read, set, mark done, clear.
 *
 *  Reads go through `LeadService.guard` — the one copy of the lead scope rule.
 *  Writes re-ask the same question on the LOCKED lead row (`lockOpen`), the
 *  `LeadExitService.lockRow` pattern: a lead handed away between the read and
 *  the write must not be written by an `ownOnly` actor who no longer holds it.
 *
 *  A step belongs to a lead still in the funnel (`LEAD_OPEN_STATES`): writes on
 *  any other state are refused, and a read of one answers null. `dueLevel` is
 *  graded against the Vietnam day the database reads with the row. */
@Injectable()
export class NextStepService {
  constructor(
    private readonly repo: NextStepRepository,
    private readonly leads: LeadService,
    private readonly touch: TouchService,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly actors: ActorRepository,
  ) {}

  async get(who: Actor, code: ObjectCode): Promise<NextStepResponse> {
    await this.leads.guard(who, code)
    return answer(await this.repo.slot(code))
  }

  async set(who: Actor, code: ObjectCode, body: NextStepSetBody): Promise<NextStepResponse> {
    const reach = await this.reaches(body.doerId)
    const slot = await this.repo.run(async (tx) => {
      const held = await this.lockOpen(tx, who, code)
      await this.put(tx, who, code, held.ownerId, body, reach)
      return this.repo.slot(code, tx)
    })
    return answer(slot)
  }

  /** `closing` must be the step standing under the lock: a retried or doubled
   *  press finds another step (or none) and is refused, so one piece of work
   *  logs one touch. The touch is written here, while the text is still known. */
  async done(who: Actor, code: ObjectCode, body: NextStepDoneBody): Promise<NextStepResponse> {
    /* A `next` equal to `closing` would pass the closing check on a replay. */
    if (body.next?.text === body.closing.text && body.next.due === body.closing.due) {
      throw invalid(
        { next: ['Việc tiếp theo mới trùng với việc vừa xong — đổi nội dung hoặc hạn.'] },
        'Việc tiếp theo mới trùng với việc vừa xong.',
      )
    }
    const reach = await this.reaches(body.next?.doerId)
    const slot = await this.repo.run(async (tx) => {
      const held = await this.lockOpen(tx, who, code)
      const current = (await this.repo.slot(code, tx))?.step
      if (!current || current.text !== body.closing.text || current.due !== body.closing.due) {
        throw conflict(
          `Việc tiếp theo của lead ${code} đã được đánh dấu xong hoặc đã đổi — tải lại để xem việc hiện tại.`,
        )
      }

      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: 'next-step-done',
          ...byOf(who),
          note: doneNote(current.text),
        },
      ])

      if (body.next) await this.put(tx, who, code, held.ownerId, body.next, reach)
      else await dropStep(tx, code)
      return this.repo.slot(code, tx)
    })
    return answer(slot)
  }

  /** Idempotent: clearing a lead that has no step is not an error. */
  async clear(who: Actor, code: ObjectCode): Promise<NextStepResponse> {
    await this.repo.run(async (tx) => {
      await this.lockOpen(tx, who, code)
      await dropStep(tx, code)
    })
    return { step: null }
  }

  /** `doerId` absent = the holder at THIS moment, read off the locked row.
   *  Naming anyone else is giving work to a colleague — `setOwner`'s fence. */
  private async put(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    holderId: string | null,
    body: NextStepSetBody,
    reach: boolean,
  ): Promise<void> {
    const doerId = body.doerId ?? holderId
    if (doerId === null) {
      throw invalid(
        { doerId: [`Lead ${code} chưa có người giữ — chọn người làm việc tiếp theo.`] },
        'Chưa có người làm việc tiếp theo.',
      )
    }
    if (doerId !== holderId && !this.access.allows(who, 'lead.assign')) {
      throw denied(
        'out-of-scope',
        'Bạn chỉ đặt việc tiếp theo cho người đang giữ lead. Giao việc cho người khác là việc của trưởng phòng.',
      )
    }
    if (!(await this.repo.isLiveSalesActor(tx, doerId))) {
      throw invalid(
        { doerId: ['Người làm phải là nhân sự Sales đang hoạt động — chọn lại người làm.'] },
        'Người làm không hợp lệ.',
      )
    }
    if (doerId !== holderId && !reach) {
      throw invalid(
        {
          doerId: [
            'Người này chỉ thấy lead đứng tên mình nên sẽ không mở được việc này — chọn người khác hoặc giao lead cho họ.',
          ],
        },
        'Người làm không mở được lead này.',
      )
    }
    await this.repo.put(tx, {
      subjectCode: code,
      text: body.text,
      due: body.due,
      doerId,
      createdBy: who.id,
    })
  }

  /** A doer who is not the holder must be able to open the lead to do the step:
   *  `lead.view` through E2 and no `ownOnly`, off the same `Actor` the session
   *  builds — the two axes the guard and `lockOpen` ask of a caller. Asked
   *  BEFORE the transaction: `ActorRepository` reads on the pool, and inside the
   *  tx that waits on PGlite's single connection forever. No `doerId` = the
   *  holder, who needs no check. */
  private async reaches(doerId: string | undefined): Promise<boolean> {
    if (doerId === undefined) return true
    const doer = (await this.actors.byId(doerId))?.actor
    if (!doer || doer.ownOnly) return false
    return this.access.check(doer, { branch: 'Sales', permission: 'lead.view' }).ok
  }

  /** Exists, in scope, still in the funnel — refused in that order. */
  private async lockOpen(tx: Db, who: Actor, code: ObjectCode) {
    const row = await this.repo.lockLead(tx, code)
    if (!row) throw notFound('lead', code)
    if (who.ownOnly && row.ownerId !== who.id) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }
    if (!isOpen(row.state)) {
      throw conflict(
        `Lead ${code} đang ở “${LEAD_STATE_LABEL[row.state]}” — chỉ lead còn trong phễu mới có việc tiếp theo.`,
      )
    }
    return row
  }
}

const isOpen = (state: LeadState): boolean =>
  (LEAD_OPEN_STATES as readonly LeadState[]).includes(state)

/** A step left on a lead that has left the funnel is not shown: it is nobody's
 *  work any more, whatever the row still says. */
function answer(slot: NextStepSlot | null): NextStepResponse {
  const step = slot?.step && isOpen(slot.state) ? toContract(slot.step, slot.today) : null
  return NextStepResponse.parse({ step })
}
