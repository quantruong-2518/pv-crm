import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { passwordChangeRequired } from '../http/problem'

export const OWING_OK_KEY = 'pv:owing-ok'

/** `@OpenWhileOwingPassword()` — this door still answers somebody who is holding
 *  a password an administrator handed them.
 *
 *  IT GOES ON THE WHOLE `/auth` CONTROLLER, not on a hand-picked list of
 *  methods, because the sign-in flow is exactly the set of doors that must keep
 *  working for somebody who cannot yet use the rest of the system:
 *
 *   · `change-password` pays the debt — the point of the whole mechanism;
 *   · `sign-in` must never close, or a person cannot sign in as somebody else
 *     without first signing out of an account they are stuck in;
 *   · `forgot-password` and the two `reset-password` doors are the way back for
 *     somebody who was handed a default password and then forgot it. Closing
 *     them leaves exactly one route out of the system: an administrator with
 *     database access;
 *   · `sign-out` must never close either. Refusing to let a person leave is how
 *     a forced change becomes a trapped account;
 *   · `me` is what the app boots on — without it the session store never
 *     resolves and the screen cannot even find out why it is stuck — and
 *     `renew` keeps the session from dying underneath somebody mid-form.
 *
 *  Metadata rather than a list of paths, for `@NeedsReauth()`'s reason: a path
 *  list is a second place to edit when a route moves, and the guard would stop
 *  matching silently. Everything outside this controller is closed by default,
 *  which is the direction a mistake here should fail in. */
export const OpenWhileOwingPassword = () => SetMetadata(OWING_OK_KEY, true)

/** `@ClosedWhileOwingPassword()` — opt one method back out of the controller's
 *  blanket exemption. `confirm-password` is the only one.
 *
 *  It takes a password like `change-password` does, but it opens the sudo
 *  window for administrative actions, and every one of those is behind this
 *  guard anyway. Letting it through would buy nothing but a password typed to
 *  reach a door that refuses on the next hop — and it would put a
 *  password-confirmation box in front of somebody whose actual problem is a
 *  different screen entirely.
 *
 *  Works because `getAllAndOverride` reads the handler before the class, so the
 *  `false` here wins over the `true` on the controller. */
export const ClosedWhileOwingPassword = () => SetMetadata(OWING_OK_KEY, false)

/** The gate that makes `DEFAULT_PASSWORD` safe to have written down.
 *
 *  ------------------------------------------------------------------
 *  WHY A GUARD AND NOT A REDIRECT IN THE BROWSER
 *  ------------------------------------------------------------------
 *  `SessionView.mustChangePassword` tells the screen where to send the person,
 *  and that is all it does. Somebody holding a password out of a public git
 *  repository who skips the screen — by calling the API directly, or by editing
 *  one boolean in a response — must still be unable to read a single lead. The
 *  fence has to be here, on the server, on every door.
 *
 *  ------------------------------------------------------------------
 *  WHY IT RUNS BEFORE `AccessGuard`, THE OPPOSITE OF `ReauthGuard`
 *  ------------------------------------------------------------------
 *  `ReauthGuard` runs last on purpose: somebody who lacks a permission should
 *  hear that, not be shown a password box for something they could never do.
 *  This one is the reverse case and the same principle. While the mark is set
 *  NO door opens, so a permission verdict would be a true sentence about the
 *  wrong problem — it would send a director off to find an administrator when
 *  the only thing in their way is a form they can fill in themselves.
 *
 *  It sits after `ActorGuard` because it needs to know who is calling, and it
 *  reads the flag that guard already stashed rather than asking the database a
 *  second time. */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()

    /* No session, no debt to answer for. Sign-in and forgot-password are
       reached without one, and refusing them here would wall off the very doors
       that produce the session this guard judges. */
    if (!req.actor || !req.owesPasswordChange) return true

    const open = this.reflector.getAllAndOverride<boolean>(OWING_OK_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (open) return true

    throw passwordChangeRequired()
  }
}
