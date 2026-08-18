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
  /** Loại yêu cầu do nhánh khai báo, ví dụ 'giảm-giá' | 'mua-hàng'. */
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

type NewRequest = {
  id: string
  type: string
  ref: ObjectRef
  raisedBy: string
  chain: ChainLink[]
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

  const put = (req: NewRequest, fromAi: boolean, basis?: string): ApprovalRequest => {
    if (store.has(req.id)) throw new Error(`E3: yêu cầu ${req.id} đã tồn tại`)
    if (req.chain.length === 0) throw new Error(`E3: ${req.id} không có chuỗi duyệt`)
    const created: ApprovalRequest = { ...req, fromAi, basis, state: 'waiting' }
    store.set(req.id, created)
    return created
  }

  return {
    submit: (req) => put(req, false),

    proposeFromAi: ({ basis, ...req }) => {
      if (!basis.trim()) throw new Error(`E3: đề xuất AI ${req.id} thiếu căn cứ`)
      return put(req, true, basis)
    },

    decide(id, by, decision) {
      const req = store.get(id)
      if (!req) throw new Error(`E3: không có yêu cầu ${id}`)
      if (req.state !== 'waiting') throw new Error(`E3: ${id} đã ${req.state}, không quyết lại`)

      const link = req.chain.find((l) => l.state === 'waiting')
      if (!link) throw new Error(`E3: ${id} không còn ai đang chờ`)
      if (link.person !== by.name) {
        throw new Error(`E3: ${id} đang chờ ${link.person}, không phải ${by.name}`)
      }

      link.state = decision
      const stillWaiting = req.chain.some((l) => l.state === 'waiting')
      const updated: ApprovalRequest = {
        ...req,
        state: decision === 'rejected' ? 'rejected' : stillWaiting ? 'waiting' : 'approved',
        decidedAt: clock(),
        decidedBy: by.name,
      }
      store.set(id, updated)
      return updated
    },

    pending: (actor) =>
      [...store.values()].filter(
        (r) =>
          r.state === 'waiting' &&
          r.chain.some((l) => l.state === 'waiting' && l.person === actor.name),
      ),

    get: (id) => store.get(id),
    all: () => [...store.values()],
  }
}
