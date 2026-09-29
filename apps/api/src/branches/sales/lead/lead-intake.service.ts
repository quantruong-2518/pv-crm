import { Inject, Injectable } from '@nestjs/common'
import {
  LeadIntakeResponse,
  ORIGIN_NAME_MAX,
  originKey,
  type LeadIntakeBody,
  type LeadIntakeQuery,
} from '@pv/contracts'
import { AUDIENCE_INTERNAL, LEAD_INTAKE_ACCEPTED, plan, type ObjectRef } from '@pv/engines'
import { ENV, type Env } from '@api/platform/config/env'
import type { Db } from '@api/platform/db/db.module'
import { MAIL_ENQUEUE, type MailEnqueue } from '@api/platform/mail/mail.contract'
import { fromIntake, LEAD_NOTE, refOf } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadWriteService } from './lead-write.service'
import { LeadIntakeRepository, type IntakeClient } from './lead-intake.repository'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LeadOriginService } from '../lead-origin/lead-origin.service'

@Injectable()
export class LeadIntakeService {
  constructor(
    private readonly intake: LeadIntakeRepository,
    private readonly writes: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly births: LeadWriteService,
    private readonly runs: WorkstreamRepository,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_ENQUEUE) private readonly mail: MailEnqueue,
    private readonly origins: LeadOriginService,
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
    const run = await this.runs.nextCode()

    /* No live-email fence any more (ADR 0070): a second lead on one mailbox is
       written and flagged by the book's `duplicateOf`, never refused here. */
    await this.writes.run(async (tx) => {
      const origin = await this.originOf(tx, query.utm_source)
      /* The same birth every other door makes (company edge, primary contact,
         first touch) — this door only adds its attempt row and the alert. */
      await this.births.bear(tx, {
        code,
        run,
        write,
        extra: {
          campaignId: null,
          originId: origin.id,
          originRaw: origin.raw,
          partnerCode: null,
        },
        who: null,
        owner: null,
        note: LEAD_NOTE.landing,
      })
      await this.intake.writeAttempt(tx, { ...attempt, status: 'accepted', leadCode: code })
      await this.notify(tx, refOf(code, write))
    })

    return LeadIntakeResponse.parse({ accepted: true })
  }

  /** `utm_source` → an EXISTING origin, blank → Website. Lookup only: an
   *  anonymous caller must not grow the catalog, so an unknown source keeps
   *  `origin_id` null and its text in `origin_raw` for a person to file later. */
  private async originOf(
    tx: Db,
    utm: string | undefined,
  ): Promise<{ id: string | null; raw: string | null }> {
    const typed = utm !== undefined && originKey(utm) !== '' ? utm.trim() : undefined
    const found = await this.origins.findLive(tx, typed ?? 'Website')
    return { id: found?.id ?? null, raw: typed?.slice(0, ORIGIN_NAME_MAX) ?? null }
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
