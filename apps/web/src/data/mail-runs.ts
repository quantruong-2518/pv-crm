import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  MailRunListQuery,
  MailRunListResponse,
  MailRunPatchResponse,
  MailRunState,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { LEAD_MAIL_KEY } from '@/data/mas'

/** SỔ LÔ GỬI — `platform.mail_run`, mọi lô thư đã rời hoặc sắp rời máy.
 *
 *  ------------------------------------------------------------------
 *  MỘT BẢNG TRẢ LỜI CHO CẢ HAI ĐƯỜNG GỬI
 *  ------------------------------------------------------------------
 *  Quick MAS (chọn vài lead ở sổ rồi bấm gửi) và một đợt của chiến dịch đều
 *  sinh một `mail_run` — quyết định #3 của `ban-giao-mas-mail.md`, và lý do
 *  ghi ở đó: dòng thời gian trong hồ sơ lead phải đọc ĐÚNG MỘT bảng, vì hai
 *  nguồn cho một câu hỏi là hai câu trả lời lệch nhau sau một quý. Hệ quả cho
 *  màn này là nó thấy được cả hai, và cột "Chiến dịch" trống nghĩa là lô đi
 *  lẻ chứ không nghĩa là thiếu dữ liệu.
 *
 *  ------------------------------------------------------------------
 *  ĐỌC BẰNG `chiến-dịch.xem`, HUỶ BẰNG `chiến-dịch.bắn`
 *  ------------------------------------------------------------------
 *  Chép đúng `@Need` của `MasController`. Hai mức vì huỷ một lô là một quyết
 *  định về mail thật: nó giết những lá thư còn nằm trong hàng đợi. Ai xem được
 *  số liệu chưa chắc được phép dừng một đợt đang bay. */
const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'chiến-dịch.xem', scoped: true }
const CANCEL_NEED: ApiNeed = { branch: 'Sales', permission: 'chiến-dịch.bắn', scoped: true }

export const MAIL_RUN_KEY = ['sales', 'mail-runs'] as const

export const DEFAULT_MAIL_RUN_QUERY: MailRunListQuery = {
  page: 1,
  size: 20,
  sort: 'createdAt',
  dir: 'desc',
}

const MAIL_RUN_QUERY_KEYS = [
  'page',
  'size',
  'sort',
  'dir',
  'state',
  'campaign',
  'q',
] as const satisfies readonly (keyof MailRunListQuery)[]

export function mailRunQueryToParams(query: MailRunListQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of MAIL_RUN_QUERY_KEYS) {
    const value = query[key]
    if (value === undefined) continue
    if (value === DEFAULT_MAIL_RUN_QUERY[key]) continue
    params.set(key, String(value))
  }
  return params
}

/** Nhãn tiếng Việt của năm trạng thái lô. */
export const MAIL_RUN_STATE_LABEL: Record<MailRunState, string> = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Hẹn giờ',
  SENDING: 'Đang gửi',
  SENT: 'Đã gửi',
  CANCELLED: 'Đã huỷ',
}

export const MAIL_RUN_STATE_TONE: Record<
  MailRunState,
  'draft' | 'running' | 'success' | 'warning'
> = {
  DRAFT: 'draft',
  SCHEDULED: 'draft',
  SENDING: 'running',
  SENT: 'success',
  CANCELLED: 'warning',
}

/** Hai trạng thái người còn dừng được. `SENT` và `CANCELLED` là terminal —
 *  `MailRunPatch` ở máy chủ từ chối chúng, nên nút phải xám trước khi bấm chứ
 *  đừng để người dùng phát hiện bằng một thông báo lỗi. */
export const CANCELLABLE: readonly MailRunState[] = ['DRAFT', 'SCHEDULED', 'SENDING']

/** Một trang sổ lô.
 *
 *  `refetchInterval` chỉ chạy khi có lô ĐANG gửi trên trang này. Một trang
 *  toàn lô đã xong không được đánh thức trình duyệt, và một lô hẹn sang tuần
 *  cũng không — cùng lý lẽ với `leadMailTimelineQuery`, và cùng con số. */
export const mailRunListQuery = (query: MailRunListQuery) =>
  queryOptions({
    queryKey: [...MAIL_RUN_KEY, 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<MailRunListResponse>(`/sales/mail/runs?${mailRunQueryToParams(query)}`, {
        need: READ_NEED,
        signal,
      }),
    refetchInterval: (q) =>
      q.state.data?.rows.some((row) => row.state === 'SENDING') ? 5_000 : false,
  })

/** Huỷ một lô — `PATCH /sales/mail/runs/:id`, cửa MỘT CHIỀU.
 *
 *  Dọn cả `MAIL_RUN_KEY` lẫn `LEAD_MAIL_KEY`: những lá thư vừa bị giữ lại đang
 *  hiện trên dòng thời gian của từng lead trong lô, và bỏ quên khoá thứ hai là
 *  hồ sơ lead còn nói "đang chờ gửi" về một lá thư sẽ không bao giờ đi. */
export function useMailRunCancel() {
  const client = useQueryClient()

  return useMutation<MailRunPatchResponse, ApiError, string>({
    mutationFn: (id) =>
      api.write<MailRunPatchResponse>(`/sales/mail/runs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { state: 'CANCELLED' },
        need: CANCEL_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: MAIL_RUN_KEY })
      void client.invalidateQueries({ queryKey: LEAD_MAIL_KEY })
    },
  })
}
