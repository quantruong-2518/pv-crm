import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import type { Actor } from '@pv/engines'

/** Người đang gọi. `null` khi chưa đăng nhập.
 *
 *  Controller nhận `Actor` chứ không nhận `req` — đó là nửa dưới của luật
 *  "controller không biết Drizzle, repository không biết HTTP": không có
 *  `FastifyRequest` nào lọt xuống tầng service. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor | null =>
    ctx.switchToHttp().getRequest<FastifyRequest>().actor ?? null,
)
