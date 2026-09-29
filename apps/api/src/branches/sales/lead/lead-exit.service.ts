import { sql } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LEAD_STATE_LABEL,
  LEAD_STOP_REASON_OTHER,
  type LeadExitBody,
  type LeadNurtureBody,
  type LeadProfile,
  type ObjectCode,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'
import {
  LEAD_GONE_WORDS,
  LEAD_NURTURED_WITHHOLD,
  LeadStateWriter,
  stateByWork,
  stateOnReopen,
} from './lead-state'
import { LeadWriteRepository } from './lead-write.repository'

/** The lifecycle doors a person presses (ADR 0058, 0063): confirm contact, exit
 *  and reopen (ADR 0057 §2 — direct, no E3, because each undoes the other),
 *  nurture and resume. Each locks the row, checks the state it leaves, moves it through
 *  `LeadStateWriter` with its timeline row in one transaction, then answers
 *  with the profile read back through `LeadService.profile`.
 *
 *  Exit is refused while the lead still has an open deal or is signed: a lead
 *  cannot be "dead" while a deal on it is being worked or has closed won. */
@Injectable()
export class LeadExitService {
  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly profiles: LeadService,
    private readonly touch: TouchService,
    private readonly states: LeadStateWriter,
    private readonly runs: WorkstreamRepository,
    private readonly mailRuns: MailRunRepository,
  ) {}

  /** `POST /sales/leads/:code/contacted` — confirm that the phone call really
   *  happened. Opening a `tel:` URL alone proves nothing, so the screen asks
   *  for this short second press. It records every valid call and, being a real
   *  exchange, moves `assigned|verifying|nurturing` → `working` (ADR 0068). */
  async contacted(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state === 'disqualified') {
        throw conflict(
          `Lead ${code} đang ở trạng thái ${LEAD_GONE_WORDS} — không ghi cuộc gọi mới được.`,
        )
      }

      await this.states.exchanged(tx, [code], who.id)
      await this.record(tx, who, code, 'contacted', LEAD_NOTE.contacted)
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/exit` — from any open state, or from `converted`
   *  once its deals are lost (how a run closes LOST). */
  async exit(who: Actor, code: ObjectCode, body: LeadExitBody): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state === 'disqualified') throw conflict(`Lead ${code} đã rời phễu rồi.`)
      if (held.openDeal) {
        throw conflict(`Lead ${code} còn cơ hội đang mở — đóng cơ hội trước khi cho lead rời phễu.`)
      }
      if (held.signed) throw conflict(`Lead ${code} đã ký hợp đồng — không cho rời phễu được.`)
      await this.assertReason(tx, body.reasonKey)

      await this.states.move(tx, code, 'disqualified', {
        exitReason: body.reasonKey,
        /* The DB clock, same as the `state_since` this move stamps. */
        exitedAt: sql`now()`,
      })
      await this.record(tx, who, code, 'exited', LEAD_NOTE.exited(body.reasonKey, body.note), {
        reasonId: body.reasonKey,
      })
      /* A timed letter or a queued wave must not reach a customer a person just
         stopped caring for (ADR 0068 §5); reopen does not release them. */
      await this.mailRuns.withholdSubject(
        tx,
        { aggregateType: 'lead', aggregateId: code },
        { code: 'lead-disqualified', summary: 'lead đã ngừng chăm sóc: thư chưa gửi bị giữ lại' },
      )
      if (held.workstreamCode) await this.runs.syncClosed(tx, [held.workstreamCode])
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/reopen` — the state is recomputed from facts
   *  (`stateOnReopen`), not restored. */
  async reopen(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state !== 'disqualified') {
        throw conflict(`Lead ${code} chưa rời phễu nên không có gì để mở lại.`)
      }

      await this.states.move(tx, code, stateOnReopen(held), { exitReason: null, exitedAt: null })
      await this.record(tx, who, code, 'reopened', LEAD_NOTE.reopened)
      if (held.workstreamCode) await this.runs.syncClosed(tx, [held.workstreamCode])
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/nurture` — `verifying|working` → `nurturing`. */
  async nurture(who: Actor, code: ObjectCode, body: LeadNurtureBody): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state !== 'verifying' && held.state !== 'working') {
        throw conflict(
          `Lead ${code} không ở “${LEAD_STATE_LABEL.verifying}” hay “${LEAD_STATE_LABEL.working}” — chỉ hai bước đó chuyển sang “${LEAD_STATE_LABEL.nurturing}” được.`,
        )
      }
      await this.assertReason(tx, body.reasonKey)

      await this.states.move(tx, code, 'nurturing')
      /* The reason lives on the touch, not the lead: nurturing loops in place,
         and a column on the lead would be overwritten by the next park (ADR 0070). */
      await this.record(tx, who, code, 'nurtured', LEAD_NOTE.nurtured(body.reasonKey, body.note), {
        reasonId: body.reasonKey,
      })
      /* Parked means parked: a timed letter must not undo it (ADR 0068). */
      await this.mailRuns.withholdSubject(
        tx,
        { aggregateType: 'lead', aggregateId: code },
        LEAD_NURTURED_WITHHOLD,
      )
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/resume` — `nurturing` → `working` when an exchange
   *  was ever logged, else back to `verifying`. Nurture is only reachable from
   *  those two, so `verifying` is the floor. */
  async resume(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state !== 'nurturing') {
        throw conflict(
          `Lead ${code} không ở “${LEAD_STATE_LABEL.nurturing}” nên không có gì để chăm lại.`,
        )
      }

      await this.states.move(tx, code, stateByWork(held.reached === 'working'))
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
    extra: Pick<TouchEntry, 'reasonId'> = {},
  ): Promise<void> {
    await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'lead',
        kind,
        ...byOf(who),
        note,
        ...extra,
      },
    ])
  }

  /** Both stop doors pick from the `EXIT_REASON` catalogue (ADR 0070); `other`
   *  is virtual — no row — and the contract already demanded its note. */
  private async assertReason(tx: Db, reasonKey: string): Promise<void> {
    if (reasonKey === LEAD_STOP_REASON_OTHER) return
    if (!(await this.repo.stopReasonLive(tx, reasonKey))) {
      throw conflict('Lý do không có trong danh mục lý do dừng chăm sóc — chọn lại lý do.')
    }
  }

  /** The same two refusals, in the same words, as `LeadWriteService.patch`. */
  private async inScope(who: Actor, code: ObjectCode) {
    const found = await this.leads.byCode(who, code)
    if (!found) throw notFound('lead', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }
    return found
  }

  /** The row under lock, with scope re-checked ON it: `inScope` read the pool
   *  before the tx, and a lead handed away since then must not be moved by an
   *  `ownOnly` actor who no longer holds it. */
  private async lockRow(tx: Db, who: Actor, code: ObjectCode) {
    const row = await this.repo.lockForMove(tx, code)
    if (!row) throw notFound('lead', code)
    if (who.ownOnly && row.ownerId !== who.id) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }
    return row
  }
}
