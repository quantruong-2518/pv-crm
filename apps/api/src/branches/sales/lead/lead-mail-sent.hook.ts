import { and, eq } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import type {
  MailSent,
  MailSentHook,
  MailSubjectPeople,
  MailTrouble,
} from '@api/platform/mail/mail-sent.hook'
import { SYSTEM_ACTOR, TouchService } from '../touch/touch.service'
import { LeadStateWriter } from './lead-state'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadWriteRepository } from './lead-write.repository'
import { lead } from './lead.schema'
import { leadLive } from './lead-scope'

/** A letter that really went out to a lead IS a touch (ADR 0068 §1): it moves
 *  the lead to `working` whoever sent it; a `nurturing` lead stays in the pool.
 *  A letter that failed for good, or went out without that move, lands on the
 *  lead's trail instead, and the hook names who the bell tells (ADR 0085).
 *  Lives here because it writes `sales.lead`/`touch`; the worker reaches it
 *  only through `MAIL_SENT_HOOK`, bound in `LeadModule`.
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

  async afterTrouble(
    tx: Db,
    sent: MailSent,
    trouble: MailTrouble,
  ): Promise<MailSubjectPeople | null> {
    if (!toCustomer(sent)) return null
    /* A switched-off lead takes no new timeline row, not even a failure. */
    if (!(await this.repo.lockForOwnerChange(tx, sent.aggregateId))) return null
    await this.touch.record(tx, [
      {
        subjectCode: sent.aggregateId,
        subjectKind: 'lead',
        by: SYSTEM_ACTOR,
        ...(trouble.kind === 'failed'
          ? { kind: 'mail-failed', note: LEAD_NOTE.mailFailed(trouble.address, trouble.unknown) }
          : { kind: 'mail-sync-failed', note: LEAD_NOTE.mailSyncFailed }),
      },
    ])
    return people(tx, sent.aggregateId)
  }

  /** Every reply leaves ONE `customer-replied` row, by the system, whatever
   *  the lead's state — pool, parked and converted included. An `assigned`
   *  lead also moves to `working` (ADR 0067 §2), a `nurturing` one
   *  back to `new` (ADR 0109), and the state writer dates that move with its
   *  own row: two facts, two rows. A
   *  switched-off lead takes neither, and nobody is told. */
  async afterReply(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null> {
    if (!toCustomer(sent)) return null
    if (!(await this.repo.lockForOwnerChange(tx, sent.aggregateId))) return null
    await this.state.replied(tx, [sent.aggregateId])
    await this.touch.record(tx, [
      {
        subjectCode: sent.aggregateId,
        subjectKind: 'lead',
        kind: 'customer-replied',
        by: SYSTEM_ACTOR,
        note: LEAD_NOTE.replied,
      },
    ])
    return people(tx, sent.aggregateId)
  }

  async peopleOf(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null> {
    return toCustomer(sent) ? people(tx, sent.aggregateId) : null
  }
}

/** The lead's holder, or the people who hand out pool leads when it has none
 *  (ADR 0067 §6). A switched-off lead has nobody to tell. */
async function people(tx: Db, code: string): Promise<MailSubjectPeople | null> {
  const [row] = await tx
    .select({ ownerId: lead.ownerId, company: lead.company })
    .from(lead)
    .where(and(eq(lead.code, code), leadLive))
    .limit(1)
  if (!row) return null
  return {
    subject: { kind: 'lead', code, label: row.company },
    holders: row.ownerId ? [row.ownerId] : [],
    ...(row.ownerId ? {} : { watchers: { permission: 'lead.assign', branch: 'Sales' } }),
  }
}

const toCustomer = (sent: MailSent): boolean =>
  sent.aggregateType === 'lead' && sent.role === 'recipient' && sent.mailRunId !== null
