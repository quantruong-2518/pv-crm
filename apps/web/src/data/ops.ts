import { queryOptions } from '@tanstack/react-query'
import {
  dasVina,
  DAY_FROZEN,
  dayISO,
  isRotting,
  OPEN_DEALS,
  OPPORTUNITIES,
  OPPORTUNITY_STATES,
  type Opportunity,
  type OpportunityDraft,
  type OpportunityState,
} from '@pv/engines/fixtures/das-vina'

/** Sổ cơ hội — module 3. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy sổ cơ hội. Khi có backend, đổi thân `fetchOps`
 *  thành lời gọi HTTP; `opsBookQuery` và cả hai màn dùng nó không phải sửa —
 *  cùng hình với `data/leads.ts` của module 2.
 *
 *  ------------------------------------------------------------------
 *  SỔ TRÊN MÀN = SỔ FIXTURE + PHIẾU VỪA GỬI + BẢN SỬA TẠI CHỖ
 *  ------------------------------------------------------------------
 *  Ba nguồn, gộp ở `mergeOps` chứ không gộp ở màn:
 *
 *   1 · `OPPORTUNITIES` — 30 dòng của kỳ, suy ra từ sổ lead (fixture);
 *   2 · `desk.deals`    — phiếu người dùng vừa đổi từ một lead trong phiên này;
 *   3 · `desk.ops`      — những ô đã sửa trên một dòng đã có.
 *
 *  Gộp ở một hàm THUẦN vì cả bảng lẫn màn hồ sơ đều cần đúng danh sách đó, và
 *  hai bản gộp chép tay sẽ lệch nhau ngay lần đầu ai đó thêm nguồn thứ tư. */

async function fetchOps(): Promise<Opportunity[]> {
  return OPPORTUNITIES
}

export const opsBookQuery = queryOptions({
  queryKey: ['sales', 'ops-book'] as const,
  queryFn: fetchOps,
})

/** Cột mà một trạng thái rơi vào. Hai kết cục đóng sổ không có cột nào. */
const STATE_STAGE = new Map(OPPORTUNITY_STATES.map((s) => [s.key, s.stage]))

/** Cột mà một trạng thái rơi vào — dây nối `OPPORTUNITY_STATES` → cột.
 *
 *  Đổi trạng thái trên hồ sơ là đơn ĐỔI CỘT, và cột phải đi theo ngay: để
 *  `stage` cũ nằm lại thì bảng tô "Close won" mà `title` vẫn nói "cột Chờ ký". */
export function stageOfState(state: OpportunityState) {
  return STATE_STAGE.get(state) ?? null
}

/** Phiếu vừa gửi, nâng thành một dòng sổ đầy đủ.
 *
 *  Phiếu thiếu đúng hai thứ so với một dòng sổ: lead nó sinh ra từ đâu (người
 *  gọi biết, phiếu thì không mang) và cột nó rơi vào (suy từ trạng thái đã
 *  chọn — cùng bảng nối mà popup đang in ra ở câu dẫn dưới ô Trạng thái). */
export function rowOfDraft(leadCode: string, draft: OpportunityDraft): Opportunity {
  return { ...draft, leadCode, stage: stageOfState(draft.state) }
}

/** Sổ như người dùng đang thấy nó.
 *
 *  Phiếu mới đứng TRƯỚC 30 dòng cũ: thứ vừa tạo xong mà phải lật sang trang ba
 *  mới thấy thì người dùng tưởng nút không ăn.
 *
 *  Bản sửa đè lên dòng gốc bằng `...patch` chứ không thay cả dòng — patch chỉ
 *  chở những ô đã đổi, và `leadCode` thì không bao giờ đổi được. */
export function mergeOps(
  book: Opportunity[],
  deals: Record<string, OpportunityDraft>,
  patches: Record<string, Partial<Opportunity>>,
): Opportunity[] {
  const fresh = Object.entries(deals).map(([leadCode, draft]) => rowOfDraft(leadCode, draft))
  return [...fresh, ...book].map((op) => ({ ...op, ...patches[op.code] }))
}

// ---------------------------------------------------------------------------
// Luật của phiếu
// ---------------------------------------------------------------------------

/** Còn thiếu gì để phiếu này gửi được — MỘT bản kiểm, dùng ở cả hai chỗ.
 *
 *  Trả về danh sách CHỮ chứ không trả `boolean`: thiếu gì thì nói ra thiếu gì.
 *  Một nút mờ không lý do là một ngõ cụt — người dùng không biết phải sửa ô nào
 *  để nó sáng lại.
 *
 *  Nằm ở đây chứ không cạnh bộ ô nhập vì `react-refresh` đòi một file component
 *  chỉ xuất component — và vì bản kiểm này là LUẬT của phiếu, không phải cách
 *  vẽ một cái ô. */
export function missingOf(draft: OpportunityDraft): string[] {
  const missing: string[] = []
  if (draft.name.trim() === '') missing.push('tên cơ hội')
  if (draft.closedDate === '') missing.push('ngày đóng dự kiến')
  if (draft.amount === null || draft.amount === 0) missing.push('giá trị đơn')
  if (draft.saleOwners.length === 0) missing.push('ít nhất một Sale đứng đơn')
  if (draft.state === 'close-lost' && draft.lossReason === '' && draft.lossNote.trim() === '') {
    missing.push('lý do thua')
  }
  return missing
}

/** Bật/tắt một người trong một danh sách — cùng phép cho cả hai ô chủ sở hữu. */
export const toggled = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

// ---------------------------------------------------------------------------
// Cách một dòng sổ ra mặt
// ---------------------------------------------------------------------------

/** Màu của trạng thái — năm trạng thái, năm tone, không trùng nhau.
 *
 *  Bảng nằm ở tầng app chứ không ở fixture: "close-won màu gì" là cách trình
 *  bày của phòng kinh doanh, không phải kiến thức của kịch bản (cùng cách chia
 *  với `ORIGIN_FACE` ở `data/leads.ts`).
 *
 *  Ba trạng thái đang chạy KHÔNG tô ba màu khác nhau: bảng token có năm tone
 *  semantic, và tô hết cho ba bậc của cùng một việc thì màu chỉ còn nói lại
 *  đúng chữ đã in trong chính cái pill. Màu ở đây trả lời "đơn này còn sống
 *  không", chữ trả lời "đang ở bậc nào". */
export const STATE_TONE: Record<OpportunityState, 'success' | 'danger' | 'running' | 'draft'> = {
  'close-won': 'success',
  'close-lost': 'danger',
  nego: 'running',
  'gui-quotation': 'running',
  pending: 'draft',
}

/** Ngày lát cắt, dạng ISO ngày — mốc để nói một ngày là quá khứ hay tương lai. */
export const CUT_DAY = dayISO(DAY_FROZEN).slice(0, 10)

/** Đơn đang mở mà ngày đóng dự kiến đã trôi qua.
 *
 *  Trong kịch bản đóng băng có đúng một đơn như vậy (OP-0252, nằm cột cuối 14
 *  ngày trên hạn 10) — `scenario.test.ts` khoá con số đó. Đây là tín hiệu
 *  "đáng lẽ đóng rồi", không phải lỗi tính ngày. */
export function isLateClose(op: Opportunity): boolean {
  return op.stage !== null && op.closedDate <= CUT_DAY
}

/** Đơn đang mục — nằm trong cột lâu hơn hạn của cột.
 *
 *  Đọc `OPEN_DEALS` chứ không tự đếm lại: số ngày trong cột là dữ liệu của sổ
 *  10 đơn đang mở, và `isRotting` là phép của chính fixture. Phiếu người dùng
 *  vừa tạo chưa nằm trong cột nào đủ lâu để mục.
 *
 *  Kiểm `stage` TRƯỚC khi tra mã, và đây không phải phép thừa: người dùng sửa
 *  một đơn đang mục sang Close won thì nó ra khỏi năm cột, nhưng mã của nó vẫn
 *  còn trong `OPEN_DEALS` — thiếu vế này thì màn vẽ ra "Close won · mục" tô
 *  vàng, tức một đơn vừa thắng vừa quá hạn. Đơn đã đóng sổ thì không còn cột
 *  nào để mà mục. */
export function isRottingOp(op: Opportunity): boolean {
  if (op.stage === null) return false
  const deal = OPEN_DEALS.find((d) => d.code === op.code)
  return deal ? isRotting(deal) : false
}

/** Tên người từ id actor. Sổ giữ id vì tên đổi được, màn thì phải in tên. */
export function nameOfActor(id: string): string {
  return dasVina.actors.find((a) => a.id === id)?.name ?? id
}

export const actorNames = (ids: string[]): string[] => ids.map(nameOfActor)
