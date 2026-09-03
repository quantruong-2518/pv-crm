import { Inject, Injectable } from '@nestjs/common'
import { LeadIntakeResponse, type LeadIntakeBody, type LeadIntakeQuery } from '@pv/contracts'
import { AUDIENCE_INTERNAL, LEAD_INTAKE_ACCEPTED, plan, type ObjectRef } from '@pv/engines'
import { ENV, type Env } from '@api/platform/config/env'
import type { Db } from '@api/platform/db/db.module'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { AccountService } from '../account/account.service'
import { isDbConstraint } from '@api/platform/http/db-error'
import { MAIL_ENQUEUE, type MailEnqueue } from '@api/platform/mail/mail.contract'
import { SYSTEM_ACTOR, TouchService } from '../touch/touch.service'
import { fromIntake, LEAD_NOTE, refOf } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadIntakeRepository, type IntakeClient } from './lead-intake.repository'

@Injectable()
export class LeadIntakeService {
  constructor(
    private readonly intake: LeadIntakeRepository,
    private readonly writes: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly accounts: AccountService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_ENQUEUE) private readonly mail: MailEnqueue,
  ) {}

  async accept(
    query: LeadIntakeQuery,
    body: LeadIntakeBody,
    client: IntakeClient,
  ): Promise<LeadIntakeResponse> {
    const attempt = { query, ...client }

    /* A bot filling the hidden field gets the same 202 as a human. Revealing
       the trap teaches the bot which field to stop filling. */
    if (body.website.trim() !== '') {
      await this.intake.writeAttempt(this.intake.handle, { ...attempt, status: 'honeypot' })
      return LeadIntakeResponse.parse({ accepted: true })
    }

    const write = fromIntake(body)
    const code = await this.leads.nextCode()

    try {
      await this.writes.run(async (tx) => {
        const ref = refOf(code, write)
        await this.mirror.put(tx, ref)
        /* Same transaction and same order as the other two lead write paths:
           the foreign key on `lead.account_code` wants the company row to exist
           first. This door is anonymous, but the company is not — somebody
           filling in the landing page form has to land on the company row that
           already exists, or every repeat submission opens a new customer. */
        const accountCode = await this.accounts.resolveForLead(tx, write.values)
        await this.writes.insertLandingLead(tx, { ...write.values, accountCode, code })
        await this.intake.writeAttempt(tx, { ...attempt, status: 'accepted', leadCode: code })

        /* `SYSTEM_ACTOR` and no `actorId`, because this door is anonymous by
           design — there is no session and there is nobody to credit. "Hệ
           thống" is the true answer to "who did this", and inventing an actor
           here would put a name on work no person did. */
        await this.touch.record(tx, [
          {
            subjectCode: code,
            subjectKind: 'lead',
            kind: 'vao-so',
            by: SYSTEM_ACTOR,
            note: LEAD_NOTE.landing,
          },
        ])

        await this.notify(tx, ref)
      })
    } catch (error) {
      if (!isDbConstraint(error, 'lead_email_live_idx')) throw error

      /* Record attribution for a repeated submit, but never tell the public
         caller whether this mailbox already existed. */
      const existing = await this.writes.liveByEmail(this.writes.readonlyHandle, [body.email])
      await this.intake.writeAttempt(this.intake.handle, {
        ...attempt,
        status: 'duplicate',
        leadCode: existing.get(body.email),
      })
    }

    return LeadIntakeResponse.parse({ accepted: true })
  }

  /** Queue the internal alert IN THE SAME UNIT OF WORK as the lead.
   *
   *  Inside `tx` on purpose, and it is the whole point of `MailEnqueue` taking
   *  a transaction handle: a lead that exists without its alert is a lead
   *  nobody is told about, and an alert that exists without its lead points at
   *  a code that was rolled back. Both are only avoidable while the two writes
   *  share a commit. Nothing leaves the process here — the row is a promise to
   *  send, and the worker keeps it after the commit.
   *
   *  Only the ACCEPTED path reaches this. The honeypot and the duplicate paths
   *  write their attempt row outside any transaction and stay that way: a bot
   *  must not be able to make this system send mail, and a repeated submit is
   *  the same lead — mailing it again is exactly the duplicate that
   *  `UNIQUE(event_key)` exists to prevent.
   *
   *  The branch EMITS an event; it does not choose a channel or a template.
   *  E4 owns that mapping, which is why `plan()` is asked rather than a
   *  template name being written here. All this branch contributes is the one
   *  thing an engine may not know: which mailbox this deployment sends to.
   *  Blank mailbox = no intent, so a machine that was never told where to send
   *  queues nothing (`PV_EMAIL_ENABLED` deliberately does NOT gate this — see
   *  `env.ts`: a disabled sender still writes the ledger, it just never leaves
   *  the machine). */
  private async notify(tx: Db, ref: ObjectRef): Promise<void> {
    const intents = plan({
      name: LEAD_INTAKE_ACCEPTED,
      ref,
      audiences: { [AUDIENCE_INTERNAL]: this.env.PV_LEAD_NOTIFICATION_TO },
    })

    for (const intent of intents) {
      /* Email is the only channel with a port today. A Zalo or Telegram intent
         would need its own ledger, so it is skipped rather than silently
         posted through the mail one. */
      if (intent.channel !== 'email') continue

      await this.mail.enqueue(tx, {
        eventKey: intent.eventKey,
        eventType: LEAD_INTAKE_ACCEPTED,
        aggregateType: 'lead',
        aggregateId: ref.code,
        template: intent.template,
        templateVersion: intent.templateVersion,
        recipient: intent.to,
      })
    }
  }
}
