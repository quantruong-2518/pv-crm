import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { LeadExitBody, LeadProfile, ObjectCode } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { byOf, TouchService } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LEAD_NOTE } from './lead-write.mapper'
import { toRef } from './lead.mapper'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'
import { LeadWriteRepository } from './lead-write.repository'

/** A lead leaving the funnel, and coming back — the Sale's own call, no E3,
 *  because both directions undo each other (ADR 0057 §2).
 *
 *  Refused while the lead still has an open deal or is signed: a lead cannot be
 *  "dead" while a deal on it is being worked or has closed won. Each door writes
 *  the lead row, its timeline row and the run's end in one transaction, then
 *  answers with the profile read back through `LeadService.profile`.
 *
 *  `stage` is set NULL on exit (`lead_exit_no_stage`) and NOT restored on
 *  reopen: no door writes a lead's funnel column — the deal board owns
 *  columns — so there is nothing true to restore. `stage_since` restarts at
 *  reopen, because it marks "since when the lead stands where it is now". */
@Injectable()
export class LeadExitService {
  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly profiles: LeadService,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly runs: WorkstreamRepository,
  ) {}

  /** `POST /sales/leads/:code/exit`. */
  async exit(who: Actor, code: ObjectCode, body: LeadExitBody): Promise<LeadProfile> {
    const found = await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, code)
      if (held.exitReason !== null) throw conflict(`Lead ${code} đã rời phễu rồi.`)
      if (held.openDeal) {
        throw conflict(`Lead ${code} còn cơ hội đang mở — đóng cơ hội trước khi cho lead rời phễu.`)
      }
      if (held.signed) throw conflict(`Lead ${code} đã ký hợp đồng — không cho rời phễu được.`)

      await this.repo.patchLead(tx, code, {
        exitReason: body.reason,
        exitedAt: new Date(),
        stage: null,
      })
      /* The mirror row's `state` is the funnel column, which exit clears. */
      await this.mirror.put(tx, toRef({ ...found.row, stage: null }, found.ownerName))
      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: 'exited',
          ...byOf(who),
          note: LEAD_NOTE.exited(body.reason, body.note),
        },
      ])
      if (held.workstreamCode) await this.runs.syncClosed(tx, [held.workstreamCode])
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/reopen`. No mirror write: `stage` stays NULL, so
   *  the ref exit left behind is still true. */
  async reopen(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, code)
      if (held.exitReason === null) {
        throw conflict(`Lead ${code} chưa rời phễu nên không có gì để mở lại.`)
      }

      await this.repo.patchLead(tx, code, {
        exitReason: null,
        exitedAt: null,
        stageSince: new Date(),
      })
      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: 'reopened',
          ...byOf(who),
          note: LEAD_NOTE.reopened,
        },
      ])
      if (held.workstreamCode) await this.runs.syncClosed(tx, [held.workstreamCode])
    })

    return this.profiles.profile(who, code)
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

  private async lockRow(tx: Db, code: ObjectCode) {
    const row = await this.repo.lockForExit(tx, code)
    if (!row) throw notFound('lead', code)
    return row
  }
}
