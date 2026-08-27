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
  'rate-limited': 429,
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

// ---------------------------------------------------------------------------
// XƯỞNG LỖI — bốn hàm, mọi module dùng chung
// ---------------------------------------------------------------------------
//
// `new PvError({ kind, status, title })` viết tay ở mỗi chỗ ném là hai bảng:
// một bảng `ProblemKind → status` ở `STATUS_OF` ngay trên, và một bảng nữa nằm
// rải trong đầu người gõ. Bản thứ hai sẽ lệch bản thứ nhất — một `not-found`
// ném kèm 400, và màn bên kia dây đọc con số chứ không đọc chữ.
//
// Bốn hàm dưới đây là toàn bộ số cách một endpoint được phép hỏng. Cần cách
// thứ năm thì thêm ở ĐÂY, không thêm bằng một `new PvError` mới ở nhánh.

/** 404 — thứ được hỏi không có trong sổ.
 *
 *  `kind` ở đây là DANH TỪ người dùng gọi ('lead', 'hợp đồng', 'danh mục
 *  nguồn'), KHÔNG phải `ProblemKind`. Nó đi thẳng vào câu người đọc thấy, nên
 *  viết bằng tiếng Việt của nghiệp vụ, đừng viết tên bảng.
 *
 *  `code` là mã object người dùng vừa gõ hoặc vừa bấm — trả lại được, vì đó là
 *  thứ họ đưa cho hệ chứ không phải thứ hệ giấu bên trong. */
export function notFound(kind: string, code?: string): PvError {
  return new PvError({
    kind: 'not-found',
    status: 404,
    title: code ? `Không tìm thấy ${kind} "${code}".` : `Không tìm thấy ${kind}.`,
  })
}

/** 409 — dữ liệu ngoài kia đã khác thứ thao tác này giả định.
 *
 *  Trùng khoá, sửa đè lên bản mới hơn, xoá thứ nơi khác còn dùng. `title` phải
 *  nói được người dùng LÀM GÌ TIẾP; bên web nhánh `'xung-đột'` mặc định chỉ
 *  nói "tải lại rồi làm lại", câu cụ thể hơn là việc của chỗ ném. */
export function conflict(title: string): PvError {
  return new PvError({ kind: 'conflict', status: 409, title })
}

/** 400 — dữ liệu gửi lên sai, và sai ở NHỮNG Ô NÀO.
 *
 *  `fields` giữ đúng hình của `zod.pipe.ts`: gom theo TỪNG Ô, không phải một
 *  chuỗi dài. Màn tô đỏ được đúng ô sai chỉ khi nó biết ô nào — một câu
 *  "3 trường không hợp lệ" bắt người dùng tự dò lại cả form. */
export function invalid(
  fields: Record<string, string[]>,
  title = 'Dữ liệu gửi lên không hợp lệ.',
): PvError {
  return new PvError({ kind: 'invalid', status: 400, title, fields })
}

/** 401 hoặc 403 — và ĐÚNG MỘT chỗ quyết định là cái nào.
 *
 *  Trộn hai thứ này là lỗi nặng nhất của tầng quyền (`e2-access.ts` nói rõ):
 *  trả 401 cho một người ĐÃ đăng nhập là đá họ về màn đăng nhập để đăng nhập
 *  lại vòng vo mà không bao giờ vào được. Nên `reason` là thứ quyết định mã,
 *  không phải người gõ tự chọn 401 hay 403.
 *
 *  `title` để trống thì lấy câu mặc định theo lý do — bốn câu này khớp với
 *  `userMessage()` bên `apps/web/src/app/api/errors.ts`. */
export function denied(reason: DenyReason, title?: string): PvError {
  const unauth = reason === 'unauthenticated'
  return new PvError({
    kind: unauth ? 'unauthenticated' : 'forbidden',
    status: unauth ? 401 : 403,
    title: title ?? DENY_TITLE[reason],
    reason,
  })
}

/** 429 — the public caller has exhausted a bounded intake budget. */
export function rateLimited(title = 'Bạn gửi quá nhanh. Vui lòng thử lại sau.'): PvError {
  return new PvError({ kind: 'rate-limited', status: 429, title })
}

const DENY_TITLE: Record<DenyReason, string> = {
  unauthenticated: 'Phiên đã hết hạn. Đăng nhập lại để tiếp tục.',
  'branch-not-licensed': 'Công ty chưa mở nhánh này.',
  'permission-denied': 'Bạn không có quyền làm việc này.',
  'out-of-scope': 'Dữ liệu này nằm ngoài phạm vi của bạn.',
}
