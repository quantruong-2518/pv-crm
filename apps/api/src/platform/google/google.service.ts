import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { GoogleConnectStart, GoogleLinkStatus } from '@pv/contracts'
import { ENV, type Env } from '../config/env'
import { conflict } from '../http/problem'
import { openToken, readState, sealToken, signState } from './google-crypto'
import { CALENDAR_SCOPE, GoogleOAuth } from './google-oauth.client'
import { mailReadinessOf } from './google-access'
import { GoogleRepository } from './google.repository'

/** The life of one person's Google link: status, consent, callback, disconnect.
 *
 *  The callback answers with a URL to send the browser to, never an error
 *  body: it is a top-level navigation coming back from Google, and a JSON
 *  problem there is a page of raw text. `?google=connected|failed` tells the
 *  web app which toast to show. */

/** Long enough for a consent screen and a password prompt, short enough that
 *  a copied consent URL is dead by the time anybody else could use it. */
const STATE_TTL_MS = 10 * 60_000

export type CallbackQuery = { code?: string; state?: string; error?: string }

@Injectable()
export class GoogleService {
  private readonly log = new Logger('google')

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly oauth: GoogleOAuth,
    private readonly links: GoogleRepository,
  ) {}

  async status(who: Actor): Promise<GoogleLinkStatus> {
    const link = await this.links.byActor(who.id)
    const configured = this.oauth.config !== null
    return GoogleLinkStatus.parse({
      configured,
      connected: link !== null,
      ...(link ? { email: link.googleEmail } : {}),
      ...(link && configured ? { mail: mailReadinessOf(link) } : {}),
    })
  }

  connect(who: Actor): GoogleConnectStart {
    const c = this.oauth.config
    if (!c) throw conflict('Máy chủ chưa cấu hình kết nối Google Calendar.')
    const state = signState(c.key, who.id, new Date(Date.now() + STATE_TTL_MS))
    return GoogleConnectStart.parse({ url: this.oauth.consentUrl(c, state) })
  }

  /** The state must name the SAME person whose session carries the callback:
   *  otherwise a consent URL sent to a colleague would land their Google
   *  account on the sender's row. A grant missing the calendar box (the
   *  consent screen lets it be unticked) is not stored — it could write nothing.
   *  The Gmail boxes may be unticked: that link is stored and reads `needs_consent`. */
  async callback(who: Actor, q: CallbackQuery): Promise<string> {
    try {
      const c = this.oauth.config
      const refusal = !c
        ? 'server is not configured'
        : q.error
          ? `Google answered ${q.error}`
          : q.code === undefined || q.state === undefined
            ? 'code or state is missing'
            : readState(c.key, q.state, new Date()) !== who.id
              ? 'state does not match this session'
              : null
      const granted = c && !refusal ? await this.oauth.exchange(c, q.code ?? '') : null
      if (c && !refusal && !granted) this.log.warn('callback refused — code exchange failed')
      if (granted && !granted.scope.split(' ').includes(CALENDAR_SCOPE)) {
        this.log.warn('callback refused — calendar scope was not granted')
        return this.backTo('failed')
      }
      if (!c || !granted) {
        if (refusal) this.log.warn(`callback refused — ${refusal}`)
        return this.backTo('failed')
      }
      await this.links.save({
        actorId: who.id,
        googleEmail: granted.email,
        refreshTokenEnc: sealToken(c.key, who.id, granted.refreshToken),
        scope: granted.scope,
      })
      return this.backTo('connected')
    } catch (error) {
      /* Message only: the error may carry a token-bearing request body. */
      this.log.warn(`callback failed — ${(error as Error).name}`)
      return this.backTo('failed')
    }
  }

  /** The row goes whatever Google answers; revoking there is courtesy. */
  async disconnect(who: Actor): Promise<void> {
    const link = await this.links.byActor(who.id)
    if (!link) return
    const c = this.oauth.config
    let token: string | null = null
    try {
      token = c ? openToken(c.key, who.id, link.refreshTokenEnc) : null
    } catch {
      /* Sealed under a key since rotated: nothing usable left to revoke. */
    }
    if (token) await this.oauth.revoke(token)
    await this.links.remove(who.id)
  }

  private backTo(result: 'connected' | 'failed'): string {
    return `${this.env.PV_APP_URL.replace(/\/+$/, '')}/?google=${result}`
  }
}
