import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ConfigProposalReceipt,
  type ContractSign,
  type ObjectCode,
  type OpportunityCareBody,
  type OpportunityCareResponse,
  type OpportunityCreate,
  type OpportunityCreateResponse,
  type OpportunityMilestoneBody,
  type OpportunityMilestoneResponse,
  type OpportunityProfileResponse,
  type OpportunityReactivateResponse,
  type OpportunityRow,
  type OpportunityStageHistory,
  type OpportunityUpdate,
  type OpportunityUpdateResponse,
} from '@pv/contracts'
import { type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import { api, type ApiError, type ApiNeed, type FieldErrors } from '@/app/api'
import { CONTRACT_BOOK_KEY } from '@/data/contracts'
import { invalidateLeadState } from '@/data/lead-exit'
import { idsOf, OPPORTUNITY_BOOK_KEY, saleOwnersOf, bdOwnersOf } from '@/data/opportunities'

/** Module 3 · các cửa GHI của sổ cơ hội, và một hàm dịch dùng chung.
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
 *     `textInputOptional` ở tầng hợp đồng đã đổi `''` → `undefined`.
 *
 *  ------------------------------------------------------------------
 *  VÀ MỘT ĐƯỜNG DỊCH NGƯỢC
 *  ------------------------------------------------------------------
 *  `draftOf` đưa một dòng sổ từ máy chủ TRỞ LẠI hình phiếu, để hồ sơ cơ hội
 *  dùng đúng bộ ô nhập mà popup đang dùng. Không có nó thì `ops-fields.tsx`
 *  phải học hai hình dữ liệu, và cùng một cái ô sẽ đọc `closedDate` ở một chỗ
 *  còn `expectedClose` ở chỗ kia. */

const BOOK_PATH = '/sales/opportunities'

/** Cửa TẠO và hai cửa NẠP LÔ — `@Need({ …, permission: 'opportunity.edit' })`,
 *  KHÔNG `scoped`, đúng như ba dòng khai ở controller.
 *
 *  `opportunity.edit` chứ không phải `opportunity.close`: mở một đơn thì đóng lại được, ký
 *  thì không — đọc docblock của controller cho phần đầy đủ. Khai ở đây để nút
 *  tắt đi TRƯỚC khi người dùng bấm, thay vì để họ điền hết phiếu rồi ăn 403.
 *
 *  Vắng `scoped` là ĐÚNG ở những cửa này: chưa có đơn nào thì chưa có phạm vi
 *  nào để cắt — người tạo chính là người sắp đứng đơn. */
export const OPPORTUNITY_WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'opportunity.edit' }

/** Cửa SỬA — cùng quyền, nhưng `scoped: true` như `@Need` của `PATCH :code`.
 *
 *  Tách khỏi hằng trên chứ không dùng chung: đứng trong PIC là thứ cho quyền
 *  sửa (ADR 0064 §5), nên một dòng khai thiếu `scoped` là hai đầu của cùng một
 *  ma trận quyền đọc ra hai câu khác nhau. */
export const OPPORTUNITY_UPDATE_NEED: ApiNeed = {
  branch: 'Sales',
  permission: 'opportunity.edit',
  scoped: true,
}

/** Cửa KÝ đòi một quyền khác hẳn — `@Need({ …, permission: 'opportunity.close',
 *  scoped: true })` ở `opportunity.controller.ts`.
 *
 *  Khai HẰNG RIÊNG chứ không mượn `OPPORTUNITY_WRITE_NEED` ngay trên, và không phải vì
 *  gõ thêm bốn dòng cho vui: hai quyền cố ý không gộp. Sửa một đơn thì sửa
 *  ngược lại được, ký thì không — chữ ký đã sang tay kế toán và sang tay khách,
 *  gỡ nó phải là một đề nghị có người duyệt chứ không phải một lượt gọi của
 *  người vừa lỡ tay. Gộp hai quyền nghĩa là muốn cho BD mở đơn thì phải cho họ
 *  luôn quyền ký, và `presales` — vai dựng số và chạy demo — sẽ ký được.
 *
 *  `scoped: true` vì máy chủ khai đúng chữ đó: người chỉ thấy đơn của mình thì
 *  cũng chỉ ký được đơn của mình. */
export const OPPORTUNITY_SIGN_NEED: ApiNeed = {
  branch: 'Sales',
  permission: 'opportunity.close',
  scoped: true,
}

const some = (s: string) => (s.trim() === '' ? undefined : s)

/** Phần thân chung của hai cửa — đúng bộ ô sửa được.
 *
 *  KHÔNG có `state`, `stage`, hay lý do chăm sóc, và cả ba đều vắng vì cùng một
 *  lý do (ADR 0064): một trục, một writer. Cột đi theo sự kiện thật ở máy chủ,
 *  còn lý do chăm sóc đi qua cửa riêng `POST /:code/care` — kèm đúng thân của
 *  nó. Một phiếu sửa mà chở được cột là một phiếu cãi lại chính máy chủ. */
function dealBody(draft: OpportunityDraft) {
  return {
    name: draft.name,
    expectedClose: draft.closedDate,
    /* `missingOf` đã chặn `null` và `0` trước khi nút gửi bật. */
    amount: draft.amount ?? 0,
    currency: draft.currency,
    saleOwners: draft.saleOwners,
    bdOwners: draft.bdOwners,
    /* The form's `null` must NOT become 0 on the wire. The contract marks this
       field `.optional()` precisely so "nobody has judged it" stays tellable
       from "judged at 0%", and absence is the only way to say the first. */
    ...(draft.probability === null ? {} : { probability: draft.probability }),
    products: draft.products,
    ...(some(draft.description) === undefined ? {} : { description: draft.description }),
    attachments: draft.attachments,
  }
}

/** Phiếu → thân `POST`. */
export function createBodyOf(leadCode: ObjectCode, draft: OpportunityDraft): OpportunityCreate {
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
    /* Chở theo mà KHÔNG có ô nào vẽ nó và KHÔNG cửa nào nhận nó: `stage` rời
       khỏi cả hai thân request từ ADR 0064. `'new'` cho đơn đã ra khỏi bảng chỉ
       là một giá trị hợp kiểu — cột thật của đơn đọc ở `op.stage`. */
    stage: op.stage ?? 'new',
    amount: op.amount,
    /* Đơn cũ chưa có tiền thì cũng chưa có đồng tiền. Phiếu phải chọn sẵn một
       cái để ô Select không rỗng, và VND là mặc định của sổ này. */
    currency: op.currency ?? 'VND',
    saleOwners: idsOf(saleOwnersOf(op)),
    bdOwners: idsOf(bdOwnersOf(op)),
    /* `null` is copied straight through, NOT turned into `''` like the text
       fields below: this box is numeric, and a number input takes `null` by
       rendering empty. Turning it into 0 "for tidiness" would erase the
       statement "nobody has judged this". */
    probability: op.probability,
    /* The wire carries `{ id, name }` so the screen can print a label; the form
       only needs ids, exactly like `saleOwners` above. */
    products: op.products.map((p) => p.id),
    description: op.description ?? '',
    attachments: op.attachments,
  }
}

/** Wire field names → the form's field names, for what the server refused.
 *
 *  ------------------------------------------------------------------
 *  ONE CELL IS SPELLED DIFFERENTLY ON EACH SIDE, AND THAT IS THE WHOLE JOB
 *  ------------------------------------------------------------------
 *  Every name but one matches, so this looks like it could be skipped —
 *  right up to `expectedClose`, which the form calls `closedDate` (see
 *  `draftOf`). Handed straight through, zod's complaint about a date that is
 *  not on the calendar lands under a key no box on either screen is listening
 *  for: it is fetched, parsed, and then silently dropped, and the user reads a
 *  footer saying something is wrong with a form where nothing is marked.
 *
 *  Translating HERE and not in each screen is the same call `createBodyOf` and
 *  `draftOf` already made: this file owns the boundary between the two
 *  spellings, and a second place that knows about it is the place they drift.
 *
 *  Keys with no box on screen — `leadCode` above all, which is what a 409
 *  duplicate arrives under — are dropped rather than renamed. They are not
 *  lost: they never had a cell to sit in, so the footer sentence carries them,
 *  and for a 409 that sentence is the server's own. */
const DRAFT_FIELD_OF_WIRE: Record<string, keyof OpportunityDraft> = {
  name: 'name',
  expectedClose: 'closedDate',
  amount: 'amount',
  currency: 'currency',
  saleOwners: 'saleOwners',
  bdOwners: 'bdOwners',
  probability: 'probability',
  products: 'products',
  description: 'description',
  attachments: 'attachments',
}

export function draftErrorsOf(errors: FieldErrors | undefined): FieldErrors {
  const out: FieldErrors = {}
  for (const [wire, messages] of Object.entries(errors ?? {})) {
    const field = DRAFT_FIELD_OF_WIRE[wire]
    if (field !== undefined) out[field] = messages
  }
  return out
}

// ---------------------------------------------------------------------------
// Ba cửa
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
    need: OPPORTUNITY_WRITE_NEED,
    signal,
  })
}

export function saveOpportunity(
  code: ObjectCode,
  body: OpportunityUpdate,
  signal?: AbortSignal,
): Promise<OpportunityUpdateResponse> {
  return api.write<OpportunityUpdateResponse>(`${BOOK_PATH}/${code}`, {
    method: 'PATCH',
    body,
    need: OPPORTUNITY_UPDATE_NEED,
    signal,
  })
}

/** Raise a request to sign — the only road to `won`, and it now passes E3.
 *
 *  202 with a receipt: the contract row exists only once an approver accepts
 *  the `contract-sign` request (`docs/decisions/0057-seven-sales-pipeline-decisions.md`,
 *  decision 7). All three body fields are optional — absent means "as the deal
 *  says" — and the drawer still shows them so the requester confirms the
 *  figures the approver will read. A second request while one waits is a 409. */
export function signContract(
  code: ObjectCode,
  body: ContractSign,
  signal?: AbortSignal,
): Promise<ConfigProposalReceipt> {
  return api.write<ConfigProposalReceipt>(`${BOOK_PATH}/${code}/contract`, {
    method: 'POST',
    body,
    need: OPPORTUNITY_SIGN_NEED,
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
      void client.invalidateQueries({ queryKey: OPPORTUNITY_BOOK_KEY })
      /* The first deal moves its lead to `converted` (ADR 0058). */
      invalidateLeadState(client)
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
export function useSaveOpportunity(code: ObjectCode) {
  const client = useQueryClient()

  return useMutation<OpportunityUpdateResponse, ApiError, OpportunityUpdate>({
    mutationFn: (body) => saveOpportunity(code, body),
    onSuccess: (row) => {
      /* Merged, not replaced: the row lacks the profile's `chain`, `position`
         and `pendingSign`, and a bare row would crash the rail on the next render. */
      client.setQueryData<OpportunityProfileResponse>(['sales', 'ops', code], (prev) =>
        prev ? { ...prev, ...row } : prev,
      )
      void client.invalidateQueries({ queryKey: OPPORTUNITY_BOOK_KEY })
      /* A signed deal's amount, currency and owner are carried onto its contract. */
      void client.invalidateQueries({ queryKey: CONTRACT_BOOK_KEY })
    },
  })
}

/** Mutation of the "Chốt thắng" button.
 *
 *  Nothing about the deal has changed yet, so nothing is written into the
 *  cache: the profile is re-read for its `pendingSign`, which locks the button,
 *  and the inbox is re-read in case the requester is also on the chain. The
 *  deal and contract books move when the approval lands (`useDecideApproval`). */
export function useSignContract(code: ObjectCode) {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, ContractSign>({
    mutationFn: (body) => signContract(code, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sales', 'ops', code], exact: true })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}

// ---------------------------------------------------------------------------
// THE THREE DOORS THAT MOVE A DEAL — MILESTONE · CARE · REACTIVATE
// ---------------------------------------------------------------------------

/** `PATCH :code/stage` IS GONE (ADR 0064 §1) and so is the mutation that drove
 *  it. A drag gesture was never a reason a deal advanced, so the three doors
 *  below take the FACT instead and let the server's single stage writer move the
 *  column: a milestone that really happened, a parking with a reason, a reopen.
 *
 *  `scoped: true` on all three, the same flag `OPPORTUNITY_UPDATE_NEED` above
 *  carries and the create door deliberately does not: standing in the PIC is what
 *  grants the right (ADR 0064 §5), so every declaration here has to read the same
 *  as its controller `@Need`. */
export const OPPORTUNITY_MOVE_NEED: ApiNeed = {
  branch: 'Sales',
  permission: 'opportunity.edit',
  scoped: true,
}

export function logMilestone(
  code: ObjectCode,
  body: OpportunityMilestoneBody,
  signal?: AbortSignal,
): Promise<OpportunityMilestoneResponse> {
  return api.write<OpportunityMilestoneResponse>(`${BOOK_PATH}/${code}/milestones`, {
    method: 'POST',
    body,
    need: OPPORTUNITY_MOVE_NEED,
    signal,
  })
}

export function pushToCare(
  code: ObjectCode,
  body: OpportunityCareBody,
  signal?: AbortSignal,
): Promise<OpportunityCareResponse> {
  return api.write<OpportunityCareResponse>(`${BOOK_PATH}/${code}/care`, {
    method: 'POST',
    body,
    need: OPPORTUNITY_MOVE_NEED,
    signal,
  })
}

/** An EMPTY body, and it is sent rather than omitted: the door parses one, and
 *  the column to return to is remembered on the row — asking the caller for it
 *  would let a deal come back further along than it left. */
export function reactivateDeal(
  code: ObjectCode,
  signal?: AbortSignal,
): Promise<OpportunityReactivateResponse> {
  return api.write<OpportunityReactivateResponse>(`${BOOK_PATH}/${code}/reactivate`, {
    method: 'POST',
    body: {},
    need: OPPORTUNITY_MOVE_NEED,
    signal,
  })
}

/** What all three moves have to refresh, written ONCE.
 *
 *  Three keys, three different reasons. The profile is ON SCREEN, so the row
 *  that just came back is merged straight in — merged and not replaced, because
 *  it lacks `chain`, `position` and `pendingSign` — and then re-read, since
 *  `position` and `daysInStage` are computed from the column the move just
 *  changed. The prefix key also covers the column history one card below. The
 *  deal's timeline gains a touch row, and the book's counts have moved. */
function useMoveSettled(code: ObjectCode) {
  const client = useQueryClient()

  return (row: OpportunityRow) => {
    client.setQueryData<OpportunityProfileResponse>(['sales', 'ops', code], (prev) =>
      prev ? { ...prev, ...row } : prev,
    )
    void client.invalidateQueries({ queryKey: ['sales', 'ops', code] })
    void client.invalidateQueries({ queryKey: ['sales', 'ops-touches', code] })
    void client.invalidateQueries({ queryKey: OPPORTUNITY_BOOK_KEY })
  }
}

/** Record `sample-sent` · `poc-run` · `quotation-sent`. Pressing the CURRENT
 *  column's milestone again is legal and expected — another quotation round. */
export function useLogMilestone(code: ObjectCode) {
  const settled = useMoveSettled(code)

  return useMutation<OpportunityMilestoneResponse, ApiError, OpportunityMilestoneBody>({
    mutationFn: (body) => logMilestone(code, body),
    onSuccess: settled,
  })
}

export function usePushToCare(code: ObjectCode) {
  const settled = useMoveSettled(code)

  return useMutation<OpportunityCareResponse, ApiError, OpportunityCareBody>({
    mutationFn: (body) => pushToCare(code, body),
    onSuccess: settled,
  })
}

export function useReactivateDeal(code: ObjectCode) {
  const settled = useMoveSettled(code)

  return useMutation<OpportunityReactivateResponse, ApiError, void>({
    mutationFn: () => reactivateDeal(code),
    onSuccess: settled,
  })
}

/** Which columns a deal has been through, and how long it stood in each.
 *
 *  A SEPARATE query from the profile rather than folded into `GET /:code`: the
 *  deal profile is opened dozens of times a day, while the column history is
 *  what somebody scrolls to when asking one specific question. Folding it in
 *  would make every profile open pay for a table most people never look at.
 *
 *  The cache key extends the profile's key (`['sales','ops',code]`) by one
 *  segment — which is why a column move's `invalidateQueries` reaches it
 *  without a second key constant that two places could forget to keep in
 *  sync. */
export function opportunityStageHistoryQuery(code: ObjectCode) {
  return queryOptions({
    queryKey: ['sales', 'ops', code, 'stage-history'] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityStageHistory>(`${BOOK_PATH}/${code}/stage-history`, {
        need: { branch: 'Sales', permission: 'opportunity.view', scoped: true },
        signal,
      }),
  })
}
