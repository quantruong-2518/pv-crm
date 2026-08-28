import { queryOptions } from '@tanstack/react-query'
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
  domainsOf,
  isOverSla,
  isRunning,
  LEADS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  leadContact,
  saleOfCategory,
  type FrozenLead,
  type Lead,
  type LeadContact,
  type OriginKind,
  type StageKey,
} from '@pv/engines/fixtures/das-vina'
import type { Actor } from '@pv/engines'
import type { LeadBookQuery, LeadBookResponse } from '@pv/contracts'
import type { LeadAssignment } from '@/app/desk'
import { api } from '@/app/api'
import { leadBookQueryToParams } from '@/app/url'
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
 *  bốn màn khác (`lead-detail`, `ops-detail`, `campaigns`, `campaign-detail`)
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
 *  (`@Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })` on
 *  `LeadController.book`).
 *
 *  `scoped: true` is the axis this query used to be missing. The three Sale
 *  actors are `ownOnly`, so the server cuts their book down to the rows they
 *  hold and reports the size of the cut in `hidden`; a query that declares only
 *  branch and permission reads as if the whole book were coming back. Both
 *  reads of one permission matrix have to say the same sentence — see `ApiNeed`
 *  in `app/api/client.ts`. */
const BOOK_NEED = { branch: 'Sales', permission: 'lead.xem', scoped: true } as const

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
    queryKey: ['sales', 'lead-book', 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<LeadBookResponse>(`/sales/leads?${leadBookQueryToParams(query)}`, {
        need: BOOK_NEED,
        signal,
      }),
  })

/** Trần `size` của hợp đồng (`PageQuery.size.max(200)`). Đây là con số làm cho
 *  `leadFacetQuery` bên dưới có hạn sử dụng, nên nó phải đọc được thành số
 *  chứ không nấp trong một chuỗi. */
export const FACET_SIZE = 200

/** CHẮP VÁ — không phải một giải pháp. Đọc hết trước khi dùng lại kiểu này.
 *
 *  Hai ô lọc "Lead PIC" và "Account" là danh sách CHỌN, nên chúng cần mọi giá
 *  trị có trong sổ, không phải mọi giá trị có trên trang đang mở. Khi sổ còn
 *  nằm cả trong bộ nhớ thì `[...new Set(book.map(...))]` trả lời đúng; từ lúc
 *  máy chủ chỉ gửi 10 dòng một trang thì đúng câu đó trả về 10 giá trị, và bộ
 *  lọc HỎNG THẦM LẶNG — người dùng không tìm thấy người hoặc công ty mà họ
 *  biết chắc là có, và không có gì trên màn nói cho họ biết vì sao.
 *
 *  Không có endpoint nào trả facet, nên đây là một lần gọi thứ hai vào chính
 *  `GET /sales/leads` với `?status=all&size=200`, cache dài, chỉ để dựng danh
 *  sách chọn.
 *
 *  **Nó gãy khi sổ vượt 200 lead.** Hôm nay sổ có 119 dòng nên vừa; ở dòng thứ
 *  201 trang đầu vẫn đúng còn hai ô lọc lặng lẽ thiếu giá trị — cùng một kiểu
 *  hỏng, chỉ chậm hơn. `size` không nâng lên được: 200 là trần của
 *  `PageQuery` (`FACET_SIZE`), và nâng trần chỉ dời ngày gãy chứ không bỏ nó.
 *
 *  Cách sửa THẬT là một endpoint facet — `GET /sales/leads/facets` trả về
 *  danh sách owner và account đã DISTINCT ở SQL, kèm số dòng mỗi giá trị. Một
 *  câu `SELECT DISTINCT` trên một cột đã có index, thay cho việc kéo cả sổ về
 *  trình duyệt để làm đúng việc đó bằng JavaScript.
 *
 *  Trong lúc chờ, cùng một lượt kéo về này còn nuôi hai chỗ khác mà trang
 *  hiện tại cũng không trả lời được — dải "Ghim của tôi" (ghim trỏ vào mã ở
 *  bất kỳ trang nào) và khoá chống trùng của panel nạp tệp. Ba chỗ dùng chung
 *  MỘT lần gọi; ngày có endpoint facet thì hai chỗ sau chuyển sang đường của
 *  chúng chứ không kéo cái chắp vá này đi theo. */
export const leadFacetQuery = queryOptions({
  queryKey: ['sales', 'lead-book', 'facets'] as const,
  queryFn: ({ signal }) =>
    api.read<LeadBookResponse>(`/sales/leads?status=all&size=${FACET_SIZE}`, {
      need: BOOK_NEED,
      signal,
    }),
})

/** Sổ ĐÓNG BĂNG — fixture, và vẫn là sổ duy nhất của bốn màn chưa cắt.
 *
 *  Giữ `load` là giữ chúng sống: cả chuỗi interceptor vẫn chạy y hệt, chỉ có
 *  nguồn dữ liệu là fixture thay vì mạng (xem docblock đầu `app/api/client.ts`).
 *  Xoá dòng `load` ở đây là nghi thức cắt màn tiếp theo — không phải việc của
 *  đợt này. */
async function loadFrozenBook(): Promise<FrozenLead[]> {
  return LEADS
}

export const frozenLeadBookQuery = queryOptions({
  queryKey: ['sales', 'lead-book', 'frozen'] as const,
  queryFn: () =>
    api.read('/sales/leads', {
      need: BOOK_NEED,
      load: loadFrozenBook,
    }),
})

// ---------------------------------------------------------------------------
// Xuất xứ — bốn kiểu, bốn cách nói và bốn hình
// ---------------------------------------------------------------------------

/** Hình và chữ của bốn kiểu xuất xứ. Bảng nằm ở tầng app vì "sự kiện trông như
 *  thế nào" là cách trình bày của phòng kinh doanh, không phải kiến thức của
 *  fixture (biên giới package · CLAUDE.md). */
export const ORIGIN_FACE: Record<
  OriginKind,
  { label: string; icon: IconGlyph; openLabel: string }
> = {
  'chien-dich': { label: 'Chiến dịch', icon: Megaphone, openLabel: 'Xem chiến dịch' },
  'su-kien': { label: 'Sự kiện', icon: CalendarClock, openLabel: 'Xem sự kiện' },
  /* Nhãn KIỂU phải khác tên NGUỒN: nguồn GT tên sẵn là "Khách cũ giới thiệu",
     nên nhãn kiểu trùng chữ sẽ in ra hai lần cùng một câu trên một thẻ. */
  'gioi-thieu': { label: 'Được giới thiệu', icon: Handshake, openLabel: 'Xem nguồn' },
  'tu-mo': { label: 'Tạo trực tiếp', icon: PenLine, openLabel: 'Xem nguồn' },
}

/* `SOURCE_KIND_FACE` (khoá theo `kind` của một dòng SỔ NGUỒN, `GET
   /sales/config`) đã XOÁ 27/08 lần 2: bảng chỉ tồn tại để cấp `icon` cho pill
   cột Nguồn ở `leads.tsx`, chủ dự án yêu cầu bỏ icon khỏi pill đó (tên chữ đã
   là tín hiệu chính), và sau khi bỏ thì không còn chỗ nào đọc bảng này nữa.

   Tone vàng của pill từng so `entry.kind === 'mua-du-lieu'` — một câu KHÔNG
   BAO GIỜ đúng: `kind` của một dòng sổ nguồn chỉ nhận `chien-dich · su-kien ·
   tu-nhien`, nên nhánh đó là code chết kể từ lúc viết. Nay nó so
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
 *  là dựng đúng cái bản-thứ-hai-của-một-quyết-định mà file này đã ghi nợ hai
 *  lần rồi (`EXIT_REASON_LABEL`, `SOURCE_KIND_FACE`).
 *
 *  Bản trước tên là `UNKNOWN_SOURCE_FACE` và nói "Không có trong sổ nguồn", vì
 *  hồi đó nó thật sự là một lỗi tra cứu: màn cầm một mã trần rồi tự đi tìm tên
 *  trong `GET /sales/config`, và tra trượt thì chỉ biết là trượt. Máy chủ nay
 *  gửi thẳng `campaignName` cạnh `campaignId`, nên phép tra ấy không còn, và
 *  cùng với nó là cả một lớp lỗi: không còn chỗ nào để trượt. */
export const NO_CAMPAIGN_ICON = CircleDashed

/** Nhãn tiếng Việt của sáu lý do rơi.
 *
 *  Bảng này là bản ĐẢO của `EXIT_KEY` trong `apps/api/src/seed.ts`, và nó tồn
 *  tại vì cùng một món nợ: fixture lưu thẳng nhãn hiển thị làm giá trị của
 *  `Lead.exitReason`, còn hợp đồng đã đổi sang khoá ASCII. Máy chủ trả khoá,
 *  màn phải in ra chữ.
 *
 *  Viết tay chứ không ghép theo `ord` của danh mục `EXIT_REASON` bên
 *  `/sales/config`: ghép theo thứ tự là một phép nối ngầm gãy im lặng đúng
 *  ngày ai đó kéo một dòng lên trên trong màn Cấu hình. Bảng biến mất khi
 *  `exitReason` trên `LeadRow` đổi sang ID cấu hình — nợ đã ghi ở
 *  `docs/tich-hop-be.md`. */
export const EXIT_REASON_LABEL: Record<string, string> = {
  'khong-goi-duoc': 'Không gọi được ai',
  'khong-phai-khach-cua-minh': 'Không phải khách của mình',
  'khong-co-ngan-sach': 'Năm nay không có tiền',
  'nguoi-lien-he-nghi': 'Người liên hệ nghỉ việc',
  'chon-ben-khac': 'Khách chọn bên khác',
  'im-sau-bao-gia': 'Im sau báo giá',
}

// ---------------------------------------------------------------------------
// Next action — việc nên làm tiếp trên một lead
// ---------------------------------------------------------------------------

export type NextActionKey =
  | 'nhan-lead'
  | 'lay-o-thieu'
  | 'de-nghi-sql'
  | 'nhac-ky'
  | 'day-cot'
  | 'bao-tac'
  | 'goi-khach'
  | 'nhan-tin'
  | 'giao-viec'
  | 'mo-nguon'

export type NextAction = {
  key: NextActionKey
  label: string
  icon: IconGlyph
  /** Việc đáng làm nhất đứng đầu và là nút đặc; phần còn lại là nút mờ. */
  primary: boolean
  /** Vì sao đề xuất việc này — hiện ngay dưới nút, không giấu trong code. */
  why: string
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

  if (lead.exitReason) {
    return [
      {
        key: 'mo-nguon',
        label: 'Xem nguồn kéo về',
        icon: Megaphone,
        primary: true,
        why: `Lead đã ra khỏi luồng · ${lead.exitReason}. Việc còn lại là trả phản hồi cho nơi kéo nó về.`,
      },
      {
        key: 'giao-viec',
        label: 'Giao việc',
        icon: Users,
        primary: false,
        why: 'Nhờ người khác xác minh lại trước khi đóng hẳn.',
      },
    ]
  }

  if (!lead.owner) {
    out.push({
      key: 'nhan-lead',
      label: 'Nhận lead về mình',
      icon: UserPlus,
      primary: true,
      why: 'Lead còn ở kho chung, chưa ai đứng tên — không ai nhận thì không ai chạm.',
    })
  }

  if (missing > 0) {
    out.push({
      key: 'lay-o-thieu',
      label: `Lấy ${missing} ô còn thiếu`,
      icon: ClipboardList,
      primary: out.length === 0,
      why: `Cổng init data là ${REQUIRED_SLOTS} ô bắt buộc. Chưa qua cổng thì agent 2 không chạy.`,
    })
  }

  if (gate.ok) {
    out.push({
      key: 'de-nghi-sql',
      label: 'Đề nghị nhận vào pipeline',
      icon: ArrowRight,
      primary: out.length === 0,
      why: `Đủ ${REQUIRED_SLOTS} ô bắt buộc. Người gật là ${APPROVER_ROLE_LABEL}, Sale đề nghị chứ không tự chuyển bậc.`,
    })
  }

  if (isOverSla(lead)) {
    const limit = PIPELINE_STAGES.find((s) => s.key === lead.stage)
    out.push({
      key: 'bao-tac',
      label: 'Báo tắc',
      icon: TriangleAlert,
      primary: out.length === 0,
      why: `Nằm cột "${limit?.label ?? lead.stage}" ${lead.daysHere} ngày, quá hạn ${limit?.limitDays ?? '?'} ngày của cột.`,
    })
  } else if (lead.stage === 'cho-ky') {
    out.push({
      key: 'nhac-ky',
      label: 'Nhắc ký',
      icon: PenLine,
      primary: out.length === 0,
      why: 'Đơn đang ở cột cuối — thứ còn thiếu là chữ ký, không phải thông tin.',
    })
  } else if (lead.stage) {
    out.push({
      key: 'day-cot',
      label: 'Đề nghị sang cột kế',
      icon: ArrowRight,
      primary: out.length === 0,
      why: 'Đơn còn trong hạn cột đang đứng; đẩy sớm thì cả sổ chạy nhanh hơn.',
    })
  }

  out.push({
    key: contact?.phone ? 'goi-khach' : 'nhan-tin',
    label: contact?.phone ? `Gọi ${contact.name}` : 'Nhắn trên kênh khách vừa dùng',
    icon: contact?.phone ? Phone : MessageSquare,
    primary: false,
    /* `contact.title` có thể trống trên dữ liệu thật (ô 4 chưa moi hết) — nối
       thẳng vào `` `${contact.title} · ${contact.phone}` `` sẽ in ra một dấu
       chấm mồ côi ("· 0912…"). Bản sinh cũ luôn có title nên chưa từng lộ. */
    why: contact?.phone
      ? contact.title
        ? `${contact.title} · ${contact.phone}`
        : contact.phone
      : 'Chưa có ô số 5 "kênh gọi lại được" — nhắn lại đúng chỗ khách vừa nhắn.',
  })

  out.push({
    key: 'giao-viec',
    label: 'Giao việc',
    icon: Users,
    primary: false,
    why: 'Giao cho người khác cùng làm. Giao việc không đổi người giữ lead.',
  })

  return out
}

// ---------------------------------------------------------------------------
// Việc của tôi — cùng một sổ, nhìn từ phía người đang đăng nhập
// ---------------------------------------------------------------------------

/** Cột của bảng việc. Năm cột của sổ cơ hội, cộng một cột cho lead chưa qua
 *  cổng — nó CHƯA có cột nào để đứng, và đó chính là việc phải làm. */
export type WorkColumn = StageKey | 'chua-vao-cot'

export const WORK_COLUMNS: { key: WorkColumn; label: string; limitDays?: number }[] = [
  { key: 'chua-vao-cot', label: 'Chưa vào sổ cơ hội' },
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
  assigns: Record<string, LeadAssignment>
}): WorkItem[] {
  const { actor, leads, assigns } = input
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
      column: lead.stage ?? 'chua-vao-cot',
      reason,
      action,
      fresh,
      overSla: isOverSla(lead),
    })
  }

  // 1 · việc vừa được giao — đứng trước mọi thứ, ở mọi vai.
  for (const lead of leads) {
    const a = assigns[lead.code]
    if (a?.actorIds.includes(actor.id)) push(lead, `Vừa được giao · ${a.task}`, true)
  }

  const running = leads.filter(isRunning)
  const mine = running.filter((l) => l.owner === actor.name)

  /* Bốn nhánh dưới đây so bằng `roleId`, KHÔNG bằng `name` hay nhãn `role`.
     Bản trước so `actor.name === HEAD_OF_SALES` — một cái tên có thật trong
     fixture và không có thật trong bảng người dùng, nên với tài khoản thật thì
     bốn nhánh này im lặng không chạy nhánh nào. `roleId` là khoá của ma trận
     quyền, thứ duy nhất ở đây không đổi khi người ta đổi tên hay đổi nhãn vai
     (`Actor.role` mang cả ngành: "Sale · chip"). */
  if (actor.roleId === 'sale') {
    for (const lead of mine) {
      push(
        lead,
        lead.stage
          ? `Bạn đang giữ · nằm cột này ${lead.daysHere} ngày`
          : 'Bạn đang giữ · chưa vào sổ cơ hội',
      )
    }
  }

  if (actor.roleId === 'bd') {
    for (const lead of mine) {
      const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
      push(
        lead,
        missing > 0 ? `Còn thiếu ${missing} ô bắt buộc` : 'Đủ ô bắt buộc — chờ đẩy sang Sale',
      )
    }
  }

  if (actor.roleId === 'marketing') {
    for (const lead of mine) push(lead, `Đang nuôi ở bậc đầu mối · ${lead.daysHere} ngày`)
  }

  if (actor.roleId === 'presales') {
    for (const lead of running) {
      if (lead.stage === 'tim-hieu' || lead.stage === 'da-demo') {
        push(lead, `Đơn ở cột có demo · chủ đơn ${lead.owner ?? 'chưa ai'}`)
      }
    }
  }

  if (actor.roleId === 'trưởng-phòng') {
    for (const lead of running) {
      if (canPromoteToSql(lead).ok) push(lead, 'Đủ ô bắt buộc · chờ bạn gật cho vào pipeline')
    }
    for (const lead of running) {
      if (isOverSla(lead)) push(lead, `Quá hạn cột · ${lead.daysHere} ngày`)
    }
    for (const lead of running) {
      if (!lead.owner) push(lead, 'Còn ở kho chung · chưa ai đứng tên')
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
  /** 'toi' luôn đứng đầu; 'goi-y' là người hợp việc; 'con-lai' là phần còn lại. */
  group: 'toi' | 'goi-y' | 'con-lai'
}

/** Danh sách người nên giao, xếp theo mức hợp việc với ĐÚNG lead này.
 *
 *  Thứ tự không phải bảng chữ cái mà là thứ tự người dùng cần: mình trước, rồi
 *  người có ngành khớp, rồi vai đang nắm phần việc lead đang thiếu, rồi phần
 *  còn lại. Danh sách đầy đủ vẫn giữ — gợi ý sai thì người dùng vẫn phải chọn
 *  được người mình muốn. */
export function assigneeOptions(
  lead: Lead,
  actors: readonly Actor[],
  meId: string | undefined,
): AssigneeOption[] {
  const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
  const owner = saleOfCategory(lead.category)

  const scored = actors
    .filter((a) => a.branches.includes('Sales'))
    .map((a) => {
      const domains = domainsOf(a.name)
      let rank = 90
      let why = 'Trong phòng kinh doanh'

      if (a.id === meId) {
        rank = 0
        why = 'Nhận việc về chính mình'
      } else if (a.name === owner) {
        rank = 10
        why = `Sale phụ trách ngành ${domains.join(' · ')}`
      } else if (a.roleId === 'bd' && missing > 0) {
        rank = 20
        why = `Còn ${missing} ô bắt buộc — moi ô là việc của vai này`
      } else if (
        a.roleId === 'presales' &&
        (lead.stage === 'tim-hieu' || lead.stage === 'da-demo')
      ) {
        rank = 30
        why = 'Đơn đang ở cột có demo'
      } else if (a.roleId === 'marketing' && lead.tier === 'dau-moi') {
        rank = 40
        why = 'Lead còn ở bậc đầu mối — nuôi tiếp là việc của Marketing'
      } else if (a.roleId === 'trưởng-phòng') {
        rank = 50
        why = 'Người gật mọi đề nghị của phòng'
      } else if (domains.length > 0) {
        rank = 70
        why = `Sale ngành ${domains.join(' · ')}`
      } else if (a.roleId === 'bd') {
        rank = 60
        why = 'Mở khách mới, moi ô bắt buộc'
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
    group: actor.id === meId ? 'toi' : rank <= 50 ? 'goi-y' : 'con-lai',
  }))
}

/** Ai đang làm việc trên một lead: chủ lead trước, rồi người được giao.
 *
 *  Trả về TÊN chứ không trả id, vì cụm avatar đọc tên. Trùng thì bỏ — một người
 *  vừa giữ lead vừa được giao thêm việc vẫn chỉ là một cái đầu. */
export function peopleOn(
  lead: Lead,
  assigns: Record<string, LeadAssignment>,
  actors: readonly Actor[],
): string[] {
  const names = new Set<string>()
  if (lead.owner) names.add(lead.owner)
  for (const id of assigns[lead.code]?.actorIds ?? []) {
    const a = actors.find((x) => x.id === id)
    if (a) names.add(a.name)
  }
  return [...names]
}

/** Icon của cột trống trong bảng việc — dùng chung để EmptyState của mọi tab
 *  nói cùng một hình. */
export const EMPTY_ICON = Inbox
