import { Inject, Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'
import { ENV, type Env } from '../config/env'
import { tokenKeyOf } from './google-crypto'

/** The ONLY file that knows Google's OAuth endpoints, and the one reader of the
 *  four `GOOGLE_*` env keys. Plain `fetch`, no `googleapis`: four endpoints do
 *  not earn a dependency that size.
 *
 *  Any key empty (or a token key that is not 32 bytes) = `config` is null and
 *  the whole feature reads `off`, the `RESEND_API_KEY` convention. Tokens never
 *  reach a log line: every warn here names the step and the status only. */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
/** Send as the person, and read thread HEADERS only: `gmail.metadata` cannot
 *  fetch a body, which is what lets the reply sweep promise it never reads one. */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.metadata',
] as const
const SCOPES = ['openid', 'email', CALENDAR_SCOPE, ...GMAIL_SCOPES].join(' ')

/** The cap the booking path promised: a slow Google never holds a save longer. */
export const GOOGLE_TIMEOUT_MS = 8_000

export type GoogleConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  key: Buffer
}

const TokenBody = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
})

/** Unverified is refused: the company-domain gate on sending rests on this claim. */
const IdClaims = z.object({ email: z.string().includes('@'), email_verified: z.literal(true) })

export type Granted = { refreshToken: string; scope: string; email: string }

@Injectable()
export class GoogleOAuth {
  private readonly log = new Logger('google')
  readonly config: GoogleConfig | null

  constructor(@Inject(ENV) env: Env) {
    const key = tokenKeyOf(env.GOOGLE_TOKEN_KEY)
    const strings = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI]
    this.config =
      key && strings.every((s) => s.length > 0)
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: env.GOOGLE_REDIRECT_URI,
            key,
          }
        : null
  }

  /** `offline` + `consent`: Google hands out a refresh token only on a consent
   *  it shows, and a reconnect without one would store nothing usable. */
  consentUrl(c: GoogleConfig, state: string): string {
    const query = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    })
    return `${AUTH_URL}?${query.toString()}`
  }

  /** Code → refresh token, granted scope and the account's email. The email
   *  comes from the id token Google returned on this TLS call itself, so its
   *  signature needs no second check (OIDC Core §3.1.3.7). */
  async exchange(c: GoogleConfig, code: string): Promise<Granted | null> {
    const body = await this.token(c, { grant_type: 'authorization_code', code })
    if (body === null || body === 'revoked') return null
    if (!body.refresh_token) {
      this.log.warn('code exchanged but Google returned no refresh token')
      return null
    }
    const email = emailOf(body.id_token)
    if (!email) {
      this.log.warn('code exchanged but the id token carries no verified email')
      return null
    }
    return { refreshToken: body.refresh_token, scope: body.scope ?? '', email }
  }

  /** A fresh access token; `revoked` when Google says the grant is gone
   *  (`invalid_grant`), null for any other failure. */
  async accessToken(
    c: GoogleConfig,
    refreshToken: string,
    signal: AbortSignal,
  ): Promise<string | 'revoked' | null> {
    const body = await this.token(
      c,
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      signal,
    )
    return body === 'revoked' ? 'revoked' : (body?.access_token ?? null)
  }

  /** Best effort: the row is deleted whatever Google answers. */
  async revoke(token: string): Promise<void> {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      })
    } catch {
      this.log.warn('revoke unreachable — row removed anyway')
    }
  }

  private async token(
    c: GoogleConfig,
    grant: Record<string, string>,
    signal: AbortSignal = AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  ): Promise<z.infer<typeof TokenBody> | 'revoked' | null> {
    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          ...grant,
          client_id: c.clientId,
          client_secret: c.clientSecret,
          redirect_uri: c.redirectUri,
        }).toString(),
        signal,
      })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const error = (json as { error?: unknown } | null)?.error
        this.log.warn(`token ${grant['grant_type']} refused — status=${response.status}`)
        return error === 'invalid_grant' && grant['grant_type'] === 'refresh_token'
          ? 'revoked'
          : null
      }
      const parsed = TokenBody.safeParse(json)
      if (!parsed.success)
        this.log.warn(`token ${grant['grant_type']} reply has an unexpected shape`)
      return parsed.success ? parsed.data : null
    } catch {
      this.log.warn(`token ${grant['grant_type']} unreachable — timeout or network`)
      return null
    }
  }
}

function emailOf(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  try {
    const claims = IdClaims.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString()))
    return claims.success ? claims.data.email : null
  } catch {
    return null
  }
}
