import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Resend, type WebhookEventPayload } from 'resend'
import { Public } from '@api/platform/access/need.decorator'
import { ENV, type Env } from '@api/platform/config/env'
import { PvError } from '@api/platform/http/problem'
import {
  MAIL_LEDGER,
  type MailLedger,
  type MailState,
  type SuppressionReason,
} from './mail.contract'

/** THE TWO INBOUND DOORS OF THE MAIL PATH. Both only READ or RECORD; neither
 *  can cause a byte to leave this company.
 *
 *  ------------------------------------------------------------------
 *  WHY A FOURTH `@Public()` ROUTE IS STILL SAFE
 *  ------------------------------------------------------------------
 *  `need.decorator.ts` says the right list of public routes is very short —
 *  login and `/healthz` — and that a third one should make you stop and ask.
 *  The landing intake door was the third; these are the fourth and fifth, so
 *  the reason has to be written down rather than assumed.
 *
 *  `@Public()` means "no SESSION required". It does not mean "no proof
 *  required". A webhook cannot log in: the caller is Resend's server, it has
 *  no user, and a login it could perform would be a credential sitting in a
 *  third party's configuration. What replaces the session is a signature —
 *  every request carries `svix-id`/`svix-timestamp`/`svix-signature`, an HMAC
 *  over the exact bytes received, keyed by `RESEND_WEBHOOK_SECRET`. An
 *  unsigned or mis-signed request is refused before a single row is touched,
 *  and the timestamp inside the signed envelope bounds replay. That is a
 *  STRONGER check than the session-cookie path this codebase has today, not a
 *  weaker one.
 *
 *  Two further fences, because a signature alone is not a design:
 *   · this door never SENDS. Receiving "it bounced" must not produce "then let
 *     me try again by mail" — that is how a mail loop is built. Every path
 *     below ends in a ledger write;
 *   · the payload is never logged in full and the mail body is never touched.
 *     A webhook body carries recipient addresses and subjects; a log line is
 *     the one place personal data leaks without anyone deciding to leak it.
 *
 *  `/healthz/email` is public for the same reason `/healthz` is: a runbook
 *  needs it exactly when sessions are the thing that is broken. It answers
 *  with three counters and no addresses.
 *
 *  Why it lives HERE and not in `platform/health/health.controller.ts`:
 *  `HealthModule` has no providers, so reaching the ledger would force health
 *  to import the mail module — turning the check into a dependent of the thing
 *  it watches, and making a broken mail module take `/healthz` down with it.
 *  Registering this class from the mail module keeps that arrow pointing one
 *  way. */

/** Resend event type → the ledger state it proves. `email.opened`,
 *  `email.clicked`, `contact.*` and `domain.*` are deliberately absent: they
 *  say nothing about whether a mail arrived, and a row must not move for them. */
type Signal = {
  state: MailState
  /** Structural subset of Resend's `BaseEmailEventData` — that interface is
   *  not exported by the SDK, and this door needs exactly two fields of it. */
  data: { email_id: string; to: string[] }
  /** Short diagnostic, never the mail body. Truncated before it is stored. */
  reason?: string
  /** Set only when the ADDRESS itself is burnt, not merely this attempt. */
  suppress?: SuppressionReason
}

/** A pending row older than this means nothing is draining the queue — the
 *  worker is down, wedged, or never started. Above the retry backoff ceiling
 *  so ordinary retrying never reads as broken. */
const STUCK_AFTER_SECONDS = 900

@Controller('integrations/resend')
export class MailWebhookController {
  private readonly log = new Logger('mail.webhook')
  private client: Resend | null = null

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_LEDGER) private readonly ledger: MailLedger,
  ) {}

  @Post('webhooks')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Public()
  async receive(@Req() req: RawBodyRequest<FastifyRequest>): Promise<{ ok: true }> {
    const svixId = this.headerOf(req, 'svix-id')
    const event = this.verified(req, svixId)
    const signal = this.read(event)

    /* Answer 200 for an event we do not act on. A 4xx tells Resend to retry
       forever an event that will never become interesting. */
    if (!signal) {
      this.log.debug(`resend ${event.type} · ngoài phạm vi`)
      return { ok: true }
    }

    /* Replay protection and the no-going-backwards rule both live in the
       ledger, keyed by `svixId` and compared by state rank. Re-deciding either
       of them here would be a second implementation of the same rule, and the
       two would drift. */
    const outcome = await this.ledger.applyWebhook({
      svixId,
      type: event.type,
      providerEmailId: signal.data.email_id || null,
      state: signal.state,
      ...(signal.reason ? { reason: signal.reason.slice(0, 500) } : {}),
      at: this.timeOf(event.created_at),
    })

    /* Suppression is keyed by ADDRESS, not by delivery row: it has to outlive
       the mail that revealed it, and it has to apply even when the webhook
       names a delivery this system never queued. It is idempotent by address,
       so it runs on a stale or duplicated event too — a hard bounce is a hard
       bounce regardless of whether the row moved. */
    if (signal.suppress) {
      for (const address of signal.data.to) {
        await this.ledger.suppress(address, signal.suppress, 'resend')
      }
    }

    /* `email_id` is a provider identifier, not personal data — it is the one
       thing that makes a runbook able to follow a mail. No recipient, no
       subject, no body. */
    this.log.log(`resend ${event.type} · ${signal.data.email_id} · ${outcome}`)
    return { ok: true }
  }

  /** Verify the signature over the RAW bytes, or refuse without writing.
   *
   *  `req.rawBody` exists because `main.ts` boots Nest with `rawBody: true`;
   *  re-serialising `req.body` would not work, because `JSON.stringify` of a
   *  parsed object is not byte-identical to what was signed (key order,
   *  whitespace, number formatting), so every signature would fail. */
  private verified(req: RawBodyRequest<FastifyRequest>, svixId: string): WebhookEventPayload {
    const secret = this.env.RESEND_WEBHOOK_SECRET
    /* No secret configured = the door is CLOSED, not open. An unverifiable
       webhook is an unauthenticated write to the delivery ledger. */
    if (secret === '') throw this.refuse()

    const raw = req.rawBody
    const timestamp = this.headerOf(req, 'svix-timestamp')
    const signature = this.headerOf(req, 'svix-signature')
    if (!raw || !svixId || !timestamp || !signature) throw this.refuse()

    try {
      return this.resend().webhooks.verify({
        payload: raw.toString('utf8'),
        headers: { id: svixId, timestamp, signature },
        webhookSecret: secret,
      })
    } catch {
      /* Swallow the library's message on purpose: it distinguishes "bad
         signature" from "timestamp too old", and telling an unauthenticated
         caller which one it was is a probing oracle. */
      throw this.refuse()
    }
  }

  /** `new Resend()` throws without an API key, and this process may be
   *  configured to RECEIVE webhooks while not being allowed to SEND
   *  (`PV_EMAIL_ENABLED=false` is the correct state of every dev machine).
   *  Verification is pure HMAC over the body and never reads the key, so a
   *  placeholder keeps the door working without inventing a send capability.
   *  Built lazily so a machine that never receives a webhook never builds it. */
  private resend(): Resend {
    this.client ??= new Resend(this.env.RESEND_API_KEY || 'resend-verify-only')
    return this.client
  }

  /** Switch rather than a lookup table so TypeScript narrows `event.data` and
   *  the bounce/failure/suppression details are reachable without a cast. */
  private read(event: WebhookEventPayload): Signal | null {
    switch (event.type) {
      /* Resend accepted it and handed it on. Same rank as the worker's own
         `markAccepted`, so a replayed `email.sent` after `email.delivered`
         changes nothing — `advances` refuses it. */
      case 'email.sent':
        return { state: 'accepted', data: event.data }
      case 'email.delivered':
        return { state: 'delivered', data: event.data }
      case 'email.delivery_delayed':
        return { state: 'delayed', data: event.data }
      case 'email.bounced':
        return {
          state: 'bounced',
          data: event.data,
          reason: `${event.data.bounce.type}/${event.data.bounce.subType}: ${event.data.bounce.message}`,
          /* ONLY a permanent bounce burns the address. A transient one is a
             full mailbox or a greylist; suppressing on it would quietly stop a
             working mailbox from ever hearing about a new lead again, and
             nobody would notice for weeks. Unknown types are treated as
             transient for the same reason. */
          ...(event.data.bounce.type.toLowerCase() === 'permanent'
            ? { suppress: 'hard_bounce' as const }
            : {}),
        }
      case 'email.complained':
        /* Someone pressed "this is spam". Sending again is how a sending
           domain gets blocked for everyone. */
        return { state: 'complained', data: event.data, suppress: 'complaint' }
      case 'email.failed':
        return {
          state: 'failed_permanent',
          data: event.data,
          reason: event.data.failed.reason,
        }
      case 'email.suppressed':
        /* Resend refused to send because the address is already on ITS
           suppression list. Recorded, but not re-suppressed here: the reason
           belongs to the bounce or complaint that put it there. */
        return {
          state: 'suppressed',
          data: event.data,
          reason: `${event.data.suppressed.type}: ${event.data.suppressed.message}`,
        }
      default:
        return null
    }
  }

  private timeOf(value: string): Date {
    const at = new Date(value)
    /* A malformed timestamp inside a VERIFIED envelope is a provider bug, not
       an attack. Falling back to now keeps the ledger ordered rather than
       storing `Invalid Date`. */
    return Number.isNaN(at.getTime()) ? new Date() : at
  }

  private headerOf(req: FastifyRequest, name: string): string {
    const value = req.headers[name]
    return typeof value === 'string' ? value : ''
  }

  /** 401, and the same 401 for every kind of failure.
   *
   *  Built inline rather than through the factories in `problem.ts` because
   *  `denied()` maps to session language ("Phiên đã hết hạn...") and this
   *  caller has no session to expire — same reason `lead-intake.guard.ts`
   *  builds its origin refusal by hand. */
  private refuse(): PvError {
    return new PvError({
      kind: 'unauthenticated',
      status: 401,
      title: 'Chữ ký webhook không hợp lệ.',
    })
  }
}

export type EmailHealth =
  | {
      status: 'ok' | 'degraded'
      ledger: true
      pending: number
      oldestPendingSeconds: number | null
      dead: number
    }
  | { status: 'degraded'; ledger: false }

/** `GET /healthz/email` — the only window onto the mail queue.
 *
 *  This repo has no metrics stack, and a queue nobody can see is a queue that
 *  stops draining silently. Three counters answer the only two questions a
 *  runbook has at 2am: is anything moving, and is anything parked. */
@Controller('healthz')
export class MailHealthController {
  constructor(@Inject(MAIL_LEDGER) private readonly ledger: MailLedger) {}

  @Get('email')
  @Header('Cache-Control', 'no-store')
  @Public()
  async check(): Promise<EmailHealth> {
    try {
      const queue = await this.ledger.queueHealth()
      /* `degraded`, never a 5xx: a deep queue or a parked row needs a human,
         but the process is healthy. Answering 500 here would make a load
         balancer pull a perfectly good machine out of rotation over a mail. */
      const stuck = queue.dead > 0 || (queue.oldestPendingSeconds ?? 0) > STUCK_AFTER_SECONDS
      return { status: stuck ? 'degraded' : 'ok', ledger: true, ...queue }
    } catch {
      return { status: 'degraded', ledger: false }
    }
  }
}
