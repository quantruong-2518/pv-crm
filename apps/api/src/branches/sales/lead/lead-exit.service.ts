import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LEAD_STATE_LABEL,
  LEAD_STOP_REASON_OTHER,
  type LeadNurtureBody,
  type LeadProfile,
  type LeadState,
  type ObjectCode,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { MeetingCancel } from '../meeting/meeting-cancel'
import type { MeetingRowDb } from '../meeting/meeting.schema'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadService } from './lead.service'
import { LeadStateWriter } from './lead-state'
import { LeadWriteRepository } from './lead-write.repository'

/** A lead as `lockForMove` hands it to a door, under the row lock. */
export type LockedLead = NonNullable<Awaited<ReturnType<LeadWriteRepository['lockForMove']>>>

/** States the park door takes a lead from; `converted` only with nothing live. */
const PARKABLE: readonly LeadState[] = ['new', 'assigned', 'verifying', 'working', 'converted']

/** A pool lead has no holder to call or hand over; the claim is its way out. */
const IN_POOL = 'Lead đang ở Nhóm chờ chăm sóc. Bấm Nhận lead để chăm lại.'

/** The lifecycle doors a person presses (ADR 0058, 0063, 0109): confirm
 *  contact, park into the `nurturing` pool, claim out of it. Each locks the
 *  row, checks the state it leaves, moves it through `LeadStateWriter` with its
 *  timeline row in one transaction, then answers with the profile read back
 *  through `LeadService.profile`. A park is refused while a deal on the lead
 *  is still worked or a contract on it is live. */
@Injectable()
export class LeadExitService {
  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly profiles: LeadService,
    private readonly touch: TouchService,
    private readonly states: LeadStateWriter,
    private readonly meetings: MeetingCancel,
  ) {}

  /** `POST /sales/leads/:code/contacted` — confirm that the phone call really
   *  happened. Opening a `tel:` URL alone proves nothing, so the screen asks
   *  for this short second press. It records every valid call and, being a real
   *  exchange, moves `assigned|verifying` → `working` (ADR 0068). */
  async contacted(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state === 'nurturing') throw conflict(IN_POOL)

      await this.states.exchanged(tx, [code], who.id)
      await this.record(tx, who, code, 'contacted', LEAD_NOTE.contacted)
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/nurture` — THE park door (ADR 0109). */
  async nurture(who: Actor, code: ObjectCode, body: LeadNurtureBody): Promise<LeadProfile> {
    const gone = await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      return this.park(tx, who, code, held, body)
    })
    await this.meetings.forgetCancelled(gone)

    return this.profiles.profile(who, code)
  }

  /** The park door's verdict and write on a row the caller locked — the hold's
   *  "to waiting" end runs it too. Returns the meetings it cancelled, for the
   *  caller to `forgetCancelled` after its commit. */
  async park(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    held: LockedLead,
    body: LeadNurtureBody,
  ): Promise<MeetingRowDb[]> {
    const waiting = `“${LEAD_STATE_LABEL.nurturing}”`
    if (!PARKABLE.includes(held.state)) {
      throw conflict(
        `Lead ${code} đang ở “${LEAD_STATE_LABEL[held.state]}” nên không chuyển vào ${waiting} được.`,
      )
    }
    if (held.state === 'converted' && (held.openDeal || held.signed)) {
      throw conflict(
        `Lead ${code} còn cơ hội đang chạy hoặc hợp đồng còn hiệu lực nên không chuyển vào ${waiting} được.`,
      )
    }
    await this.assertReason(tx, body.reasonKey)

    await this.states.parked(tx, code, {
      by: who,
      reasonId: body.reasonKey,
      note: LEAD_NOTE.nurtured(body.reasonKey, body.note),
      actorId: who.id,
    })
    return this.meetings.cancelFor(tx, who, [code], 'lead-nurtured')
  }

  /** `POST /sales/leads/:code/resume` — the claim: the caller takes a pool
   *  lead and it stands on the rung its trail proves, floor `assigned`. */
  async resume(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code, true)
      if (held.state !== 'nurturing') {
        throw conflict(`Lead ${code} không ở “${LEAD_STATE_LABEL.nurturing}” nên không nhận được.`)
      }

      await this.states.move(tx, code, held.reached, { ownerId: who.id })
      await this.record(tx, who, code, 'resumed', LEAD_NOTE.resumed)
    })

    return this.profiles.profile(who, code)
  }

  private async record(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    kind: TouchEntry['kind'],
    note: string,
  ): Promise<void> {
    await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'lead',
        kind,
        ...byOf(who),
        note,
      },
    ])
  }

  /** The park picks from the `EXIT_REASON` catalogue (ADR 0070); `other` is
   *  virtual — no row — and the contract already demanded its note. */
  private async assertReason(tx: Db, reasonKey: string): Promise<void> {
    if (reasonKey === LEAD_STOP_REASON_OTHER) return
    if (!(await this.repo.stopReasonLive(tx, reasonKey))) {
      throw conflict('Không tìm thấy lý do này. Chọn lại.')
    }
  }

  /** The row under lock, judged ON it: the same two refusals, in the same words,
   *  as `LeadWriteService.patch` — 404 for no live lead, 403 for an `ownOnly`
   *  actor who does not hold it (`claim`: nor is it in the shared pool). The only scope check these
   *  doors make, so a lead handed away meanwhile is refused. Public for the hold
   *  and label doors. Only a lead the caller moves is locked; the 404/403 split
   *  is read after. */
  async lockRow(tx: Db, who: Actor, code: ObjectCode, claim = false): Promise<LockedLead> {
    const row = await this.repo.lockForMove(tx, code, who, claim)
    if (row) return row
    if (!(await this.repo.isLive(tx, code))) throw notFound('lead', code)
    throw denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)
  }
}
