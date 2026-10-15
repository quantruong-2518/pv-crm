import { sql } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import { LEAD_REOPENED, LEAD_RESUMED, LEAD_STOPPED, type Actor } from '@pv/engines'
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
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { endHolds } from '../hold/hold.sql'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'
import { LEAD_GONE_WORDS, LeadStateWriter, stateByWork, stateOnReopen } from './lead-state'
import { LeadWriteRepository } from './lead-write.repository'

/** A lead as `lockForMove` hands it to a door, under the row lock. */
export type LockedLead = NonNullable<Awaited<ReturnType<LeadWriteRepository['lockForMove']>>>

/** These doors' scope on a locked row: an `ownOnly` actor moves only a lead they
 *  hold. Exported for the deal stop, which may stop the lead (owner, 15/10/2026). */
export const movesLead = (who: Pick<Actor, 'id' | 'ownOnly'>, ownerId: string | null): boolean =>
  !who.ownOnly || ownerId === who.id

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
    private readonly hub: NotificationHub,
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
          `Lead ${code} đang ở trạng thái ${LEAD_GONE_WORDS}. Không ghi được cuộc gọi.`,
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
    const label = (await this.inScope(who, code)).row.company

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state === 'disqualified') throw conflict(`Lead ${code} đã rời phễu.`)
      if (held.openDeal) {
        throw conflict(`Lead ${code} còn cơ hội đang mở. Đóng cơ hội trước.`)
      }
      if (held.signed) throw conflict(`Lead ${code} đã ký hợp đồng, không rời phễu được.`)
      await this.disqualify(tx, who, code, { ...held, label }, body)
    })

    return this.profiles.profile(who, code)
  }

  /** The exit door's write on a row the caller locked and judged — the deal
   *  stop runs it too when its stopper picks `disqualified` for the lead of
   *  its last live deal (owner, 15/10/2026). A lead nobody holds stays so. */
  async disqualify(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    held: Pick<LockedLead, 'ownerId' | 'workstreamCode'> & { label: string },
    body: LeadExitBody,
  ): Promise<void> {
    await this.assertReason(tx, body.reasonKey)

    await this.states.move(tx, code, 'disqualified', {
      exitReason: body.reasonKey,
      /* The DB clock, same as the `state_since` this move stamps. */
      exitedAt: sql`now()`,
    })
    const occurrence = await this.record(
      tx,
      who,
      code,
      'exited',
      LEAD_NOTE.exited(body.reasonKey, body.note),
      { reasonId: body.reasonKey },
    )
    /* The holder hears when somebody else stopped their lead (ADR 0085). */
    await this.hub.announce(tx, {
      event: {
        name: LEAD_STOPPED,
        ref: { code },
        actorId: who.id,
        audiences: { holder: held.ownerId ? [held.ownerId] : [] },
        occurrence,
      },
      subject: { kind: 'lead', code, label: held.label },
    })
    /* A timed letter or a queued wave must not reach a customer a person just
       stopped caring for (ADR 0068 §5); reopen does not release them. */
    await this.mailRuns.withholdSubject(
      tx,
      { aggregateType: 'lead', aggregateId: code },
      { code: 'lead-disqualified', summary: 'lead đã ngừng chăm sóc: thư chưa gửi bị giữ lại' },
    )
    /* Stopping care ends a hold too (ADR 0097 §3); reopen does not restore it. */
    await endHolds(tx, 'lead', [code], 'disqualified', who.id)
    if (held.workstreamCode) await this.runs.syncClosed(tx, [held.workstreamCode])
  }

  /** `POST /sales/leads/:code/reopen` — the state is recomputed from facts
   *  (`stateOnReopen`), not restored. */
  async reopen(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    const label = (await this.inScope(who, code)).row.company

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state !== 'disqualified') {
        throw conflict(`Lead ${code} chưa rời phễu.`)
      }

      const to = stateOnReopen(held)
      await this.states.move(tx, code, to, { exitReason: null, exitedAt: null })
      const occurrence = await this.record(tx, who, code, 'reopened', LEAD_NOTE.reopened)
      await this.tellHolder(tx, LEAD_REOPENED, who, held.ownerId, { code, label, occurrence })
      if (to === 'new') {
        const subject = { kind: 'lead' as const, code, label }
        await this.states.pooled(tx, { subject, actorId: who.id, occurrence })
      }
      if (held.workstreamCode) await this.runs.syncClosed(tx, [held.workstreamCode])
    })

    return this.profiles.profile(who, code)
  }

  /** `POST /sales/leads/:code/nurture` — `assigned|verifying|working`, or
   *  `converted` with no open deal and nothing signed, → `nurturing` (ADR 0097 §1). */
  async nurture(who: Actor, code: ObjectCode, body: LeadNurtureBody): Promise<LeadProfile> {
    await this.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      await this.park(tx, who, code, held, body)
    })

    return this.profiles.profile(who, code)
  }

  /** The nurture door's verdict and write on a row the caller locked — the
   *  hold's "to waiting" end runs it too, and only that end
   *  may re-park a lead already `nurturing` (`inPlace`): one code path. */
  async park(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    held: LockedLead,
    body: LeadNurtureBody,
    inPlace = false,
  ): Promise<void> {
    const waiting = `“${LEAD_STATE_LABEL.nurturing}”`
    const from = [
      'assigned',
      'verifying',
      'working',
      'converted',
      ...(inPlace ? ['nurturing'] : []),
    ]
    if (!from.includes(held.state)) {
      throw conflict(
        `Lead ${code} đang ở “${LEAD_STATE_LABEL[held.state]}” nên không chuyển sang ${waiting} được.`,
      )
    }
    /* The exit door's two facts: a lead whose deal is still worked or signed stays put. */
    if (held.state === 'converted' && (held.openDeal || held.signed)) {
      throw conflict(
        `Lead ${code} còn cơ hội đang chạy hoặc đã ký hợp đồng nên không chuyển sang ${waiting} được.`,
      )
    }
    if (held.ownerId === null) {
      throw conflict(`Lead ${code} chưa có người phụ trách. Giao lead cho một người trước.`)
    }
    await this.assertReason(tx, body.reasonKey)

    /* The reason lives on the touch, not the lead: nurturing loops in place,
       and a column on the lead would be overwritten by the next park (ADR 0070). */
    await this.states.parked(tx, code, {
      by: who,
      reasonId: body.reasonKey,
      note: LEAD_NOTE.nurtured(body.reasonKey, body.note),
    })
  }

  /** `POST /sales/leads/:code/resume` — `nurturing` → `working` when an exchange
   *  was ever logged, else back to `verifying`. Nurture is only reachable from
   *  those two, so `verifying` is the floor. */
  async resume(who: Actor, code: ObjectCode): Promise<LeadProfile> {
    const label = (await this.inScope(who, code)).row.company

    await this.repo.run(async (tx) => {
      const held = await this.lockRow(tx, who, code)
      if (held.state !== 'nurturing') {
        throw conflict(
          `Lead ${code} không ở “${LEAD_STATE_LABEL.nurturing}” nên không chăm lại được.`,
        )
      }

      await this.states.move(tx, code, stateByWork(held.reached === 'working'))
      // Picking the lead up again answers any re-meet date it was waiting on.
      await endHolds(tx, 'lead', [code], 'resumed', who.id)
      const occurrence = await this.record(tx, who, code, 'resumed', LEAD_NOTE.resumed)
      await this.tellHolder(tx, LEAD_RESUMED, who, held.ownerId, { code, label, occurrence })
    })

    return this.profiles.profile(who, code)
  }

  /** The holder hears when somebody else moved their lead (ADR 0093); the
   *  engine skips the line when the holder pressed it. `holderId` came from
   *  `lockForMove`, so a disabled lead never gets here. */
  private tellHolder(
    tx: Db,
    name: string,
    who: Actor,
    holderId: string | null,
    move: { code: ObjectCode; label: string; occurrence?: string },
  ): Promise<void> {
    return this.hub.announce(tx, {
      event: {
        name,
        ref: { code: move.code },
        actorId: who.id,
        audiences: { holder: holderId ? [holderId] : [] },
        occurrence: move.occurrence,
      },
      subject: { kind: 'lead', code: move.code, label: move.label },
    })
  }

  private async record(
    tx: Db,
    who: Actor,
    code: ObjectCode,
    kind: TouchEntry['kind'],
    note: string,
    extra: Pick<TouchEntry, 'reasonId'> = {},
  ): Promise<string | undefined> {
    const [id] = await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'lead',
        kind,
        ...byOf(who),
        note,
        ...extra,
      },
    ])
    return id
  }

  /** Both stop doors pick from the `EXIT_REASON` catalogue (ADR 0070); `other`
   *  is virtual — no row — and the contract already demanded its note. */
  private async assertReason(tx: Db, reasonKey: string): Promise<void> {
    if (reasonKey === LEAD_STOP_REASON_OTHER) return
    if (!(await this.repo.stopReasonLive(tx, reasonKey))) {
      throw conflict('Không tìm thấy lý do này. Chọn lại.')
    }
  }

  /** The same two refusals, in the same words, as `LeadWriteService.patch`.
   *  Public: the hold doors are scoped exactly like this door. */
  async inScope(who: Actor, code: ObjectCode) {
    const found = await this.leads.byCode(who, code)
    if (!found) throw notFound('lead', code)
    if (!found.holds) {
      throw denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)
    }
    return found
  }

  /** The row under lock, with scope re-checked ON it: `inScope` read the pool
   *  before the tx, and a lead handed away since then must not be moved by an
   *  `ownOnly` actor who no longer holds it. Public for the hold doors. */
  async lockRow(tx: Db, who: Actor, code: ObjectCode): Promise<LockedLead> {
    const row = await this.repo.lockForMove(tx, code)
    if (!row) throw notFound('lead', code)
    if (!movesLead(who, row.ownerId)) {
      throw denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)
    }
    return row
  }
}
