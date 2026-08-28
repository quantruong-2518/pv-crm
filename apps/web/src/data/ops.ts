import { queryOptions } from '@tanstack/react-query'
import {
  type OpportunityBookResponse,
  type OpportunityOwner,
  type OpportunityRow,
  type OpportunityState,
} from '@pv/contracts'
import { PIPELINE_STAGES, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import { api } from '@/app/api'

/** Sổ cơ hội — module 3. Đọc từ máy chủ.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CẮT KHỎI FIXTURE — 28/08
 *  ------------------------------------------------------------------
 *  `opsBookQuery` không còn `load`, và theo nghi thức của
 *  `app/api/client.ts` thì đó CHÍNH LÀ lượt cắt: có `load` nghĩa là query còn
 *  đọc fixture, vắng `load` nghĩa là nó đi HTTP thật. Không có cờ nào khác để
 *  bật, không có nhánh nào để đọc.
 *
 *  Ba thứ biến mất cùng lượt cắt này, và cả ba đều là hệ quả chứ không phải
 *  dọn dẹp tuỳ hứng:
 *
 *   · `mergeOps` — sổ trên màn từng là "fixture + phiếu vừa gửi + bản sửa tại
 *     chỗ". Cả ba nguồn phụ nay đều nằm ở máy chủ: phiếu gửi đi qua
 *     `POST /sales/ops`, bản sửa qua `PATCH /sales/ops/:code`. Giữ lại phép gộp
 *     là để một dòng xuất hiện hai lần — một bản của máy chủ, một bản của desk.
 *   · `nameOfActor` — dòng sổ nay chở `owners[]` có sẵn TÊN. Tra ngược id sang
 *     tên bằng danh sách actor của fixture là đọc tên khách hàng ra từ một kịch
 *     bản đóng băng, cho dữ liệu không thuộc kịch bản đó.
 *   · `stageOfState` — chuyển sang `@pv/contracts`, nơi máy chủ cũng đọc nó.
 *     Một bảng nối, hai đầu dây.
 *
 *  Thứ KHÔNG biến mất: `missingOf` và `toggled`. Chúng là luật của PHIẾU, và
 *  phiếu vẫn là phiếu — người dùng vẫn điền `OpportunityDraft` ở cả popup lẫn
 *  hồ sơ, `data/ops-create.ts` dịch nó sang thân request. */

export const OPS_BOOK_KEY = ['sales', 'ops-book'] as const

/** Cả sổ, một trang.
 *
 *  `size: 200` là trần của `PageQuery`, và ở đây nó là một lựa chọn có hạn
 *  dùng: cả ba việc màn làm — thẻ điểm, ba ô lọc dựng từ chính sổ, và phân
 *  trang tại máy — đều cần TOÀN BỘ sổ trong tay. Sổ hôm nay là mười mấy dòng.
 *  Ngày nó vượt 200, ba việc đó phải chuyển sang máy chủ (một endpoint thống
 *  kê, một endpoint danh sách lọc, và `page`/`size` đi theo bảng) — đó là một
 *  thay đổi có thật, không phải một con số cần nống lên. */
export const opsBookQuery = queryOptions({
  queryKey: OPS_BOOK_KEY,
  queryFn: () =>
    api.read<OpportunityBookResponse>('/sales/ops?size=200', {
      need: { branch: 'Sales', permission: 'cơ-hội.xem' },
    }),
})

export const opsProfileQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'ops', code] as const,
    queryFn: () =>
      api.read<OpportunityRow>(`/sales/ops/${code}`, {
        need: { branch: 'Sales', permission: 'cơ-hội.xem' },
      }),
  })

// ---------------------------------------------------------------------------
// Đọc một dòng sổ
// ---------------------------------------------------------------------------

/** Hai vai, tách ra khỏi một danh sách người.
 *
 *  Máy chủ trả MỘT mảng `owners` có `role`, không trả hai mảng: một danh sách
 *  người kèm vai là hình của bảng nối, và dây thì đi theo hình của dữ liệu.
 *  Màn cần hai danh sách vì nó bày ra hai hàng avatar, nên phép tách nằm ở
 *  đây — một chỗ, không phải mỗi màn một lần. */
export const ownersOf = (op: OpportunityRow, role: OpportunityOwner['role']) =>
  op.owners.filter((o) => o.role === role)

export const saleOwnersOf = (op: OpportunityRow) => ownersOf(op, 'SALE')
export const bdOwnersOf = (op: OpportunityRow) => ownersOf(op, 'BD')

export const namesOf = (owners: OpportunityOwner[]) => owners.map((o) => o.name)
export const idsOf = (owners: OpportunityOwner[]) => owners.map((o) => o.id)

/** Hạn của mỗi cột, tra theo khoá. */
const STAGE_LIMIT = new Map(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))

/** Đơn đang MỤC — nằm trong cột lâu hơn hạn của cột.
 *
 *  Máy chủ gửi SỐ NGÀY, màn áp HẠN. Chia thế vì hai vế có hai đời sống khác
 *  nhau: số ngày là một phép trừ trên `stage_since`, chỉ database biết; còn hạn
 *  mỗi cột là dòng cấu hình của phòng kinh doanh, thứ người ta sửa được và màn
 *  đã cầm sẵn.
 *
 *  `daysInStage === null` = đơn đã ra khỏi năm cột, và đơn đã đóng sổ thì không
 *  còn cột nào để mà mục. Đây cũng là chỗ bản cũ hay sai: kiểm `stage` trước
 *  rồi mới tra, nếu không thì một đơn vừa chuyển sang Close won vẫn bị tô vàng
 *  "mục" vì mã của nó còn trong bảng đơn đang mở. */
export function isRottingOp(op: OpportunityRow): boolean {
  if (op.daysInStage === null || op.stage === null) return false
  return op.daysInStage > (STAGE_LIMIT.get(op.stage) ?? Infinity)
}

/** Hôm nay, dạng ISO ngày. Sổ nay là dữ liệu SỐNG nên mốc so sánh là hôm nay,
 *  không còn là lát cắt đóng băng của kịch bản. */
const today = () => new Date().toISOString().slice(0, 10)

/** Đơn đang mở mà ngày đóng dự kiến đã trôi qua — "đáng lẽ đóng rồi".
 *
 *  Đơn chưa đặt ngày đóng thì KHÔNG trễ: không có hạn thì không có gì để quá.
 *  Hai chục dòng của sổ đóng băng rơi vào đúng nhánh đó. */
export function isLateClose(op: OpportunityRow): boolean {
  return op.stage !== null && op.expectedClose !== null && op.expectedClose <= today()
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
 *  Đây là bản của MÀN, và nó cố tình soi cùng những điều kiện mà
 *  `OpportunityCreate`/`OpportunityUpdate` soi ở máy chủ. Hai bản không phải
 *  thừa: bản này bật/tắt một cái nút trước khi có request nào, bản kia là hàng
 *  rào thật cho mọi cửa gọi. Bản này lệch thì người dùng thấy một nút sáng rồi
 *  ăn 400; bản kia lệch thì dữ liệu sai vào bảng. */
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
 *  Bảng nằm ở tầng app chứ không ở hợp đồng: "close-won màu gì" là cách trình
 *  bày của phòng kinh doanh, không phải hình của dữ liệu (cùng cách chia với
 *  `ORIGIN_FACE` ở `data/leads.ts`).
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
