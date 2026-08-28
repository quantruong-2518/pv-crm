import { queryOptions } from '@tanstack/react-query'
import { type CostBandValue } from '@pv/engines'
import type {
  CampaignSource,
  CampaignSourceResponse,
  CampaignTotals,
  SourceKind,
  SourceWave,
} from '@pv/contracts'
import {
  LEADS,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  type Lead,
  type LeadCategory,
  type LeadTier,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { bandText, costBreakdown, costOf, type CostBreakdown } from '@/data/source-cost'
import { api } from '@/app/api'

/** Nguồn lead — module 1 · Chiến dịch & Sự kiện. ĐỌC TỪ MÁY CHỦ.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CẮT KHỎI FIXTURE — 28/08
 *  ------------------------------------------------------------------
 *  `sourcesQuery` và `campaignTotalsQuery` không còn `load`, và theo nghi thức
 *  của `app/api/client.ts` thì đó CHÍNH LÀ lượt cắt: có `load` nghĩa là query
 *  còn ăn fixture, vắng `load` nghĩa là nó đi HTTP thật.
 *
 *  ------------------------------------------------------------------
 *  MÁY CHỦ GỬI TỬ SỐ VÀ MẪU SỐ; TỈ LỆ TÍNH Ở ĐÂY
 *  ------------------------------------------------------------------
 *  `GET /sales/campaigns/sources` trả về thứ đếm được — lead, lead tốt, thư đã
 *  gửi, người mở, hoá đơn từng dòng. Bốn thứ màn thật sự vẽ (`openRate`,
 *  `costPerGood`, dải giá, "đang chạy hay đã xong") đều là phép tính trên
 *  chúng, và chúng tính ở file này vì đó là chỗ DUY NHẤT cả bảng lẫn hàng tổng
 *  cùng đọc. Một phép chia viết trong JSX là một phép chia không ai test được,
 *  và hai màn cùng chia sẽ chia lệch nhau.
 *
 *  ------------------------------------------------------------------
 *  "TRẢ LỜI" ĐÃ THÀNH "BẤM VÀO", VÀ ĐÓ KHÔNG PHẢI ĐỔI CHỮ
 *  ------------------------------------------------------------------
 *  Bản fixture có cột `replied`. Hệ thư thật ghi được `OPEN` · `CLICK` ·
 *  `UNSUBSCRIBE` và KHÔNG ghi được "người ta có trả lời không" — thư trả lời đi
 *  vào hộp thư của người gửi, nơi máy chủ này không đọc. Giữ nhãn "Trả lời" mà
 *  đổ số click vào là đặt một cái nhãn sai lên một con số đúng. */

/** Cộng một trường của mảng. Dùng lại ở cả hàng nguồn lẫn hàng tổng để hai chỗ
 *  không thể cộng khác nhau. */
function sum<T>(xs: readonly T[], pick: (x: T) => number): number {
  return xs.reduce((n, x) => n + pick(x), 0)
}

/** Chia có gác mẫu số. Trả 0 khi mẫu bằng 0 — màn không có chỗ nào hiện được
 *  `NaN`, và "chưa gửi ai" đọc thành 0% là đúng nghĩa.
 *
 *  Xuất ra vì hàng score card chia trên số của CẢ SỔ (`campaignTotalsQuery`),
 *  còn bảng chia trên số của một dòng — hai lát cắt, và chúng phải chia bằng
 *  đúng một phép. Màn tự viết `a / b` là chỗ `NaN` quay lại đúng vào ngày sổ
 *  chưa gửi thư nào. */
export function rate(top: number, bottom: number): number {
  return bottom > 0 ? top / bottom : 0
}

// ---------------------------------------------------------------------------
// TRỤC NGÀY — một chỗ đổi ISO thành số ngày, không phải mỗi màn một phép trừ
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** Số ngày từ mốc đầu kỳ tới một mốc ISO, làm tròn xuống.
 *
 *  Cắt về nửa đêm UTC trước khi trừ: hai mốc cách nhau 20 giờ nhưng nằm ở hai
 *  ngày lịch phải ra 1, không phải 0. Nếu không thì mốc timeline nhảy chỗ tuỳ
 *  theo giờ trong ngày mà lô rời máy chủ. */
function daysFrom(fromISO: string, atISO: string): number {
  const a = Date.parse(fromISO.slice(0, 10))
  const b = Date.parse(atISO.slice(0, 10))
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / DAY_MS)
}

/** Hôm nay dạng `YYYY-MM-DD` — mốc mà mọi đợt sắp gửi đếm từ đó.
 *
 *  Đồng hồ THẬT. Bản trước đọc `dayISO(DAY_FROZEN)` của kịch bản đóng băng, và
 *  đó là thứ làm ô "gửi ngày nào" của một form mở hôm nay mặc định về một ngày
 *  trong quá khứ. */
export const TODAY = new Date().toISOString().slice(0, 10)

export const dayAfterToday = (n: number): string =>
  new Date(Date.parse(TODAY) + n * DAY_MS).toISOString().slice(0, 10)

/** Ba trạng thái của một chiến dịch, đúng thứ tự đời của nó.
 *
 *  `nhap` chưa có trong kịch bản đóng băng — nó là trạng thái của chiến dịch
 *  NGƯỜI DÙNG vừa soạn trong phiên và chưa bấm "Bắt đầu chạy". Có mặt ở đây vì
 *  màn phải vẽ được nó ngay khi form lưu nháp, chứ không phải vì fixture có
 *  dòng nào mang nó. */
export const CAMPAIGN_STATUS = [
  { key: 'nhap', label: 'Nháp', tone: 'draft' },
  { key: 'dang-chay', label: 'Đang chạy', tone: 'running' },
  { key: 'da-xong', label: 'Đã xong', tone: 'success' },
] as const satisfies readonly {
  key: string
  label: string
  tone: 'draft' | 'running' | 'success'
}[]

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number]['key']

export const STATUS_LABEL = Object.fromEntries(
  CAMPAIGN_STATUS.map((s) => [s.key, s.label]),
) as Record<CampaignStatus, string>

export const STATUS_TONE = Object.fromEntries(
  CAMPAIGN_STATUS.map((s) => [s.key, s.tone]),
) as Record<CampaignStatus, (typeof CAMPAIGN_STATUS)[number]['tone']>

/** Trạng thái → chấm màu của `StatusDot`. Bảng riêng chứ không suy từ `tone`:
 *  hai component có hai bộ tên trạng thái khác nhau, và nối chúng bằng một phép
 *  đoán là cách để một hôm nào đó chấm xanh nằm cạnh chữ "Đang chạy". */
export const STATUS_DOT: Record<CampaignStatus, 'next' | 'current' | 'ok'> = {
  nhap: 'next',
  'dang-chay': 'current',
  'da-xong': 'ok',
}

/** Chiến dịch đang chạy hay đã xong — đọc theo CỬA SỔ CÒN NHẬN TRẢ LỜI, không
 *  đọc theo mốc "đợt cuối đã rời máy chủ".
 *
 *  Chuỗi vừa gửi hôm kia mà gọi là "đã xong" thì người chạy nó đóng sổ sớm mất
 *  hai tuần trả lời. Đợt còn nằm ở tương lai cũng giữ chuỗi ở "đang chạy" —
 *  `todayDay - lastDay` âm thì vế so vẫn đúng, và một chiến dịch đã hẹn giờ mà
 *  đọc thành "đã xong" là đọc ngược hẳn.
 *
 *  `todayDay` truyền vào chứ không đọc đồng hồ ở đây: cả bảng lẫn hàng tổng
 *  phải chấm trạng thái trên CÙNG một mốc hôm nay, và hai lời gọi `Date.now()`
 *  cách nhau một nhịp render là hai mốc khác nhau. */
function statusOf(lastDay: number, todayDay: number, hasWaves: boolean): CampaignStatus {
  if (!hasWaves) return 'nhap'
  return todayDay - lastDay <= WAVE_REPLY_WINDOW ? 'dang-chay' : 'da-xong'
}

/** Chuỗi còn được coi là ĐANG CHẠY bao nhiêu ngày sau đợt cuối, ngày.
 *
 *  **Số ĐẶT, không phải số đo.** Đây là luật hiển thị — nó quyết định một chuỗi
 *  vừa gửi hôm kia đọc thành "đang chạy" hay "đã xong" — nên nó ở tầng app cạnh
 *  `ENOUGH_GATE`, không ở máy chủ và không ở fixture. Đo lại được khi có nhật ký
 *  trả lời theo ngày; tới lúc đó 14 là hai tuần, nhịp nhắc thông thường của một
 *  chuỗi email. */
const WAVE_REPLY_WINDOW = 14

/** Một đợt như màn đọc nó — hợp đồng của máy chủ cộng hai thứ tầng màn cần. */
export type WaveRow = SourceWave & {
  /** Kênh của đợt. Hôm nay LUÔN là `email`, và nói thẳng ra chứ không bỏ
   *  trường đi: một đợt của hệ này là một lô `platform.mail_run`, tức là thư —
   *  Zalo OA, Telegram và ba nền tảng đăng bài chưa có đường gửi nào. Giữ
   *  trường để bộ lọc kênh của bảng còn hỏi được câu của nó, và để ngày E4 mở
   *  kênh thứ hai thì chỗ phải sửa là đây chứ không phải cả màn. */
  channel: WaveChannel
  /** Ngày gửi, đếm bằng ngày kể từ đầu kỳ. Trục thời gian của màn đo bằng số
   *  ngày (mốc timeline, bộ lọc "30 ngày qua", cột "kéo dài"), nên chỗ đổi từ
   *  ISO sang số ngày phải là MỘT chỗ — ở đây — chứ không phải mỗi màn một phép
   *  trừ ngày tự viết. Đợt chưa gửi thì bằng ngày cuối kỳ: nó chưa xảy ra, nên
   *  nó đứng ở mép phải của trục chứ không rơi về đầu kỳ. */
  day: number
}

/* KHÔNG có `hit`/`hitRate` trên một ĐỢT, và chỗ trống này là một câu trả lời.
   Hai trường đó so "lead đợt này kéo về" với `expected`, mà vế đầu KHÔNG TỒN
   TẠI: `lead.campaign_id` quy lead về một NGUỒN, không về một đợt của nguồn —
   một người nhận cả ba đợt rồi mới điền form thì lead đó là của đợt nào cũng
   không ai trả lời được. Bản fixture có `Wave.leads` vì fixture tự chia con số
   ấy ra; hệ thật thì không có ai chia.
   Kỳ vọng vẫn ở lại trên đợt (người soạn đặt nó cho từng đợt), và phép so duy
   nhất đúng là ở tầng NGUỒN — `SourceRow.hitRate` cộng cả chuỗi. */

/** Một dòng của bảng nguồn — hợp đồng máy chủ CỘNG những phép tính màn cần.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO KHÔNG DÙNG THẲNG `CampaignSource` CỦA HỢP ĐỒNG
 *  ------------------------------------------------------------------
 *  Hợp đồng chở sự kiện (lead, thư, hoá đơn); bảng vẽ kết luận (tỉ lệ, dải giá,
 *  trạng thái, số ngày). Nếu màn tự tính lấy thì bảng và hàng tổng phía trên nó
 *  tính hai lần cùng một phép — và hai lần tính là hai chỗ để chúng lệch nhau.
 *  Dòng này là chỗ phép tính xảy ra ĐÚNG MỘT LẦN.
 *
 *  Mọi trường thêm vào đây phải là hàm thuần của những trường máy chủ gửi. Cái
 *  gì không suy ra được thì không có mặt — chứ không điền 0 cho đủ cột. */
export type SourceRow = {
  // ---- máy chủ gửi ---------------------------------------------------------
  code: string
  /** Tên hiển thị. Tên trường là `label` chứ không `name` vì cả bảng lẫn thẻ
   *  ContextRail đọc nó như NHÃN của một dòng, và đổi tên trường ở đây là sửa
   *  chín chỗ trong hai màn cho một chữ. */
  label: string
  kind?: SourceKind
  active: boolean
  owner: string
  ownerId?: string
  followers: string[]
  leads: number
  /** Lead đã qua cổng init data. */
  good: number
  ops: number
  waves: WaveRow[]
  costs: CampaignSource['costs']
  event?: CampaignSource['event']

  // ---- cộng từ các đợt -----------------------------------------------------
  /** Người nhận mà lô NỢ khi mở — mẫu số thật của mọi tỉ lệ dưới đây nếu muốn
   *  đo cái phễu từ lúc bấm gửi. Màn hiện đang chia trên `sent`; hai số đi cùng
   *  nhau để chỗ chênh (thư không rời được máy) đọc ra được. */
  audience: number
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  /** Tổng kỳ vọng lead mọi đợt — số đặt TRƯỚC khi chạy. Đợt không ai đặt kỳ
   *  vọng cộng 0 vào đây, nên `expected = 0` nghĩa là cả chuỗi không ai đặt. */
  expected: number

  /** Lead của nguồn CHƯA qua cổng init data — `leads` trừ `good`. Phép trừ
   *  nghiệp vụ, không phải phép trừ trang trí trong JSX. */
  notGood: number

  // ---- bốn tỉ lệ · mỗi cái trả lời đúng một câu ------------------------------
  /** Mở trên số người nhận. */
  openRate: number
  /** Bấm trên số người nhận — KHÔNG phải "trả lời", xem docblock đầu file. */
  clickRate: number
  /** Hỏng trên số người nhận. Mẫu số ĐÚNG BẰNG mẫu số của hai tỉ lệ trên — ba
   *  cột cạnh nhau mà chia trên ba mẫu số khác nhau là ba cột không so được với
   *  nhau, và người đọc không có cách nào biết. */
  bounceRate: number
  /** Qua cổng init data ở mức nào — lead tốt trên lead. Tỉ lệ đắt nhất: một
   *  nguồn kéo nhiều lead mà `mqlRate` thấp là nguồn đang làm bận cả BD. */
  mqlRate: number
  /** Đạt bao nhiêu phần kỳ vọng — lead trên `expected`. Trên 1 là vượt. */
  hitRate: number
  /** Chỉ sự kiện: người đến trên người đăng ký. `null` = không phải sự kiện
   *  hoặc chưa ai nhập số đăng ký, KHÔNG phải "chưa ai đến". */
  attendRate: number | null

  // ---- tiền · dải giá và phân rã --------------------------------------------
  /** Tổng chi tiền mặt của nguồn, đồng. Cộng từ chính các dòng hoá đơn — không
   *  có cột tổng nào ở máy chủ để hai số lệch nhau. */
  cost: number
  /** Dải giá mỗi lead tốt, 95%. `costPerGood` là `band.point` — cùng một số, và
   *  màn KHÔNG được hiện điểm một mình. */
  band: CostBandValue
  /** Dải đủ chắc để đứng cạnh một câu khẳng định chưa. */
  enough: boolean
  /** Vì sao chưa đủ. Rỗng khi `enough`. */
  why: string
  /** Dải viết thành chữ, cho những chỗ chỉ nhận chuỗi (hint của thẻ số). */
  bandText: string
  /** Tiền của nguồn đi đâu — năm loại L1…L5, số và tỉ trọng. Nguồn chưa nhập
   *  hoá đơn nào cho `rows` rỗng: 0 đồng là NỘI DUNG, không phải chỗ thiếu số. */
  costByKind: CostBreakdown

  // ---- trục thời gian --------------------------------------------------------
  startISO: string
  startDay: number
  /** Ngày của đợt cuối. Nguồn chưa có đợt nào thì bằng chính `startDay`. */
  lastDay: number
  lastISO: string
  /** Chuỗi kéo dài bao nhiêu ngày, từ mốc đầu tới mốc cuối. */
  runDays: number
  /** Nháp · đang chạy · đã xong — xem `statusOf`. */
  status: CampaignStatus
}
/** Nguồn mở sẵn khi vào màn chi tiết mà chưa chọn dòng nào.
 *
 *  Rỗng, và màn phải chịu được điều đó: bản trước trỏ vào nguồn đã kéo DAS Vina
 *  về — một mã có thật trong kịch bản và không có thật trong sổ cấu hình. Với
 *  dữ liệu thật thì "nguồn nào đáng mở đầu tiên" là câu chỉ trả lời được sau
 *  khi bảng về, nên nó là việc của màn (dòng đầu của bảng đã sắp), không phải
 *  của một hằng số tầng dữ liệu. */
export const ANCHOR_SOURCE = ''

export type DraftWave = {
  label: string
  channel: WaveChannel
  /** Gửi ngay khi chiến dịch bắt đầu chạy, thay vì chờ tới ngày đã hẹn.
   *
   *  `sendNow` và `dateISO` cùng tồn tại CÓ CHỦ Ý: bật "Gửi ngay" rồi tắt lại
   *  thì ngày người dùng vừa gõ vẫn còn đó. Gộp thành một trường thì mỗi lần
   *  bấm nhầm là mất một ô đã điền, và người mới bấm nhầm nhiều. */
  sendNow: boolean
  /** Ngày hẹn gửi, `YYYY-MM-DD`. Bỏ qua khi `sendNow`. */
  dateISO: string
  /** Giờ hẹn gửi, `HH:mm`. */
  time: string
  /** Kỳ vọng lead của đợt — chép từ đợt tương ứng của nguồn mẫu. Người soạn sửa
   *  được. KHÔNG còn là ô bắt buộc từ 23/08: chiến dịch phải tạo được mà không
   *  cần ai gật, và bắt gõ một con số dự báo trước khi được bấm Lưu là chặn
   *  đúng người chưa biết đặt con số đó. Để 0 nghĩa là chưa đặt kỳ vọng, và cột
   *  chấm đạt/hụt sẽ nói "chưa đặt" thay vì nói "hụt". */
  expected: number
  /** Nội dung mail của đợt, HTML. Mở đầu là chuỗi RỖNG — kịch bản đóng băng
   *  không có bài nào đã soạn, và một đoạn văn mẫu sinh ra ở tầng dữ liệu sẽ
   *  trông y hệt nội dung thật trên màn. Ô trống là câu trả lời đúng. */
  content: string
}

/** Nhịp mặc định khi bấm "Thêm đợt", ngày.
 *
 *  **Số ĐẶT.** Bản trước đo khoảng cách hai đợt cuối của một nguồn mẫu trong
 *  fixture — một phép đo thật trên dữ liệu giả. Trên dữ liệu thật thì nguồn mẫu
 *  đó không tồn tại, và đo nhịp của chiến dịch đầu tiên có mặt là đo một mẫu
 *  cỡ một. Mười bốn ngày là hai tuần, nhịp nhắc thông thường của một chuỗi
 *  email, và người soạn sửa được ngay trên form. */
export const DRAFT_STEP_DAYS = 14

/** Bản nháp mở đầu của form "Chiến dịch mới".
 *
 *  Chỉ MỘT đợt, và đó là chỗ khác hẳn bản trước: bản trước chép cả chuỗi của
 *  một nguồn mẫu trong fixture, nên form mở ra đã có sẵn ba đợt mà người soạn
 *  không đặt đợt nào. Một đợt mở màn là thứ ít nhất mà một chiến dịch phải có,
 *  và "Thêm đợt" ngay bên cạnh.
 *
 *  Đợt mở màn mặc định "Gửi ngay": người mới soạn chiến dịch đầu tiên gần như
 *  luôn muốn nó đi ngay khi bấm chạy, và bắt họ chọn một ngày trước khi hiểu
 *  chuỗi hoạt động ra sao là bắt chọn thứ chưa có gì để chọn.
 *
 *  `name` là VÍ DỤ để làm placeholder, không phải dữ liệu — màn in nó sau chữ
 *  "Ví dụ", và nó phải đọc ra như một cái tên người ta sẽ gõ. */
export const DRAFT_TEMPLATE = {
  fromCode: '',
  name: 'Chuỗi email nhà máy chip Bắc Ninh',
  waves: [
    {
      label: 'Đợt mở màn',
      channel: 'email',
      sendNow: true,
      dateISO: TODAY,
      time: '09:00',
      expected: 0,
      content: '',
    },
  ] satisfies DraftWave[],
}

// ---------------------------------------------------------------------------
// NHÓM NGƯỜI NHẬN — "tạo nhóm lead để bắn campaign"
//
// Nhóm KHÔNG phải một danh sách chép tay, nó là một BỘ LỌC trên sổ lead. Khác
// biệt này quyết định cả màn: một danh sách chép tay đóng băng lúc bấm lưu và
// sau đó âm thầm cũ đi, còn một bộ lọc thì mỗi lần chiến dịch chạy lại quét
// đúng sổ hôm đó. Người mới cũng đọc được nó thành một câu tiếng Việt — "gửi
// cho khách ngành chip ở Bắc Ninh chưa lên MQL" — thay vì một tệp 400 dòng.
//
// Ba chiều lọc, không hơn: NGÀNH · BẬC · TỈNH. Đây là ba thứ Sale thật sự phân
// nhóm theo, và cũng là ba trường mọi lead đều có. Thêm chiều thứ tư ("đã trả
// lời chưa", "lần chạm cuối") cần dữ liệu theo thời gian mà kịch bản đóng băng
// chưa có — bịa ra một ô lọc luôn trả về cả sổ thì tệ hơn không có ô đó.
// ---------------------------------------------------------------------------

export type LeadGroup = {
  categories: LeadCategory[]
  tiers: LeadTier[]
  provinces: string[]
}

/** Nhóm mở đầu: KHÔNG chọn gì, tức cả sổ.
 *
 *  Mảng rỗng nghĩa là "chiều này không lọc", không phải "chiều này loại hết".
 *  Đây là chỗ dễ hiểu ngược nhất của cả màn, nên màn phải in ra số người ngay
 *  cạnh mọi lúc — con số là thứ nói cho người dùng biết họ đang hiểu đúng hay
 *  sai, không phải một dòng giải thích. */
export const EMPTY_GROUP: LeadGroup = { categories: [], tiers: [], provinces: [] }

/** Tỉnh có mặt trong sổ lead, theo số lead giảm dần rồi tới chữ cái. Tỉnh nhiều
 *  khách đứng trước để người mới không phải đọc hết 10 nút mới thấy Bắc Ninh. */
export const PROVINCES: string[] = (() => {
  const count = new Map<string, number>()
  for (const l of LEADS) count.set(l.province, (count.get(l.province) ?? 0) + 1)
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
    .map(([p]) => p)
})()

export { LEAD_CATEGORIES, LEAD_TIERS }

/** Lead lọt nhóm. Ba chiều nối bằng VÀ, các lựa chọn trong một chiều nối bằng
 *  HOẶC — đúng cách người ta đọc ba hàng chip trên màn. */
export function membersOf(g: LeadGroup): Lead[] {
  return LEADS.filter(
    (l) =>
      (g.categories.length === 0 || g.categories.includes(l.category)) &&
      (g.tiers.length === 0 || g.tiers.includes(l.tier)) &&
      (g.provinces.length === 0 || g.provinces.includes(l.province)),
  )
}

/** Nhóm viết thành một câu tiếng Việt, cho thanh tóm tắt và cho hồ sơ chiến
 *  dịch đọc lại. Ở tầng data vì cả form lẫn hồ sơ đều in nó, và hai bản chép
 *  tay sẽ lệch nhau ngay lần đầu ai đó thêm một chiều lọc. */
export function groupText(g: LeadGroup): string {
  const parts = [
    g.categories.length > 0
      ? `ngành ${g.categories.map((k) => LEAD_CATEGORIES.find((c) => c.key === k)?.label ?? k).join(', ')}`
      : null,
    g.tiers.length > 0
      ? `bậc ${g.tiers.map((k) => LEAD_TIERS.find((t) => t.key === k)?.label ?? k).join(', ')}`
      : null,
    g.provinces.length > 0 ? `ở ${g.provinces.join(', ')}` : null,
  ].filter((p): p is string => p !== null)

  return parts.length === 0 ? 'cả sổ lead, chưa lọc chiều nào' : parts.join(' · ')
}

// ---------------------------------------------------------------------------
// Một dòng bảng, dựng từ một dòng máy chủ
// ---------------------------------------------------------------------------

/** Hợp đồng + kỳ → dòng bảng. Chỗ DUY NHẤT tính tỉ lệ, dải giá và trạng thái.
 *
 *  `period` vào cùng vì ba thứ của dòng đo bằng NGÀY KỂ TỪ ĐẦU KỲ (`startDay`,
 *  `lastDay`, `runDays`) và một thứ đo bằng "cách hôm nay bao xa" (`status`).
 *  Cả hai mốc đó thuộc về cả sổ, không thuộc về một dòng — nên chúng đi vào
 *  chứ không được đọc lại trong đây. */
function rowOf(s: CampaignSource, period: { fromISO: string; toISO: string }): SourceRow {
  const todayDay = daysFrom(period.fromISO, new Date().toISOString())
  const endDay = daysFrom(period.fromISO, period.toISO)

  const waves: WaveRow[] = s.waves.map((w) => ({
    ...w,
    channel: 'email',
    day: w.sentAt ? daysFrom(period.fromISO, w.sentAt) : endDay,
  }))

  const audience = sum(waves, (w) => w.audience)
  const sent = sum(waves, (w) => w.sent)
  const delivered = sum(waves, (w) => w.delivered)
  const opened = sum(waves, (w) => w.opened)
  const clicked = sum(waves, (w) => w.clicked)
  const bounced = sum(waves, (w) => w.bounced)
  const expected = sum(waves, (w) => w.expected ?? 0)
  const cost = sum(s.costs, (c) => c.amount)

  const startDay = s.firstAt ? daysFrom(period.fromISO, s.firstAt) : 0
  const lastDay = waves.length > 0 ? Math.max(...waves.map((w) => w.day)) : startDay

  const priced = costOf({ code: s.code, label: s.name }, cost, s.leads, s.goodLeads)
  const registered = s.event?.registered

  return {
    code: s.code,
    label: s.name,
    kind: s.kind,
    active: s.active,
    /* Nguồn chưa ai đứng tên in ra một câu, không in ra chuỗi rỗng: một ô
       trống trên cột "PIC" đọc như lỗi tải, còn "chưa ai" là một câu trả lời. */
    owner: s.ownerName ?? 'Chưa ai đứng tên',
    ownerId: s.ownerId,
    followers: s.followers.map((f) => f.name),

    leads: s.leads,
    good: s.goodLeads,
    notGood: s.leads - s.goodLeads,
    ops: s.ops,

    waves,
    costs: s.costs,
    event: s.event,

    audience,
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    expected,

    openRate: rate(opened, sent),
    clickRate: rate(clicked, sent),
    bounceRate: rate(bounced, sent),
    mqlRate: rate(s.goodLeads, s.leads),
    hitRate: rate(s.leads, expected),
    /* `null` khi không phải sự kiện HOẶC chưa ai nhập số đăng ký — cả hai đều
       là "không có mẫu số", và 0% ở đó đọc thành "không ai đến". */
    attendRate:
      typeof registered === 'number' && registered > 0
        ? rate(s.event?.checkedIn ?? 0, registered)
        : null,

    cost,
    band: priced.band,
    enough: priced.enough,
    why: priced.why,
    bandText: bandText(priced.band),
    costByKind: costBreakdown(s.costs),

    startISO: s.firstAt ?? period.fromISO,
    startDay,
    lastDay,
    lastISO: s.lastAt ?? s.firstAt ?? period.fromISO,
    runDays: Math.max(0, lastDay - startDay),
    status: statusOf(lastDay, todayDay, waves.length > 0),
  }
}

// ---------------------------------------------------------------------------
// Hai cửa
// ---------------------------------------------------------------------------

/** Hai query, MỘT mức quyền: cả hai đọc cùng một sổ nguồn, chỉ khác lát cắt.
 *  Cho chúng hai mức khác nhau là mở đường cho một màn hiện tổng mà không hiện
 *  được dòng nào. Máy chủ khai đúng chữ này ở `SourceController`. */
const CAMPAIGN_ACCESS = { branch: 'Sales', permission: 'chiến-dịch.xem' } as const

/** Bảng nguồn. Nguồn TỰ NHIÊN đứng ngoài — không ai chạy đợt nào cho chúng, nên
 *  mọi cột của bảng (người nhận, mở, bấm, hỏng) đều rỗng ở những dòng đó, và
 *  một dòng rỗng toàn tập đọc như lỗi tải chứ không đọc như "khách tự tìm tới".
 *  Lead của chúng vẫn nằm nguyên ở sổ lead, và `campaignTotalsQuery.natural`
 *  đếm chúng một lần cho cả màn. */
export const sourcesQuery = queryOptions({
  queryKey: ['sales', 'sources'] as const,
  queryFn: ({ signal }) =>
    api
      .read<CampaignSourceResponse>('/sales/campaigns/sources', {
        need: CAMPAIGN_ACCESS,
        signal,
      })
      .then((r) => r.rows.filter((s) => s.kind !== 'tu-nhien').map((s) => rowOf(s, r.period))),
})

/** Hàng score card. Trả nguyên hình của hợp đồng — mọi tỉ lệ của hàng này tính
 *  ở màn bằng chính `rate()` mà bảng dùng, nên hai chỗ không thể chia lệch. */
export const campaignTotalsQuery = queryOptions({
  queryKey: ['sales', 'campaign-totals'] as const,
  queryFn: ({ signal }) =>
    api.read<CampaignTotals>('/sales/campaigns/totals', { need: CAMPAIGN_ACCESS, signal }),
})

export type SourceSort = {
  key: string
  compare: (a: SourceRow, b: SourceRow) => number
}

/** Bộ sắp xếp của bảng — một mục cho mỗi cột SỐ, không hơn.
 *
 *  `compare` là hàm so sánh THUẦN, luôn tăng dần. Màn giữ hướng riêng (mặc định
 *  `desc` — mới nhất, cao nhất lên trước) và tự `reverse`; nhét hướng vào đây
 *  thì mỗi mục phải có hai bản và hai bản đó sẽ lệch nhau.
 *
 *  KHÔNG có `label`: sắp xếp đã dời vào header cột, mà header cột tự mang tên
 *  của nó. Một nhãn "Theo ngày" không chỗ nào hiện là một nhãn sẽ trôi khỏi tên
 *  cột mà không ai biết. */
export const SOURCE_SORTS = [
  { key: 'bat-dau', compare: (a: SourceRow, b: SourceRow) => a.startDay - b.startDay },
  { key: 'ket-thuc', compare: (a: SourceRow, b: SourceRow) => a.lastDay - b.lastDay },
  { key: 'nguoi-nhan', compare: (a: SourceRow, b: SourceRow) => a.sent - b.sent },
  { key: 'mo', compare: (a: SourceRow, b: SourceRow) => a.openRate - b.openRate },
  { key: 'bam', compare: (a: SourceRow, b: SourceRow) => a.clickRate - b.clickRate },
  { key: 'hong', compare: (a: SourceRow, b: SourceRow) => a.bounceRate - b.bounceRate },
  { key: 'ops', compare: (a: SourceRow, b: SourceRow) => a.ops - b.ops },
] as const satisfies readonly SourceSort[]

export type SourceSortKey = (typeof SOURCE_SORTS)[number]['key']

// ---------------------------------------------------------------------------
// Bốn bộ lọc của sổ — DANH SÁCH LỰA CHỌN dựng từ chính dữ liệu, không gõ tay
//
// Gõ tay một danh sách PIC hay một danh sách kênh thì đổi fixture là bộ lọc trỏ
// vào người không còn chạy chiến dịch nào — và một mục lọc luôn ra 0 dòng đọc y
// hệt một bộ lọc hỏng. Ở đây mọi mục đều suy ra từ sáu dòng đang có mặt.
// ---------------------------------------------------------------------------

/** Khung thời gian, tính LÙI từ ngày đóng băng của kịch bản.
 *
 *  Mốc lọc là NGÀY BẮT ĐẦU của chiến dịch, không phải ngày kết thúc: người hỏi
 *  "30 ngày qua chạy cái gì" đang hỏi cái gì được MỞ RA trong 30 ngày đó.
 *
 *  Không có ô chọn ngày tự do. Kịch bản là một lát cắt đóng băng, và một ô lịch
 *  cho chọn tháng sau sẽ luôn trả về bảng rỗng — ba nút phủ đúng khoảng dữ liệu
 *  có thật thì người mới không bấm vào chỗ không có gì. */
export const TIME_WINDOWS = [
  { key: 'all', label: 'Cả kỳ', days: null },
  { key: '30', label: '30 ngày qua', days: 30 },
  { key: '60', label: '60 ngày qua', days: 60 },
] as const satisfies readonly { key: string; label: string; days: number | null }[]

export type TimeWindowKey = (typeof TIME_WINDOWS)[number]['key']

/** Bộ lọc đang bật — một hình cho cả bốn, để màn truyền đúng một object. */
export type CampaignFilter = {
  owner: string | null
  channel: WaveChannel | null
  window: TimeWindowKey
  status: CampaignStatus | null
}

export const NO_FILTER: CampaignFilter = {
  owner: null,
  channel: null,
  window: 'all',
  status: null,
}

/** Lọc sáu dòng theo bộ lọc đang bật. Ở tầng data chứ không ở JSX vì đây là
 *  bốn phép so nghiệp vụ, và câu "kênh" phải hỏi trên MỌI đợt của chiến dịch —
 *  một chuỗi ba đợt email + một đợt Zalo phải lọt cả hai bộ lọc kênh. */
export function filterSources(rows: SourceRow[], f: CampaignFilter): SourceRow[] {
  const win = TIME_WINDOWS.find((w) => w.key === f.window)?.days ?? null

  return rows.filter((r) => {
    if (f.owner && r.owner !== f.owner) return false
    if (f.channel && !r.waves.some((w) => w.channel === f.channel)) return false
    if (f.status && r.status !== f.status) return false
    /* Khoảng cách tính từ HÔM NAY THẬT tới ngày mở nguồn, không từ mốc đóng
       băng của một kịch bản. `daysFrom` cắt cả hai mốc về nửa đêm trước khi
       trừ, nên một nguồn mở sáng nay không rơi ra ngoài cửa sổ "30 ngày". */
    if (win !== null && daysFrom(r.startISO, TODAY) > win) return false
    return true
  })
}

/** PIC có mặt trong sổ, theo thứ tự chữ cái.
 *
 *  Hôm nay hàm này trả về ĐÚNG MỘT tên: cả sáu chiến dịch của kỳ đều do
 *  Marketing chạy. Màn phải đọc độ dài trước khi vẽ — một hộp lọc chỉ có một
 *  lựa chọn là một hộp không lọc được gì, và người mới bấm vào đó rồi kết luận
 *  công cụ hỏng. */
export const ownersOf = (rows: SourceRow[]): string[] =>
  [...new Set(rows.map((r) => r.owner))].sort((a, b) => a.localeCompare(b, 'vi'))

/** Kênh có thật trong sổ, theo số chiến dịch dùng nó — kênh phổ biến đứng trước. */
export const channelsInUse = (rows: SourceRow[]): WaveChannel[] => {
  const count = new Map<WaveChannel, number>()
  for (const r of rows) {
    for (const c of new Set(r.waves.map((w) => w.channel))) {
      count.set(c, (count.get(c) ?? 0) + 1)
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}
