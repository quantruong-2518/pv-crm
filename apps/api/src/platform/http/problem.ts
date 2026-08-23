import { HttpException } from '@nestjs/common'
import type { DenyReason, Problem, ProblemKind } from '@pv/contracts'

/** Lỗi của hệ, mang đủ thứ `Problem` cần.
 *
 *  Không ném `ForbiddenException('...')` trần: `HttpException` chỉ chở được mã
 *  và một câu chữ, mà bốn lý do từ chối của E2 KHÔNG rút gọn được về hai mã
 *  401/403. Lớp này là chỗ chở phần chênh. */
export class PvError extends HttpException {
  readonly kind: ProblemKind
  readonly reason?: DenyReason
  readonly fields?: Record<string, string[]>

  constructor(init: {
    kind: ProblemKind
    status: number
    title: string
    reason?: DenyReason
    fields?: Record<string, string[]>
  }) {
    super(init.title, init.status)
    this.kind = init.kind
    this.reason = init.reason
    this.fields = init.fields
  }
}

export const STATUS_OF: Record<ProblemKind, number> = {
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  invalid: 400,
  server: 500,
}

export function toProblem(e: PvError, ctx: { instance: string; traceId?: string }): Problem {
  return {
    type: e.kind,
    title: e.message,
    status: STATUS_OF[e.kind],
    instance: ctx.instance,
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.fields ? { errors: e.fields } : {}),
    ...(ctx.traceId ? { traceId: ctx.traceId } : {}),
  }
}
