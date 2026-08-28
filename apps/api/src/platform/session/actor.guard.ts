import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AuthService } from '../auth/auth.service'
import { readSessionToken } from '../auth/cookie'
import { ENV, type Env } from '../config/env'
import { ActorRepository } from './actor.repository'

/** Xác định NGƯỜI ĐANG GỌI là ai. Không quyết định gì về quyền.
 *
 *  Là guard chứ không phải middleware, và lý do rất cụ thể: dưới
 *  `FastifyAdapter`, middleware của Nest nhận `IncomingMessage` thô, còn
 *  `@CurrentActor()` đọc `FastifyRequest`. Gắn vào một cái rồi đọc ở cái kia
 *  là `undefined` lặng lẽ. Guard nhận đúng `FastifyRequest`.
 *
 *  Đăng ký TRƯỚC `AccessGuard` trong `app.module.ts` — Nest chạy guard toàn
 *  cục theo đúng thứ tự khai báo, và `AccessGuard` cần `req.actor` đã có.
 *
 *  ------------------------------------------------------------------
 *  THE SEAM IS NOW FILLED IN — COOKIE FIRST, HEADER ONLY AS A FALLBACK
 *  ------------------------------------------------------------------
 *  This docblock used to say that when real sessions arrived, `resolve` would
 *  become "read the cookie, then look up `platform.session`". That is what it
 *  now does, and the ORDER is the part worth stating: the cookie is tried
 *  first, and `X-PV-Actor-Id` is consulted only when there is no cookie at all.
 *
 *  Reversing that would be a live impersonation hole rather than a style
 *  choice: on a machine with `PV_TRUST_ACTOR_HEADER=true`, a header wins over a
 *  real signed-in session, so anything able to add a header to a request —
 *  a browser extension, a proxy, a piece of test tooling somebody forgot to
 *  remove — silently becomes whoever it names. Cookie first means the header
 *  can only ever answer a question nobody else answered.
 *
 *  The header survives at all because `curl` and Postman have no sign-in
 *  screen, and because `env.ts` refuses to boot with the flag on in production.
 *  `.env` now ships with it OFF, so the real path is the one exercised on a
 *  development machine; flip it on deliberately for a session with a terminal.
 *
 *  ------------------------------------------------------------------
 *  STILL `return true`, ALWAYS
 *  ------------------------------------------------------------------
 *  Unchanged, and now load-bearing in a second way: `/auth/sign-in` and
 *  `/auth/forgot-password` are reached by people who by definition have no
 *  session, so a guard that refused unauthenticated requests here would wall
 *  off the only doors that can produce a session. "Anh là ai" and "anh được
 *  làm gì" stay two questions; the second is `AccessGuard`'s. */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly actors: ActorRepository,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()
    req.actor = await this.resolve(req)
    /* Luôn cho đi tiếp: "anh là ai" và "anh được làm gì" là hai câu hỏi khác
       nhau, và câu thứ hai là việc của AccessGuard. Chặn ở đây thì endpoint
       công khai (đăng nhập, quên mật khẩu) cũng chặn theo. */
    return true
  }

  private async resolve(req: FastifyRequest) {
    const token = readSessionToken(req)
    /* `AuthService.resolve` also pushes the sitting-still mark forward when it
       has fallen more than a minute behind — that write belongs to reading the
       session, not to the guard, so it is on the far side of this call. */
    if (token) return await this.auth.resolve(token)

    if (!this.env.PV_TRUST_ACTOR_HEADER) return null
    const id = req.headers['x-pv-actor-id']
    return typeof id === 'string' && id ? await this.actors.byId(id) : null
  }
}
