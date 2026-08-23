import { queryOptions } from '@tanstack/react-query'
import { type CostBandValue } from '@pv/engines'
import {
  DAS_VINA_LEAD,
  DAY_FROZEN,
  LEADS,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  OPPORTUNITIES,
  SOURCES,
  WAVE_REPLY_WINDOW,
  dasVina,
  dayISO,
  opsFromSource,
  sourceStats,
  sourcesRan,
  type Lead,
  type LeadCategory,
  type LeadTier,
  type Source,
  type Wave,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { ADDRESSED_CHANNELS, E4_CHANNELS } from '@/data/sales-config'
import { bandText, costBreakdown, costOf, type CostBreakdown } from '@/data/source-cost'
import { api } from '@/app/api'

/** Nguồn lead — module 1 · Chiến dịch & Sự kiện. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy chiến dịch và số của nó. Khi có backend, đổi thân
 *  các hàm `fetch*` thành lời gọi HTTP; màn không phải sửa.
 *
 *  Số của một chiến dịch KHÔNG tính ở tầng màn — `sourceStats` nằm trong fixture
 *  vì "lead tốt" là khái niệm của cổng init data, không phải của giao diện. Mọi
 *  tỉ lệ cũng tính ở đây chứ không ở JSX: một phép chia viết trong màn là một
 *  phép chia không ai test được, và hai màn cùng chia sẽ chia lệch nhau. */

/** Cộng một trường của mảng. Dùng lại ở cả hàng nguồn lẫn hàng tổng để hai chỗ
 *  không thể cộng khác nhau. */
function sum<T>(xs: readonly T[], pick: (x: T) => number): number {
  return xs.reduce((n, x) => n + pick(x), 0)
}

/** Chia có gác mẫu số. Trả 0 khi mẫu bằng 0 — màn không có chỗ nào hiện được
 *  `NaN`, và "chưa gửi ai" đọc thành 0% là đúng nghĩa. */
function rate(top: number, bottom: number): number {
  return bottom > 0 ? top / bottom : 0
}

/** Đạt bao nhiêu phần kỳ vọng. Khác `rate` ở đúng một chỗ: KHÔNG đặt kỳ vọng
 *  thì mọi lead về đều là "đủ" — 0 trên 0 không phải là hụt, và trả 0% ở đó sẽ
 *  làm thanh tiến độ nói ngược với chấm trạng thái ngay bên cạnh. */
function hitOf(leads: number, expected: number): number {
  if (expected > 0) return leads / expected
  return leads > 0 ? 1 : 0
}

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
 *  hai tuần trả lời; cửa sổ đặt ở fixture (`WAVE_REPLY_WINDOW`) kèm test khoá,
 *  không phải một con số gõ trong màn. Đợt còn nằm ở tương lai cũng giữ chuỗi ở
 *  "đang chạy" — hôm nay kịch bản không có đợt nào như thế, nhưng chiến dịch
 *  người dùng vừa tạo thì có. */
function statusOf(lastDay: number, hasWaves: boolean): CampaignStatus {
  if (!hasWaves) return 'nhap'
  return DAY_FROZEN - lastDay <= WAVE_REPLY_WINDOW ? 'dang-chay' : 'da-xong'
}

/** Một đợt kèm phép chấm của chính nó.
 *
 *  `hit` và `hitRate` nằm ở ĐÂY chứ không ở JSX vì hai thứ trên màn đọc cùng một
 *  phép so — chấm trạng thái của mốc timeline và màu thanh tiến độ ngay dưới nó.
 *  Viết phép so hai lần trong màn là cách chắc chắn nhất để một hôm nào đó chấm
 *  xanh nằm trên thanh vàng. */
export type WaveRow = Wave & {
  /** Đợt đã đạt kỳ vọng đặt trước hay chưa. */
  hit: boolean
  /** Đạt bao nhiêu phần kỳ vọng của ĐỢT này. Trên 1 là vượt. */
  hitRate: number
}

export type SourceRow = Omit<Source, 'waves'> &
  ReturnType<typeof sourceStats> & {
    waves: WaveRow[]

    /** Mã đơn của nguồn này ĐANG CÓ MẶT trong đồ thị E1, nếu có.
     *
     *  Đây là chỗ ContextRail bám vào (luật 10): chiến dịch chưa có `ObjectKind`
     *  riêng trong E1 nên rail phải mượn một đơn mà nguồn đã kéo về. Tìm bằng
     *  code trên fixture, KHÔNG gõ cặp mã nào ra tay.
     *
     *  Lọc thêm bằng `dasVina.graph.get` chứ không lấy đơn ĐẦU TIÊN có
     *  `dealCode`: đồ thị của DAS Vina mới có bốn object (AC-0142 · CT-0391 ·
     *  OP-0288 · BG-1077), nên một đơn ngoài đồ thị chỉ làm `story()` trả rỗng —
     *  tức trường này nói "có chuỗi" trong khi không có.
     *
     *  Thực tế hôm nay: ĐÚNG MỘT trong tám nguồn ra được chuỗi thật — nguồn đã
     *  kéo chính DAS Vina về. Bảy nguồn còn lại rail rút về một chip của chính
     *  mã nguồn, giống hệt lead chưa vào pipeline ở module 2; đó là thiếu object
     *  trong đồ thị chứ không phải rail hỏng. Khi E1 có `ObjectKind` cho chiến
     *  dịch thì đưa thẳng chiến dịch vào đồ thị và bỏ đường vòng này. */
    anchorDeal?: string

    // ---- số của chuỗi đợt · cộng từ `waves`, nguồn tự nhiên thì bằng 0 -------
    /** Tổng người nhận mọi đợt. */
    sent: number
    opened: number
    replied: number
    /** Địa chỉ không nhận được, cộng mọi đợt. Xem `Wave.bounced` ở fixture: đợt
     *  đăng bài luôn 0 vì không có địa chỉ nào để dội. */
    bounced: number
    /** Tổng kỳ vọng lead mọi đợt — số đặt TRƯỚC khi chạy. */
    expected: number

    /** Lead của nguồn này đã thành cơ hội trong sổ module 3. Đây là cột cuối của
     *  bảng và là câu trả lời thật cho "chiến dịch này có ra tiền không" — mọi
     *  cột trước nó mới chỉ đo được cái phễu. */
    ops: number

    /** Lead của nguồn CHƯA qua cổng init data — `leads` trừ `good`. Đây là con
     *  số khối AI nhắm tới khi đề xuất đợt tiếp theo, nên nó là một phép trừ
     *  nghiệp vụ chứ không phải một phép trừ trang trí trong JSX. */
    notGood: number

    // ---- bốn tỉ lệ · mỗi cái trả lời đúng một câu ----------------------------
    /** Mở trên số người nhận. */
    openRate: number
    /** Trả lời trên số người nhận. */
    replyRate: number
    /** Hỏng trên số người nhận. Mẫu số ĐÚNG BẰNG mẫu số của hai tỉ lệ trên —
     *  ba cột cạnh nhau mà chia trên ba mẫu số khác nhau là ba cột không so được
     *  với nhau, và người đọc không có cách nào biết. Hệ quả phải chấp nhận:
     *  chiến dịch chạy bằng bài đăng có mẫu số phồng lên vì reach, nên tỉ lệ
     *  hỏng của nó gần 0 — cột Kênh ngay cạnh nói ra lý do. */
    bounceRate: number
    /** Qua cổng init data ở mức nào — lead tốt trên lead. Đây là tỉ lệ đắt nhất:
     *  một nguồn kéo nhiều lead mà `mqlRate` thấp là nguồn đang làm bận cả BD. */
    mqlRate: number
    /** Đạt bao nhiêu phần kỳ vọng — lead trên `expected`. Trên 1 là vượt. */
    hitRate: number
    /** Chỉ sự kiện: người đến trên người đăng ký. `null` = không phải sự kiện,
     *  KHÔNG phải "chưa ai đến". */
    attendRate: number | null

    // ---- tiền · dải giá và phân rã ------------------------------------------
    /** Dải giá mỗi lead tốt, 95%. `costPerGood` là `band.point` — cùng một số,
     *  và màn KHÔNG được hiện điểm một mình. */
    band: CostBandValue
    /** Dải đủ chắc để đứng cạnh một câu khẳng định chưa. */
    enough: boolean
    /** Vì sao chưa đủ. Rỗng khi `enough`. */
    why: string
    /** Dải viết thành chữ, cho những chỗ chỉ nhận chuỗi (hint của thẻ số). */
    bandText: string
    /** Tiền của nguồn đi đâu — năm loại L1…L5, số và tỉ trọng. Nguồn tự nhiên
     *  cho `rows` rỗng: 0 đồng tiền mặt là NỘI DUNG, không phải chỗ thiếu số. */
    costByKind: CostBreakdown

    // ---- trục thời gian của chuỗi -------------------------------------------
    startISO: string
    /** Ngày của đợt cuối. Nguồn không có đợt thì bằng chính `startDay`. */
    lastDay: number
    lastISO: string
    /** Chuỗi kéo dài bao nhiêu ngày, từ đợt đầu tới đợt cuối. */
    runDays: number
    /** Nháp · đang chạy · đã xong — xem `statusOf`. Trong kịch bản đóng băng
     *  đúng MỘT nguồn còn "đang chạy" (SK-0106, đợt cuối ngày 103), năm nguồn
     *  kia đã ra khỏi cửa sổ trả lời. `campaigns.test.ts` khoá chỗ chia này. */
    status: CampaignStatus

    /** Người theo dõi thêm, không kể chủ nguồn. Rỗng là câu trả lời hợp lệ. */
    followers: string[]
  }

/** Nguồn mồi mọi lần mở màn: nguồn đã kéo chính DAS Vina về.
 *  Suy từ `DAS_VINA_LEAD`, không gõ mã chiến dịch thẳng vào màn. */
export const ANCHOR_SOURCE =
  LEADS.find((l) => l.code === DAS_VINA_LEAD)?.source ?? SOURCES[0]?.code ?? ''

/** Nguồn mẫu của tab "Tạo mới": nguồn ĐÃ CHẠY ĐỢT và ra nhiều lead nhất trong
 *  kỳ. Chọn bằng số chứ không chỉ tay vào một mã — đổi fixture thì mẫu tự đi
 *  theo. */
const SAMPLE = [...sourcesRan()].sort((a, b) => b.leads - a.leads)[0]

/** Hôm nay của kịch bản, dạng `YYYY-MM-DD` — mốc mà mọi đợt sắp gửi đếm từ đó.
 *
 *  KHÔNG gọi `new Date()`: kịch bản đóng băng, và một form dựng lại hai lần phải
 *  mở ra đúng một ngày. */
export const TODAY = dayISO(DAY_FROZEN).slice(0, 10)

export const dayAfterToday = (n: number) => dayISO(DAY_FROZEN + n).slice(0, 10)

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

/** Nhịp mặc định khi bấm "Thêm đợt": khoảng cách giữa hai đợt cuối của nguồn
 *  mẫu, không phải một con số tròn ai đó thấy đẹp. */
export const DRAFT_STEP_DAYS = (() => {
  const w = SAMPLE?.waves ?? []
  const last = w[w.length - 1]?.day ?? 0
  const prev = w[w.length - 2]?.day ?? 0
  return Math.max(1, last - prev)
})()

/** Bản nháp mở đầu của form "Chiến dịch mới" — CHÉP NHỊP của nguồn mẫu, không
 *  phải số đo của chiến dịch mới.
 *
 *  Mọi giá trị suy từ fixture. Gõ tay "sau 14 ngày" thì đổi fixture là ô nhập
 *  nói một đằng, chuỗi đợt đã chạy nói một nẻo, mà không ai biết — và trên màn
 *  con số gõ tay trông hệt như một số đo thật.
 *
 *  Đợt MỞ MÀN mặc định "Gửi ngay": người mới soạn chiến dịch đầu tiên gần như
 *  luôn muốn nó đi ngay khi bấm chạy, và bắt họ chọn một ngày trước khi hiểu
 *  chuỗi hoạt động ra sao là bắt chọn thứ chưa có gì để chọn. */
export const DRAFT_TEMPLATE = {
  /** Nguồn được chép, để màn nói thẳng bản nháp này từ đâu ra. */
  fromCode: SAMPLE?.code ?? '',
  name: SAMPLE?.label ?? '',
  waves: (SAMPLE?.waves ?? []).map((w, i): DraftWave => {
    const gap = w.day - (SAMPLE?.waves[0]?.day ?? w.day)
    return {
      label: w.label,
      channel: w.channel,
      sendNow: i === 0,
      dateISO: dayAfterToday(gap),
      time: '09:00',
      expected: w.expected,
      content: '',
    }
  }),
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

function rowOf(s: Source): SourceRow {
  const stats = sourceStats(s.code)
  const priced = costOf(s, s.cost, stats.leads, stats.good)
  const sent = sum(s.waves, (w) => w.sent)
  const opened = sum(s.waves, (w) => w.opened)
  const replied = sum(s.waves, (w) => w.replied)
  const bounced = sum(s.waves, (w) => w.bounced)
  const expected = sum(s.waves, (w) => w.expected)
  const lastDay = s.waves.length > 0 ? Math.max(...s.waves.map((w) => w.day)) : s.startDay

  return {
    ...s,
    ...stats,
    waves: s.waves.map((w) => ({
      ...w,
      hit: w.leads >= w.expected,
      hitRate: hitOf(w.leads, w.expected),
    })),
    anchorDeal: LEADS.find(
      (l) => l.source === s.code && l.dealCode && dasVina.graph.get(l.dealCode),
    )?.dealCode,

    sent,
    opened,
    replied,
    bounced,
    expected,
    ops: opsFromSource(s.code),
    notGood: stats.leads - stats.good,

    openRate: rate(opened, sent),
    replyRate: rate(replied, sent),
    bounceRate: rate(bounced, sent),
    mqlRate: rate(stats.good, stats.leads),
    hitRate: rate(stats.leads, expected),
    attendRate: typeof s.registered === 'number' ? rate(s.checkedIn ?? 0, s.registered) : null,

    band: priced.band,
    enough: priced.enough,
    why: priced.why,
    bandText: bandText(priced.band),
    costByKind: costBreakdown(s.costLines),

    startISO: dayISO(s.startDay),
    lastDay,
    lastISO: dayISO(lastDay),
    runDays: lastDay - s.startDay,
    status: statusOf(lastDay, s.waves.length > 0),

    followers: s.followers ?? [],
  }
}

/** Sổ chiến dịch — SÁU dòng, không phải tám.
 *
 *  Hai nguồn tự nhiên (GT · TM) đứng ngoài từ 23/08: không ai chạy đợt nào cho
 *  chúng, nên không có gì để gửi, để dừng, hay để nhân bản. Mọi cột của sổ mới —
 *  người nhận, mở, trả lời, hỏng — đều rỗng ở hai dòng đó, và một dòng rỗng
 *  toàn tập đọc như lỗi tải chứ không đọc như "khách tự tìm tới". 12 lead của
 *  chúng vẫn nằm nguyên ở Sổ lead, đúng chỗ của chúng.
 *
 *  Ba nguồn `su-kien` thì Ở LẠI và đọc thành chiến dịch: chúng có chuỗi đợt, có
 *  người nhận, có mail đi ra — tức chúng trả lời đúng câu mà sổ này hỏi. Cái bị
 *  bỏ là NHÃN "sự kiện" trên màn, không phải sáu dòng dữ liệu. */
async function fetchSources(): Promise<SourceRow[]> {
  return SOURCES.filter((s) => s.kind !== 'tu-nhien').map(rowOf)
}

/** NĂM con số của hàng score card — hai ô đếm chiến dịch, ba ô đo cái phễu mail.
 *
 *  Hàng cũ có sáu ô và trộn ba câu hỏi khác nhau (nguồn · đợt · tiền). Hàng này
 *  hỏi đúng một câu và trả lời theo thứ tự người mới đọc từ trái sang: *bao
 *  nhiêu chiến dịch xong rồi · bao nhiêu còn đang chạy · gửi đi bao nhiêu · có
 *  ai mở không · có ai trả lời không.*
 *
 *  MẪU SỐ CỦA BA TỈ LỆ LÀ CÙNG MỘT SỐ (`sent`), và đó là lựa chọn phải nói ra:
 *  `sent` gộp cả reach của bài đăng LinkedIn/Facebook, nên tỉ lệ mở của cả kỳ
 *  thấp hơn tỉ lệ mở của riêng email khá nhiều. Ba tỉ lệ đứng cạnh nhau so được
 *  với nhau là thứ đáng giá hơn ba con số đẹp mà mỗi cái chia trên một tập khác.
 *  `addressed` in ra ngay dưới hàng để chỗ chênh đó không phải đoán. */
async function fetchCampaignTotals() {
  const ran = sourcesRan()
  const waves = ran.flatMap((s) => s.waves)
  /** Đợt nằm ngoài bốn kênh E4: hệ không gửi được, người tự đăng rồi nhập số về. */
  const manual = waves.filter((w) => !E4_CHANNELS.includes(w.channel))
  /** Đợt GỬI TỚI MỘT ĐỊA CHỈ — chỗ duy nhất chữ "mail" đúng nghĩa đen. */
  const addressed = waves.filter((w) => ADDRESSED_CHANNELS.includes(w.channel))

  const sent = sum(waves, (w) => w.sent)
  const opened = sum(waves, (w) => w.opened)
  const replied = sum(waves, (w) => w.replied)
  const bounced = sum(waves, (w) => w.bounced)

  /* Đếm trạng thái đi qua ĐÚNG hàm mà từng dòng bảng dùng. Đếm lại bằng một
     phép so riêng ở đây là cách chắc chắn nhất để ô "Đang chạy" nói 2 trong khi
     bảng dưới nó chỉ tô một dòng. */
  const statuses = ran.map((s) => statusOf(Math.max(...s.waves.map((w) => w.day)), true))

  return {
    /** Chiến dịch đã ra khỏi cửa sổ trả lời — coi như chốt sổ. */
    done: statuses.filter((s) => s === 'da-xong').length,
    /** Còn trong cửa sổ trả lời, hoặc còn đợt chưa tới ngày. */
    running: statuses.filter((s) => s === 'dang-chay').length,
    /** Tổng số chiến dịch của sổ. */
    campaigns: ran.length,
    /** Tổng số đợt đã gửi trong kỳ. */
    waves: waves.length,

    sent,
    opened,
    replied,
    bounced,

    openRate: rate(opened, sent),
    replyRate: rate(replied, sent),
    bounceRate: rate(bounced, sent),

    /** Phần gửi tới một địa chỉ thật, tách khỏi phần reach của bài đăng và số
     *  người quét mã tại chỗ. Đây là chỗ chênh mà ba tỉ lệ ở trên đang gánh. */
    addressed: {
      sent: sum(addressed, (w) => w.sent),
      waves: addressed.length,
    },

    /** Đợt nằm ngoài bốn kênh E4 — không có đường gửi thật, người phải tự đăng.
     *  Đây là nợ treo số 2 hiện ra thành một con số đếm được. */
    manualWaves: manual.length,
    manualSent: sum(manual, (w) => w.sent),

    /** Cơ hội sáu chiến dịch này đẻ ra, trên cả sổ cơ hội của kỳ. Chỗ chênh là
     *  khách tự tìm tới — không chiến dịch nào được ghi công. */
    ops: sum(ran, (s) => opsFromSource(s.code)),
    opsBook: OPPORTUNITIES.length,

    /** Hai nguồn tự nhiên đã ra khỏi sổ này (xem `fetchSources`) — số lead của
     *  chúng vẫn phải nói ra một lần, không thì sáu dòng đọc như cả kỳ. */
    natural: {
      count: SOURCES.filter((s) => s.kind === 'tu-nhien').length,
      leads: sum(
        SOURCES.filter((s) => s.kind === 'tu-nhien'),
        (s) => s.leads,
      ),
    },

    /** Kỳ của kịch bản: 01/05 → ngày đóng băng. Suy từ `DAY_FROZEN`. */
    period: { fromISO: dayISO(0), toISO: dayISO(DAY_FROZEN) },
  }
}

export type CampaignTotals = Awaited<ReturnType<typeof fetchCampaignTotals>>

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
  { key: 'tra-loi', compare: (a: SourceRow, b: SourceRow) => a.replyRate - b.replyRate },
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
    if (win !== null && DAY_FROZEN - r.startDay > win) return false
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

/** Hai query, MỘT mức quyền: cả hai đọc cùng một sổ chiến dịch, chỉ khác lát
 *  cắt. Cho chúng hai mức khác nhau là mở đường cho một màn hiện tổng mà không
 *  hiện được dòng nào. */
const CAMPAIGN_ACCESS = { branch: 'Sales', permission: 'chiến-dịch.xem' } as const

export const sourcesQuery = queryOptions({
  queryKey: ['sales', 'sources'] as const,
  queryFn: () =>
    api.read('/sales/campaigns/sources', { need: CAMPAIGN_ACCESS, load: fetchSources }),
})

export const campaignTotalsQuery = queryOptions({
  queryKey: ['sales', 'campaign-totals'] as const,
  queryFn: () =>
    api.read('/sales/campaigns/totals', { need: CAMPAIGN_ACCESS, load: fetchCampaignTotals }),
})
