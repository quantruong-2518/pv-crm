import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
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
 *  ĐÂY LÀ MỐI NỐI, KHÔNG PHẢI XÁC THỰC
 *  ------------------------------------------------------------------
 *  Hôm nay app web chưa có token thật — `app/auth/session.ts` cố tình không
 *  giữ token giả, nó chỉ gắn header `X-PV-Actor-Id`. Guard này tin header đó,
 *  và CHỈ khi `PV_TRUST_ACTOR_HEADER=true`; `env.ts` từ chối khởi động nếu cờ
 *  đó bật ở production. Khi có phiên thật, thân hàm `resolve` đổi thành đọc
 *  cookie đã ký rồi tra bảng `platform.session` — phần còn lại của app không
 *  đụng một dòng. */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly actors: ActorRepository,
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
    if (!this.env.PV_TRUST_ACTOR_HEADER) return null
    const id = req.headers['x-pv-actor-id']
    return typeof id === 'string' && id ? await this.actors.byId(id) : null
  }
}
