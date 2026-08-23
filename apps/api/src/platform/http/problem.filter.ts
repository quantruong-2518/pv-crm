import {
  type ArgumentsHost,
  Catch,
  HttpException,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ProblemKind } from '@pv/contracts'
import { PvError, STATUS_OF, toProblem } from './problem'

/** Mọi lỗi ra khỏi máy chủ đều đi qua đây, và đều mang một hình.
 *
 *  `apps/web/src/app/api/errors.ts` đã có sẵn `ApiFailure` với đúng các nhánh
 *  này — nghĩa là màn không phải đoán mình vừa bắt được cái gì, cả khi lỗi
 *  sinh ra ở phía bên kia dây. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('http')

  catch(raw: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<FastifyRequest>()
    const res = ctx.getResponse<FastifyReply>()

    const error = this.normalise(raw, req)
    const traceId = req.headers['x-pv-request-id']

    const body = toProblem(error, {
      instance: req.url,
      traceId: typeof traceId === 'string' ? traceId : undefined,
    })

    void res.status(body.status).type('application/problem+json').send(body)
  }

  /** Đổi mọi thứ ném ra thành `PvError`. Sau hàm này không chỗ nào còn phải
   *  đoán — cùng vai trò với `toApiError` ở phía trình duyệt. */
  private normalise(raw: unknown, req: FastifyRequest): PvError {
    if (raw instanceof PvError) return raw

    if (raw instanceof HttpException) {
      const status = raw.getStatus()
      return new PvError({ kind: this.kindOf(status), status, title: raw.message })
    }

    /* Lỗi không lường trước: ghi ĐỦ vào log, trả RẤT ÍT ra ngoài. Một stack
       trace trong response là bản đồ nội thất của máy chủ gửi cho người lạ. */
    this.log.error(`${req.method} ${req.url}`, raw instanceof Error ? raw.stack : String(raw))
    return new PvError({ kind: 'server', status: 500, title: 'Máy chủ gặp sự cố.' })
  }

  private kindOf(status: number): ProblemKind {
    const hit = (Object.entries(STATUS_OF) as [ProblemKind, number][]).find(([, s]) => s === status)
    /* 419/440 là "phiên hết hạn" của một số máy chủ — gộp vào 401 vì hậu quả
       với người dùng giống hệt. Cùng bảng ánh xạ với `failureOf` bên web. */
    if (status === 419 || status === 440) return 'unauthenticated'
    return hit?.[0] ?? 'server'
  }
}
