import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { CampaignBookQuery } from '@pv/contracts'
import type {
  CampaignBookResponse,
  CampaignCreate,
  CampaignCreateResponse,
  CampaignMemberPatch,
  CampaignMemberPatchResponse,
  CampaignPatch,
  CampaignPatchResponse,
  CampaignProfile,
  CampaignStart,
  CampaignStartResponse,
  CampaignState,
  CampaignStopResponse,
  CampaignWaveInput,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** SỔ CHIẾN DỊCH THẬT — `sales.campaign`, mã `CP-nnnn`. ĐỌC TỪ MÁY CHỦ.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG PHẢI `data/campaigns.ts`, VÀ HAI FILE NÀY KHÔNG ĐƯỢC GỘP
 *  ------------------------------------------------------------------
 *  `data/campaigns.ts` phục vụ màn **Nguồn dẫn** (`SR-nn`) — nơi lead SINH RA:
 *  hội thảo, landing page, danh sách mua, đo bằng chi phí trên một lead tốt.
 *  File này phục vụ **Chiến dịch** (`CP-nnnn`) — đơn vị GỬI, thứ tiêu lead chứ
 *  không đẻ ra lead. Quyết định D2 ngày 28/08 chốt tách riêng, không hợp nhất,
 *  vì hai định nghĩa đối lập nhau và gộp thành một bảng thì phá một trong hai.
 *
 *  Tên file soi gương contract (`@pv/contracts` → `sales/campaign-book.ts`),
 *  chứ không soi gương màn — cùng lý do contract đã phải nhận tên đó: `campaign`
 *  đã bị màn Nguồn dẫn chiếm trước.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG CÓ `load` Ở BẤT KỲ QUERY NÀO
 *  ------------------------------------------------------------------
 *  Theo nghi thức của `app/api/client.ts`, vắng `load` nghĩa là query đi HTTP
 *  thật. Sổ này chưa từng có bản fixture nên không có gì để cắt — nó sinh ra
 *  đã đứng trên bảng thật. */

/** `chiến-dịch.xem` · scoped — cùng cửa mà `CampaignController` khai. Trục
 *  phạm vi cắt ở máy chủ (chiến dịch không đứng tên bạn thì không thấy), nên
 *  màn không tự lọc lại: hai nơi lọc là hai kết quả lệch nhau. */
const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'chiến-dịch.xem', scoped: true }

/** Tạo · sửa · thêm/bớt thành viên. Tái dùng `chiến-dịch.sửa` cho cả tạo lẫn
 *  sửa, đúng khuôn `lead.sửa` — quyết định #6 của `ban-giao-campaign.md`. */
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'chiến-dịch.sửa', scoped: true }

/** Bắt đầu và dừng là quyền KHÁC: chúng bắn mail thật. Mọi vai có
 *  `chiến-dịch.sửa` hôm nay cũng có `chiến-dịch.bắn`, nhưng khai đúng quyền là
 *  thứ giữ cho ma trận vai đổi được mà màn không phải đổi theo. */
const FIRE_NEED: ApiNeed = { branch: 'Sales', permission: 'chiến-dịch.bắn', scoped: true }

export const CAMPAIGN_BOOK_KEY = ['sales', 'campaign-book'] as const

/** Bộ lọc của sổ. Rỗng ở đây = KHÔNG gửi tham số đó lên — `undefined` chứ
 *  không phải chuỗi rỗng, vì zod ở máy chủ đọc chuỗi rỗng là một giá trị tìm
 *  kiếm hợp lệ và trả về không dòng nào. */
export type CampaignBookFilter = {
  state: CampaignState | null
  owner: string | null
  q: string
}

export const NO_CAMPAIGN_FILTER: CampaignBookFilter = { state: null, owner: null, q: '' }

/** Nhãn tiếng Việt của bốn trạng thái. MỘT bảng, mọi màn đọc chung — hai bản
 *  chép sẽ lệch nhau ở đúng cái mới thêm. */
export const CAMPAIGN_STATE_LABEL: Record<CampaignState, string> = {
  DRAFT: 'Nháp',
  RUNNING: 'Đang chạy',
  STOPPED: 'Đã dừng',
  DONE: 'Xong',
}

/** Tông `Badge` của bốn trạng thái — cùng bảng màu sổ cơ hội dùng.
 *
 *  `DONE` là `success`, `RUNNING` là `running`: đó là hai chuyện khác nhau và
 *  màu phải nói ra được. Một chiến dịch `RUNNING` còn đợt chưa ngã ngũ, tức
 *  còn thư sẽ đi; `DONE` là mọi đợt đã xong. Đừng đọc `success` ở đây thành
 *  "chiến dịch tốt" — thư có ai mở không là câu của Sổ lô gửi, không phải câu
 *  của một cái nhãn màu. */
export const CAMPAIGN_STATE_TONE: Record<
  CampaignState,
  'draft' | 'running' | 'success' | 'warning'
> = {
  DRAFT: 'draft',
  RUNNING: 'running',
  STOPPED: 'warning',
  DONE: 'success',
}

/** Mặc định của `CampaignBookQuery` như zod ở máy chủ hiểu nó. Trường nào
 *  BẰNG mặc định thì không lên thanh địa chỉ — cùng nghi thức
 *  `opportunityBookQueryToParams`, và cùng lý do: một URL chở `?sort=createdAt
 *  &dir=desc&page=1` cho trạng thái mặc định là một URL không ai chép cho ai. */
export const DEFAULT_CAMPAIGN_BOOK_QUERY: CampaignBookQuery = {
  page: 1,
  size: 20,
  sort: 'createdAt',
  dir: 'desc',
}

const CAMPAIGN_BOOK_QUERY_KEYS = [
  'page',
  'size',
  'sort',
  'dir',
  'state',
  'owner',
  'q',
] as const satisfies readonly (keyof CampaignBookQuery)[]

export function campaignBookQueryToParams(query: CampaignBookQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of CAMPAIGN_BOOK_QUERY_KEYS) {
    const value = query[key]
    if (value === undefined) continue
    if (value === DEFAULT_CAMPAIGN_BOOK_QUERY[key]) continue
    params.set(key, String(value))
  }
  return params
}

/** Địa chỉ → `CampaignBookQuery`, kiểm bằng chính schema của hợp đồng.
 *
 *  KHÔNG BAO GIỜ ném, cùng lý do `parseOpportunityBookQuery` không ném: thanh
 *  địa chỉ sửa tay được, và một màn trắng vì một ký tự thừa tệ hơn mọi cách
 *  hỏng khác. Rơi về mặc định là rơi CẢ câu hỏi chứ không từng trường một. */
export function parseCampaignBookQuery(params: URLSearchParams): CampaignBookQuery {
  const raw: Record<string, string> = {}
  for (const key of CAMPAIGN_BOOK_QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) raw[key] = value
  }
  const parsed = CampaignBookQuery.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_CAMPAIGN_BOOK_QUERY
}

/** Trần `size` của hợp đồng (`PageQuery.size.max(200)`) — con số làm cho
 *  `campaignFacetQuery` bên dưới có hạn sử dụng. */
export const FACET_SIZE = 200

/** CHẮP VÁ, cùng hình và cùng hạn sử dụng với `opportunityFacetQuery` — đọc
 *  docblock ở đó trước khi bắt chước kiểu này.
 *
 *  Hai thứ trên màn cần câu trả lời về CẢ SỔ chứ không về trang đang mở: ba ô
 *  số ở đầu màn, và danh sách chủ trong ô lọc. Đếm trên trang thì mở trang 2
 *  là ba con số đổi, và ô lọc tự giấu mất những người không xuất hiện trên
 *  hai mươi dòng đang xem.
 *
 *  **Gãy khi sổ vượt 200 chiến dịch** — trang đầu vẫn đúng, ba con số lặng lẽ
 *  sai. Cách sửa thật là một endpoint đếm ở SQL (`GET /sales/campaigns/
 *  scorecard`), đúng thứ sổ cơ hội đã có; dựng nó khi sổ này chạm ngưỡng đó,
 *  đừng dựng trước.
 *
 *  `staleTime` một phút: ba con số ở đầu màn không cần đúng tới từng giây, và
 *  mỗi lần đổi bộ lọc mà kéo lại 200 dòng là trả tiền cho một câu hỏi không
 *  đổi. Cửa ghi vẫn dọn nó qua `CAMPAIGN_BOOK_KEY`. */
export const campaignFacetQuery = queryOptions({
  queryKey: [...CAMPAIGN_BOOK_KEY, 'facets'] as const,
  queryFn: ({ signal }) =>
    api.read<CampaignBookResponse>(`/sales/campaigns?size=${FACET_SIZE}`, {
      need: READ_NEED,
      signal,
    }),
  staleTime: 60_000,
})

/** Một trang của sổ.
 *
 *  `queryKey` mang trọn tham số truy vấn, nên đổi bộ lọc là một khoá khác chứ
 *  không phải một lần ghi đè lên cùng khoá — trang cũ nằm lại trong cache và
 *  quay lại bộ lọc trước hiện ra tức thì. Khoá vẫn nối dài
 *  `CAMPAIGN_BOOK_KEY`, nên mọi cửa ghi bên dưới dọn được cả cụm bằng một
 *  dòng. */
export const campaignBookQuery = (query: CampaignBookQuery) =>
  queryOptions({
    queryKey: [...CAMPAIGN_BOOK_KEY, 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<CampaignBookResponse>(`/sales/campaigns?${campaignBookQueryToParams(query)}`, {
        need: READ_NEED,
        signal,
      }),
  })

/** Hồ sơ một chiến dịch, kèm chuỗi đợt đã bắn.
 *
 *  `refetchInterval` bám theo trạng thái ĐỢT, không theo trạng thái chiến
 *  dịch: một chiến dịch `RUNNING` với đợt tiếp theo hẹn sang tuần không được
 *  đánh thức trình duyệt mỗi 5 giây suốt bảy ngày. Cùng lý lẽ với
 *  `leadMailTimelineQuery`. */
export const campaignProfileQuery = (code: string) =>
  queryOptions({
    queryKey: [...CAMPAIGN_BOOK_KEY, 'profile', code] as const,
    queryFn: ({ signal }) =>
      api.read<CampaignProfile>(`/sales/campaigns/${encodeURIComponent(code)}`, {
        need: READ_NEED,
        signal,
      }),
    refetchInterval: (query) =>
      query.state.data?.waves.some((w) => w.run.state === 'SENDING') ? 5_000 : false,
  })

/** Mọi mutation dưới đây dọn CẢ cụm khoá, không dọn đúng một dòng.
 *
 *  Thêm một thành viên đổi `audienceCount` của dòng trong sổ; bắn một đợt đổi
 *  `waveCount` VÀ `state`; dừng đổi `state` và mọi con số của mọi đợt. Tính
 *  xem khoá nào còn đúng sau mỗi lần ghi là ba phép suy luận phải bảo trì, và
 *  sai một phép là màn hiện số cũ mà không ai biết. Sổ này đếm bằng chục dòng,
 *  nên nạp lại cả cụm rẻ hơn nhiều so với một con số sai. */
function useInvalidateBook() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: CAMPAIGN_BOOK_KEY })
}

export function useCampaignCreate() {
  const invalidate = useInvalidateBook()

  return useMutation<CampaignCreateResponse, ApiError, CampaignCreate>({
    mutationFn: (body) =>
      api.write<CampaignCreateResponse>('/sales/campaigns', {
        method: 'POST',
        body,
        need: WRITE_NEED,
      }),
    onSuccess: invalidate,
  })
}

/** Ném ra khi campaign đã tạo xong nhưng bước gom người nhận hoặc bắt đầu chạy
 *  ngay sau đó thất bại — MÀN cần biết mã vừa sinh ra để đưa người dùng vào
 *  đúng hồ sơ thay vì về sổ tay không, chứ không phải bắt họ nhớ tên vừa gõ và
 *  tìm lại trong sổ. `cause` giữ lỗi gốc để `userMessage` vẫn đọc được câu máy
 *  chủ tự viết. */
export class CampaignCreateFullError extends Error {
  constructor(
    readonly code: string,
    readonly cause: unknown,
  ) {
    super(`Chiến dịch ${code} đã tạo nhưng chưa xong hẳn`)
  }
}

/** MỘT LƯỢT BẤM, BA CUỘC GỌI — tạo hồ sơ, gom người nhận, bắt đầu chạy chuỗi
 *  đợt đã soạn. Sống ở tầng dữ liệu, không ở màn (`apps/web/CLAUDE.md`: màn
 *  chỉ gọi `useQuery`/mutation, không tự gọi `api`) — vì `code` của chiến
 *  dịch chỉ có SAU lệnh gọi đầu, nên ba hook `useCampaignCreate` /
 *  `useCampaignMembers` / `useCampaignStart` (mỗi cái đòi `code` ngay lúc
 *  gọi hook) không ghép được thành một chuỗi ở tầng màn.
 *
 *  Hai bước sau là TUỲ CHỌN — bước Người nhận/Luồng sự kiện của stepper có
 *  thể để trống, và một chiến dịch NHÁP không người nhận là trạng thái hợp
 *  lệ. Hỏng ở bước hai hoặc ba KHÔNG lùi bước một: dòng đã nằm trong sổ,
 *  nên lỗi ném ra kèm `code` để màn điều hướng thẳng vào hồ sơ đó thay vì
 *  về sổ với một dòng người dùng không biết đã có. */
export function useCampaignCreateFull() {
  const invalidate = useInvalidateBook()

  return useMutation<
    CampaignCreateResponse,
    ApiError | CampaignCreateFullError,
    CampaignCreate & { leadCodes?: string[]; waves?: CampaignWaveInput[] }
  >({
    mutationFn: async ({ leadCodes, waves, ...body }) => {
      const created = await api.write<CampaignCreateResponse>('/sales/campaigns', {
        method: 'POST',
        body,
        need: WRITE_NEED,
      })

      try {
        if (leadCodes && leadCodes.length > 0) {
          await api.write(`/sales/campaigns/${encodeURIComponent(created.code)}/members`, {
            method: 'POST',
            body: { add: leadCodes },
            need: WRITE_NEED,
          })
        }
        if (waves && waves.length > 0) {
          await api.write(`/sales/campaigns/${encodeURIComponent(created.code)}/start`, {
            method: 'POST',
            body: { waves },
            need: FIRE_NEED,
          })
        }
      } catch (cause) {
        throw new CampaignCreateFullError(created.code, cause)
      }

      return created
    },
    onSettled: invalidate,
  })
}

export function useCampaignPatch(code: string) {
  const invalidate = useInvalidateBook()

  return useMutation<CampaignPatchResponse, ApiError, CampaignPatch>({
    mutationFn: (body) =>
      api.write<CampaignPatchResponse>(`/sales/campaigns/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body,
        need: WRITE_NEED,
      }),
    onSuccess: invalidate,
  })
}

export function useCampaignMembers(code: string) {
  const invalidate = useInvalidateBook()

  return useMutation<CampaignMemberPatchResponse, ApiError, CampaignMemberPatch>({
    mutationFn: (body) =>
      api.write<CampaignMemberPatchResponse>(
        `/sales/campaigns/${encodeURIComponent(code)}/members`,
        { method: 'POST', body, need: WRITE_NEED },
      ),
    onSuccess: invalidate,
  })
}

/** Bắt đầu chạy — mỗi phần tử `waves` là MỘT đợt gửi thật.
 *
 *  Máy chủ nâng trạng thái `RUNNING` TRƯỚC vòng lặp gửi (quyết định #5), nên
 *  một đợt lỗi giữa chừng vẫn để lại chiến dịch ĐANG CHẠY với những đợt đã
 *  vào hàng đợi. Màn phải nạp lại chứ không được tự đặt `RUNNING` theo phản
 *  hồi: `CampaignStartResponse.waves` mới nói được đợt nào thật sự đi. */
export function useCampaignStart(code: string) {
  const invalidate = useInvalidateBook()

  return useMutation<CampaignStartResponse, ApiError, CampaignStart>({
    mutationFn: (body) =>
      api.write<CampaignStartResponse>(`/sales/campaigns/${encodeURIComponent(code)}/start`, {
        method: 'POST',
        body,
        need: FIRE_NEED,
      }),
    onSuccess: invalidate,
  })
}

/** Dừng — huỷ mọi đợt CHƯA GỬI, giữ lại những lá thư còn trong hàng đợi.
 *
 *  Không nhận thân: `/stop` không có gì để chọn. Đợt đã gửi xong thì không
 *  gọi về được, và máy chủ bỏ qua chúng thay vì báo lỗi. */
export function useCampaignStop(code: string) {
  const invalidate = useInvalidateBook()

  return useMutation<CampaignStopResponse, ApiError, void>({
    mutationFn: () =>
      api.write<CampaignStopResponse>(`/sales/campaigns/${encodeURIComponent(code)}/stop`, {
        method: 'POST',
        body: {},
        need: FIRE_NEED,
      }),
    onSuccess: invalidate,
  })
}
