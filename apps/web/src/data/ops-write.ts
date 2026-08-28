import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  OpportunityCreateState,
  type MaObject,
  type OpportunityCreate,
  type OpportunityCreateResponse,
  type OpportunityRow,
  type OpportunityUpdate,
  type OpportunityUpdateResponse,
} from '@pv/contracts'
import { OPPORTUNITY_STATES, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { idsOf, OPS_BOOK_KEY, saleOwnersOf, bdOwnersOf } from '@/data/ops'

/** Module 3 · hai cửa GHI của sổ cơ hội, và một hàm dịch dùng chung.
 *
 *  ------------------------------------------------------------------
 *  PHIẾU GIỮ NGUYÊN HÌNH CỦA NÓ, DÂY LÀ MỘT HÌNH KHÁC
 *  ------------------------------------------------------------------
 *  Cả popup đổi lead lẫn hồ sơ cơ hội đều cầm một `OpportunityDraft` — 14 ô,
 *  đúng bộ đã chốt khi đặt hàng màn, và cùng bộ component vẽ ra chúng
 *  (`components/ops-fields.tsx`). Thân request thì KHÔNG cùng hình, và ba khác
 *  biệt đều có lý do ở phía máy chủ:
 *
 *   · `code` không đi lên. Máy chủ cấp bằng `sales.opportunity_code_seq`; một
 *     thân request mang sẵn mã là mời hai tab mở phiếu cùng lúc cấp cùng một số.
 *   · `account` không đi lên. Tên khách đọc từ chính lead — gửi lên là cho phép
 *     một phiếu đổi tên khách của người khác.
 *   · `''` thành VẮNG MẶT. Bảng chỉ có một quy ước cho "trống" là `NULL`, và
 *     `textNhapTuyChon` ở tầng hợp đồng đã đổi `''` → `undefined`.
 *
 *  ------------------------------------------------------------------
 *  VÀ MỘT ĐƯỜNG DỊCH NGƯỢC
 *  ------------------------------------------------------------------
 *  `draftOf` đưa một dòng sổ từ máy chủ TRỞ LẠI hình phiếu, để hồ sơ cơ hội
 *  dùng đúng bộ ô nhập mà popup đang dùng. Không có nó thì `ops-fields.tsx`
 *  phải học hai hình dữ liệu, và cùng một cái ô sẽ đọc `closedDate` ở một chỗ
 *  còn `expectedClose` ở chỗ kia. */

const BOOK_PATH = '/sales/ops'

/** Cùng ba trục mà `OpportunityController` khai bằng `@Need`.
 *
 *  `cơ-hội.sửa` chứ không phải `cơ-hội.chốt`: mở một đơn thì đóng lại được, ký
 *  thì không — đọc docblock của controller cho phần đầy đủ. Khai ở đây để nút
 *  tắt đi TRƯỚC khi người dùng bấm, thay vì để họ điền hết phiếu rồi ăn 403. */
export const OPS_WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'cơ-hội.sửa' }

/** Bốn trạng thái hai phiếu nhận, lọc từ năm trạng thái của sổ.
 *
 *  "Close won" rụng ở đây, và không phải vì màn ngại vẽ nó: một đơn thắng là
 *  một đơn CÓ HỢP ĐỒNG — số hợp đồng và ngày ký — mà phiếu không có ô nào hỏi
 *  hai thứ đó. Cho chọn thì hoặc màn phải bịa, hoặc máy chủ phải bịa.
 *
 *  Lọc từ `OPPORTUNITY_STATES` chứ không khai lại bốn dòng: nhãn tiếng Việt chỉ
 *  có một bản, và `OpportunityCreateState` của hợp đồng là thứ nói cái nào được
 *  phép. Thêm một trạng thái ở hợp đồng thì danh sách này tự dài ra. */
export const CREATE_STATES = OPPORTUNITY_STATES.filter(
  (s) => OpportunityCreateState.safeParse(s.key).success,
)

const some = (s: string) => (s.trim() === '' ? undefined : s)

/** Phần thân chung của hai cửa — đúng mười một ô sửa được. */
function dealBody(draft: OpportunityDraft) {
  const lost = draft.state === 'close-lost'

  return {
    name: draft.name,
    expectedClose: draft.closedDate,
    /* Ép kiểu vì `OpportunityDraft.state` còn mang cả năm giá trị. Nút gửi đã
       tắt với 'close-won' (nó không có trong `CREATE_STATES` nên không chọn
       được), và nếu nó lọt tới đây thì zod ở máy chủ trả 400 gọi tên ô — hàng
       rào thật nằm ở đó, không nằm ở phép ép này. */
    state: draft.state as OpportunityCreate['state'],
    /* `missingOf` đã chặn `null` và `0` trước khi nút gửi bật. */
    amount: draft.amount ?? 0,
    currency: draft.currency,
    saleOwners: draft.saleOwners,
    bdOwners: draft.bdOwners,
    ...(some(draft.description) === undefined ? {} : { description: draft.description }),
    attachments: draft.attachments,
    /* Lý do thua CHỈ đi kèm đơn thua. Hợp đồng từ chối một lý do trên đơn còn
       sống, nên gửi kèm "cho chắc" là một 400 chứ không phải một trường bị bỏ
       qua. */
    ...(lost && some(draft.lossReason) !== undefined ? { lossReason: draft.lossReason } : {}),
    ...(lost && some(draft.lossNote) !== undefined ? { lossNote: draft.lossNote } : {}),
  }
}

/** Phiếu → thân `POST`. */
export function createBodyOf(leadCode: MaObject, draft: OpportunityDraft): OpportunityCreate {
  return {
    leadCode,
    ...(draft.accountCode === '' ? {} : { accountCode: draft.accountCode }),
    ...dealBody(draft),
  }
}

/** Phiếu → thân `PATCH`. */
export function updateBodyOf(draft: OpportunityDraft): OpportunityUpdate {
  return dealBody(draft)
}

/** Dòng sổ → phiếu.
 *
 *  Ba ô của phiếu không có mặt trên dây và được dựng lại ở đây, mỗi ô một lý
 *  do khác nhau:
 *
 *   · `code`/`account`/`accountCode` — có trên dây, chỉ đọc, chép thẳng.
 *   · `saleOwners`/`bdOwners` — dây chở MỘT mảng `owners` kèm vai; phiếu cần
 *     hai mảng id. `idsOf` bỏ tên đi, và đó là đúng: ô chọn người bật/tắt theo
 *     id, tên chỉ để hiển thị.
 *   · mọi ô chữ tuỳ chọn — dây dùng `undefined` cho "không có", phiếu dùng `''`
 *     vì `<input>` không nhận `undefined` mà không thành uncontrolled. Đây là
 *     ranh giới giữa hai quy ước, và nó chỉ được nằm ở đúng một chỗ. */
export function draftOf(op: OpportunityRow): OpportunityDraft {
  return {
    code: op.code,
    name: op.name,
    account: op.account,
    accountCode: op.accountCode ?? '',
    closedDate: op.expectedClose ?? '',
    state: op.state,
    amount: op.amount,
    /* Đơn cũ chưa có tiền thì cũng chưa có đồng tiền. Phiếu phải chọn sẵn một
       cái để ô Select không rỗng, và VND là mặc định của sổ này. */
    currency: op.currency ?? 'VND',
    saleOwners: idsOf(saleOwnersOf(op)),
    bdOwners: idsOf(bdOwnersOf(op)),
    description: op.description ?? '',
    attachments: op.attachments,
    lossReason: op.lossReason ?? '',
    lossNote: op.lossNote ?? '',
  }
}

// ---------------------------------------------------------------------------
// Hai cửa
// ---------------------------------------------------------------------------

/** `api.write` chứ không `fetch`: cửa ghi đi qua ĐÚNG chuỗi interceptor của mọi
 *  lượt đọc — đóng dấu phiên, từ chối phiên đã chết, và hỏi E2 trước khi một
 *  byte nào rời trình duyệt. Một `fetch` trần trong `mutationFn` là một đường
 *  dữ liệu đi vòng qua hàng rào quyền, đúng thứ `app/api/client.ts` tồn tại để
 *  làm cho bất khả thi. */
export function promoteLead(
  body: OpportunityCreate,
  signal?: AbortSignal,
): Promise<OpportunityCreateResponse> {
  return api.write<OpportunityCreateResponse>(BOOK_PATH, {
    method: 'POST',
    body,
    need: OPS_WRITE_NEED,
    signal,
  })
}

export function saveOpportunity(
  code: MaObject,
  body: OpportunityUpdate,
  signal?: AbortSignal,
): Promise<OpportunityUpdateResponse> {
  return api.write<OpportunityUpdateResponse>(`${BOOK_PATH}/${code}`, {
    method: 'PATCH',
    body,
    need: OPS_WRITE_NEED,
    signal,
  })
}

/** Mutation của popup đổi lead.
 *
 *  `onSuccess` chỉ vô hiệu hoá sổ để bảng phía sau nạp lại; nó KHÔNG đi tìm
 *  dòng mới, vì 201 đã chở nguyên dòng đó rồi. Người gọi nhận nó và dùng luôn
 *  — cùng cách `useCreateLead` làm. */
export function usePromoteLead() {
  const client = useQueryClient()

  return useMutation<OpportunityCreateResponse, ApiError, OpportunityCreate>({
    mutationFn: (body) => promoteLead(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: OPS_BOOK_KEY })
    },
  })
}

/** Mutation của nút Lưu ở hồ sơ cơ hội.
 *
 *  Ghi THẲNG dòng vừa nhận vào cache của hồ sơ (`setQueryData`) rồi mới đánh
 *  dấu sổ cần nạp lại. Hai bước, hai việc: hồ sơ đang mở phải thấy bản mới
 *  NGAY — người vừa bấm Lưu không nên thấy ô cũ nhấp nháy trở lại trong lúc
 *  chờ một lượt đọc thứ hai — còn cái sổ thì có thể nạp lại thong thả, nó đang
 *  không ở trước mắt ai. */
export function useSaveOpportunity(code: MaObject) {
  const client = useQueryClient()

  return useMutation<OpportunityUpdateResponse, ApiError, OpportunityUpdate>({
    mutationFn: (body) => saveOpportunity(code, body),
    onSuccess: (row) => {
      client.setQueryData(['sales', 'ops', code], row)
      void client.invalidateQueries({ queryKey: OPS_BOOK_KEY })
    },
  })
}
