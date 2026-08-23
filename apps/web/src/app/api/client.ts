import type { AccessNeed } from '@pv/engines'
import { access, renewSession, sessionIsLive, useSession } from '@/app/auth'
import { ApiError, failureOf } from './errors'

/** Tầng gọi dữ liệu — có INTERCEPTOR, và interceptor là toàn bộ lý do nó tồn tại.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO KHÔNG PHẢI MỖI QUERY TỰ LO
 *  ------------------------------------------------------------------
 *  Bảy query của app đều cần đúng bốn thứ giống nhau trước và sau mỗi lần gọi:
 *  gắn danh tính phiên, chặn khi phiên đã chết, kiểm quyền, và dịch lỗi thô
 *  thành một câu nói được với người dùng. Để mỗi query tự lo thì bảy bản sao sẽ
 *  lệch nhau ngay ở query thứ ba, và cái lệch đó là lỗ hổng quyền chứ không
 *  phải lỗi hiển thị.
 *
 *  ------------------------------------------------------------------
 *  QUYỀN ĐƯỢC CƯỠNG CHẾ Ở ĐÂY, KHÔNG CHỈ Ở CÁI NÚT
 *  ------------------------------------------------------------------
 *  Ẩn nút là việc của giao diện và nó chỉ ngăn được người dùng thật thà. Đường
 *  dữ liệu mới là chỗ quyền phải chặn: mỗi endpoint khai mình cần quyền gì
 *  (`need`), và `requireAccess` hỏi E2 trước khi bất kỳ byte nào đi ra. Hôm nay
 *  "máy chủ" là fixture trong cùng trình duyệt nên đây là hàng rào cuối; mai
 *  máy chủ thật kiểm lại lần nữa, và hai lần kiểm cùng đọc một ma trận quyền vì
 *  ma trận nằm trong engine dùng chung.
 *
 *  ------------------------------------------------------------------
 *  HÔM NAY KHÔNG CÓ MẠNG — VÀ ĐÓ KHÔNG PHẢI CỚ ĐỂ BỎ TẦNG NÀY
 *  ------------------------------------------------------------------
 *  `load` là nguồn dữ liệu của hôm nay: một hàm trả fixture đóng băng. Cả chuỗi
 *  interceptor vẫn chạy thật quanh nó. Khi có backend, `load` biến mất và thân
 *  `dispatch` đổi thành `fetch(path)` — hai chục dòng, không màn nào phải sửa,
 *  đúng lời hứa "engine đã có interface để sau cắm backend thật". */

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type ApiRequest = {
  path: string
  method: Method
  /** Quyền mà endpoint này đòi. Trống = chỉ cần một phiên còn sống. */
  need: AccessNeed
  headers: Record<string, string>
  /** Lần thử thứ mấy, tính từ 1. Chỉ interceptor đọc; `load` không cần biết. */
  attempt: number
  signal?: AbortSignal
}

/** Nguồn dữ liệu của một lần gọi. Nhận nguyên `ApiRequest` để chỗ nào cần header
 *  (phân trang, điều kiện) vẫn lấy được, thay vì phải đóng biến bên ngoài. */
export type Fetcher<T> = (req: ApiRequest) => Promise<T>

type BeforeSend = (req: ApiRequest) => ApiRequest

/** Kết luận của một interceptor lỗi. `'thử-lại'` chỉ được trả khi đã LÀM một
 *  việc khiến lần sau có cơ khác đi (gia hạn vé) — trả bừa thì đó là vòng lặp. */
type Recovery = 'thử-lại' | 'chịu'
type OnFailure = (error: ApiError, req: ApiRequest) => Promise<Recovery>

const MAX_ATTEMPTS = 2

// ---------------------------------------------------------------------------
// Trước khi gửi
// ---------------------------------------------------------------------------

let traceSeq = 0

/** Số hiệu yêu cầu — để nối một dòng log ở màn với một dòng log ở máy chủ.
 *
 *  Đếm lên chứ không random: trong một phiên, thứ tự số cũng chính là thứ tự
 *  thời gian, và khi đọc log thì đó là thứ hay cần nhất. */
const stampTrace: BeforeSend = (req) => ({
  ...req,
  headers: { ...req.headers, 'X-PV-Yêu-cầu': `${++traceSeq}` },
})

/** Danh tính phiên.
 *
 *  CHƯA có `Authorization` vì chưa có token thật, và một chuỗi giả ở đây sẽ được
 *  người đọc code sau tin là thật (cùng lý do `app/auth/session.ts` không giữ
 *  token). Khi backend cấp token, thêm đúng một dòng vào hàm này. */
const stampSession: BeforeSend = (req) => {
  const { actor, ticket } = useSession.getState()
  if (!actor || !ticket) return req
  return {
    ...req,
    headers: {
      ...req.headers,
      'X-PV-Người-dùng': actor.id,
      'X-PV-Phiên': `${ticket.issuedAt}`,
    },
  }
}

/** Phiên chết thì KHÔNG bắn request.
 *
 *  Bắn rồi đợi 401 cũng ra cùng kết quả, chỉ chậm hơn một vòng mạng và ồn hơn
 *  một dòng lỗi đỏ trong console. Quan trọng hơn: lúc màn khoá vì hết hạn,
 *  người dùng vẫn cuộn và vẫn mở tab — không chặn ở đây thì mỗi cú cuộn là một
 *  request chắc chắn hỏng. */
const requireLiveSession: BeforeSend = (req) => {
  if (sessionIsLive()) return req
  throw new ApiError({
    kind: 'chưa-xác-thực',
    path: req.path,
    message: 'Phiên không còn hiệu lực.',
  })
}

/** Hàng rào quyền. Hỏi E2, và giữ nguyên LÝ DO bị chặn — màn cần phân biệt
 *  "công ty chưa mua nhánh" với "vai của bạn không có quyền". */
const requireAccess: BeforeSend = (req) => {
  const verdict = access.check(useSession.getState().actor, req.need)
  if (verdict.ok) return req
  throw new ApiError({
    kind: verdict.reason === 'chưa-đăng-nhập' ? 'chưa-xác-thực' : 'thiếu-quyền',
    path: req.path,
    message: verdict.reason === 'chưa-đăng-nhập' ? 'Phiên chưa đăng nhập.' : verdict.note,
    status: verdict.reason === 'chưa-đăng-nhập' ? 401 : 403,
    reason: verdict.reason,
  })
}

const BEFORE: BeforeSend[] = [stampTrace, stampSession, requireLiveSession, requireAccess]

// ---------------------------------------------------------------------------
// Khi hỏng
// ---------------------------------------------------------------------------

/** 401 → xin vé mới đúng MỘT lần rồi thử lại.
 *
 *  `renewSession` tự chống bay đàn, nên năm query cùng hỏng chỉ tạo một lần xin.
 *  Xin không được thì nó cho phiên chết luôn — ở đây không phải làm gì thêm,
 *  và cũng không được thử vòng hai: 401 sau khi vừa gia hạn nghĩa là máy chủ
 *  thật sự từ chối, thử lại chỉ để hỏng chậm hơn. */
const renewOnUnauthorized: OnFailure = async (error, req) => {
  if (error.kind !== 'chưa-xác-thực' || req.attempt >= MAX_ATTEMPTS) return 'chịu'
  return (await renewSession()) ? 'thử-lại' : 'chịu'
}

/** 403 → ghi vết.
 *
 *  Ghi ở ĐÂY chứ không ở `access.check`: `check` chạy trong mọi vòng lặp lọc
 *  danh sách, còn chỗ này là một lần chặn thật. Nhật ký phải trả lời được "vì
 *  sao hôm đó tôi không lấy được dữ liệu", nên nó cần ít dòng mà đúng chỗ. */
const logDenied: OnFailure = async (error, req) => {
  if (error.kind !== 'thiếu-quyền') return 'chịu'
  const actor = useSession.getState().actor
  if (actor) {
    access.log({
      actorId: actor.id,
      action: 'xem',
      note: `chặn ${req.method} ${req.path} · ${error.reason}`,
    })
  }
  return 'chịu'
}

const AFTER: OnFailure[] = [renewOnUnauthorized, logDenied]

// ---------------------------------------------------------------------------
// Vòng gọi
// ---------------------------------------------------------------------------

/** Đổi mọi thứ ném ra thành `ApiError`. Sau hàm này, không chỗ nào trong app
 *  còn phải đoán mình vừa bắt được cái gì. */
function toApiError(raw: unknown, req: ApiRequest): ApiError {
  if (raw instanceof ApiError) return raw
  if (raw instanceof DOMException && raw.name === 'AbortError') {
    return new ApiError({ kind: 'huỷ', path: req.path, message: 'Đã huỷ.', cause: raw })
  }
  if (raw instanceof Response) {
    return new ApiError({
      kind: failureOf(raw.status),
      path: req.path,
      status: raw.status,
      message: `${req.method} ${req.path} → ${raw.status}`,
    })
  }
  return new ApiError({
    kind: 'mạng',
    path: req.path,
    message: raw instanceof Error ? raw.message : 'Gọi dữ liệu hỏng.',
    cause: raw,
  })
}

async function dispatch<T>(req: ApiRequest, load: Fetcher<T>): Promise<T> {
  let current = req

  for (;;) {
    try {
      const prepared = BEFORE.reduce((r, step) => step(r), current)
      /* Điểm cắt sang backend thật: đổi dòng dưới thành `fetch(prepared.path, …)`
         rồi ném `Response` khi `!res.ok` — `toApiError` đã biết đọc `Response`. */
      return await load(prepared)
    } catch (raw) {
      const error = toApiError(raw, current)

      let recovery: Recovery = 'chịu'
      for (const step of AFTER) {
        if ((await step(error, current)) === 'thử-lại') recovery = 'thử-lại'
      }

      if (recovery !== 'thử-lại' || current.attempt >= MAX_ATTEMPTS) throw error
      current = { ...current, attempt: current.attempt + 1 }
    }
  }
}

export type ReadOptions<T> = {
  /** Quyền endpoint này đòi. Khai ở CHỖ KHAI QUERY, không khai ở màn — một
   *  đường dữ liệu chỉ có một mức quyền, dù mười màn cùng gọi nó. */
  need?: AccessNeed
  /** Nguồn dữ liệu hôm nay. Biến mất khi có backend. */
  load: Fetcher<T>
  signal?: AbortSignal
}

export const api = {
  read<T>(path: string, opts: ReadOptions<T>): Promise<T> {
    return dispatch<T>(
      {
        path,
        method: 'GET',
        need: opts.need ?? {},
        headers: {},
        attempt: 1,
        signal: opts.signal,
      },
      opts.load,
    )
  },
}
