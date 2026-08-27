import { Inject, Injectable, Logger } from '@nestjs/common'
import { Resend, type CreateEmailOptions, type CreateEmailRequestOptions } from 'resend'
import { ENV, type Env } from '@api/platform/config/env'
import type { MailFailure, MailMessage, MailPort, MailSendResult } from './mail.contract'

const SEND_TIMEOUT_MS = 15_000
/** Resend's own default for `rate_limit_exceeded` responses (2 req/s on most
 *  plans) when the response carries no `Retry-After`/`ratelimit-reset`
 *  header to read a real number from. */
const DEFAULT_RATE_LIMIT_RETRY_SECONDS = 5
/** A day/month quota resets on a clock, not on a backoff curve — parking the
 *  queue for an hour is closer to "try again once this makes sense" than the
 *  five-second default above, and still short enough that a human notices
 *  the dead-lettered mail well before it matters. */
const DEFAULT_QUOTA_RETRY_SECONDS = 3600

/** The shape `resend@6`'s `fetchRequest()` always resolves to on a failed
 *  call — see `node_modules/resend/dist/index.cjs`. It never throws: a
 *  network reset and an aborted `AbortSignal.timeout` both land here as
 *  `statusCode: null`, same as every HTTP error status. */
type ResendErrorLike = { message: string; statusCode: number | null; name: string }

/** `resend`'s public `CreateEmailRequestOptions` doesn't declare `signal` —
 *  but `Resend.post()` spreads its `options` argument straight into the
 *  `fetch()` call it makes, so a `signal` field on the object we pass through
 *  is honored at runtime regardless of whether the SDK's own type names it. */
type SendOptions = CreateEmailRequestOptions & { signal?: AbortSignal }

/** `MailPort` over the real Resend API. Registered for `MAIL_PORT` only when
 *  `PV_EMAIL_ENABLED=true` — that wiring, like every other provider binding,
 *  lives in `app.module.ts`, not here. */
@Injectable()
export class ResendMailDriver implements MailPort {
  private readonly log = new Logger('mail')
  private readonly resend: Resend

  constructor(@Inject(ENV) env: Env) {
    this.resend = new Resend(env.RESEND_API_KEY)
  }

  async send(message: MailMessage, idempotencyKey: string): Promise<MailSendResult> {
    const payload: CreateEmailOptions = {
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }
    if (message.replyTo) payload.replyTo = message.replyTo
    if (message.headers) payload.headers = message.headers

    const options: SendOptions = { idempotencyKey, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }

    let response: Awaited<ReturnType<Resend['emails']['send']>>
    try {
      response = await this.resend.emails.send(payload, options)
    } catch {
      // Defense only — the SDK's own `fetchRequest()` catches every network
      // and abort error and resolves `{ data: null, error }` instead of
      // rejecting (confirmed by reading `resend@6.24.0`'s bundled source).
      // This branch is a guard against a future SDK version changing that.
      this.log.error(`[resend] key=${idempotencyKey} code=unexpected_exception`)
      return {
        ok: false,
        kind: 'retry',
        code: 'unexpected_exception',
        summary: 'Gửi mail thất bại không rõ nguyên nhân — SDK ném lỗi thay vì trả về.',
      }
    }

    if (response.error) {
      const failure = classify(response.error, response.headers)
      this.log.error(
        `[resend] key=${idempotencyKey} code=${failure.code} status=${response.error.statusCode ?? 'n/a'}`,
      )
      return { ok: false, ...failure }
    }

    return { ok: true, providerEmailId: response.data.id }
  }
}

/** The classification table this driver is built against — see the task
 *  brief. Ordered so quota beats plain rate-limit and `invalid_idempotent_request`
 *  beats the generic 409 case; every other branch is a `statusCode` range. */
function classify(error: ResendErrorLike, headers: Record<string, string> | null): MailFailure {
  const { name: code, message: summary, statusCode } = error

  // No HTTP response at all: timeout or network reset, both surfaced by the
  // SDK as `statusCode: null` (see `ResendErrorLike` above).
  if (statusCode === null) return { kind: 'retry', code, summary }

  if (code === 'daily_quota_exceeded' || code === 'monthly_quota_exceeded') {
    return {
      kind: 'rate-limit',
      code,
      summary,
      retryAfterSeconds: readRetryAfterSeconds(headers) ?? DEFAULT_QUOTA_RETRY_SECONDS,
    }
  }

  if (code === 'rate_limit_exceeded' || statusCode === 429) {
    return {
      kind: 'rate-limit',
      code,
      summary,
      retryAfterSeconds: readRetryAfterSeconds(headers) ?? DEFAULT_RATE_LIMIT_RETRY_SECONDS,
    }
  }

  if (statusCode === 409) {
    // Same idempotency key, request still in flight elsewhere — safe to
    // retry. Same key, DIFFERENT payload — that never self-heals.
    if (code === 'invalid_idempotent_request') return { kind: 'permanent', code, summary }
    return { kind: 'retry', code, summary }
  }

  if (statusCode >= 500) return { kind: 'retry', code, summary }

  // Everything left — 400/422 validation, 401/403 auth — is a request that
  // will fail exactly the same way on the next attempt.
  return { kind: 'permanent', code, summary }
}

function readRetryAfterSeconds(headers: Record<string, string> | null): number | null {
  if (!headers) return null
  for (const key of ['retry-after', 'ratelimit-reset']) {
    const raw = headers[key]
    if (!raw) continue
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  }
  return null
}
