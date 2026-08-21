import { queryOptions } from '@tanstack/react-query'
import { millions } from '@pv/ui'
import { costBand, type CostBandValue } from '@pv/engines'
import {
  DAS_VINA_LEAD,
  DAY_FROZEN,
  LEADS,
  OPEN_DEALS,
  SOURCES,
  costOfGoodLead,
  dasVina,
  dayISO,
  sourceStats,
  sourcesRan,
  type Source,
  type Wave,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { E4_CHANNELS } from '@/data/sales-config'
import { bandText, costBreakdown, costOf, type CostBreakdown } from '@/data/source-cost'

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

/** Tiền của các đơn ĐANG MỞ, tra theo mã. `OPEN_DEALS` là chỗ duy nhất trong
 *  kịch bản có `amount`. */
const DEAL_AMOUNT = new Map(OPEN_DEALS.map((d) => [d.code, d.amount]))

/** Nhãn và căn cứ của cột "giá trị" — để màn gọi đúng tên thứ nó đang cộng.
 *
 *  Kịch bản DAS Vina KHÔNG có tiền của hợp đồng đã ký: sáu dòng `contractCode`
 *  chỉ có mã, không có số. Vì thế giá trị của một nguồn chỉ tính được từ các đơn
 *  đang mở mà lead của nguồn đó kéo tới — nó là **cơ hội đang treo**, không phải
 *  doanh thu đã về. Bịa tiền cho sáu hợp đồng kia thì màn có một cột đẹp và một
 *  con số không ai ký. Màn phải nói ra chỗ thiếu này. */
export const OPEN_VALUE = {
  label: 'Giá trị đơn đang mở',
  /** Bản ngắn cho header cột — ô hẹp 0.9fr không chứa nổi nhãn đầy đủ. */
  shortLabel: 'Giá trị đơn mở',
  /** Số đơn đang mở đang được cộng vào cột này. */
  deals: OPEN_DEALS.length,
  /** Hợp đồng đã ký trong kỳ — có mã, KHÔNG có tiền trong kịch bản. */
  signedDeals: LEADS.filter((l) => l.contractCode).length,
  signedHasAmount: false,
} as const

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
    /** Tổng kỳ vọng lead mọi đợt — số đặt TRƯỚC khi chạy. */
    expected: number

    /** Lead của nguồn CHƯA qua cổng init data — `leads` trừ `good`. Đây là con
     *  số khối AI nhắm tới khi đề xuất đợt tiếp theo, nên nó là một phép trừ
     *  nghiệp vụ chứ không phải một phép trừ trang trí trong JSX. */
    notGood: number

    // ---- bốn tỉ lệ · mỗi cái trả lời đúng một câu ----------------------------
    /** Mở trên số người nhận. */
    openRate: number
    /** Trả lời trên số người nhận. */
    replyRate: number
    /** Qua cổng init data ở mức nào — lead tốt trên lead. Đây là tỉ lệ đắt nhất:
     *  một nguồn kéo nhiều lead mà `mqlRate` thấp là nguồn đang làm bận cả BD. */
    mqlRate: number
    /** Đạt bao nhiêu phần kỳ vọng — lead trên `expected`. Trên 1 là vượt. */
    hitRate: number
    /** Chỉ sự kiện: người đến trên người đăng ký. `null` = không phải sự kiện,
     *  KHÔNG phải "chưa ai đến". */
    attendRate: number | null

    /** Tiền của các đơn đang mở mà nguồn này kéo về — xem `OPEN_VALUE`. */
    value: number

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
    /** Chuỗi đợt đã chạy hết trước ngày đóng băng.
     *
     *  Nguồn tự nhiên luôn `false`: nó không có chuỗi nào để chạy hết, và gọi
     *  "khách cũ giới thiệu" là đã xong thì sai hẳn nghĩa.
     *
     *  Trong kịch bản đóng băng này CẢ SÁU nguồn có đợt đều `true` — đợt cuối
     *  muộn nhất rơi vào ngày 103, trước mốc 108. Đừng dựng phần giao diện chỉ
     *  hiện được khi có nguồn `false`, hôm nay không có nguồn nào như thế. */
    finished: boolean

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

/** Sự kiện đông lead nhất — chỉ dùng để gợi ý ô địa điểm. */
const SAMPLE_EVENT = [...SOURCES].filter((s) => s.venue).sort((a, b) => b.leads - a.leads)[0]

export type DraftWave = {
  label: string
  channel: WaveChannel
  afterDays: number
  /** Kỳ vọng lead của đợt — ô bắt buộc của form, chép từ đợt tương ứng của
   *  nguồn mẫu. Người soạn sửa được, nhưng không được để trống: chiến dịch
   *  không có kỳ vọng thì sau này không chấm được là đạt hay hụt. */
  expected: number
  /** Nội dung đợt, HTML. Mở đầu là chuỗi RỖNG — kịch bản đóng băng không có bài
   *  nào đã soạn, và một đoạn văn mẫu sinh ra ở tầng dữ liệu sẽ trông y hệt nội
   *  dung thật trên màn. Ô trống là câu trả lời đúng. */
  content: string
}

/** Bản nháp mở đầu của tab "Tạo mới" — CHÉP NHỊP của nguồn mẫu, không phải số
 *  đo của chiến dịch mới.
 *
 *  Mọi giá trị suy từ fixture. Gõ tay "1200 người nhận" hay "sau 14 ngày" thì
 *  đổi fixture là ô nhập nói một đằng, chuỗi đợt đã chạy nói một nẻo, mà không
 *  ai biết — và trên màn con số gõ tay trông hệt như một số đo thật. */
export const DRAFT_TEMPLATE = {
  /** Nguồn được chép, để màn nói thẳng bản nháp này từ đâu ra. */
  fromCode: SAMPLE?.code ?? '',
  name: SAMPLE?.label ?? '',
  venue: SAMPLE_EVENT?.venue ?? '',
  /** Số người nhận của đợt mở màn nguồn mẫu — điểm xuất phát để người soạn sửa. */
  audience: SAMPLE?.waves[0]?.sent ?? 0,
  /** KHÔNG có `runDays`: chuỗi dài bao nhiêu ngày là thứ SUY RA từ nhịp các đợt,
   *  không phải một ô người soạn gõ riêng. Giữ cả hai thì hai con số chọi nhau
   *  ngay trên cùng một màn mà không ai cảnh báo. Form tính lại từ `afterDays`. */
  waves: (SAMPLE?.waves ?? []).map((w): DraftWave => ({
    label: w.label,
    channel: w.channel,
    afterDays: w.day - (SAMPLE?.waves[0]?.day ?? w.day),
    expected: w.expected,
    content: '',
  })),
}

/** Nhịp mặc định khi bấm "Thêm đợt": khoảng cách giữa hai đợt cuối của nguồn
 *  mẫu, không phải một con số tròn ai đó thấy đẹp. */
export const DRAFT_STEP_DAYS = (() => {
  const w = DRAFT_TEMPLATE.waves
  const last = w[w.length - 1]?.afterDays ?? 0
  const prev = w[w.length - 2]?.afterDays ?? 0
  return Math.max(1, last - prev)
})()

/** Tiền của các đơn đang mở mà lead của nguồn này đang trỏ tới. Đi qua
 *  `dealCode` của lead chứ không đoán theo tên công ty. */
function openValueOf(code: string): number {
  return sum(
    LEADS.filter((l) => l.source === code),
    (l) => (l.dealCode ? (DEAL_AMOUNT.get(l.dealCode) ?? 0) : 0),
  )
}

function rowOf(s: Source): SourceRow {
  const stats = sourceStats(s.code)
  const priced = costOf(s, s.cost, stats.leads, stats.good)
  const sent = sum(s.waves, (w) => w.sent)
  const opened = sum(s.waves, (w) => w.opened)
  const replied = sum(s.waves, (w) => w.replied)
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
    expected,
    notGood: stats.leads - stats.good,

    openRate: rate(opened, sent),
    replyRate: rate(replied, sent),
    mqlRate: rate(stats.good, stats.leads),
    hitRate: rate(stats.leads, expected),
    attendRate: typeof s.registered === 'number' ? rate(s.checkedIn ?? 0, s.registered) : null,

    value: openValueOf(s.code),

    band: priced.band,
    enough: priced.enough,
    why: priced.why,
    bandText: bandText(priced.band),
    costByKind: costBreakdown(s.costLines),

    startISO: dayISO(s.startDay),
    lastDay,
    lastISO: dayISO(lastDay),
    runDays: lastDay - s.startDay,
    finished: s.waves.length > 0 && lastDay < DAY_FROZEN,

    followers: s.followers ?? [],
  }
}

async function fetchSources(): Promise<SourceRow[]> {
  return SOURCES.map(rowOf)
}

/** Số của CẢ KỲ cho hàng score card — đo CHIẾN DỊCH, không đo lead.
 *
 *  Phần cộng theo đợt (`sent` … `expected`, `leads`, `good`, `cost`) chỉ lấy các
 *  nguồn CÓ ĐỢT. Đó là lý do `leads` ở đây là 88 chứ không phải 100: 12 lead còn
 *  lại đến từ hai nguồn tự nhiên, không đợt nào kéo chúng về nên không đợt nào
 *  được ghi công. Cộng chúng vào thì `hitRate` đội lên bằng số không có ai làm.
 *  Chỗ chênh không để người đọc tự trừ: `natural` và `bookLeads` nói thẳng ra
 *  ngay dưới hàng KPI. Thao tác trên chính 100 dòng đó vẫn là việc của module 2. */
async function fetchCampaignTotals() {
  /* Phạm vi xin ở fixture, không tự lọc — "giá mỗi lead tốt" là nhãn dùng chung
     ba màn và mỗi màn tự chọn tập nguồn là cách chắc chắn để ba màn hiện ba con
     số dưới một chữ. Xem `costOfGoodLead` ở `das-vina.ts`. */
  const running = sourcesRan()
  const waves = running.flatMap((s) => s.waves)
  const events = SOURCES.filter((s) => s.kind === 'su-kien')
  const natural = SOURCES.filter((s) => s.kind === 'tu-nhien')
  /** Đợt nằm ngoài bốn kênh E4: hệ không gửi được, người tự đăng rồi nhập số về. */
  const manual = waves.filter((w) => !E4_CHANNELS.includes(w.channel))

  const sent = sum(waves, (w) => w.sent)
  const opened = sum(waves, (w) => w.opened)
  const replied = sum(waves, (w) => w.replied)
  const expected = sum(waves, (w) => w.expected)
  const leads = sum(running, (s) => s.leads)
  const spend = costOfGoodLead(running)

  const registered = sum(events, (s) => s.registered ?? 0)
  const checkedIn = sum(events, (s) => s.checkedIn ?? 0)

  /** Lead của CẢ SỔ — tám nguồn cộng lại, đúng bậc đầu của phễu. Số này thuộc
   *  module 2; ở đây có mặt để màn nói thẳng chỗ chênh với `leads` thay vì bắt
   *  người đọc tự trừ hai con số nằm cách nhau nửa màn. */
  const bookLeads = sum(SOURCES, (s) => s.leads)

  return {
    /** Nguồn có đợt — tức có người chạy. */
    running: running.length,
    /** Tổng số nguồn, kể cả nguồn tự nhiên không ai chạy. */
    sources: SOURCES.length,
    /** Tổng số đợt đã gửi trong kỳ. */
    waves: waves.length,

    sent,
    opened,
    replied,
    leads,
    good: spend.good,
    expected,

    openRate: rate(opened, sent),
    replyRate: rate(replied, sent),
    /** Đạt bao nhiêu phần kỳ vọng của cả kỳ. */
    hitRate: rate(leads, expected),

    cost: spend.cost,
    /** Giá mỗi lead tốt của cả kỳ. `null` khi chưa có lead tốt nào. */
    costPerGood: spend.perGood,
    /** Nhãn khai PHẠM VI của ô trên. Cùng chữ "chi phí mỗi lead tốt" mà màn Kế
     *  hoạch đọc trên nguồn CÓ TIÊU TIỀN, màn Performance đọc trên nguồn CỦA
     *  MARKETING; không nói ra tập nào thì ba con số trông như một. Chuỗi ở
     *  tầng dữ liệu chứ không ở JSX, vì nó phải đổi cùng lúc với phép lọc. */
    costPerGoodHint: `${running.length} nguồn đã chạy đợt · đã tiêu ${millions(spend.cost)} · dải ${bandText(costBand(spend.cost, spend.good, leads))}`,

    /** Sự kiện có mặt người thật — mục 1.3. */
    events: events.length,
    registered,
    checkedIn,
    /** Người đến trên người đăng ký, gộp mọi sự kiện. `null` khi chưa có ai
     *  đăng ký — không quy về 0, vì hai chuyện đó khác nhau. */
    attendRate: registered > 0 ? checkedIn / registered : null,

    /** Đợt nằm ngoài bốn kênh E4 — không có đường gửi thật, người phải tự đăng.
     *  Đây là nợ treo số 2 hiện ra thành một con số đếm được. */
    manualWaves: manual.length,
    /** Lượt gửi của riêng các đợt tự đăng. Hơn nửa `sent` của cả kỳ nằm ở đây,
     *  và đó là số NGƯỜI TỰ NHẬP chứ không phải số hệ đo được — hàng KPI phải
     *  nói ra, nếu không cả ba ô tiếp cận/mở/trả lời đều mượn uy tín của một
     *  con số không ai kiểm được. */
    manualSent: sum(manual, (w) => w.sent),

    /** Nguồn tự nhiên: không ai chạy đợt nào nên không đợt nào được ghi công.
     *  `leads` ở đây là CHỖ CHÊNH giữa cả sổ và phần các đợt kéo về. */
    natural: { count: natural.length, leads: bookLeads - leads },
    /** Cả sổ lead của kỳ — 100 dòng, thuộc module 2. */
    bookLeads,

    /** Kỳ của kịch bản: 01/05 → ngày đóng băng. Suy từ `DAY_FROZEN`. */
    period: { fromISO: dayISO(0), toISO: dayISO(DAY_FROZEN) },
  }
}

export type CampaignTotals = Awaited<ReturnType<typeof fetchCampaignTotals>>

export type SourceSort = {
  key: string
  compare: (a: SourceRow, b: SourceRow) => number
}

/** Bộ sắp xếp của danh sách: theo ngày · theo tỉ lệ MQL · theo giá trị.
 *
 *  `compare` là hàm so sánh THUẦN, luôn tăng dần. Màn giữ hướng riêng (mặc định
 *  `desc` — mới nhất, cao nhất lên trước) và tự `reverse`; nhét hướng vào đây
 *  thì mỗi mục phải có hai bản và hai bản đó sẽ lệch nhau.
 *
 *  KHÔNG có `label`: sắp xếp đã dời vào header cột, mà header cột tự mang tên
 *  của nó. Một nhãn "Theo ngày" không chỗ nào hiện là một nhãn sẽ trôi khỏi tên
 *  cột mà không ai biết. */
export const SOURCE_SORTS = [
  {
    key: 'ngay',
    compare: (a: SourceRow, b: SourceRow) => a.startDay - b.startDay,
  },
  {
    key: 'mql',
    compare: (a: SourceRow, b: SourceRow) => a.mqlRate - b.mqlRate,
  },
  {
    key: 'gia-tri',
    compare: (a: SourceRow, b: SourceRow) => a.value - b.value,
  },
] as const satisfies readonly SourceSort[]

export type SourceSortKey = (typeof SOURCE_SORTS)[number]['key']

export const sourcesQuery = queryOptions({
  queryKey: ['sales', 'sources'] as const,
  queryFn: fetchSources,
})

export const campaignTotalsQuery = queryOptions({
  queryKey: ['sales', 'campaign-totals'] as const,
  queryFn: fetchCampaignTotals,
})
