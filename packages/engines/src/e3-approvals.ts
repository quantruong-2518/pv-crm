import { systemClock, type Actor, type Clock, type ObjectRef } from './types'

/** E3 · Quy trình duyệt.
 *
 *  Giữ: định nghĩa chuỗi duyệt, trạng thái, người đang chờ, hạn, uỷ quyền.
 *  Nhánh khai báo loại yêu cầu + điều kiện; E3 lo phần còn lại. Mọi yêu cầu đổ
 *  về Hộp duyệt của One.
 *
 *  ĐÂY LÀ NƠI LUẬT 9 ĐƯỢC THỰC THI. "AI không bao giờ tự làm" không phải thiện
 *  chí của người viết màn: đề xuất của AI chỉ vào hệ qua `proposeFromAi`, luôn
 *  ở trạng thái `waiting`, luôn phải có `basis`, và chỉ đổi trạng thái được
 *  bằng `decide()` — hàm bắt buộc có một `Actor` là người. */

export type ApprovalState = 'waiting' | 'approved' | 'rejected'

export type ChainLink = {
  role: string
  person: string
  state: ApprovalState
  /** ISO. Quá hạn thì Hộp duyệt tô cảnh báo. */
  due?: string
}

export type ApprovalRequest = {
  id: string
  /** Loại yêu cầu do nhánh khai báo, ví dụ 'discount' | 'purchase'. */
  type: string
  ref: ObjectRef
  raisedBy: string
  /** Do Trợ lý AI đề xuất hay do người mở. */
  fromAi: boolean
  /** Dòng "Căn cứ: …" hiện trên khối AI. Bắt buộc với đề xuất của AI. */
  basis?: string
  chain: ChainLink[]
  state: ApprovalState
  decidedAt?: string
  decidedBy?: string
}

/** What a branch hands E3 to open a request. Exported because the server builds
 *  one before it has a row to store. */
export type NewRequest = {
  id: string
  type: string
  ref: ObjectRef
  raisedBy: string
  chain: ChainLink[]
}

// ---------------------------------------------------------------------------
// THE LAW, AS PURE FUNCTIONS
// ---------------------------------------------------------------------------

/** Why these exist beside `createApprovalEngine` rather than inside it.
 *
 *  The engine below keeps its requests in a `Map`, which is the right shape for
 *  a browser and the wrong one for a server: a deploy would drop every pending
 *  request on the floor. The server therefore keeps them in Postgres — and the
 *  moment it does, it needs the RULES without the store, or it ends up writing
 *  a second copy of them next to its repository. A second copy is a fork, and
 *  `engines.module.ts` says out loud why this codebase refuses forks: one day
 *  somebody adds a branch to one side and the two ends start approving by
 *  different laws.
 *
 *  So the law lives here, in functions that take a request and give one back,
 *  and BOTH ends call them — the `Map` engine below and `ApprovalService` on
 *  the server. Pure, synchronous, no store: the shape `apps/api/CLAUDE.md`
 *  demands of an engine. */

/** Why a decision was refused. A code rather than a sentence, because the two
 *  callers phrase refusals differently: the in-memory engine throws, the server
 *  turns it into a Problem with an HTTP status. A shared sentence would be a
 *  sentence written for neither. */
export type DecisionRefusal = 'unknown' | 'already-decided' | 'nobody-waiting' | 'not-your-turn'

/** The half of a request this law actually reads.
 *
 *  Generic rather than `ApprovalRequest`, because the server's row is not that
 *  shape: it carries an opaque branch payload and zero-or-many object links
 *  where the browser's request carries exactly one `ObjectRef`. Narrowing the
 *  parameter to what the rule reads lets both ends call the SAME function
 *  instead of one of them copying it. */
export type Decidable = { state: ApprovalState; chain: ChainLink[] }

export type DecisionResult<T extends Decidable = ApprovalRequest> =
  | { ok: true; request: T & { decidedAt?: string; decidedBy?: string } }
  | { ok: false; reason: DecisionRefusal; waitingFor?: string }

/** A brand new request, in the only state one can be born in.
 *
 *  `waiting` is not a default that a caller may override: rule 9 says AI never
 *  acts, and "never acts" is exactly "every proposal starts waiting for a
 *  human". `basis` is required of an AI proposal and the type says so at the
 *  only door AI comes through (`proposeFromAi`). */
export function raise(req: NewRequest, from: { ai: boolean; basis?: string }): ApprovalRequest {
  if (req.chain.length === 0) throw new Error(`E3: ${req.id} không có chuỗi duyệt`)
  if (from.ai && !from.basis?.trim()) throw new Error(`E3: đề xuất AI ${req.id} thiếu căn cứ`)

  return { ...req, fromAi: from.ai, basis: from.basis, state: 'waiting' }
}

/** One person's yes or no, applied to a request that was loaded from wherever
 *  it lives. Returns the WHOLE new request; the caller stores it.
 *
 *  Whose turn it is comes out of the chain rather than out of a column: the
 *  first link still `waiting` is the person being waited on. A rejection ends
 *  the request immediately — there is nothing left to ask once somebody has
 *  said no — while an approval only finishes it when no link is still waiting.
 *
 *  The turn is matched on NAME, because that is what a `ChainLink` carries.
 *  Two people sharing a display name would share a turn; that is a real hole
 *  and it is the chain's shape that has it, not this function. */
export function decideOn<T extends Decidable>(
  request: T | undefined,
  by: Actor,
  decision: Exclude<ApprovalState, 'waiting'>,
  now: string,
): DecisionResult<T> {
  if (!request) return { ok: false, reason: 'unknown' }
  if (request.state !== 'waiting') return { ok: false, reason: 'already-decided' }

  const turn = request.chain.find((l) => l.state === 'waiting')
  if (!turn) return { ok: false, reason: 'nobody-waiting' }
  if (turn.person !== by.name) {
    return { ok: false, reason: 'not-your-turn', waitingFor: turn.person }
  }

  /* A fresh chain rather than a mutated one: the caller may still hold the
     request it passed in — the server logs it, the browser may have rendered
     it — and a link that changes state underneath them is a bug nobody sees. */
  const chain = request.chain.map((l) => (l === turn ? { ...l, state: decision } : l))
  const stillWaiting = chain.some((l) => l.state === 'waiting')
  const state = decision === 'rejected' ? 'rejected' : stillWaiting ? 'waiting' : 'approved'

  /* `decidedAt`/`decidedBy` belong to the REQUEST, not to one link: they say
     when the whole thing was settled and by whom. A chain with a second
     approver still pending is not settled, so stamping them on the first yes
     would claim a decision nobody made — and `approval_decided_when_settled`
     in the table refuses exactly that row. Which link just answered is already
     written in the chain. */
  const settled = state !== 'waiting'

  return {
    ok: true,
    request: {
      ...request,
      chain,
      state,
      ...(settled ? { decidedAt: now, decidedBy: by.name } : {}),
    },
  }
}

/** Is this request sitting in that person's inbox right now.
 *
 *  The FIRST waiting link, not any waiting link — the same test `decideOn`
 *  applies. Showing somebody a request they cannot yet decide puts a button on
 *  their screen that answers 403 when pressed, and the two rules drifting apart
 *  is precisely how that happens. One reading of "whose turn", used by both. */
export function isPendingFor(request: Decidable, actor: Actor): boolean {
  if (request.state !== 'waiting') return false
  return request.chain.find((l) => l.state === 'waiting')?.person === actor.name
}

export interface ApprovalEngine {
  submit(req: NewRequest): ApprovalRequest
  /** Cửa duy nhất để AI đưa đề xuất vào hệ. `basis` là tham số bắt buộc —
   *  không compile được một đề xuất AI thiếu căn cứ. */
  proposeFromAi(req: NewRequest & { basis: string }): ApprovalRequest
  /** Chỉ người quyết. Không có đường nào khác đổi được `state`. */
  decide(id: string, by: Actor, decision: Exclude<ApprovalState, 'waiting'>): ApprovalRequest
  pending(actor: Actor): ApprovalRequest[]
  get(id: string): ApprovalRequest | undefined
  all(): ApprovalRequest[]
}

export function createApprovalEngine(opts: { clock?: Clock } = {}): ApprovalEngine {
  const clock = opts.clock ?? systemClock
  const store = new Map<string, ApprovalRequest>()

  /* Store-keeping only. Every rule this engine has now lives in the pure
     functions above, so the browser and the server cannot drift apart. */
  const put = (req: NewRequest, ai: boolean, basis?: string): ApprovalRequest => {
    if (store.has(req.id)) throw new Error(`E3: yêu cầu ${req.id} đã tồn tại`)
    const created = raise(req, { ai, basis })
    store.set(req.id, created)
    return created
  }

  return {
    submit: (req) => put(req, false),

    proposeFromAi: ({ basis, ...req }) => put(req, true, basis),

    decide(id, by, decision) {
      const result = decideOn(store.get(id), by, decision, clock())
      if (!result.ok) throw new Error(refusalMessage(id, by, result))

      store.set(id, result.request)
      return result.request
    },

    pending: (actor) => [...store.values()].filter((r) => isPendingFor(r, actor)),

    get: (id) => store.get(id),
    all: () => [...store.values()],
  }
}

/** The in-memory engine's wording for a refusal the pure law returned.
 *
 *  Kept here rather than in `decideOn` because the server needs the same
 *  refusals as HTTP statuses with sentences a user reads, and one shared
 *  sentence would serve neither side well. */
function refusalMessage(
  id: string,
  by: Actor,
  result: Extract<DecisionResult<Decidable>, { ok: false }>,
) {
  if (result.reason === 'unknown') return `E3: không có yêu cầu ${id}`
  if (result.reason === 'already-decided') return `E3: ${id} đã được quyết, không quyết lại`
  if (result.reason === 'nobody-waiting') return `E3: ${id} không còn ai đang chờ`
  return `E3: ${id} đang chờ ${result.waitingFor}, không phải ${by.name}`
}
