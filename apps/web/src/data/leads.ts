import { queryOptions } from '@tanstack/react-query'
import { keepPageUnderSameFilters } from '@/app/book-query'
import {
  ArrowRight,
  CalendarClock,
  CircleDashed,
  ClipboardList,
  Handshake,
  Inbox,
  Megaphone,
  MessageSquare,
  PenLine,
  Phone,
  TriangleAlert,
  UserPlus,
  Users,
  type IconGlyph,
} from '@pv/ui'
import {
  canPromoteToSql,
  DAS_VINA_LEAD,
  isOverSla,
  isRunning,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  leadContact,
  type FrozenLead,
  type Lead,
  type LeadContact,
  type OriginKind,
  type StageKey,
} from '@pv/engines/fixtures/das-vina'
import type { Actor } from '@pv/engines'
import { LeadFacetsQuery, LeadScorecard, LeadStopReasonResponse } from '@pv/contracts'
import type {
  LeadBookQuery,
  LeadBookResponse,
  LeadFacets,
  LeadIndustryOptionsResponse,
  LeadRow,
} from '@pv/contracts'
import { api } from '@/app/api'
import { message, translate, type Message } from '@/app/i18n'
import { cacheTier } from '@/app/query-client'
import { DEFAULT_LEAD_BOOK_QUERY, leadBookQueryToParams } from '@/app/url'
import { APPROVER_ROLE_LABEL } from '@/data/directory'

/** Sổ lead — module 2.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CẮT SANG MÁY CHỦ — VÀ MỘT NỬA SỔ CŨ CÒN Ở LẠI
 *  ------------------------------------------------------------------
 *  `leadBookQuery` gọi thẳng `GET /sales/leads`: lọc, sắp và phân trang đều
 *  làm ở máy chủ. Nó nhận THAM SỐ, vì một sổ đã phân trang ở máy chủ không
 *  còn là một giá trị mà là một hàm của bộ lọc — và `queryKey` phải chở đúng
 *  tham số đó, nếu không TanStack trả cache của bộ lọc trước cho bộ lọc sau.
 *
 *  `frozenLeadBookQuery` phía dưới vẫn là fixture, và đó KHÔNG phải chỗ quên:
 *  bốn màn khác (`lead-detail`, `opportunity-detail`, `campaigns`, `campaign-detail`)
 *  đọc cả sổ để tra chéo và để chống trùng lúc nạp tệp, còn
 *  `GET /sales/leads/:code` thì chưa dựng. Cắt chúng cùng một đợt là làm vỡ
 *  bốn màn cho một endpoint chưa tồn tại.
 *
 *  Ba thứ dưới query cũng ở đây chứ không ở tầng màn, vì cả bảng lẫn màn chi
 *  tiết đều cần và hai bản chép tay sẽ lệch nhau:
 *   · `nextActions` — việc nên làm tiếp trên một lead;
 *   · `myWork`      — việc của người đang đăng nhập, xếp theo cột kanban;
 *   · `assigneeOptions` — ai nên nhận việc trên đúng lead này.
 *
 *  Nguồn của lead (chiến dịch, sự kiện) nằm ở `data/campaigns.ts` — module 1 và
 *  module 2 đọc hai query khác nhau trên cùng một kịch bản. */

/** Dòng mồi: lead của chính DAS Vina, nối thẳng sang OP-0288 trong sổ cơ hội. */
export const ANCHOR_CODE = DAS_VINA_LEAD

/** What the route asks for, in the SAME words `apps/api` uses on the other end
 *  (`@Need({ branch: 'Sales', permission: 'lead.view', scoped: true })` on
 *  `LeadController.book`).
 *
 *  `scoped: true` is the axis this query used to be missing. The three Sale
 *  actors are `ownOnly`, so the server cuts their book down to the rows they
 *  hold and reports the size of the cut in `hidden`; a query that declares only
 *  branch and permission reads as if the whole book were coming back. Both
 *  reads of one permission matrix have to say the same sentence — see `ApiNeed`
 *  in `app/api/client.ts`. */
const BOOK_NEED = { branch: 'Sales', permission: 'lead.view', scoped: true } as const

/** Sổ, một trang một lần. `{ rows, total, hidden }` — hình của `paged()`.
 *
 *  `hidden` đi tới đây và DỪNG ở đây: nó là số dòng phạm vi đã cắt đi, luật 7
 *  đòi màn hiện nó, và chủ dự án đã chốt đợt này không đổi một pixel nào. Con
 *  số có mặt trong `data.hidden` để ngày đổi ý chỉ còn là việc vẽ nó ra — chứ
 *  không phải một chuyến đi lại xuống tận repository.
 *
 *  `signal` nối vào `AbortSignal` của TanStack: gõ nhanh trên ô tìm thì trang
 *  đang bay bị huỷ thay vì về sau và ghi đè trang mới. */
export const leadBookQuery = (query: LeadBookQuery) =>
  queryOptions({
    placeholderData: keepPageUnderSameFilters(query),
    queryKey: ['sales', 'lead-book', 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<LeadBookResponse>(`/sales/leads?${leadBookQueryToParams(query)}`, {
        need: BOOK_NEED,
        signal,
      }),
  })

/** Thẻ điểm cả kỳ — bốn con số ĐẾM, `GET /sales/leads/scorecard`.
 *
 *  ------------------------------------------------------------------
 *  ĐÂY LÀ THỨ THAY HAI HẰNG SỐ FIXTURE, VÀ NÓ TRẢ MỘT MÓN NỢ CÓ TÊN
 *  ------------------------------------------------------------------
 *  `ScoreCards` trong `pages/leads.tsx` từng đọc thẳng `FUNNEL` và
 *  `FIRST_MEETINGS` từ `@pv/engines/fixtures/das-vina`, không qua một
 *  `useQuery` nào — nên bảng nói 122 dòng trong khi thẻ điểm đứng nguyên
 *  `100 · 38% · 30% · 6%` — món nợ "thẻ điểm đọc fixture", đã trả ngày 29/08.
 *
 *  Món nợ ấy treo được lâu vì `FIRST_MEETINGS` của fixture đếm bằng một điều
 *  kiện KHÔNG suy ra được từ dữ liệu thật (đã lên MQL và có kênh gọi lại).
 *  `sales.meeting` là thứ làm nó suy ra được: một lead "đã gặp lần đầu" khi nó
 *  có ít nhất một buổi họp được ghi. Định nghĩa mới đúng bằng thứ ngôi sao
 *  trên màn chi tiết đang hiện, nên con số trên thẻ và ngôi sao trên dòng
 *  không bao giờ cãi nhau được.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG `scoped`, VÀ ĐÓ LÀ CHỦ Ý
 *  ------------------------------------------------------------------
 *  Chép đúng `@Need` của `LeadController.scorecard`, cửa duy nhất của sổ lead
 *  không bật trục phạm vi: thẻ điểm là điểm của cả phòng. Cắt nó theo lead ai
 *  đang giữ thì mỗi người mở màn thấy một con số khác nhau dưới cùng một dòng
 *  chữ "Thẻ điểm 10/08 → 28/08".
 *
 *  Aggregate tier (one minute): the four figures of the whole period do not
 *  change between two clicks, and this screen remounts on every return from
 *  a lead profile. */
export const leadScorecardQuery = queryOptions({
  queryKey: ['sales', 'lead-scorecard'] as const,
  queryFn: ({ signal }) =>
    api.read<LeadScorecard>('/sales/leads/scorecard', {
      need: { branch: 'Sales', permission: 'lead.view' },
      schema: LeadScorecard,
      signal,
    }),
  ...cacheTier.aggregate,
})

/** The `EXIT_REASON` catalogue, for anyone who stops a lead or reads its
 *  history but holds no `config.view` — `GET /sales/lead-stop-reasons`.
 *
 *  A separate door from `salesCatalogQuery` (`data/sales-config.ts`) on
 *  purpose: that one needs `config.view`, which an ordinary Sale does not
 *  hold, and a stop dialog gated behind the config screen's own permission
 *  would refuse the very people who stop leads all day. Inactive rows stay,
 *  so an old stop still prints its label rather than a bare id.
 *
 *  `stopReasonLabel` (`data/sales-config.ts`) reads `rows` from either this
 *  query or `salesCatalogQuery`'s `EXIT_REASON` — same two fields, one
 *  function, two doors for two audiences. */
export const leadStopReasonsQuery = queryOptions({
  queryKey: ['sales', 'lead-stop-reasons'] as const,
  /* No explicit `<T>` — `@pv/contracts` has no `export type` twin for this
     const yet (sharedRequests), so `T` is inferred from `schema` instead. */
  queryFn: ({ signal }) =>
    api.read('/sales/lead-stop-reasons', {
      need: { branch: 'Sales', permission: 'lead.view' },
      schema: LeadStopReasonResponse,
      signal,
    }),
  ...cacheTier.reference,
})

/** Trần `size` của hợp đồng (`PageQuery.size.max(200)`). Đây là con số làm cho
 *  `leadFacetQuery` bên dưới có hạn sử dụng, nên nó phải đọc được thành số
 *  chứ không nấp trong một chuỗi. */
export const FACET_SIZE = 200

/** Up to a screenful of leads matching `q` (company or code), for pickers
 *  that look people up by typing rather than hold the whole book. */
export const SEARCH_SIZE = 20
export const leadSearchQuery = (text: string) =>
  queryOptions({
    queryKey: ['sales', 'lead-book', 'search', text] as const,
    queryFn: ({ signal }) =>
      api.read<LeadBookResponse>(
        `/sales/leads?state=all&size=${SEARCH_SIZE}&q=${encodeURIComponent(text)}`,
        { need: BOOK_NEED, signal },
      ),
  })

/** The leads with exactly these codes, inside the caller's scope. Mail and the
 *  ticked rows read them here instead of pulling the whole book. */
export const leadsByCodesQuery = (codes: readonly string[]) =>
  queryOptions({
    queryKey: ['sales', 'lead-book', 'by-codes', [...codes].sort()] as const,
    queryFn: ({ signal }) =>
      api.read<LeadBookResponse>(
        `/sales/leads?state=all&size=${FACET_SIZE}&codes=${codes.slice(0, FACET_SIZE).join(',')}`,
        { need: BOOK_NEED, signal },
      ),
  })

/** `GET /sales/leads/facets` — the state tabs' counts (`byState`) under the
 *  book's other filters, plus the no-campaign half of the Nguồn select
 *  (`sourceKinds`, which ignores them). Read `LeadFacets` before reusing it.
 *
 *  Takes the whole book query and lets the contract strip what facets do not
 *  take (`state`, paging, sort), so the key only moves when a count could. */
export const leadFacetsQuery = (query: LeadBookQuery) => {
  const filters = LeadFacetsQuery.parse(query)
  return queryOptions({
    queryKey: ['sales', 'lead-book', 'counts', filters] as const,
    queryFn: ({ signal }) =>
      api.read<LeadFacets>(
        `/sales/leads/facets?${leadBookQueryToParams({ ...DEFAULT_LEAD_BOOK_QUERY, ...filters })}`,
        { need: BOOK_NEED, signal },
      ),
  })
}

/* `frozenLeadBookQuery` XOÁ 31/08 cùng `loadFrozenBook`. Nó là sổ fixture 100
   dòng mà hai màn Nguồn dẫn đọc để chống trùng và cấp mã cho lô nạp; cả hai
   việc đó nay do máy chủ làm (`data/lead-import.ts` · `POST /sales/leads/import`),
   nên nó hết chỗ gọi cuối cùng. Docblock cũ của nó chờ `GET /sales/leads/:code`
   — cửa đó đã lên từ trước, không ai quay lại gỡ.

   `myWork` bên dưới vẫn nhận `FrozenLead[]` và vẫn không có màn nào gọi. Ngày
   dựng lại màn việc, nó đọc `leadBookQuery` — sổ thật, phân trang ở máy chủ —
   chứ không phải một sổ đóng băng khác. */

// ---------------------------------------------------------------------------
// Xuất xứ — bốn kiểu, bốn cách nói và bốn hình
// ---------------------------------------------------------------------------

/** Hình và chữ của bốn kiểu xuất xứ. Bảng nằm ở tầng app vì "sự kiện trông như
 *  thế nào" là cách trình bày của phòng kinh doanh, không phải kiến thức của
 *  fixture (biên giới package · CLAUDE.md). */
export const ORIGIN_FACE: Record<
  OriginKind,
  { label: Message; icon: IconGlyph; openLabel: Message }
> = {
  campaign: {
    label: message('Chiến dịch', 'Campaign', '캠페인'),
    icon: Megaphone,
    openLabel: message('Xem chiến dịch', 'View campaign', '캠페인 보기'),
  },
  event: {
    label: message('Sự kiện', 'Event', '이벤트'),
    icon: CalendarClock,
    openLabel: message('Xem sự kiện', 'View event', '이벤트 보기'),
  },
  /* Nhãn KIỂU phải khác tên NGUỒN: nguồn GT tên sẵn là "Khách cũ giới thiệu",
     nên nhãn kiểu trùng chữ sẽ in ra hai lần cùng một câu trên một thẻ. */
  referral: {
    label: message('Được giới thiệu', 'Referred', '소개받음'),
    icon: Handshake,
    openLabel: message('Xem nguồn', 'View source', '유입 경로 보기'),
  },
  'self-sourced': {
    label: message('Tạo trực tiếp', 'Created directly', '직접 생성'),
    icon: PenLine,
    openLabel: message('Xem nguồn', 'View source', '유입 경로 보기'),
  },
}

/* `SOURCE_KIND_FACE` (khoá theo `kind` của một dòng SỔ NGUỒN, `GET
   /sales/config`) đã XOÁ 27/08 lần 2: bảng chỉ tồn tại để cấp `icon` cho pill
   cột Nguồn ở `leads.tsx`, chủ dự án yêu cầu bỏ icon khỏi pill đó (tên chữ đã
   là tín hiệu chính), và sau khi bỏ thì không còn chỗ nào đọc bảng này nữa.

   Tone vàng của pill từng so `entry.kind === 'mua-du-lieu'` — một câu KHÔNG
   BAO GIỜ đúng: `kind` của một dòng sổ nguồn chỉ nhận `campaign · event ·
   organic`, nên nhánh đó là code chết kể từ lúc viết. Nay nó so
   `source.kind === 'APOLLO'`, một giá trị có thật của `LeadSourceKind` và
   đúng câu hỏi định hỏi từ đầu: dòng này có phải dữ liệu MUA không. */

/** Lead không thuộc chiến dịch nào.
 *
 *  KHÔNG phải "tra không ra" — đây là một câu trả lời đầy đủ. Lead gõ tay và
 *  lead khách tự bấm gửi từ landing page đều không có chiến dịch, và bịa cho
 *  chúng một cái là dựng một chiến dịch không có trong sổ.
 *
 *  CHỈ hình, không chữ: chữ nằm ở `CAMPAIGN_NONE` trong `@pv/contracts`, cùng
 *  chỗ với `campaignLabel` đang chọn giữa ba trạng thái. Để nhãn ở cả hai nơi
 *  là dựng đúng cái bản-thứ-hai-của-một-quyết-định mà file này đã ghi nợ trước
 *  đây (`SOURCE_KIND_FACE`).
 *
 *  `EXIT_REASON_LABEL` carried the same debt and is gone: `exitReason` became
 *  a config id (ADR 0070), and `stopReasonLabel` (`data/sales-config.ts`)
 *  resolves it now, from either stop-reason source.
 *
 *  Bản trước tên là `UNKNOWN_SOURCE_FACE` và nói "Không có trong sổ nguồn", vì
 *  hồi đó nó thật sự là một lỗi tra cứu: màn cầm một mã trần rồi tự đi tìm tên
 *  trong `GET /sales/config`, và tra trượt thì chỉ biết là trượt. Máy chủ nay
 *  gửi thẳng `campaignName` cạnh `campaignId`, nên phép tra ấy không còn, và
 *  cùng với nó là cả một lớp lỗi: không còn chỗ nào để trượt. */
export const NO_CAMPAIGN_ICON = CircleDashed

/** Câu giải thích ô PIC trống — MỘT bản, dùng ở cả sổ lẫn hồ sơ.
 *
 *  `owner_id` để trống là DỮ LIỆU, không phải lỗi tải: cột nullable, và 100
 *  dòng seed có 33 dòng cố ý không ai giữ. Nhưng "—" trơ trọi thì đọc giống
 *  hệt một ô hỏng, nên chỗ nào in nó cũng phải nói được VÌ SAO.
 *
 *  Nằm ở đây chứ không khai lại ở mỗi màn vì đó chính là cách hai màn của cùng
 *  một dòng dữ liệu bắt đầu nói hai câu khác nhau về cùng một trạng thái — sổ
 *  bảo "chưa ai nhận", hồ sơ bảo "không có", và người đọc phải tự đoán hai câu
 *  đó có cùng nghĩa không. */
export const NO_OWNER_COPY = message(
  'Còn ở kho chung, chưa ai nhận',
  'Unassigned in the shared pool',
  '공용 목록에서 배정 대기 중',
)

/** The creator column's empty title; leads older than the column carry none. */
export const NO_CREATOR_COPY = message(
  'Chưa ghi nhận người tạo',
  'Creator not recorded',
  '생성자 기록 없음',
)

// ---------------------------------------------------------------------------
// Next action — việc nên làm tiếp trên một lead
// ---------------------------------------------------------------------------

export type NextActionKey =
  | 'claim-lead'
  | 'fill-slots'
  | 'propose-sql'
  | 'chase-signature'
  | 'advance-stage'
  | 'flag-blocked'
  | 'call-customer'
  | 'send-message'
  | 'assign-owner'
  | 'open-source-record'

export type NextAction = {
  key: NextActionKey
  label: string
  icon: IconGlyph
  /** Việc đáng làm nhất đứng đầu và là nút đặc; phần còn lại là nút mờ. */
  primary: boolean
  /** Vì sao đề xuất việc này — hiện ngay dưới nút, không giấu trong code. */
  why: string
}

/** A lead that left the flow offers two doors only: look at where it came from, or hand it on. */
function leftFlowActions(exitReason: string): NextAction[] {
  return [
    {
      key: 'open-source-record',
      label: translate(message('Xem nguồn kéo về', 'View the source', '유입 경로 보기')),
      icon: Megaphone,
      primary: true,
      why: translate(
        message(
          `Lead đã ra khỏi luồng · ${exitReason}.`,
          `The lead left the flow · ${exitReason}.`,
          `리드가 프로세스에서 제외됨 · ${exitReason}.`,
        ),
      ),
    },
    {
      key: 'assign-owner',
      label: translate(message('Giao việc', 'Assign', '업무 배정')),
      icon: Users,
      primary: false,
      why: translate(
        message(
          'Nhờ người khác xác minh lại trước khi đóng hẳn.',
          'Ask someone else to verify before closing for good.',
          '완전히 종료하기 전에 다른 사람에게 다시 확인을 요청하세요.',
        ),
      ),
    },
  ]
}

/** Việc nên làm tiếp, xếp từ gấp nhất.
 *
 *  Đây là hàm THUẦN trên một dòng lead: cùng một lead luôn ra cùng một danh
 *  sách, ở bảng cũng như ở màn chi tiết. Không có "gợi ý AI" nào ở đây — mọi
 *  dòng đều suy thẳng từ trạng thái của lead, nên không dòng nào cần nút xác
 *  nhận theo luật 9.
 *
 *  ------------------------------------------------------------------
 *  `contact` LÀ THAM SỐ RIÊNG, KHÔNG TỰ SUY TỪ `lead` — VÌ SAO
 *  ------------------------------------------------------------------
 *  Bản trước gọi thẳng `leadContact(lead)` bên trong hàm này — hàm SINH của
 *  fixture, nặn tên và số điện thoại từ `seedOf(lead.code)`. Với 100 mã đóng
 *  băng, giá trị sinh ra trùng seed nên không lộ; với một mã THẬT ngoài dải đó
 *  (ví dụ 19 dòng Apollo `LD-0201…LD-0219` trên Neon) nó nặn ra một con người
 *  không tồn tại, rồi nút "Gọi …" mời người dùng gọi một số điện thoại do thuật
 *  toán nghĩ ra.
 *
 *  Bắt tham số này ở CHỮ KÝ hàm — không cho mặc định về `leadContact(lead)` —
 *  để mỗi nơi gọi phải tự khai rõ nguồn: `myWork` (kịch bản đóng băng, sổ
 *  `LEADS` không bao giờ chứa mã ngoài `LD-0101…LD-0200`) khai thẳng
 *  `leadContact(lead)`; màn hồ sơ thật (`lead-detail.tsx`) khai
 *  `realContact(profile)` ở `data/lead-profile.ts`, đọc `contactName` /
 *  `phone` / `contactChannel` CÓ THẬT trên dây. Không có `phone` thì `contact`
 *  không có `phone` — nút "Gọi" không xuất hiện, chứ không rơi về một số bịa. */
export function nextActions(lead: Lead, contact: LeadContact | null): NextAction[] {
  const out: NextAction[] = []
  const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
  const gate = canPromoteToSql(lead)

  if (lead.exitReason) return leftFlowActions(lead.exitReason)

  if (!lead.owner) {
    out.push({
      key: 'claim-lead',
      label: translate(message('Nhận lead về mình', 'Claim this lead', '리드 직접 받기')),
      icon: UserPlus,
      primary: true,
      why: translate(
        message(
          'Lead còn ở kho chung, chưa ai nhận.',
          'The lead is still in the shared pool.',
          '리드가 아직 공용 목록에 있습니다.',
        ),
      ),
    })
  }

  if (missing > 0) {
    out.push({
      key: 'fill-slots',
      label: translate(
        message(
          `Lấy ${missing} ô còn thiếu`,
          `Get the ${missing} missing ${missing === 1 ? 'field' : 'fields'}`,
          `누락된 항목 ${missing}개 채우기`,
        ),
      ),
      icon: ClipboardList,
      primary: out.length === 0,
      why: translate(
        message(
          `Cần đủ ${REQUIRED_SLOTS} ô bắt buộc.`,
          `All ${REQUIRED_SLOTS} required fields are needed.`,
          `필수 항목 ${REQUIRED_SLOTS}개를 모두 채워야 합니다.`,
        ),
      ),
    })
  }

  if (gate.ok) {
    out.push({
      key: 'propose-sql',
      label: translate(
        message('Đề nghị nhận vào pipeline', 'Propose moving to pipeline', '파이프라인 편입 제안'),
      ),
      icon: ArrowRight,
      primary: out.length === 0,
      why: translate(
        message(
          `Đủ ${REQUIRED_SLOTS} ô bắt buộc. ${APPROVER_ROLE_LABEL.vi} là người duyệt.`,
          `All ${REQUIRED_SLOTS} required fields are filled. The ${APPROVER_ROLE_LABEL.en} approves.`,
          `필수 항목 ${REQUIRED_SLOTS}개가 모두 채워졌습니다. ${APPROVER_ROLE_LABEL.ko}이(가) 승인합니다.`,
        ),
      ),
    })
  }

  if (isOverSla(lead)) {
    const limit = PIPELINE_STAGES.find((s) => s.key === lead.stage)
    out.push({
      key: 'flag-blocked',
      label: translate(message('Báo tắc', 'Flag as stuck', '정체 보고')),
      icon: TriangleAlert,
      primary: out.length === 0,
      why: translate(
        message(
          `Nằm cột "${limit?.label ?? lead.stage}" ${lead.daysHere} ngày, quá hạn ${limit?.limitDays ?? '?'} ngày của cột.`,
          `In stage "${limit?.label ?? lead.stage}" for ${lead.daysHere} days, over the stage limit of ${limit?.limitDays ?? '?'} days.`,
          `"${limit?.label ?? lead.stage}" 단계에 ${lead.daysHere}일째 머물러 단계 기한 ${limit?.limitDays ?? '?'}일을 넘겼습니다.`,
        ),
      ),
    })
  } else if (lead.stage === 'quotation') {
    out.push({
      key: 'chase-signature',
      label: translate(message('Nhắc ký', 'Remind to sign', '서명 요청')),
      icon: PenLine,
      primary: out.length === 0,
      why: translate(
        message(
          'Đơn đang ở cột cuối, còn thiếu chữ ký.',
          'The deal is in the last stage and still needs a signature.',
          '마지막 단계에 있으며 서명이 아직 없습니다.',
        ),
      ),
    })
  } else if (lead.stage) {
    out.push({
      key: 'advance-stage',
      label: translate(message('Đề nghị sang cột kế', 'Propose next stage', '다음 단계 이동 제안')),
      icon: ArrowRight,
      primary: out.length === 0,
      why: translate(
        message(
          'Đơn còn trong hạn của cột.',
          'The deal is within the stage limit.',
          '단계 기한 내에 있습니다.',
        ),
      ),
    })
  }

  out.push({
    key: contact?.phone ? 'call-customer' : 'send-message',
    label: contact?.phone
      ? translate(
          message(`Gọi ${contact.name}`, `Call ${contact.name}`, `${contact.name}에게 전화`),
        )
      : translate(
          message(
            'Nhắn trên kênh khách vừa dùng',
            'Message on the channel the customer last used',
            '고객이 마지막으로 사용한 채널로 메시지 보내기',
          ),
        ),
    icon: contact?.phone ? Phone : MessageSquare,
    primary: false,
    /* `contact.title` có thể trống trên dữ liệu thật (ô 4 chưa moi hết) — nối
       thẳng vào `` `${contact.title} · ${contact.phone}` `` sẽ in ra một dấu
       chấm mồ côi ("· 0912…"). Bản sinh cũ luôn có title nên chưa từng lộ. */
    why: contact?.phone
      ? contact.title
        ? `${contact.title} · ${contact.phone}`
        : contact.phone
      : translate(
          message('Chưa có số điện thoại.', 'No phone number yet.', '전화번호가 없습니다.'),
        ),
  })

  out.push({
    key: 'assign-owner',
    label: translate(message('Giao việc', 'Assign', '업무 배정')),
    icon: Users,
    primary: false,
    why: translate(
      message(
        'Giao cho người khác cùng làm.',
        'Hand it to someone else to work on together.',
        '다른 사람과 함께 처리하도록 배정합니다.',
      ),
    ),
  })

  return out
}

// ---------------------------------------------------------------------------
// Việc của tôi — cùng một sổ, nhìn từ phía người đang đăng nhập
// ---------------------------------------------------------------------------

/** Cột của bảng việc. Năm cột của sổ cơ hội, cộng một cột cho lead chưa qua
 *  cổng — nó CHƯA có cột nào để đứng, và đó chính là việc phải làm. */
export type WorkColumn = StageKey | 'unstaged'

export const workColumns = (): { key: WorkColumn; label: string; limitDays?: number }[] => [
  {
    key: 'unstaged',
    label: translate(message('Chưa vào sổ cơ hội', 'Not yet an opportunity', '아직 기회에 없음')),
  },
  ...PIPELINE_STAGES.map((s) => ({
    key: s.key as WorkColumn,
    label: s.label,
    limitDays: s.limitDays,
  })),
]

export type WorkItem = {
  lead: Lead
  column: WorkColumn
  /** Vì sao dòng này là việc của tôi. Không có câu này thì bảng việc là một
   *  danh sách lead ngẫu nhiên. */
  reason: string
  action: NextAction
  /** Vừa được giao trong phiên này — đây là thứ "việc mới" của bảng. */
  fresh: boolean
  overSla: boolean
}

/** Luật chia việc theo vai. Viết ra ở đây vì nó là LUẬT, không phải một bộ lọc
 *  tiện tay: mỗi vai chỉ nhìn thấy phần sổ mà vai đó làm được gì với nó.
 *
 *   · ai cũng có   — lead vừa được giao cho mình (đề nghị đang treo);
 *   · Sale         — lead mình đang giữ và còn trong luồng;
 *   · BD           — lead mình giữ mà còn thiếu ô bắt buộc;
 *   · Marketing    — lead mình giữ ở bậc đầu mối, đang nuôi;
 *   · Presales     — đơn đang ở hai cột có demo; sổ không ghi "ai đi cùng demo"
 *                    nên đây là cả nhóm chứ không phải một người (docs · module Performance);
 *   · TP Kinh doanh— thứ CHỜ MÌNH GẬT: lead đủ ô chờ vào pipeline, đơn quá hạn,
 *                    lead còn nằm kho chung. Vai này không giữ khách nào. */
export function myWork(input: {
  actor: Actor | null
  /* `FrozenLead`, không phải `Lead`: đoạn dưới gọi `leadContact()` — hàm SINH
     của fixture — và nhãn kiểu là thứ giữ cho lời hứa "sổ này đóng băng" ở
     ngay dưới đây không lặng lẽ hết đúng ngày ai đó đổi query. */
  leads: FrozenLead[]
}): WorkItem[] {
  const { actor, leads } = input
  if (!actor) return []

  const seen = new Set<string>()
  const out: WorkItem[] = []
  const push = (lead: FrozenLead, reason: string, fresh = false) => {
    if (seen.has(lead.code)) return
    seen.add(lead.code)
    /* `myWork` chưa cắt sang máy chủ — nó chạy trên sổ ĐÓNG BĂNG
       (`frozenLeadBookQuery`/`LEADS`), thứ không bao giờ chứa một mã ngoài dải
       `LD-0101…LD-0200`. `leadContact(lead)` ở đây vẫn đúng kịch bản: nó chỉ
       từng thấy mã đã đóng băng, chưa từng thấy một mã Apollo thật. */
    const action = nextActions(lead, leadContact(lead))[0]
    if (!action) return
    out.push({
      lead,
      column: lead.stage ?? 'unstaged',
      reason,
      action,
      fresh,
      overSla: isOverSla(lead),
    })
  }

  /* Nhánh "việc vừa được giao" ĐÃ BỎ cùng `assigns` (29/08). Nó đọc kho đề
     nghị trong trình duyệt, thứ không ai khác thấy — nên một người mở máy của
     mình lên không bao giờ có dòng nào ở đây, kể cả khi vừa được giao thật.
     Giao lead nay đổi thẳng `owner_id`, và lead mới nhận rơi vào đúng nhánh
     "lead mình đang giữ" ngay bên dưới, ở mọi máy. */

  const running = leads.filter(isRunning)
  const mine = running.filter((l) => l.owner === actor.name)

  /* Bốn nhánh dưới đây so bằng `roleIds`, KHÔNG bằng `name` hay nhãn `role`.
     Bản trước so `actor.name === HEAD_OF_SALES` — một cái tên có thật trong
     fixture và không có thật trong bảng người dùng, nên với tài khoản thật thì
     bốn nhánh này im lặng không chạy nhánh nào. `roleIds` là khoá của ma trận
     quyền, thứ duy nhất ở đây không đổi khi người ta đổi tên hay đổi nhãn vai
     (`Actor.role` mang cả ngành: "Sale · chip"). */
  if (actor.roleIds.includes('sale')) {
    for (const lead of mine) {
      push(
        lead,
        lead.stage
          ? translate(
              message(
                `Bạn đang giữ · nằm cột này ${lead.daysHere} ngày`,
                `You hold it · in this stage for ${lead.daysHere} days`,
                `담당 중 · 이 단계에 ${lead.daysHere}일째`,
              ),
            )
          : translate(
              message(
                'Bạn đang giữ · chưa vào sổ cơ hội',
                'You hold it · not yet an opportunity',
                '담당 중 · 아직 기회에 없음',
              ),
            ),
      )
    }
  }

  if (actor.roleIds.includes('bd')) {
    for (const lead of mine) {
      const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
      push(
        lead,
        missing > 0
          ? translate(
              message(
                `Còn thiếu ${missing} ô bắt buộc`,
                `${missing} required ${missing === 1 ? 'field' : 'fields'} missing`,
                `필수 항목 ${missing}개 누락`,
              ),
            )
          : translate(
              message(
                'Đủ ô bắt buộc · chờ đẩy sang Sale',
                'Required fields filled · waiting to move to Sales',
                '필수 항목 입력 완료 · 영업팀 전달 대기',
              ),
            ),
      )
    }
  }

  if (actor.roleIds.includes('marketing')) {
    for (const lead of mine) {
      const reason = message(
        `Đang nuôi ở bậc đầu mối · ${lead.daysHere} ngày`,
        `Nurtured at the prospect tier · ${lead.daysHere} days`,
        `잠재 등급에서 육성 중 · ${lead.daysHere}일`,
      )
      push(lead, translate(reason))
    }
  }

  if (actor.roleIds.includes('presales')) {
    for (const lead of running) {
      if (lead.stage === 'assigned' || lead.stage === 'engaged') {
        const owner = lead.owner
        const reason = message(
          `Đơn ở cột có demo · chủ đơn ${owner ?? 'chưa ai'}`,
          `Deal in a demo stage · owner ${owner ?? 'none'}`,
          `데모 단계의 딜 · 담당자 ${owner ?? '없음'}`,
        )
        push(lead, translate(reason))
      }
    }
  }

  if (actor.roleIds.includes('head-of-sales')) {
    for (const lead of running) {
      if (canPromoteToSql(lead).ok) {
        const reason = message(
          'Đủ ô bắt buộc · chờ bạn duyệt vào pipeline',
          'Required fields filled · waiting for your approval into the pipeline',
          '필수 항목 입력 완료 · 파이프라인 편입 승인 대기',
        )
        push(lead, translate(reason))
      }
    }
    for (const lead of running) {
      if (isOverSla(lead)) {
        const reason = message(
          `Quá hạn cột · ${lead.daysHere} ngày`,
          `Over the stage limit · ${lead.daysHere} days`,
          `단계 기한 초과 · ${lead.daysHere}일`,
        )
        push(lead, translate(reason))
      }
    }
    for (const lead of running) {
      if (!lead.owner) {
        const reason = message(
          'Còn ở kho chung · chưa ai nhận',
          'In the shared pool · unassigned',
          '공용 목록 · 배정 대기 중',
        )
        push(lead, translate(reason))
      }
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Giao việc — ai nên nhận
// ---------------------------------------------------------------------------

export type AssigneeOption = {
  id: string
  name: string
  role: string
  /** Ngành người này phụ trách. Rỗng = làm được mọi ngành. */
  domains: string[]
  /** Vì sao được gợi ý cho ĐÚNG lead này. */
  why: string
  /** 'mine' luôn đứng đầu; 'suggested' là người hợp việc; 'rest' là phần còn lại. */
  group: 'mine' | 'suggested' | 'rest'
}

/** Danh sách người nên giao, xếp theo mức hợp việc với ĐÚNG lead này.
 *
 *  Thứ tự không phải bảng chữ cái mà là thứ tự người dùng cần: mình trước, rồi
 *  người có ngành khớp, rồi vai đang nắm phần việc lead đang thiếu, rồi phần
 *  còn lại. Danh sách đầy đủ vẫn giữ — gợi ý sai thì người dùng vẫn phải chọn
 *  được người mình muốn. */
/** The only 3 fields `assigneeOptions` reads — `LeadRow` (book row) and `Lead`
 *  (the detail page's fixture bridge) both carry them, so callers no longer
 *  need to build a full `Lead` object just to rank assignees. */
export type AssigneeCandidateLead = Pick<LeadRow, 'category' | 'tier' | 'requiredFilled'>

/** `categories` carry each category's Sale (`ownerId`), from `leadIndustryOptionsQuery`. */
export function assigneeOptions(
  lead: AssigneeCandidateLead,
  actors: readonly Actor[],
  meId: string | undefined,
  categories: LeadIndustryOptionsResponse['categories'],
): AssigneeOption[] {
  const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
  const owner = categories.find((c) => c.id === lead.category?.id)?.ownerId ?? undefined
  const domainsOf = (id: string) =>
    categories.filter((c) => c.active && c.ownerId === id).map((c) => c.name)

  const scored = actors
    .filter((a) => a.branches.includes('Sales'))
    .map((a) => {
      const domains = domainsOf(a.id)
      let rank = 90
      let why = translate(message('Trong phòng kinh doanh', 'In the sales team', '영업팀 소속'))

      if (a.id === meId) {
        rank = 0
        why = translate(message('Bạn tự nhận', 'You take it', '직접 받기'))
      } else if (a.id === owner) {
        rank = 10
        const names = domains.join(' · ')
        why = translate(
          message(
            `Sale phụ trách ngành ${names}`,
            `Salesperson in charge for ${names}`,
            `${names} 담당 영업`,
          ),
        )
      } else if (a.roleIds.includes('bd') && missing > 0) {
        rank = 20
        why = translate(
          message(
            `Còn ${missing} ô bắt buộc, việc của BD`,
            `${missing} required ${missing === 1 ? 'field' : 'fields'} left, a BD task`,
            `필수 항목 ${missing}개 남음, BD 업무`,
          ),
        )
      } else if (a.roleIds.includes('marketing') && lead.tier === 'prospect') {
        rank = 40
        why = translate(
          message(
            'Lead còn ở bậc đầu mối, Marketing nuôi tiếp',
            'The lead is still at the prospect tier; Marketing keeps nurturing',
            '리드가 아직 잠재 등급이므로 마케팅이 계속 육성합니다',
          ),
        )
      } else if (a.roleIds.includes('head-of-sales')) {
        rank = 50
        /* Không còn "người gật mọi đề nghị" — không còn đề nghị nào để gật.
           Vai này đứng cao vì nó là vai DUY NHẤT giao được lead cho người
           khác (`lead.assign`), nên nó cũng là người nhận lại được một lead
           đang không biết đưa cho ai. */
        why = translate(
          message(
            'Trưởng phòng, điều phối lead cho cả phòng',
            'Head of sales, distributes leads for the whole team',
            '영업 팀장, 팀 전체의 리드를 배분합니다',
          ),
        )
      } else if (domains.length > 0) {
        rank = 70
        const names = domains.join(' · ')
        why = translate(message(`Sale ngành ${names}`, `Sales for ${names}`, `${names} 영업`))
      } else if (a.roleIds.includes('bd')) {
        rank = 60
        why = translate(
          message(
            'Mở khách mới, điền ô bắt buộc',
            'Opens new customers and fills required fields',
            '신규 고객을 열고 필수 항목을 채웁니다',
          ),
        )
      }

      return { actor: a, domains, rank, why }
    })
    .sort((x, y) => x.rank - y.rank || x.actor.name.localeCompare(y.actor.name))

  return scored.map(({ actor, domains, rank, why }) => ({
    id: actor.id,
    name: actor.name,
    role: actor.role,
    domains,
    why,
    group: actor.id === meId ? 'mine' : rank <= 50 ? 'suggested' : 'rest',
  }))
}

/* `peopleOn` ĐÃ BỎ (29/08). Nó gộp "chủ lead" với "người được giao thêm việc"
   thành một cụm avatar, và vế thứ hai vừa hết tồn tại: giao lead nay LÀ đổi
   chủ lead (`data/lead-owner.ts`), nên cụm đó chỉ còn đúng một cái đầu — thứ
   `PicCell` và khối Lead PIC đã in sẵn, bằng tên, ở cả sổ lẫn hồ sơ. Hàm cũng
   đã không còn ai gọi từ trước lượt này. */

/** Icon của cột trống trong bảng việc — dùng chung để EmptyState của mọi tab
 *  nói cùng một hình. */
export const EMPTY_ICON = Inbox
