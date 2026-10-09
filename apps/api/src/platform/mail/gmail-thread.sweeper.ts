import { Inject, Injectable, Logger } from '@nestjs/common'
import { COMPANY_MAIL_DOMAIN } from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import { GoogleGmail, type GmailMailbox } from '../google/google-gmail.client'
import { addressOf, classifyThreadMessage } from './gmail-thread.classifier'
import { GmailSweepRepository, type GmailWatch } from './gmail-sweep.repository'
import { MAIL_LEDGER, type MailLedger } from './mail.contract'

/** READS WHAT CAME BACK ON LETTERS SENT FROM A PERSON'S OWN GMAIL.
 *
 *  Resend tells us about a bounce or a reply by webhook; a personal mailbox
 *  tells nobody, so the worker asks. Headers only (`GoogleGmail.thread`), and
 *  two things are written: "a counterparty replied" and "this address bounced".
 *
 *  No cursor: the work list is re-derived from the ledger every pass, and
 *  every write is keyed (Gmail message id, address row still `queued`), so a
 *  pass that dies, or two workers on the same thread, converge.
 *
 *  A `reply` is recorded whoever wrote it: the thread holds a letter THIS
 *  system sent, so it is correlated by the thread, not by the sender — the one
 *  exception to ADR 0011 wall (a), see that ADR's amendment. Only threads on
 *  the work list, only from address, subject and time; never a body.
 *  Logs carry a delivery id and a kind, never an address. */

export type GmailSweepResult = {
  threads: number
  replies: number
  bounced: number
}

const BOUNCE_REASON = 'Gmail báo không gửi được tới địa chỉ này.'

@Injectable()
export class GmailThreadSweeper {
  private readonly log = new Logger('mail.gmail')
  private notBefore = 0
  private running = false

  constructor(
    private readonly watch: GmailSweepRepository,
    private readonly gmail: GoogleGmail,
    @Inject(MAIL_LEDGER) private readonly ledger: MailLedger,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Called on every worker tick; does work once per `PV_GMAIL_POLL_MINUTES`.
   *  `null` = this tick was not a pass. The clock moves BEFORE the pass so a
   *  failing Google is asked again at the next interval, not every few seconds. */
  async sweep(now = Date.now()): Promise<GmailSweepResult | null> {
    if (!this.env.PV_EMAIL_ENABLED || !this.gmail.configured) return null
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + this.env.PV_GMAIL_POLL_MINUTES * 60_000
    this.running = true
    try {
      return await this.pass()
    } finally {
      this.running = false
    }
  }

  private async pass(): Promise<GmailSweepResult> {
    const result: GmailSweepResult = { threads: 0, replies: 0, bounced: 0 }
    const boxes = new Map<string, GmailMailbox | null>()

    for (const item of await this.watch.watchList(this.env.PV_GMAIL_POLL_DAYS)) {
      /* One bad row or one DB blip must not end the pass or starve later actors. */
      try {
        const mailbox = addressOf(item.fromAddress)
        const key = `${item.actorId} ${mailbox}`
        if (!boxes.has(key)) {
          const box = await this.gmail.mailbox(item.actorId, mailbox)
          if (!box.ok) this.log.warn(`mailbox skipped this pass — kind=${box.kind}`)
          boxes.set(key, box.ok ? box : null)
        }
        const box = boxes.get(key)
        if (box) await this.readThread(box, item, result)
      } catch (error) {
        const name = error instanceof Error ? error.name : 'unknown'
        this.log.warn(`delivery ${item.deliveryId} skipped this pass — error=${name}`)
      }
    }

    if (result.replies + result.bounced > 0) {
      this.log.log(
        `pass done — threads=${result.threads} replies=${result.replies} bounced=${result.bounced}`,
      )
    }
    return result
  }

  private async readThread(
    box: GmailMailbox,
    item: GmailWatch,
    result: GmailSweepResult,
  ): Promise<void> {
    const thread = await this.gmail.thread(box, item.threadId)
    if (!thread.ok) return
    result.threads += 1

    for (const message of thread.messages) {
      const verdict = classifyThreadMessage(message.headers, box.email, COMPANY_MAIL_DOMAIN)
      if (verdict.kind === 'reply') {
        const outcome = await this.ledger.recordReply({
          svixId: null,
          deliveryId: item.deliveryId,
          fromAddress: verdict.from,
          subject: message.headers['subject']?.slice(0, 500) ?? null,
          at: message.at,
          providerEmailId: message.id,
        })
        if (outcome === 'recorded') {
          result.replies += 1
          this.log.log(`delivery ${item.deliveryId} kind=reply`)
        }
      } else if (verdict.kind === 'bounce' && verdict.hard) {
        const moved = await this.ledger.applyAddressBounce(item.deliveryId, {
          addresses: verdict.failed,
          reason: BOUNCE_REASON,
          at: message.at,
        })
        if (moved > 0) {
          result.bounced += moved
          this.log.log(`delivery ${item.deliveryId} kind=bounce addresses=${moved}`)
        }
      }
    }
  }
}
