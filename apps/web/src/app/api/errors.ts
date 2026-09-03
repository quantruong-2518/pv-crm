import type { DenyReason as WireDenyReason } from '@pv/contracts'
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
  /** The response body does not match the endpoint's zod contract.
   *
   *  Neither a server fault nor bad user input — the two ends are running two
   *  versions of one contract. It earns its own kind because it sends the
   *  reader somewhere completely different: waiting and retrying fixes nothing,
   *  someone has to deploy until both ends agree. */
  | 'lệch-hợp-đồng'
  /** Máy chủ từ chối vì dữ liệu người dùng gửi lên sai (400/422) — không phải
   *  máy chủ trục trặc. Khác với các `kind` ở trên, đây LÀ việc của màn: màn tự
   *  hiện lỗi này, không đẩy lên tầng phiên. `error.errors` thường nêu tên ô sai
   *  (RFC 9457), nhưng có thể rỗng nên `userMessage` không được giả định nó có. */
  | 'dữ-liệu-sai'
  /** Quá ngân sách request của một cửa công khai (429). */
  | 'quá-nhanh'
  | 'máy-chủ'
  /** Người dùng rời màn giữa chừng. KHÔNG phải lỗi — đừng hiện gì cả. */
  | 'huỷ'

/** Per-field complaints, keyed by field name — the `errors` map of RFC 9457.
 *
 *  A write door needs this to outline the right box in red. Without it a form
 *  has to parse the Vietnamese sentence in `message` and guess, which is how a
 *  form ends up highlighting a field the server never complained about. */
export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly kind: ApiFailure
  readonly path: string
  readonly status?: number
  /** Lý do E2 từ chối, chỉ có khi `kind === 'thiếu-quyền'`. Giữ nguyên chữ của
   *  engine để màn nói đúng câu: thiếu license và thiếu vai là hai chuyện.
   *
   *  Denials raised locally by E2 already speak this vocabulary; denials that
   *  come back over the wire are translated by `denyReasonOf` below, so a
   *  screen never has to know which of the two ends refused it. */
  readonly reason?: DenyReason
  /** Field name → what the server disliked about it. Absent means "this
   *  failure is not about one field", not "this status never carries fields". */
  readonly errors?: FieldErrors
  /** The `X-PV-Request-Id` this call carried, echoed back by the server. It is
   *  what ties one line in the browser log to one line in the server log. */
  readonly traceId?: string

  constructor(init: {
    kind: ApiFailure
    path: string
    message: string
    status?: number
    reason?: DenyReason
    errors?: FieldErrors
    traceId?: string
    cause?: unknown
  }) {
    super(init.message, { cause: init.cause })
    this.name = 'ApiError'
    this.kind = init.kind
    this.path = init.path
    this.status = init.status
    this.reason = init.reason
    this.errors = init.errors
    this.traceId = init.traceId
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

/** The wire says `permission-denied`; the engine says `thiếu-quyền`. Same four
 *  refusals, two vocabularies, because they were named in two places: E2 names
 *  them in Vietnamese for the screens, `@pv/contracts` names them in ASCII
 *  because that is what travels through a JSON body, a proxy log and an
 *  OpenAPI document.
 *
 *  This table is the ONLY seam between the two. Patching a comparison at the
 *  far end instead — teaching `userMessage` to also accept
 *  `'branch-not-licensed'` — would mean every future reader of a `reason` has
 *  to know both spellings, and the third reader will only remember one.
 *
 *  Typed as a full `Record` over the wire enum on purpose: the day the server
 *  adds a fifth refusal, this line stops compiling. */
const DENY_REASON: Record<WireDenyReason, DenyReason> = {
  unauthenticated: 'chưa-đăng-nhập',
  'branch-not-licensed': 'thiếu-nhánh',
  'permission-denied': 'thiếu-quyền',
  'out-of-scope': 'ngoài-phạm-vi',
}

/** Wire refusal → engine refusal. Anything unknown comes back `undefined`
 *  rather than a guess: a screen with no `reason` says the generic sentence,
 *  which is merely unhelpful, while a wrong `reason` sends the user off to fix
 *  something that was never broken. */
export function denyReasonOf(wire: string | undefined): DenyReason | undefined {
  if (!wire) return undefined
  return DENY_REASON[wire as WireDenyReason]
}

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
  if (status === 400 || status === 422) return 'dữ-liệu-sai'
  if (status === 429) return 'quá-nhanh'
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
    /* Three of E2's four refusals land on this one kind, and each one sends the
       user somewhere different — that is why they get three sentences, not one.
       Missing licence is the company's purchase; missing permission is a role
       change to ask for (E3); out of scope is the same role on someone else's
       row, which no amount of granted permission fixes — the only way through
       is the person holding it. Say the wrong one and the user spends a day
       chasing an admin who has nothing to give them.

       `chưa-đăng-nhập` deliberately has no branch here: it arrives as kind
       `chưa-xác-thực`, and that one is auth's business, not a screen's. */
    case 'thiếu-quyền':
      if (error.reason === 'thiếu-nhánh') return 'Công ty chưa mở nhánh này.'
      if (error.reason === 'ngoài-phạm-vi')
        return 'Dữ liệu này của người khác. Nhờ người đang phụ trách mở hộ, hoặc xin bàn giao.'
      return 'Bị ẩn theo quyền của bạn.'
    case 'không-thấy':
      return 'Không tìm thấy dữ liệu này. Có thể nó vừa bị xoá.'
    /* `error.message` is the server's own `title` when it sent one (see
       `toApiError` in `client.ts`) — a duplicate-email 409 and a stale-write
       409 are both `'xung-đột'`, but they are not the same sentence: only the
       second one is "someone else just edited this". The server already knows
       which is which, so its sentence wins; the canned line below only covers
       the rare case where the server said nothing at all. */
    case 'xung-đột':
      return error.message || 'Người khác vừa sửa dữ liệu này. Tải lại rồi làm lại thao tác.'
    /* Unlike the kinds above, this one IS the screen's business: it is a
       complaint about what the user just typed, not about the session or the
       server. `error.errors` often names the offending field, but a screen
       cannot always show a per-field message (list filters, query params), so
       this sentence must stand on its own even when `errors` is empty. */
    case 'dữ-liệu-sai':
      return 'Dữ liệu vừa nhập chưa hợp lệ. Kiểm tra lại rồi thử lại.'
    case 'quá-nhanh':
      return 'Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.'
    case 'huỷ':
      return ''
    /* Name the action that actually helps. "Try again in a few minutes" is the
       wrong sentence here: a contract skew does not heal with time, and that
       line leaves someone pressing F5 at a screen that will never come back. */
    case 'lệch-hợp-đồng':
      return 'Màn và máy chủ đang lệch phiên bản dữ liệu. Báo người trực deploy — tải lại trang không chữa được.'
    case 'máy-chủ':
      return 'Máy chủ đang trục trặc. Thử lại sau ít phút.'
  }
}
