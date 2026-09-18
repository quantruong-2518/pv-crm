import { sql } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type {
  LeadExitBody,
  LeadNurtureBody,
  LeadProfile,
  LeadVerifyBody,
  ObjectCode,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'
import { LeadStateWriter, stateOnReopen } from './lead-state'
import { LeadWriteRepository } from './lead-write.repository'

/** The lifecycle doors a person presses (ADR 0058): exit and reopen (ADR 0057
 *  §2 — direct, no E3, because each undoes the other), verify, nurture and
 *  resume. Each locks the row, checks the state it leaves, moves it through
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
  ) {}

  /** `POST /sales/leads/:code/exit` — from any open state, or from `converted`
   *  once its deals are lost (how a run closes LOST). */
  async exit(who: Actor, code: ObjectCode, body: LeadExitBody): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state === 'disqualified') throw conflict(`Lead ${code} đã rời phễu rồi.`)
      if (held.state === 'archived') {
        throw conflict(`Lead ${code} đã được lưu trữ — không cần cho rời phễu nữa.`)
      }
      if (held.openDeal) {
        throw conflict(`Lead ${code} còn cơ hội đang mở — đóng cơ hội trước khi cho lead rời phễu.`)
      }
      if (held.signed) throw conflict(`Lead ${code} đã ký hợp đồng — không cho rời phễu được.`)

      await this.states.move(tx, code, 'disqualified', {
        exitReason: body.reason,
        /* The DB clock, same as the `state_since` this move stamps. */
        exitedAt: sql`now()`,
      })
      await this.record(tx, who, code, 'exited', LEAD_NOTE.exited(body.reason, body.note))
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

  /** `POST /sales/leads/:code/verify` — `verifying` → `working`, with the tier. */
  async verify(who: Actor, code: ObjectCode, body: LeadVerifyBody): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state !== 'verifying') {
        throw conflict(
          `Lead ${code} không ở bước xác minh — chỉ lead đang xác minh mới chốt bậc được.`,
        )
      }

      await this.states.move(tx, code, 'working', { tier: body.tier })
      await this.record(tx, who, code, 'verified', LEAD_NOTE.verified(body.tier), body.tier)
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
          `Lead ${code} không ở bước xác minh hay đang chăm — chỉ hai bước đó chuyển nuôi dài hạn được.`,
        )
      }

      await this.states.move(tx, code, 'nurturing')
      await this.record(tx, who, code, 'nurtured', LEAD_NOTE.nurtured(body.note))
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/resume` — `nurturing` → `working`, or back to
   *  `verifying` when it was parked before a tier was ever set. */
  async resume(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state !== 'nurturing') {
        throw conflict(`Lead ${code} không ở trạng thái nuôi dài hạn nên không có gì để chăm lại.`)
      }

      await this.states.move(tx, code, held.tier === null ? 'verifying' : 'working')
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
    toTier?: TouchEntry['toTier'],
  ): Promise<void> {
    await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'lead',
        kind,
        ...(toTier ? { toTier } : {}),
        ...byOf(who),
        note,
      },
    ])
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
