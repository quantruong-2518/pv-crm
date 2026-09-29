import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  LeadOwnerResponse,
  LeadOwnerWrite,
  ObjectCode,
  OpportunityBookRow,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import {
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  OPPORTUNITY_BOOK_KEY,
  opportunityBookQuery,
} from '@/data/opportunities'

/** Đổi người giữ một lead — `PATCH /sales/leads/:code/owner`.
 *
 *  ------------------------------------------------------------------
 *  MỘT CỬA CHO CẢ "GIAO" LẪN "NHẬN", VÌ ĐÓ LÀ MỘT PHÉP GHI
 *  ------------------------------------------------------------------
 *  Trên màn là hai nút và hai câu khác nhau ("Giao lead", "Nhận lead"), nhưng
 *  cái chúng làm là một: đặt `lead.owner_id`. Tách thành hai endpoint là hai
 *  chỗ để luật đi lệch nhau — chỗ này chỉ khác nhau ở giá trị `ownerId` gửi
 *  đi, và ai được phép gửi giá trị nào thì máy chủ đã tự trả lời
 *  (`LeadWriteService.setOwner`), vì chỉ nó cầm `owner_id` hiện tại.
 *
 *  ------------------------------------------------------------------
 *  KHAI `lead.edit`, KHÔNG `scoped` — CHÉP ĐÚNG `@Need` CỦA ROUTE
 *  ------------------------------------------------------------------
 *  Đúng từng chữ với `LeadController.setOwner`, cùng nghi thức mọi query khác
 *  của repo này dùng: hai bản khai lệch nhau thì lộ ra bằng cách so hai dòng.
 *  Và cả hai chỗ đều KHÔNG bật trục phạm vi có lý do: lead trong kho chung
 *  mang `owner_id IS NULL`, bật lên là không ai nhận được gì từ kho chung.
 *
 *  ------------------------------------------------------------------
 *  VỨT BỐN THỨ, KHÔNG VÁ MỘT Ô
 *  ------------------------------------------------------------------
 *  201 trả về nguyên dòng sổ, nhưng vá nó vào cache là vá đúng MỘT trong bốn
 *  chỗ đang in người giữ:
 *
 *   · sổ lead — cột Lead PIC của trang đang mở;
 *   · mặt lọc của sổ (`lead-book/facets`) — ô lọc "Lead PIC" dựng danh sách
 *     người TỪ cả sổ, nên giao lead đầu tiên cho ai đó là thêm một dòng vào ô
 *     lọc mà không lượt đọc nào khác biết;
 *   · hồ sơ lead (`lead-profile`) — khối PIC ở đầu trang chi tiết;
 *   · dòng thời gian (`lead-touches`) — máy chủ vừa ghi một lần chạm `handed-over`.
 *
 *  Hai tiền tố vì hai cái đầu nằm chung dưới `['sales','lead-book']`. Vá tay
 *  ba chỗ rồi quên chỗ thứ tư là đúng cái lớp lỗi "màn nói một đằng máy chủ
 *  một nẻo" mà cả tầng `data/` này dựng ra để không phải gặp nữa. */

const OWNER_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit' }

/** Các tiền tố bị vứt sau mỗi lượt giao. Chép chuỗi chứ không import: ba file
 *  kia xuất object query chứ không xuất tiền tố — cùng món nợ `lead-create.ts`
 *  đã ghi khi chép `LEAD_BOOK_KEY`, ghi lại đây để lần đổi tên tìm đủ chỗ. */
const TOUCHED_KEYS = [
  ['sales', 'lead-book'],
  ['sales', 'lead-profile'],
  ['sales', 'lead-touches'],
  // The old holder's open deals follow the lead (ADR 0069 §10): the Ops book and deal profiles.
  OPPORTUNITY_BOOK_KEY,
  ['sales', 'ops'],
] as const

export function ownerPath(code: string): string {
  return `/sales/leads/${encodeURIComponent(code)}/owner`
}

export type SetOwnerInput = { code: string } & LeadOwnerWrite

export function useSetLeadOwner() {
  const client = useQueryClient()

  return useMutation<LeadOwnerResponse, ApiError, SetOwnerInput>({
    mutationFn: ({ code, ...body }) =>
      api.write<LeadOwnerResponse>(ownerPath(code), {
        method: 'PATCH',
        body,
        need: OWNER_NEED,
      }),
    onSuccess: () => {
      for (const key of TOUCHED_KEYS) void client.invalidateQueries({ queryKey: key })
    },
  })
}

/** Which of the old holder's open deals follow a lead hand-over (ADR 0069 §10).
 *
 *  Read off the Ops book filtered by lead, state and SALE rather than
 *  `live-deal`: only the book row carries `owners`, and the filter asks the
 *  server the same question `handDealsOver` asks.
 *
 *  Every deal starts ticked, so the state keeps the UNticked codes — a list
 *  that arrives after the drawer opens is still all ticked. With nothing
 *  unticked `dealCodes` stays absent, which the server reads as "every such
 *  deal", including any the reader's scope hid from this list. */
export type HandoverChoice = ReturnType<typeof useHandoverChoice>

export function useHandoverChoice(leadCode: string, fromId: string | null, enabled: boolean) {
  const [dropped, setDropped] = useState<string[]>([])
  const book = useQuery({
    ...opportunityBookQuery({
      ...DEFAULT_OPPORTUNITY_BOOK_QUERY,
      leadCode,
      state: 'open',
      ...(fromId ? { sale: fromId } : {}),
      size: 200,
    }),
    enabled: enabled && fromId !== null,
  })
  const deals: OpportunityBookRow[] = book.data?.rows ?? []
  const dealCodes: ObjectCode[] | undefined =
    dropped.length === 0 ? undefined : deals.map((d) => d.code).filter((c) => !dropped.includes(c))

  return {
    deals,
    hidden: book.data?.hidden ?? 0,
    failed: book.isError,
    dealCodes,
    isTicked: (code: string) => !dropped.includes(code),
    toggle: (code: string) =>
      setDropped((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code])),
    reset: () => setDropped([]),
  }
}
