import { Inject, Injectable, Logger } from '@nestjs/common'
import { renderMasShell } from '@pv/mail-templates'
import { ENV, type Env } from '@api/platform/config/env'
import type { MailComposer } from '@api/platform/queue/mail-composer'
import type { DeliveryToSend, MailMessage } from './mail.contract'
import type { MailRunRow } from './mail-run.schema'
import { MailRunRepository } from './mail-run.repository'
import { sign } from './unsubscribe-token'

/** The one template this composer answers for. A version in the name because
 *  `email_delivery.template` is written into rows that outlive this code: the
 *  day the shell changes shape, `mas-v2` renders the new letters while every
 *  row already queued still finds the renderer it was written against. */
const TEMPLATE = 'mas-v1'

/** `{{company}}`, `{{ contact_name }}` — a key, optionally padded.
 *
 *  Deliberately narrow: letters, digits and underscore. A pattern that accepted
 *  dots or brackets would be a small expression language, and an expression
 *  language in a mail body is a place for a sender to put things nobody
 *  reviewed. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

/** THE BODY OF A MASS MAIL, BUILT WITHOUT KNOWING WHOSE IT IS.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS ONE LIVES IN `platform` WHEN `LeadMailComposer` DOES NOT
 *  ------------------------------------------------------------------
 *  The lead-intake composer sits in the Sales branch because composing that
 *  letter means READING `sales.lead` — and `platform/` may not. This one reads
 *  nothing of the sort. Everything it needs was written down before the batch
 *  was queued, in two places both of which are platform tables:
 *
 *   · `platform.mail_run`        the subject, the body, the CTA, the sending
 *                                address — snapshotted at creation, so editing
 *                                a template never rewrites a letter already
 *                                posted.
 *   · `email_delivery.merge`     this recipient's substitution values, written
 *                                across by the branch that was allowed to read
 *                                the lead.
 *
 *  So there is nothing branch-shaped left, and the composer belongs beside the
 *  ledger it reads. That is the whole point of the `merge` column: it moves the
 *  branch's knowledge to the platform's side of the line ONCE, at enqueue time,
 *  instead of dragging the platform across the line at every send.
 *
 *  ------------------------------------------------------------------
 *  `List-Unsubscribe` IS NOT OPTIONAL AND NOT A COURTESY
 *  ------------------------------------------------------------------
 *  Gmail and Yahoo both require one-click unsubscribe headers from anyone
 *  sending bulk mail, and enforce it by refusing or foldering the mail —
 *  meaning the cost of omitting them is not a complaint, it is a sending domain
 *  that quietly stops working for every OTHER mail this system sends,
 *  transactional ones included. Two headers, and both are needed: the `Post`
 *  header is what tells the receiver the URL will accept an unattended POST,
 *  and without it the first header is read as the old mailto-era hint.
 *
 *  React is never imported here — `@pv/mail-templates` exposes a plain
 *  `{subject, html, text}` function and that is the only door apps/api may use
 *  (eslint.config.js block 3b). */
@Injectable()
export class MasMailComposer implements MailComposer {
  private readonly log = new Logger('mail.composer.mas')

  constructor(
    private readonly runs: MailRunRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  supports(template: string): boolean {
    return template === TEMPLATE
  }

  async compose(delivery: DeliveryToSend): Promise<MailMessage> {
    /* Both failures below are the same kind: a row that cannot be composed
       must stop, loudly, and be looked at. `mail.consumer.ts` settles the
       ledger before the throw escapes, so the row is retried and eventually
       parked — never sent with a default body. A mass mail with the wrong body
       cannot be recalled. */
    if (!delivery.mailRunId) {
      throw new Error(`Delivery ${delivery.id} mang template ${TEMPLATE} nhưng không có mail_run.`)
    }

    const run = await this.runs.byId(delivery.mailRunId)
    if (!run) {
      throw new Error(`Không tìm thấy mail_run ${delivery.mailRunId} của delivery ${delivery.id}.`)
    }

    const missing = new Set<string>()
    const merge = delivery.merge ?? {}
    const fill = (value: string): string => substitute(value, merge, missing)

    const subject = fill(run.subject)
    const paragraphs = splitParagraphs(fill(run.body))
    /* The CTA URL is the one field where a merge value lands in a DIFFERENT
       grammar, so it gets a different escape: `?c={{company}}` with a company
       called "Sao Đỏ" is not a link with a space in it, it is a broken link.
       `encodeURIComponent` per value, never over the whole URL — encoding the
       template itself would eat the `?` and the `=` the author wrote. */
    const cta =
      run.ctaLabel && run.ctaUrl
        ? {
            label: fill(run.ctaLabel),
            url: substitute(run.ctaUrl, merge, missing, encodeURIComponent),
          }
        : undefined

    if (missing.size > 0) {
      /* One line, keys only. The recipient's address never reaches a log: this
         line is about a template that names a variable the batch did not
         supply, and printing who it happened to would put a mailing list into
         the log stream one entry at a time. `delivery.id` is enough to find
         the row. */
      this.log.warn(
        `Thiếu biến trộn ${[...missing].join(', ')} ở delivery ${delivery.id} · run ${run.id}.`,
      )
    }

    const unsubscribeUrl = this.unsubscribeUrl(delivery.id)
    const {
      subject: finalSubject,
      html,
      text,
    } = await renderMasShell({
      subject,
      paragraphs,
      cta,
      unsubscribeUrl,
      sender: senderOf(run, this.env.PV_MAS_SENDER_POSTAL),
    })

    return {
      /* `mas`, and this one line is what keeps a bad batch from taking the
         transactional pipeline down with it — see `MailFlow`. */
      flow: 'mas',
      from: header(run.fromAddress),
      to: delivery.recipient,
      replyTo: run.replyTo ? header(run.replyTo) : undefined,
      subject: finalSubject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  }

  /** Where the unsubscribe link points — the API's own origin, not the web
   *  app's.
   *
   *  One-click unsubscribe is an unattended `POST` sent by Gmail's or Yahoo's
   *  infrastructure, with no session and no browser, and it has to land on
   *  `UnsubscribeController` (`POST|GET /mail/unsubscribe/:token`). Pointing it
   *  at `PV_APP_URL` is correct only where the API is proxied under the app
   *  origin — and where it is not, every unsubscribe fails silently, which is
   *  worse than having no link at all: the recipient believes they opted out
   *  and reports the next letter as spam instead.
   *
   *  So `PV_API_PUBLIC_URL` first, and the fallback to `PV_APP_URL` is for the
   *  proxied-under-one-origin case and for a dev machine. It is not a guess
   *  production can slip into: `env.ts` refuses to boot with
   *  `PV_MAS_ENABLED=true` and no `PV_API_PUBLIC_URL`. */
  private unsubscribeUrl(deliveryId: string): string {
    const origin = this.env.PV_API_PUBLIC_URL || this.env.PV_APP_URL
    const base = origin.replace(/\/+$/, '')
    return `${base}/mail/unsubscribe/${sign(deliveryId, this.env.PV_UNSUBSCRIBE_SECRET)}`
  }
}

/** ONE PASS, LEFT TO RIGHT, AND NEVER OVER ITS OWN OUTPUT.
 *
 *  `String.replace` with a FUNCTION is what makes this safe, in two ways that
 *  a naive loop of `split`/`join` gets wrong:
 *
 *   · The replacement is not rescanned. A merge value that happens to contain
 *     `{{price}}` — a customer whose company name is written that way, a body
 *     pasted from another tool — stays literal instead of being substituted a
 *     second time from a key the sender never intended. Nested and adjacent
 *     braces (`{{{{a}}}}`) resolve to exactly one match each and cannot cascade.
 *   · `$&`, `$1` and `$'` in a value are inert. They are only special in the
 *     STRING form of `replace`; a function's return value is inserted verbatim.
 *     A value arriving from a lead's company name is untrusted text, and this
 *     is the difference between it being text and it being a pattern.
 *
 *  A missing key becomes the empty string rather than being left as `{{key}}`:
 *  a letter that goes out reading "Chào {{contactName}}," is worse than one
 *  reading "Chào ,". The caller collects the names and logs them once.
 *
 *  `escape` is how the same substitution serves two grammars: prose takes the
 *  value as it is, a URL takes it percent-encoded. It escapes the VALUE only —
 *  the surrounding text is the author's and is never touched. */
function substitute(
  value: string,
  merge: Record<string, string>,
  missing: Set<string>,
  escape: (raw: string) => string = (raw) => raw,
): string {
  return value.replace(PLACEHOLDER, (_match, key: string) => {
    const found = merge[key]
    if (found === undefined) {
      missing.add(key)
      return ''
    }
    return escape(found)
  })
}

/** A blank line ends a paragraph — the same rule the compose box shows the
 *  writer, and the reason `mailBody` in `@pv/contracts` refuses to run the body
 *  through `textNhap`: collapsing whitespace would turn every paragraph break
 *  in every mass mail into a space. Single newlines inside a paragraph are kept
 *  as they were typed; the shell renders each element as one `<Text>`. */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n[ \t]*\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/** The footer's identity line, read off the run's own `From`.
 *
 *  `From` is stored the way a mail header spells it — `Tên <hộp@thư>` — so the
 *  display name and the mailbox are both already there and neither is invented.
 *
 *  KNOWN GAP, stated rather than filled: `MasShellData.sender.address` is meant
 *  to be the company's POSTAL address, which commercial mail is legally required
 *  to carry in its footer (CAN-SPAM §7704 and its equivalents elsewhere).
 *
 *  `PV_MAS_SENDER_POSTAL` is that address, and `PV_MAS_ENABLED=true` refuses to
 *  boot without it — so on any machine allowed to send a real batch, this is
 *  always the configured street. The mailbox fallback below is for the
 *  unconfigured case only: it keeps a preview renderable on a dev box, and it
 *  prints something true rather than a fabricated address. It is never what
 *  goes out in production, because production cannot start in that state. */
function senderOf(run: MailRunRow, postal: string): { name: string; address: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(run.fromAddress)
  const mailbox = match?.[2]?.trim()
  const street = postal.trim()
  if (!mailbox) {
    const bare = run.fromAddress.trim()
    return { name: bare, address: street || bare }
  }

  /* A quoted display name is how a header carries a comma or a dot — the
     quotes belong to the header grammar, not to the company's name. */
  const name = (match?.[1] ?? '').replace(/^"|"$/g, '').trim()
  return { name: name || mailbox, address: street || mailbox }
}

/** A mail header ends at the first newline; anything after one would become a
 *  header of its own. Same guard, same reason, as `lead-mail.composer.ts` —
 *  duplicated because these two files are on opposite sides of the
 *  platform/branch line and may not share a helper. */
function header(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
