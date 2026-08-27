import type { Problem } from '@pv/contracts'
import type { AccessNeed } from '@pv/engines'
import { access, renewSession, sessionIsLive, useSession } from '@/app/auth'
import { ApiError, denyReasonOf, failureOf } from './errors'

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
 *  (`need`), và `requireAccess` hỏi E2 trước khi bất kỳ byte nào đi ra. Máy chủ
 *  kiểm lại lần nữa, và hai lần kiểm cùng đọc một ma trận quyền vì ma trận nằm
 *  trong engine dùng chung.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CÓ MẠNG — VÀ HAI NGUỒN DỮ LIỆU SỐNG CẠNH NHAU MỘT THỜI GIAN
 *  ------------------------------------------------------------------
 *  `dispatch` gọi `fetch` thật tới `API_BASE_URL`. Query nào còn truyền `load`
 *  thì vẫn ăn fixture đóng băng — cả chuỗi interceptor vẫn chạy y hệt quanh nó.
 *  Đó là điều kiện để cắt từng sổ một sang máy chủ mà năm màn còn lại không
 *  chết trong lúc chờ; bỏ `load` khỏi một query là cắt xong query đó. */

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** What one endpoint asks for — the SAME shape the server declares.
 *
 *  `apps/api` calls it `RouteNeed` (`platform/access/need.decorator.ts`) and
 *  writes it as `@Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })`.
 *  Both ends widen `AccessNeed` the same way and for the same reason: the
 *  engine turns axis 3 on through the presence of a `ref`, and a `ref` only
 *  exists once a row has been loaded — which is AFTER the call this object
 *  describes. `scoped: true` is how an endpoint says up front "I carry
 *  row-level data", so the server cuts by `owner_id` inside SQL.
 *
 *  On this side the flag does not itself cut anything — the browser has no
 *  rows to cut and must never be the thing that decides. What it does is make
 *  the two declarations READ THE SAME, so a route whose scope axis is on and
 *  a query that forgot it can be spotted by diffing two lines instead of by
 *  noticing that a Sale is looking at somebody else's book. The receipt that
 *  the cut really happened comes back in `hidden` on the response. */
export type ApiNeed = AccessNeed & { scoped?: boolean }

/** Where the real backend lives, read from the environment in EXACTLY one
 *  place — this line. Pointing the app at another API is then one variable, not
 *  a hunt through seven query files.
 *
 *  The fallback is the LOCAL `apps/api` port documented in
 *  `docs/tich-hop-be.md`, deliberately not production: someone who never copied
 *  `.env.example` should hit their own machine and see a connection error, not
 *  quietly read and write the Fly.io database. Trailing slashes are trimmed
 *  because every `path` already opens with one, and `//sales/leads` is a 404
 *  that reads like a routing bug. */
const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:4123'
).replace(/\/+$/, '')

/** Số hiệu yêu cầu. Máy chủ đọc đúng tên này (`problem.filter.ts`) và trả lại
 *  nguyên văn trong `traceId` của Problem — đó là sợi chỉ nối một dòng log ở
 *  màn với một dòng log ở máy chủ. Tên header phải là ASCII: `fetch` từ chối
 *  thẳng một tên có dấu, nên đây không phải chuyện thẩm mỹ. */
const TRACE_HEADER = 'X-PV-Request-Id'

/** Danh tính người gọi — CỬA SAU của POC. Xem `stampSession`. */
const ACTOR_HEADER = 'X-PV-Actor-Id'

export type ApiRequest = {
  path: string
  method: Method
  /** Quyền mà endpoint này đòi. Trống = chỉ cần một phiên còn sống. */
  need: ApiNeed
  headers: Record<string, string>
  /** Thân yêu cầu, chưa serialize. `undefined` = không gửi thân nào cả. */
  body?: unknown
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
  headers: { ...req.headers, [TRACE_HEADER]: `${++traceSeq}` },
})

/** Session identity — and today this is the POC BACK DOOR, not authentication.
 *
 *  There is no `Authorization` header because there is no real token yet, and a
 *  fake one here would be believed by the next person to read this file (same
 *  reason `app/auth/session.ts` keeps no token). What the server trusts instead
 *  is `X-PV-Actor-Id`, and only while `PV_TRUST_ACTOR_HEADER=true` — `env.ts`
 *  refuses to boot with that flag in production, so this door cannot be left
 *  open by accident.
 *
 *  THIS FUNCTION IS THE ONE PLACE THAT CHANGES the day real auth lands.
 *  `docs/tich-hop-be.md` promises exactly that, so keep the promise: the actor
 *  header disappears from here, a cookie or an `Authorization` line takes its
 *  place, and nothing else in the app — no query, no screen — is touched.
 *  Anything that reaches around this function for identity breaks that promise
 *  and will have to be found by hand later. */
const stampSession: BeforeSend = (req) => {
  const { actor, ticket } = useSession.getState()
  if (!actor || !ticket) return req
  return {
    ...req,
    headers: { ...req.headers, [ACTOR_HEADER]: actor.id },
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
 *  thật sự từ chối, thử lại chỉ để hỏng chậm hơn.
 *
 *  Nó chỉ nói "tôi vừa làm một việc khiến lần sau có cơ khác đi". Việc phát lại
 *  request có an toàn hay không là câu hỏi khác, và `mayReplay` trả lời. */
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

/** The only methods a retry may repeat, and the list is this short on purpose —
 *  see `mayReplay`. */
const REPLAYABLE = new Set<Method>(['GET'])

/** May this attempt be sent a second time?
 *
 *  `renewOnUnauthorized` asks for a retry whenever it managed to renew the
 *  ticket, and on a read that is exactly right. On a write it is not: a POST
 *  that already reached `/sales/leads` may have inserted the row before the
 *  response went wrong, and the server carries no idempotency key to collapse
 *  the second one. The user ends up with two leads, the duplicate index does
 *  not catch it if the mailbox differs, and nothing downstream can tell which
 *  one is real.
 *
 *  So a write is replayed only when it PROVABLY never left the browser — a
 *  BEFORE interceptor threw (dead session, E2 refusal) and no byte moved. Note
 *  that renewing the ticket still happens in both cases; the only thing
 *  withheld is the replay, so the next thing the user does still works.
 *
 *  This lives in the loop rather than inside `renewOnUnauthorized` because the
 *  two answer different questions: an interceptor answers "did I do something
 *  that could help", the loop answers "is doing it again safe on THIS request".
 *  Fold them together and every future AFTER interceptor has to re-derive the
 *  rule, and the fourth one will get it wrong. */
const mayReplay = (req: ApiRequest, onTheWire: boolean) => !onTheWire || REPLAYABLE.has(req.method)

/** Đọc thân `application/problem+json`. Máy chủ đã hứa một hình duy nhất cho
 *  mọi lỗi (RFC 9457), nên chỗ đọc cũng chỉ có một.
 *
 *  Thân hỏng hoặc thân rỗng thì trả về một Problem trống chứ không ném: mã
 *  trạng thái đã nói đủ rằng request hỏng, và một gateway trả HTML không được
 *  phép biến thành exception không ai bắt. */
async function readProblem(res: Response): Promise<Partial<Problem>> {
  if (!(res.headers.get('content-type') ?? '').includes('json')) return {}
  try {
    return (await res.json()) as Partial<Problem>
  } catch {
    return {}
  }
}

/** Đổi mọi thứ ném ra thành `ApiError`. Sau hàm này, không chỗ nào trong app
 *  còn phải đoán mình vừa bắt được cái gì. */
async function toApiError(raw: unknown, req: ApiRequest): Promise<ApiError> {
  if (raw instanceof ApiError) return raw
  if (raw instanceof DOMException && raw.name === 'AbortError') {
    return new ApiError({ kind: 'huỷ', path: req.path, message: 'Đã huỷ.', cause: raw })
  }
  if (raw instanceof Response) {
    const problem = await readProblem(raw)
    return new ApiError({
      kind: failureOf(raw.status),
      path: req.path,
      status: raw.status,
      /* `title` là câu tiếng Việt máy chủ tự viết cho người dùng. Dùng nó khi
         có, vì máy chủ biết chuyện gì hỏng rõ hơn màn; không có thì rơi về một
         dòng kỹ thuật, thứ không ai định đọc to lên. */
      message: problem.title ?? `${req.method} ${req.path} → ${raw.status}`,
      /* Máy chủ nói `permission-denied`, engine nói `thiếu-quyền`. Một bảng tra
         duy nhất ở `errors.ts` nối hai từ vựng — xem `denyReasonOf`. */
      reason: denyReasonOf(problem.reason),
      errors: problem.errors,
      traceId: problem.traceId ?? req.headers[TRACE_HEADER],
    })
  }
  return new ApiError({
    kind: 'mạng',
    path: req.path,
    message: raw instanceof Error ? raw.message : 'Gọi dữ liệu hỏng.',
    traceId: req.headers[TRACE_HEADER],
    cause: raw,
  })
}

/** Một lần bay thật. Đây là điểm cắt sang backend đã nói trong docblock đầu
 *  file, và giờ nó đã cắt xong. */
async function send<T>(req: ApiRequest): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${req.path}`, {
    method: req.method,
    headers: req.headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    signal: req.signal,
    /* Cookie là đích đến của auth thật (`platform.session`), và một cookie
       cross-origin chỉ đi khi cả hai đầu cùng bật. Máy chủ đã bật
       `access-control-allow-credentials` rồi; bật nốt đầu này ngay hôm nay để
       ngày đổi cửa không phải nhớ ra còn một nửa. */
    credentials: 'include',
  })
  /* Ném nguyên `Response` chứ không tự đọc thân ở đây: `toApiError` là chỗ duy
     nhất biết Problem trông như thế nào, và nó cần cả `status` lẫn thân. */
  if (!res.ok) throw res
  /* 204 không có thân — `res.json()` trên thân rỗng ném SyntaxError, và một
     lệnh ghi thành công không được phép hiện ra như lỗi mạng. */
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function dispatch<T>(req: ApiRequest, load?: Fetcher<T>): Promise<T> {
  let current = req

  for (;;) {
    /* Giữ bản ĐÃ đóng dấu ra ngoài `try` để nhánh lỗi đọc được số hiệu yêu cầu
       và danh tính đã gắn; `current` thì chưa qua interceptor nào. */
    let prepared = current
    /* Lần thử này đã ra khỏi trình duyệt chưa — `mayReplay` cần đúng một sự
       thật này để quyết định phát lại. */
    let onTheWire = false

    try {
      prepared = BEFORE.reduce((r, step) => step(r), current)
      if (load) return await load(prepared)
      onTheWire = true
      return await send<T>(prepared)
    } catch (raw) {
      const error = await toApiError(raw, prepared)

      let recovery: Recovery = 'chịu'
      for (const step of AFTER) {
        if ((await step(error, prepared)) === 'thử-lại') recovery = 'thử-lại'
      }

      if (recovery !== 'thử-lại' || current.attempt >= MAX_ATTEMPTS) throw error
      if (!mayReplay(current, onTheWire)) throw error
      current = { ...current, attempt: current.attempt + 1 }
    }
  }
}

export type ReadOptions<T> = {
  /** Quyền endpoint này đòi. Khai ở CHỖ KHAI QUERY, không khai ở màn — một
   *  đường dữ liệu chỉ có một mức quyền, dù mười màn cùng gọi nó. */
  need?: ApiNeed
  /** Fixture đóng băng, và nay là TUỲ CHỌN.
   *
   *  Có `load` → query đó còn đọc fixture. Vắng `load` → nó đi HTTP thật. Hai
   *  chế độ sống cạnh nhau vì các sổ được cắt sang máy chủ từng cái một; bắt cả
   *  bảy cùng cắt trong một đợt là bảy màn cùng vỡ trong một buổi chiều. Xoá
   *  `load` khỏi một query là nghi thức duy nhất để cắt query đó. */
  load?: Fetcher<T>
  signal?: AbortSignal
}

export type WriteOptions = {
  /** `POST` mặc định. Lưu ý CORS của máy chủ hôm nay mở `GET · HEAD · POST` —
   *  `PATCH` khai được ở đây nhưng trình duyệt còn chặn ở preflight cho tới khi
   *  máy chủ mở thêm. */
  method?: 'POST' | 'PATCH'
  /** Serialize thành JSON. `undefined` = không gửi thân, và cũng không gắn
   *  `Content-Type` — một preflight thừa cho một request rỗng. */
  body?: unknown
  /** Quyền endpoint này đòi. Cửa ghi thường đòi mức CAO HƠN cửa đọc cùng sổ
   *  (`lead.xem` để xem, `lead.sửa` để ghi), nên khai lại ở đây chứ đừng chép
   *  của query đọc. */
  need?: ApiNeed
  signal?: AbortSignal
}

export const api = {
  read<T>(path: string, opts: ReadOptions<T> = {}): Promise<T> {
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

  /** Cửa ghi, đi CHUNG một chuỗi interceptor với cửa đọc.
   *
   *  `need` là lý do hàm này tồn tại thay vì `mutationFn` gọi thẳng `fetch`.
   *  TanStack Query lo cache, dedupe và refetch — nó không biết gì về quyền, và
   *  một `fetch` trần trong `mutationFn` là một đường dữ liệu đi vòng qua
   *  `requireAccess`. Cả tầng này dựng lên để chuyện đó không xảy ra được. */
  write<T>(path: string, opts: WriteOptions = {}): Promise<T> {
    return dispatch<T>({
      path,
      method: opts.method ?? 'POST',
      need: opts.need ?? {},
      headers: opts.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: opts.body,
      attempt: 1,
      signal: opts.signal,
    })
  },
}
