import { Controller, Get, Header, HttpCode, Inject, Logger, Param, Post } from '@nestjs/common'
import { Public } from '@api/platform/access/need.decorator'
import { ENV, type Env } from '@api/platform/config/env'
import { MAIL_LEDGER, type MailLedger } from './mail.contract'
import { verify } from './unsubscribe-token'

/** THE UNSUBSCRIBE DOOR — the third inbound door of the mail path, and the only
 *  one a RECIPIENT reaches.
 *
 *  ------------------------------------------------------------------
 *  WHY A SIXTH `@Public()` ROUTE IS STILL SAFE
 *  ------------------------------------------------------------------
 *  `need.decorator.ts` says the right list of public routes is very short and
 *  that a third one should make you stop and ask. The landing intake door was
 *  the third, the Resend webhook and `/healthz/email` were the fourth and
 *  fifth; these two are the sixth and seventh, so the reason is written down
 *  rather than assumed.
 *
 *  `@Public()` means "no SESSION required". It does not mean "no proof
 *  required", and here there are two callers, NEITHER of which can log in:
 *
 *   · `POST` is one-click unsubscribe (RFC 8058). The caller is Gmail's or
 *     Yahoo's own infrastructure, acting on a `List-Unsubscribe-Post` header
 *     the letter carried. There is no person, no browser, no cookie jar, and no
 *     credential this system could hand a mail provider that would not itself
 *     be a secret sitting in someone else's configuration;
 *   · `GET` is the person, in a mail client, tapping a link in a letter that
 *     may have been forwarded, read on a phone, or opened a month later. A
 *     login wall in front of "stop mailing me" is not security — it is a dark
 *     pattern, and the people it stops are exactly the people who then press
 *     "this is spam" instead, which costs the sending domain far more.
 *
 *  What replaces the session is the signature the link carries.
 *  `unsubscribe-token.ts` mints `<deliveryId>.<HMAC>` keyed by
 *  `PV_UNSUBSCRIBE_SECRET`, so the delivery id in the URL is not enumerable: a
 *  stranger who counts cannot unsubscribe a neighbour, which is the whole
 *  attack this door would otherwise open on the one table this system will not
 *  let a screen undo casually.
 *
 *  ------------------------------------------------------------------
 *  THREE FENCES, BECAUSE A SIGNATURE ALONE IS NOT A DESIGN
 *  ------------------------------------------------------------------
 *   · this door never SENDS. Nothing below can put a byte on the wire — an
 *     unsubscribe that answered with a confirmation mail would be a mail sent
 *     to someone who just asked to stop receiving mail;
 *   · the recipient address is never logged, never rendered into the page, and
 *     never echoed in the response. It is read from the delivery row, handed
 *     straight to `suppress()`, and dropped. `delivery.id` is the only
 *     identifier a runbook gets, exactly as on the webhook door;
 *   · the action only ever ADDS to `email_suppression`. There is no route here
 *     that releases an address — re-subscribing is a decision a person makes
 *     somewhere they are logged in.
 *
 *  ------------------------------------------------------------------
 *  THE POST ANSWERS 200 TO EVERYTHING, AND THAT IS DELIBERATE
 *  ------------------------------------------------------------------
 *  A bad token, a token for a delivery that no longer exists, a second POST for
 *  an address already suppressed — all 200, all writing nothing beyond what the
 *  first valid call wrote. Two reasons, and both matter more than the tidiness
 *  of a 404:
 *
 *   · an unattended caller cannot read a status page. A 4xx to Gmail is a
 *     retry loop or a "this list's unsubscribe is broken" mark against the
 *     sending domain, neither of which helps the recipient;
 *   · answering differently for a valid and an invalid token turns this route
 *     into an oracle. `verify()` already refuses to distinguish WHICH half of a
 *     token was wrong for that reason; undoing it one layer up would be free.
 *
 *  The one thing that is NOT answered 200 is an unconfigured
 *  `PV_UNSUBSCRIBE_SECRET`: `verify()` throws on an empty key, and that throw
 *  is left to become a 500. A process that cannot check a signature cannot
 *  honour an unsubscribe either, and quietly answering "done" to a request it
 *  did not act on is the one failure worse than an error — the recipient
 *  believes they opted out and reports the next letter as spam. */
@Controller('mail/unsubscribe')
export class UnsubscribeController {
  private readonly log = new Logger('mail.unsubscribe')

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_LEDGER) private readonly ledger: MailLedger,
  ) {}

  /** One-click unsubscribe (RFC 8058). No body is read and none is required:
   *  the receiver posts `List-Unsubscribe=One-Click` as a form body, and every
   *  byte this door needs is already in the path. */
  @Post(':token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Public()
  async oneClick(@Param('token') token: string): Promise<{ ok: true }> {
    await this.apply(token, 'POST')
    return { ok: true }
  }

  /** The page a person lands on. Answers 200 with a page in BOTH cases rather
   *  than throwing on a bad token: a thrown error would leave this route
   *  through `ProblemFilter`, which answers `application/problem+json` — a
   *  browser would show a recipient a blob of JSON in place of an answer to
   *  "did it work". */
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Public()
  async page(@Param('token') token: string): Promise<string> {
    return (await this.apply(token, 'GET')) ? DONE_PAGE : BAD_TOKEN_PAGE
  }

  /** The whole action, shared by both routes because it IS the same act — the
   *  only difference between them is what the caller can read afterwards.
   *
   *  Two writes, in this order and never merged into one ledger method:
   *  `suppress()` is what actually stops the next letter, and it is keyed by
   *  ADDRESS so it outlives the delivery that revealed it;
   *  `recordEngagement()` is the note that a person did this, on the
   *  `mail_event` axis, and it must not be able to move `email_delivery.state`.
   *  Suppression goes first — if the process dies between the two, the person
   *  is still unsubscribed and only the statistic is lost.
   *
   *  Idempotent by construction: `suppress()` is an upsert by address, and a
   *  second call changes nothing a screen reads. */
  private async apply(token: string, via: 'GET' | 'POST'): Promise<boolean> {
    const deliveryId = verify(token, this.env.PV_UNSUBSCRIBE_SECRET)
    if (!deliveryId) {
      this.log.warn(`unsubscribe ${via} · chữ ký không hợp lệ`)
      return false
    }

    const recipient = await this.ledger.recipientOf(deliveryId)
    /* A correctly signed token for a row that is gone. Nothing to suppress —
       the address is only knowable through that row — so this is honestly a
       failure, and the page says so rather than claiming success. */
    if (!recipient) {
      this.log.warn(`unsubscribe ${via} · ${deliveryId} · không còn dòng gửi`)
      return false
    }

    await this.ledger.suppress(recipient, 'unsubscribe', 'operator')
    const recorded = await this.ledger.recordEngagement({
      svixId: null,
      kind: 'UNSUBSCRIBE',
      deliveryId,
      at: new Date(),
    })

    /* Delivery id only. The address that was just blocked never reaches a log
       line — that is the one place personal data leaks without anyone deciding
       to leak it. */
    this.log.log(`unsubscribe ${via} · ${deliveryId} · ${recorded}`)
    return true
  }
}

/** The two pages, whole, as constants.
 *
 *  Self-contained on purpose: no stylesheet, no font, no image, no script. A
 *  mail client's in-app browser may block every external request it does not
 *  recognise, and this page has exactly one job — telling a person whether the
 *  thing they just asked for happened. It has to work with the network already
 *  half-shut.
 *
 *  ------------------------------------------------------------------
 *  NO COLOUR OF ITS OWN, AND THAT IS THE ONLY HONEST OPTION HERE
 *  ------------------------------------------------------------------
 *  Luật 1 says colour comes from `packages/tokens` and nowhere else, and the
 *  two doors out of that rule are both shut for this file: an HTML page served
 *  by the API cannot load `globals.css`, so `var(--*)` resolves to nothing; and
 *  `apps/api` is forbidden from importing `@pv/tokens` (eslint block 3b), so
 *  the trick `@pv/mail-templates` uses — read the hex out of `BRAND_PALETTE` —
 *  is not available either. Typing a hex here would be exactly the "bịa hex
 *  mới" the rule exists to stop.
 *
 *  So the page borrows the READER'S colours: `Canvas`, `CanvasText` and
 *  `GrayText` are CSS system keywords, and with `color-scheme: light dark` they
 *  resolve to whatever that person's device already uses. Nothing is invented,
 *  contrast is theirs, and a confirmation page has no brand work to do.
 *
 *  Vietnamese, because a recipient reads it. Everything else in this file is
 *  English, because only an agent reads that. No delivery id, no address, no
 *  campaign name on screen: the page is often reached on a shared or forwarded
 *  link, so it says what happened without saying to whom. */
function shell(heading: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${heading}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 48px 24px; background: Canvas; color: CanvasText;
         font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; }
  h1 { margin: 0 0 16px; font-size: 20px; line-height: 1.35; }
  p { margin: 0 0 12px; }
  p:last-child { margin-bottom: 0; }
  small { color: GrayText; }
</style>
<main>
  <h1>${heading}</h1>
  ${body}
</main>
</html>
`
}

const DONE_PAGE = shell(
  'Đã huỷ đăng ký.',
  `<p>Địa chỉ email này đã được gỡ khỏi danh sách nhận thư giới thiệu của Pebble Vina.</p>
  <p>Bạn sẽ không nhận thêm thư quảng bá nào nữa. Các thư liên quan trực tiếp tới
  giao dịch hoặc tài khoản của bạn — nếu có — vẫn được gửi như bình thường.</p>
  <p><small>Bấm lại liên kết này cũng không sao: kết quả vẫn như trên.</small></p>`,
)

const BAD_TOKEN_PAGE = shell(
  'Liên kết không dùng được.',
  `<p>Liên kết huỷ đăng ký này không hợp lệ hoặc đã hết hiệu lực.</p>
  <p>Hãy mở lại thư gần nhất bạn nhận được và bấm vào liên kết huỷ đăng ký ở cuối thư.
  Nếu vẫn không được, trả lời thẳng vào thư đó — chúng tôi sẽ gỡ địa chỉ của bạn.</p>`,
)
