import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { reauthRequired } from '../http/problem'
import { AuthService } from './auth.service'
import { readSessionToken } from './cookie'

export const REAUTH_KEY = 'pv:reauth'

/** `@NeedsReauth()` — this door wants the password retyped first.
 *
 *  ONE RULE FOR WHERE IT GOES, so nobody has to guess next time: every door
 *  that WRITES to `platform.actor`, and every door that mints a credential.
 *  Changing a role, locking or unlocking an account, opening a new account,
 *  re-sending an invite — those decide who can get into the system and with
 *  what reach, which makes them exactly what someone who sits down at an
 *  abandoned machine would reach for.
 *
 *  It does NOT go on read doors, and not on ordinary business writes. A lead
 *  edited by mistake can be edited back and the audit log says who did it; a
 *  role edited by mistake means that person reads the whole department's book
 *  until somebody notices. Sprinkling `@NeedsReauth()` over every write button
 *  is the fastest way to teach users to type their password into any box that
 *  appears, and that habit costs more than it buys. */
export const NeedsReauth = () => SetMetadata(REAUTH_KEY, true)

/** The third gate, and the only one that asks "are you still the same person".
 *
 *  RUNS AFTER `AccessGuard`, AND THAT ORDER IS A DECISION. Somebody with no
 *  permission to change roles must be told they have no permission — not shown
 *  a password box and told so only after they type. A password box for
 *  something they can never do is both a password typed for nothing and a
 *  lesson that typing it correctly would have worked.
 *
 *  Reversing it is worse than untidy: it turns this door into a permission
 *  probe. Type any password, and a 403 that says "wrong password" rather than
 *  "no permission" confirms you found a door you are not allowed near.
 *
 *  ONE EXTRA QUERY, ONLY ON DECLARED DOORS. `reauthFresh` re-reads the session
 *  by `token_hash`, one more index seek on top of the one `ActorGuard` already
 *  paid. That is affordable because it runs on three admin doors a manager
 *  presses a few times a day. The way to avoid it is to have `ActorGuard` carry
 *  `reauth_at` onto `req` — making EVERY request in the system haul a field
 *  that 99% of them never read, to save a query on the other 1%. If the
 *  `@NeedsReauth()` list ever grows enough to flip that trade, this note is the
 *  record that it was considered. */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const needs = this.reflector.getAllAndOverride<boolean>(REAUTH_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!needs) return true

    const req = ctx.switchToHttp().getRequest<FastifyRequest>()
    if (await this.auth.reauthFresh(readSessionToken(req))) return true
    throw reauthRequired()
  }
}
