import { Inject, Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { MAIL_FAILED, MAIL_REPLIED } from '@pv/engines'
import { DB, type Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { MAIL_LEDGER, type MailLedger } from './mail.contract'
import { MailRunRepository } from './mail-run.repository'
import {
  MAIL_SENT_HOOK,
  type MailSent,
  type MailSentHook,
  type MailSubjectPeople,
} from './mail-sent.hook'

/** Local, not the Sales branch's `vnDay`: `platform/` may not import a branch. */
const VN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

/** What the mail path tells the bell about ONE letter (ADR 0085): it failed
 *  for good, or its counterparty answered. The branch names the people through
 *  `MAIL_SENT_HOOK`; this class only turns that answer into an announcement,
 *  on the transaction that wrote the fact — except a late bounce (`bounced`).
 *
 *  Nothing from the letter itself rides along — no address, no subject line:
 *  the bell row carries the lead's or deal's own name, or for a reply to a
 *  bulk run the run's label, and nothing else. */
@Injectable()
export class MailBell {
  private readonly log = new Logger('mail-bell')

  constructor(
    private readonly hub: NotificationHub,
    /* The registry is bound by the composition root (`QueueModule.forWorker`),
       a module this one may not import — so it is reached by token at call time. */
    private readonly modules: ModuleRef,
    @Inject(MAIL_LEDGER) private readonly ledger: MailLedger,
    @Inject(DB) private readonly db: Db,
    private readonly runs: MailRunRepository,
  ) {}

  /** `occurrence` is the delivery id: one line per letter, however many
   *  signals later say the same letter died. Sender and holder who are one
   *  person collapse inside E4's `plan`. */
  async failed(
    tx: Db,
    people: MailSubjectPeople,
    delivery: { id: string; sender: string | null },
  ): Promise<void> {
    await this.hub.announce(tx, {
      event: {
        name: MAIL_FAILED,
        ref: { code: people.subject.code },
        occurrence: delivery.id,
        audiences: { sender: delivery.sender ? [delivery.sender] : [], holder: people.holders },
      },
      subject: people.subject,
    })
  }

  /** A hard bounce reported AFTER the provider took the letter (webhook, Gmail
   *  thread). Only a 1-to-1 letter the ledger now holds as lost rings — never
   *  one bad address of several; the branch is asked who, read-only,
   *  because this road writes no trail row. On the pool: the ledger records a
   *  bounce in separate statements, so there is no transaction to ride, and
   *  the bell's UNIQUE key makes a repeat harmless. Never raises. */
  async bounced(deliveryId: string): Promise<void> {
    try {
      const letter = await this.ledger.lostGroupLetter(deliveryId)
      if (!letter) return
      const hooks = this.modules.get<symbol, MailSentHook[]>(MAIL_SENT_HOOK, { strict: false })
      for (const hook of hooks) {
        const people = await hook.peopleOf(this.db, letter)
        if (people) await this.failed(this.db, people, letter)
      }
    } catch (error) {
      this.log.error(`Bounce on ${deliveryId} was recorded but nobody was told: ${String(error)}`)
    }
  }

  /** The hooks write FACTS (the lead's move, the activity row), so they ride
   *  the reply's own transaction: if one throws, `mail_reply` rolls back with
   *  it and the next delivery of the signal retries. Only the bell is optional.
   *
   *  A reply to a bulk-run letter rings once per run, recipient and Vietnam day
   *  (ADR 0093 wave 2, owner 15/10): a campaign answered by forty customers is
   *  one line, and later replies that day are absorbed by the event key. */
  async replied(tx: Db, sent: MailSent, replyId: string): Promise<void> {
    const hooks = this.modules.get<symbol, MailSentHook[]>(MAIL_SENT_HOOK, { strict: false })
    const id = sent.mailRunId
    /* A failed read treats the letter as 1-to-1: the reply is never lost to it. */
    const run = id
      ? await this.hub.bellRead(tx, `run ${id}`, null, (s) => this.runs.kindAndLabel(s, id))
      : null
    const bulk = run?.kind === 'bulk' && id ? { id, ...run } : null
    for (const hook of hooks) {
      const people = await hook.afterReply(tx, sent)
      if (!people) continue
      const { watchers } = people
      await this.hub.announce(tx, {
        event: {
          name: MAIL_REPLIED,
          ref: { code: bulk ? bulk.id : people.subject.code },
          occurrence: bulk ? VN_DAY.format(new Date()) : replyId,
          data: { bulk: bulk !== null },
          audiences: {
            holder: people.holders,
            'pool-watchers': watchers
              ? await this.hub.holding(tx, watchers.permission, watchers.branch)
              : [],
          },
        },
        subject: bulk ? { kind: 'mail-run', code: bulk.id, label: bulk.label } : people.subject,
      })
    }
  }
}
