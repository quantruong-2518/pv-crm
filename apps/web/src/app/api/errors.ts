import type { DenyReason } from '@pv/engines'

/** Lỗi của tầng "dữ liệu từ ngoài vào" — MỘT kiểu lỗi, phân loại sẵn.
 *
 *  Màn không được đi đọc `status` số hay bắt chuỗi trong `message`: hai màn đọc
 *  cùng một mã lỗi theo hai cách là hai câu khác nhau nói với người dùng cho
 *  cùng một sự cố. Interceptor phân loại một lần ở đây, màn chỉ đọc `kind`. */

export type ApiFailure =
  /** Không tới được máy chủ — mất mạng, DNS hỏng, CORS chặn. */
  | 'mạng'
  /** Phiên không còn hiệu lực (401). Đây là chuyện của AUTH, không phải của màn:
   *  màn không hiện lỗi này, nó để lifecycle khoá màn hình lại. */
  | 'chưa-xác-thực'
  /** Có phiên nhưng không được phép (403). Màn hiện "Bị ẩn theo quyền của bạn". */
  | 'thiếu-quyền'
  | 'không-thấy'
  /** Dữ liệu đã đổi dưới tay người dùng (409) — sửa đè lên bản mới hơn. */
  | 'xung-đột'
  | 'máy-chủ'
  /** Người dùng rời màn giữa chừng. KHÔNG phải lỗi — đừng hiện gì cả. */
  | 'huỷ'

export class ApiError extends Error {
  readonly kind: ApiFailure
  readonly path: string
  readonly status?: number
  /** Lý do E2 từ chối, chỉ có khi `kind === 'thiếu-quyền'`. Giữ nguyên chữ của
   *  engine để màn nói đúng câu: thiếu license và thiếu vai là hai chuyện. */
  readonly reason?: DenyReason

  constructor(init: {
    kind: ApiFailure
    path: string
    message: string
    status?: number
    reason?: DenyReason
    cause?: unknown
  }) {
    super(init.message, { cause: init.cause })
    this.name = 'ApiError'
    this.kind = init.kind
    this.path = init.path
    this.status = init.status
    this.reason = init.reason
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

/** Mã HTTP → loại lỗi. Bảng này là chỗ DUY NHẤT trong app biết con số 403 nghĩa
 *  là gì; thêm một `if (res.status === 403)` ở màn là bắt đầu có hai bảng. */
export function failureOf(status: number): ApiFailure {
  if (status === 401) return 'chưa-xác-thực'
  if (status === 403) return 'thiếu-quyền'
  if (status === 404) return 'không-thấy'
  if (status === 409) return 'xung-đột'
  /* 419/440 là "phiên hết hạn" của một số máy chủ — gộp vào 401 vì hậu quả với
     người dùng giống hệt: phải đăng nhập lại. */
  if (status === 419 || status === 440) return 'chưa-xác-thực'
  return 'máy-chủ'
}

/** Câu hiện cho người dùng. Không kèm mã lỗi, không kèm tên hàm — người đọc câu
 *  này đang muốn biết mình làm gì tiếp, không muốn biết tầng nào hỏng. */
export function userMessage(error: ApiError): string {
  switch (error.kind) {
    case 'mạng':
      return 'Không nối được máy chủ. Kiểm tra mạng rồi thử lại.'
    case 'chưa-xác-thực':
      return 'Phiên đã hết hạn. Đăng nhập lại để tiếp tục.'
    case 'thiếu-quyền':
      return error.reason === 'thiếu-nhánh'
        ? 'Công ty chưa mở nhánh này.'
        : 'Bị ẩn theo quyền của bạn.'
    case 'không-thấy':
      return 'Không tìm thấy dữ liệu này. Có thể nó vừa bị xoá.'
    case 'xung-đột':
      return 'Người khác vừa sửa dữ liệu này. Tải lại rồi làm lại thao tác.'
    case 'huỷ':
      return ''
    case 'máy-chủ':
      return 'Máy chủ đang trục trặc. Thử lại sau ít phút.'
  }
}
