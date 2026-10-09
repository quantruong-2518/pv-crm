import { Injectable, Logger } from '@nestjs/common'
import { COMPANY_MAIL_DOMAIN, type GoogleMailReadiness } from '@pv/contracts'
import { openToken } from './google-crypto'
import { GMAIL_SCOPES, GoogleOAuth } from './google-oauth.client'
import { GoogleRepository } from './google.repository'
import type { GoogleLinkRowDb } from './google.schema'

/** One person's Google link as the rest of the system may use it: a fresh
 *  access token, and whether the link may send mail as that person.
 *
 *  No access-token cache: each call refreshes first, and the caller's ONE
 *  `signal` spans the refresh and whatever it does next. `invalid_grant` means
 *  the person revoked access at Google — the link row is deleted so the screen
 *  asks them to reconnect. Nothing else deletes it: a token that will not
 *  decrypt is our key's fault, not theirs. */

export type GoogleToken =
  { state: 'ok'; token: string; email: string } | { state: 'off' | 'not_connected' | 'failed' }

@Injectable()
export class GoogleAccess {
  private readonly log = new Logger('google')

  constructor(
    private readonly oauth: GoogleOAuth,
    private readonly links: GoogleRepository,
  ) {}

  get configured(): boolean {
    return this.oauth.config !== null
  }

  /** DB only, no network. null = Google not configured or this actor has no link. */
  async mailReadiness(
    actorId: string,
  ): Promise<{ readiness: GoogleMailReadiness; email: string } | null> {
    if (!this.oauth.config) return null
    const link = await this.links.byActor(actorId)
    return link ? { readiness: mailReadinessOf(link), email: link.googleEmail } : null
  }

  async tokenFor(actorId: string, signal: AbortSignal): Promise<GoogleToken> {
    const config = this.oauth.config
    if (!config) return { state: 'off' }
    const link = await this.links.byActor(actorId)
    if (!link) return { state: 'not_connected' }

    let refreshToken: string
    try {
      refreshToken = openToken(config.key, actorId, link.refreshTokenEnc)
    } catch {
      /* A mistyped GOOGLE_TOKEN_KEY would fail every row: keep them all. */
      this.log.warn('stored refresh token cannot be decrypted — check GOOGLE_TOKEN_KEY')
      return { state: 'failed' }
    }
    const access = await this.oauth.accessToken(config, refreshToken, signal)
    if (access === 'revoked') {
      await this.links.remove(actorId)
      return { state: 'not_connected' }
    }
    return access ? { state: 'ok', token: access, email: link.googleEmail } : { state: 'failed' }
  }
}

/** The domain is judged first: consent on a private mailbox must never read
 *  as "one click away" from sending company letters. */
export function mailReadinessOf(
  link: Pick<GoogleLinkRowDb, 'googleEmail' | 'scope'>,
): GoogleMailReadiness {
  const domain = link.googleEmail.slice(link.googleEmail.lastIndexOf('@') + 1).toLowerCase()
  if (domain !== COMPANY_MAIL_DOMAIN) return 'wrong_domain'
  const granted = new Set(link.scope.split(/\s+/))
  return GMAIL_SCOPES.every((scope) => granted.has(scope)) ? 'ready' : 'needs_consent'
}
