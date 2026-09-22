import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  MailRunDetail,
  MailRunEdit,
  MailRunListQuery,
  MailRunListResponse,
  MailRunPatchResponse,
  MailRunRecipientsResponse,
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
 *  sinh một `mail_run` — quyết định #3 của
 *  `docs/decisions/0040-mas-mail-data-model-decisions.md`, và lý do
 *  ghi ở đó: dòng thời gian trong hồ sơ lead phải đọc ĐÚNG MỘT bảng, vì hai
 *  nguồn cho một câu hỏi là hai câu trả lời lệch nhau sau một quý. Hệ quả cho
 *  màn này là nó thấy được cả hai, và cột "Chiến dịch" trống nghĩa là lô đi
 *  lẻ chứ không nghĩa là thiếu dữ liệu.
 *
 *  ------------------------------------------------------------------
 *  ĐỌC BẰNG `campaign.view`, GHI BẰNG `campaign.broadcast`
 *  ------------------------------------------------------------------
 *  Chép đúng `@Need` của `MasController`. Hai mức vì viết vào một lô là một
 *  quyết định về mail thật: dừng thì giết những lá thư còn nằm trong hàng đợi,
 *  sửa thì đổi chữ sắp rời máy. Ai xem được số liệu chưa chắc được phép. */
const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'campaign.view', scoped: true }
const PATCH_NEED: ApiNeed = { branch: 'Sales', permission: 'campaign.broadcast', scoped: true }

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

/** The one state whose letter can still be rewritten.
 *
 *  `DRAFT` is deliberately absent and is not an oversight: nothing is ever
 *  written to `mail_run` in that state, so it cannot appear on this book.
 *  `SENDING`/`SENT`/`CANCELLED` are refused by the server — and even
 *  `SCHEDULED` is only a maybe, because the sweeper may have moved letters out
 *  of `pending` between the read and the press. The screen greys what it knows
 *  and reports the server's refusal for what it cannot. */
export const EDITABLE: readonly MailRunState[] = ['SCHEDULED']

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

/** WHO GOT THIS BATCH — `GET /sales/mail/runs/:id/recipients`.
 *
 *  A sub-key of `MAIL_RUN_KEY`, so the cancel door below sweeps it too: a run
 *  just stopped has N letters that moved from "queued" to "cancelled", and an
 *  open list must re-read rather than keep the old picture.
 *
 *  Loaded only where it is mounted — the screen builds this for the ONE wave a
 *  reader expanded, not for the screen. A ten-wave campaign otherwise costs ten
 *  round trips for a list somebody looks at one row of.
 *
 *  `refetchInterval` follows the state of the LETTERS, not of the batch: rows
 *  still `pending`/`sending` are the rows about to change, and a list that is
 *  all `delivered` has nothing left to wait for. Same 5s beat as
 *  `mailRunListQuery`. */
export const mailRunRecipientsQuery = (runId: string) =>
  queryOptions({
    queryKey: [...MAIL_RUN_KEY, 'recipients', runId] as const,
    queryFn: ({ signal }) =>
      api.read<MailRunRecipientsResponse>(
        `/sales/mail/runs/${encodeURIComponent(runId)}/recipients`,
        { need: READ_NEED, signal },
      ),
    refetchInterval: (q) =>
      q.state.data?.rows.some((r) => PENDING_MAIL[r.deliveryState]) ? 5_000 : false,
  })

/** ONE BATCH, WITH THE LETTER IN IT — `GET /sales/mail/runs/:id`.
 *
 *  A sub-key of `MAIL_RUN_KEY` like the recipient list, so saving an edit
 *  sweeps this too. Read on demand and never by the book: `body` is the reason
 *  this door exists, and a list page carrying twenty kilobytes of letter per
 *  row would pay for it on every load for the one reader who opens the editor.
 *
 *  `enabled` on the panel being OPEN, not on the id being known: the run book
 *  holds an id for every row it draws. */
export function useMailRunDetail(runId: string | null) {
  return useQuery({
    queryKey: [...MAIL_RUN_KEY, 'detail', runId] as const,
    queryFn: ({ signal }) =>
      api.read<MailRunDetail>(`/sales/mail/runs/${encodeURIComponent(runId ?? '')}`, {
        need: READ_NEED,
        signal,
      }),
    enabled: runId !== null,
  })
}

/** THREE LOOKUP TABLES OVER ONE LETTER'S STATE — and why they live in the data
 *  layer rather than beside the screen that draws them.
 *
 *  The ten values of `MAIL_STATES` live in `apps/api` and the browser may not
 *  import them — the whole argument is at `MailRunRecipientRow.deliveryState`.
 *  So the web half has to name the values it knows how to handle, and the only
 *  thing worse than one such list is TWO: the lead profile's mail timeline and
 *  a wave's recipient list ask the same question, and two hand-copied tables
 *  drift apart at exactly the state somebody adds next.
 *
 *  An unknown value falls through to "still on its way" on both screens: less
 *  than the truth, never something untrue. */
export const FAILED_MAIL: Record<string, true | undefined> = {
  bounced: true,
  complained: true,
  suppressed: true,
  failed_permanent: true,
  dead: true,
}

export const DELIVERED_MAIL: Record<string, true | undefined> = {
  accepted: true,
  delivered: true,
}

/** Still able to change, so still worth asking about. `accepted` is NOT here
 *  even though a `delivered` webhook may follow it: a letter the receiving
 *  server never reports back on is ordinary, and keeping it in this list is a
 *  5-second poll that runs until the reader closes the tab. */
const PENDING_MAIL: Record<string, true | undefined> = {
  pending: true,
  sending: true,
  delayed: true,
}

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
        need: PATCH_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: MAIL_RUN_KEY })
      void client.invalidateQueries({ queryKey: LEAD_MAIL_KEY })
    },
  })
}

/** Rewrite a batch that has not fired — the other branch of the same
 *  `PATCH /sales/mail/runs/:id`.
 *
 *  `edit` IS THE BODY, UNTOUCHED: `MailRunEdit` is `.strict()` and separates
 *  absent (leave it alone) from `null` (take it away), so this hook must not
 *  fill in, default or drop a single key. Whoever builds the patch owns that
 *  distinction; a helper "cleaning" the object here would erase it.
 *
 *  Sweeps the same two keys as the cancel door above: the run list shows the
 *  subject and the schedule this call just changed, and every recipient's lead
 *  timeline shows the letter still waiting to go. */
export function useMailRunEdit() {
  const client = useQueryClient()

  return useMutation<MailRunPatchResponse, ApiError, { id: string; edit: MailRunEdit }>({
    mutationFn: ({ id, edit }) =>
      api.write<MailRunPatchResponse>(`/sales/mail/runs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: edit,
        need: PATCH_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: MAIL_RUN_KEY })
      void client.invalidateQueries({ queryKey: LEAD_MAIL_KEY })
    },
  })
}
