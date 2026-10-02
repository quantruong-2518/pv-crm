import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl } from '@pv/engines'
import { toActor } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { notFound, PvError } from '@api/platform/http/problem'
import type { MailSent, MailSentHook } from '@api/platform/mail/mail-sent.hook'
import { RolePermissionRepository } from '@api/platform/roles/role-permission.repository'
import { MasRepository } from '../campaign/mas.repository'
import { dealAtOf, OpportunityLifecycle } from './opportunity-lifecycle'
import { scopeRefOf } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

/** A letter that really left from the opportunity door, on a template that
 *  serves that door and carries a milestone, records it (ADR 0069 §7, 0072 §5:
 *  `sample` is a care activity, `quotation` the stage) through
 *  `OpportunityLifecycle.milestone`, in the run creator's name —
 *  and only if E2 lets that person press the manual button on THIS deal
 *  (`opportunity.edit`, scoped): sending needs `lead.send-email` and a
 *  template's milestone is set under `campaign.edit`, neither of which is it.
 *
 *  Runs inside the accept's transaction (`MAIL_SENT_HOOK`), each attempt its
 *  own savepoint, so a retried event records once. A refusal (no right,
 *  disabled creator, lost, still at `new`)
 *  is logged and writes nothing; the mail stays sent. Anything else rethrows
 *  so the worker retries. Only a run's recipient letter counts. */
@Injectable()
export class OpportunityMailSentHook implements MailSentHook {
  private readonly log = new Logger('opportunity.mail-sent')

  constructor(
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
    private readonly templates: MasRepository,
    private readonly grants: RolePermissionRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async afterSent(tx: Db, sent: MailSent): Promise<void> {
    if (!toCustomer(sent)) return
    const found = await this.templates.sentMilestone(tx, sent.mailRunId)
    if (!found) return

    const code = sent.aggregateId
    /* Grants read on `tx`, not the pool: PGlite has one connection and the
       accept's transaction holds it. */
    const who = toActor(found.creator, await this.grants.grantsFor(found.creator.roleId, tx))
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
        await this.lifecycle.milestone(sp, deal, found.milestone, who, {
          note: `Thư: ${found.subject}`,
        })
      })
    } catch (error) {
      if (!(error instanceof PvError) || error.getStatus() >= 500) throw error
      this.log.warn(`Milestone ${found.milestone} not recorded on ${code}: ${error.message}`)
    }
  }

  /** Nothing to report: a lost letter moves no rung, and the mail timeline
   *  already shows the ledger's own state for it. */
  async afterTrouble(): Promise<void> {}
}

const toCustomer = (sent: MailSent): sent is MailSent & { mailRunId: string } =>
  sent.aggregateType === 'opportunity' && sent.role === 'recipient' && sent.mailRunId !== null
