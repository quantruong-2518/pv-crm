import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl } from '@pv/engines'
import { toActor } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { notFound, PvError } from '@api/platform/http/problem'
import type { MailSent, MailSentHook, MailSubjectPeople } from '@api/platform/mail/mail-sent.hook'
import { RolePermissionRepository } from '@api/platform/roles/role-permission.repository'
import { MasRepository } from '../campaign/mas.repository'
import { LEAD_NOTE } from '../lead/lead-write.mapper'
import { QuotationService } from '../quotation/quotation.service'
import { SYSTEM_ACTOR, TouchService } from '../touch/touch.service'
import { dealAtOf, OpportunityLifecycle } from './opportunity-lifecycle'
import { scopeRefOf } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

/** A letter that really left from the opportunity door, on a template that
 *  serves that door and carries a milestone, records it (ADR 0069 §7, 0072 §5):
 *  `sample` as a care activity through `OpportunityLifecycle.milestone`,
 *  `quotation` as a kind-less ledger round through `QuotationService.record`
 *  (ADR 0090) — in the run creator's name,
 *  and only if E2 lets that person press the manual button on THIS deal
 *  (`opportunity.edit`, scoped): sending needs `lead.send-email` and a
 *  template's milestone is set under `campaign.edit`, neither of which is it.
 *
 *  Runs inside the accept's transaction (`MAIL_SENT_HOOK`), each attempt its
 *  own savepoint, so a retried event records once. A refusal (no right,
 *  disabled creator, lost, still at `new`, on hold — the hold door withholds
 *  unsent letters, this catches one already in flight)
 *  is logged and writes nothing; the mail stays sent. Anything else rethrows
 *  so the worker retries. Only a run's recipient letter counts. */
@Injectable()
export class OpportunityMailSentHook implements MailSentHook {
  private readonly log = new Logger('opportunity.mail-sent')

  constructor(
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
    private readonly quotes: QuotationService,
    private readonly templates: MasRepository,
    private readonly grants: RolePermissionRepository,
    private readonly touch: TouchService,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async afterSent(tx: Db, sent: MailSent): Promise<void> {
    if (!toCustomer(sent)) return
    const found = await this.templates.sentMilestone(tx, sent.mailRunId)
    if (!found) return

    const code = sent.aggregateId
    /* Grants read on `tx`, not the pool: PGlite has one connection and the
       accept's transaction holds it. */
    const who = toActor(found.creator, await this.grants.grantsFor(found.creator.roleIds, tx))
    try {
      /* Own savepoint: a refusal must leave no half-written row behind the catch. */
      await tx.transaction(async (sp) => {
        const lock = await this.deals.lockDeal(sp, code)
        const read = lock ? await this.deals.byCode(null, code, sp) : null
        if (!lock || !read) throw notFound('cơ hội', code)
        const ref = scopeRefOf(read.row, read.owners, who)
        const verdict = found.creator.disabledAt
          ? { ok: false, reason: 'disabled' }
          : this.access.check(who, { branch: 'Sales', permission: 'opportunity.edit', ref })
        if (!verdict.ok) {
          this.log.warn(
            `Milestone ${found.milestone} not recorded on ${code}: ${who.id} ${verdict.reason}`,
          )
          return
        }
        const deal = dealAtOf(read, lock.pendingSign)
        const note = `Thư: ${found.subject}`
        if (found.milestone === 'quotation') {
          await this.quotes.record(sp, deal, who, { source: 'mail', note })
        } else {
          await this.lifecycle.milestone(sp, deal, found.milestone, who, { note })
        }
      })
    } catch (error) {
      if (!(error instanceof PvError) || error.getStatus() >= 500) throw error
      this.log.warn(`Milestone ${found.milestone} not recorded on ${code}: ${error.message}`)
    }
  }

  /** Nothing is written: a lost letter moves no rung, and the mail timeline
   *  already shows the ledger's own state for it. Only the holder is named. */
  afterTrouble(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null> {
    return this.people(tx, sent)
  }

  /** A reply never moves a rung (ADR 0069 §9): it leaves ONE `customer-replied`
   *  row on the deal, by the system, in the lead trail's own words. A deal on
   *  a switched-off lead reads as absent, so it takes no row either. */
  async afterReply(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null> {
    const people = await this.people(tx, sent)
    if (!people) return null
    await this.touch.record(tx, [
      {
        subjectCode: sent.aggregateId,
        subjectKind: 'opportunity',
        kind: 'customer-replied',
        by: SYSTEM_ACTOR,
        note: LEAD_NOTE.replied,
      },
    ])
    return people
  }

  peopleOf(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null> {
    return this.people(tx, sent)
  }

  /** The deal's one holder (ADR 0071 §5); a deal on a switched-off lead reads
   *  as absent, so nobody is told about it. */
  private async people(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null> {
    if (!toCustomer(sent)) return null
    const read = await this.deals.byCode(null, sent.aggregateId, tx)
    if (!read) return null
    return {
      subject: { kind: 'opportunity', code: sent.aggregateId, label: read.row.name },
      holders: read.holder ? [read.holder.id] : [],
    }
  }
}

const toCustomer = (sent: MailSent): sent is MailSent & { mailRunId: string } =>
  sent.aggregateType === 'opportunity' && sent.role === 'recipient' && sent.mailRunId !== null
