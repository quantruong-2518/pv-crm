import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MeetingCreate, MeetingListResponse, MeetingPatch, MeetingRow } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** Sổ cuộc họp của một lead — bốn cửa dưới `/sales/leads/:code/meetings`.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG `load:` — ĐÃ CẮT SANG MÁY CHỦ
 *  ------------------------------------------------------------------
 *  Cả bốn đều có route thật trên `apps/api`, nên không cửa nào chở fixture.
 *  Vắng `load` chính là nghi thức cắt sang máy chủ (`app/api/client.ts`), và
 *  một fixture đứng sau một route đã tồn tại là câu trả lời thứ hai mà không
 *  ai phân biệt được với câu thứ nhất.
 *
 *  ------------------------------------------------------------------
 *  HAI QUYỀN, ĐỌC VÀ GHI, ĐÚNG NHƯ HỒ SƠ LEAD
 *  ------------------------------------------------------------------
 *  Đọc `lead.xem`, ghi `lead.sửa`, cả hai `scoped` — chép đúng từng chữ
 *  `@Need(...)` bên máy chủ để một route bật trục phạm vi và một query quên nó
 *  lộ ra bằng cách so hai dòng. Ở phía này cờ ấy không cắt gì (trình duyệt
 *  không có dòng nào để cắt, và không bao giờ được là chỗ quyết định); nó tồn
 *  tại để hai bản khai đọc giống nhau. Hàng rào thật là `requireAccess` cộng
 *  hàng rào của chính máy chủ.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO MỌI LƯỢT GHI ĐỀU LÀM MỚI CẢ DANH SÁCH, KHÔNG VÁ MỘT DÒNG
 *  ------------------------------------------------------------------
 *  `MeetingRow.isFirst` là thuộc tính của cả TẬP, không của một dòng: ghi bù
 *  một buổi cũ hơn buổi đang giữ ngôi thì ngôi sao chuyển sang dòng mới, và
 *  dòng cũ trong cache vẫn đang mang `isFirst: true`. Vá tại chỗ bằng dòng 201
 *  trả về sẽ để lại HAI ngôi sao trên màn cho tới lần tải lại kế tiếp. Nên
 *  `onSuccess` vứt nguyên khoá của lead đó và đọc lại — một lượt gọi, đổi lấy
 *  một con số không bao giờ nói dối.
 *
 *  Cùng lý do đó, thẻ điểm Sổ lead cũng bị vứt theo: `firstMeetings` của nó
 *  đếm số lead có ít nhất một buổi họp, nên buổi đầu tiên của một lead vừa đổi
 *  con số ấy. */

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.xem', scoped: true }
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.sửa', scoped: true }

/** Tiền tố của mọi khoá sổ họp, để một lượt ghi vứt được đúng phần của nó. */
export const MEETING_KEY = ['sales', 'meetings'] as const

/** Khoá thẻ điểm, chép từ `data/leads.ts` cùng lý do file `lead-create.ts` đã
 *  chép `LEAD_BOOK_KEY`: file kia xuất object query chứ không xuất tiền tố.
 *  Ghi ra đây để ngày ai đó đổi tên khoá thì phép tìm thấy cả hai chỗ. */
const SCORECARD_KEY = ['sales', 'lead-scorecard'] as const

const path = (code: string) => `/sales/leads/${encodeURIComponent(code)}/meetings`

/** Mọi buổi họp của một lead, mới trước.
 *
 *  `code` nằm TRONG `queryKey` — cùng luật với `leadProfileQuery` và
 *  `leadMailTimelineQuery`: đây không phải một giá trị mà là một giá trị mỗi
 *  lead, và một khoá quên mã sẽ vẽ buổi họp của khách trước lên hồ sơ khách
 *  sau. Trên một thẻ ghi "đã gặp 3 lần" thì đó không phải lỗi làm mới, đó là
 *  một câu sai về một khách hàng có thật. */
export const meetingsQuery = (code: string) =>
  queryOptions({
    queryKey: [...MEETING_KEY, code] as const,
    queryFn: ({ signal }) => api.read<MeetingListResponse>(path(code), { need: READ_NEED, signal }),
  })

type AddInput = { code: string; body: MeetingCreate }
type EditInput = { code: string; id: string; body: MeetingPatch }
type DropInput = { code: string; id: string }

/** Ghi một buổi vừa họp xong. 201 trả nguyên dòng.
 *
 *  Không `retry`, và đừng thêm: `mayReplay` đã từ chối phát lại một POST đã
 *  chạm dây, vì một buổi họp ghi hai lần là hai dòng không gì phân biệt nổi —
 *  và dòng thứ hai còn kéo theo một dòng `touch` thứ hai trên dòng thời gian.
 *  Chặn cú bấm thứ hai của NGƯỜI là việc của biểu mẫu (`isPending`). */
export function useAddMeeting() {
  const client = useQueryClient()

  return useMutation<MeetingRow, ApiError, AddInput>({
    mutationFn: ({ code, body }) =>
      api.write<MeetingRow>(path(code), { method: 'POST', body, need: WRITE_NEED }),
    onSuccess: (_row, { code }) => {
      void client.invalidateQueries({ queryKey: [...MEETING_KEY, code] })
      void client.invalidateQueries({ queryKey: SCORECARD_KEY })
    },
  })
}

export function useEditMeeting() {
  const client = useQueryClient()

  return useMutation<MeetingRow, ApiError, EditInput>({
    mutationFn: ({ code, id, body }) =>
      api.write<MeetingRow>(`${path(code)}/${id}`, { method: 'PATCH', body, need: WRITE_NEED }),
    onSuccess: (_row, { code }) => {
      /* Sửa `at` đổi được thứ tự VÀ đổi được ngôi sao — cùng lý do với `add`,
         nên cũng vứt cả danh sách. Thẻ điểm thì không đụng: sửa một buổi không
         làm lead nào có thêm hay bớt buổi họp. */
      void client.invalidateQueries({ queryKey: [...MEETING_KEY, code] })
    },
  })
}

export function useDropMeeting() {
  const client = useQueryClient()

  return useMutation<void, ApiError, DropInput>({
    mutationFn: ({ code, id }) =>
      api.write<void>(`${path(code)}/${id}`, { method: 'DELETE', need: WRITE_NEED }),
    onSuccess: (_void, { code }) => {
      void client.invalidateQueries({ queryKey: [...MEETING_KEY, code] })
      /* Xoá buổi CUỐI CÙNG của một lead làm nó rời khỏi mẫu số `firstMeetings`.
         Màn không biết đó có phải buổi cuối không, nên cứ vứt — một lượt đọc
         thẻ điểm rẻ hơn một con số sai. */
      void client.invalidateQueries({ queryKey: SCORECARD_KEY })
    },
  })
}
