import { Injectable } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import type { MailSent, MailSentHook, MailTrouble } from '@api/platform/mail/mail-sent.hook'
import { SYSTEM_ACTOR, TouchService } from '../touch/touch.service'
import { LeadStateWriter } from './lead-state'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadWriteRepository } from './lead-write.repository'

/** A letter that really went out to a lead IS a touch (ADR 0068 §1): it moves
 *  the lead to `working`, or loops it back from `nurturing`, whoever sent it.
 *  A letter that failed for good, or went out without that move, lands on the
 *  lead's trail instead. Lives here because it writes `sales.lead`/`touch`;
 *  the worker reaches it only through `MAIL_SENT_HOOK`, bound in `LeadModule`.
 *
 *  Only a run's recipient letter counts: a run is what a person writes to a
 *  customer, while a ledger row with no run (the intake alert) goes to staff
 *  and the run's `run_copy` goes to the shared inbox. */
@Injectable()
export class LeadMailSentHook implements MailSentHook {
  constructor(
    private readonly state: LeadStateWriter,
    private readonly touch: TouchService,
    private readonly repo: LeadWriteRepository,
  ) {}

  async afterSent(tx: Db, sent: MailSent): Promise<void> {
    if (!toCustomer(sent)) return
    await this.state.mailed(tx, [sent.aggregateId])
  }

  async afterTrouble(sent: MailSent, trouble: MailTrouble): Promise<void> {
    if (!toCustomer(sent)) return
    await this.repo.run((tx) =>
      this.touch.record(tx, [
        {
          subjectCode: sent.aggregateId,
          subjectKind: 'lead',
          by: SYSTEM_ACTOR,
          ...(trouble.kind === 'failed'
            ? { kind: 'mail-failed', note: LEAD_NOTE.mailFailed(trouble.address, trouble.unknown) }
            : { kind: 'mail-sync-failed', note: LEAD_NOTE.mailSyncFailed }),
        },
      ]),
    )
  }
}

const toCustomer = (sent: MailSent): boolean =>
  sent.aggregateType === 'lead' && sent.role === 'recipient' && sent.mailRunId !== null
