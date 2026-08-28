import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { AuthController } from './auth.controller'
import { AuthRepository } from './auth.repository'
import { AuthService } from './auth.service'
import { PasswordResetMailer } from './password-reset.mailer'
import { RESET_MAILER } from './reset-mailer'
import { SessionSweeper } from './session.sweeper'

/** WHO MAY GET IN — the sign-in flow, the session table, the reset tickets.
 *
 *  ------------------------------------------------------------------
 *  `AuthService` IS EXPORTED; `AuthRepository` IS NOT
 *  ------------------------------------------------------------------
 *  Two things outside this module need it, and both need the RULES rather than
 *  the tables:
 *
 *   · `ActorGuard` (provided by `AppModule` through `APP_GUARD`) calls
 *     `resolve` on every request — that is the seam the guard's own docblock
 *     reserved for a real session.
 *   · The `/users` admin door calls `issueInvite` when a manager opens an
 *     account for somebody.
 *
 *  The repository stays inside. Handing it out would let another module write
 *  `platform.session` and `platform.actor.password_hash` directly, and every
 *  rule stated in `auth.service.ts` — one message for every refusal, the
 *  password derivation spent even on a miss, sessions revoked when a password
 *  changes — is a rule that only holds because there is one way in.
 *
 *  ------------------------------------------------------------------
 *  `RESET_MAILER` IS A TOKEN, NOT A CLASS
 *  ------------------------------------------------------------------
 *  A symbol so the letter can be rebound without reopening the service that
 *  decides who may sign in — see the long note in `reset-mailer.ts` for what
 *  an implementation must respect. That rebinding has now happened:
 *  `PasswordResetMailer` renders the real body and posts it through
 *  `MAIL_PORT`, and this line is the whole of the change it needed.
 *
 *  `LoggingResetMailer` stays in `reset-mailer.ts`, unbound. It is not dead
 *  code: it is what a test module or a machine deliberately built without a
 *  mail path binds instead, and it is the thing that keeps the seam visible —
 *  a token with exactly one possible implementation reads like an indirection
 *  nobody needed.
 *
 *  Bound with `useClass` and not `useFactory`: unlike `MAIL_PORT`, whose Resend
 *  driver throws when constructed without a key, nothing here fails to build on
 *  a machine that was never meant to send.
 *
 *  ------------------------------------------------------------------
 *  `MailModule` IS IMPORTED FOR EXACTLY ONE PROVIDER
 *  ------------------------------------------------------------------
 *  `PasswordResetMailer` injects `MAIL_PORT`, and `MailModule` is not
 *  `@Global()` — only `ConfigModule` and `DbModule` are, and `app.module.ts`
 *  explains why that list is short. So the edge has to be declared, and
 *  declaring it here rather than leaning on the fact that `AppModule` already
 *  imports `MailModule` is the same rule `app.module.ts` states about not
 *  reaching a platform module by way of a branch that happens to be in the
 *  tree.
 *
 *  `MAIL_PORT` and NOT `MAIL_ENQUEUE`, which is the token every other sender in
 *  this codebase holds. That is the deliberate exception, and its reasoning —
 *  the reset token would otherwise be written in clear into
 *  `platform.email_delivery.merge`, defeating the hash in
 *  `platform.password_reset` — is written out at the top of
 *  `password-reset.mailer.ts`. Read it before moving this letter onto the
 *  queue. */
@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    SessionSweeper,
    { provide: RESET_MAILER, useClass: PasswordResetMailer },
  ],
  exports: [AuthService],
})
export class AuthModule {}
