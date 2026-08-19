import { queryOptions } from '@tanstack/react-query'
import {
  DAS_VINA_LEAD,
  DAY_FROZEN,
  LEADS,
  OPEN_DEALS,
  SOURCES,
  dasVina,
  dayISO,
  sourceStats,
  type Lead,
  type Source,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { E4_CHANNELS } from '@/data/sales-config'

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
  /** Số đơn đang mở đang được cộng vào cột này. */
  deals: OPEN_DEALS.length,
  /** Hợp đồng đã ký trong kỳ — có mã, KHÔNG có tiền trong kịch bản. */
  signedDeals: LEADS.filter((l) => l.contractCode).length,
  signedHasAmount: false,
} as const

export type SourceRow = Source &
  ReturnType<typeof sourceStats> & {
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

    // ---- năm tỉ lệ · mỗi cái trả lời đúng một câu ----------------------------
    /** Mở trên số người nhận. */
    openRate: number
    /** Trả lời trên số người nhận. */
    replyRate: number
    /** Chạm được người rồi thì ra khách ở mức nào — lead trên người trả lời. */
    leadRate: number
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
const SAMPLE = [...SOURCES].filter((s) => s.waves.length > 0).sort((a, b) => b.leads - a.leads)[0]

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
  /** Chuỗi chạy trong bao nhiêu ngày — khoảng từ đợt đầu tới đợt cuối của nguồn
   *  mẫu. Đây là ô "đặt sẵn chạy bao lâu" của form: người soạn thấy ngay chuỗi
   *  này dài bằng chuỗi đã chạy thật, không phải một con số tròn. */
  runDays: (() => {
    const w = SAMPLE?.waves ?? []
    const first = w[0]?.day ?? 0
    return (w[w.length - 1]?.day ?? first) - first
  })(),
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
  const sent = sum(s.waves, (w) => w.sent)
  const opened = sum(s.waves, (w) => w.opened)
  const replied = sum(s.waves, (w) => w.replied)
  const expected = sum(s.waves, (w) => w.expected)
  const lastDay = s.waves.length > 0 ? Math.max(...s.waves.map((w) => w.day)) : s.startDay

  return {
    ...s,
    ...stats,
    anchorDeal: LEADS.find(
      (l) => l.source === s.code && l.dealCode && dasVina.graph.get(l.dealCode),
    )?.dealCode,

    sent,
    opened,
    replied,
    expected,

    openRate: rate(opened, sent),
    replyRate: rate(replied, sent),
    leadRate: rate(stats.leads, replied),
    mqlRate: rate(stats.good, stats.leads),
    hitRate: rate(stats.leads, expected),
    attendRate: typeof s.registered === 'number' ? rate(s.checkedIn ?? 0, s.registered) : null,

    value: openValueOf(s.code),

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

async function fetchLeadsOfSource(code: string): Promise<Lead[]> {
  return LEADS.filter((l) => l.source === code)
}

/** Số của CẢ KỲ cho hàng score card — đo CHIẾN DỊCH, không đo lead.
 *
 *  Phần cộng theo đợt (`sent` … `expected`, `leads`, `good`, `cost`) chỉ lấy các
 *  nguồn CÓ ĐỢT. Đó là lý do `leads` ở đây là 88 chứ không phải 100: 12 lead còn
 *  lại đến từ hai nguồn tự nhiên, không đợt nào kéo chúng về nên không đợt nào
 *  được ghi công. Cộng chúng vào thì `leadRate` và `hitRate` đều đội lên bằng số
 *  không có ai làm. Chỗ chênh nói ra được bằng `sources` trừ `running`; con số
 *  100 của cả sổ nằm ở module 2, đúng chỗ của nó. */
async function fetchCampaignTotals() {
  const running = SOURCES.filter((s) => s.waves.length > 0)
  const waves = running.flatMap((s) => s.waves)
  const events = SOURCES.filter((s) => s.kind === 'su-kien')

  const sent = sum(waves, (w) => w.sent)
  const opened = sum(waves, (w) => w.opened)
  const replied = sum(waves, (w) => w.replied)
  const expected = sum(waves, (w) => w.expected)
  const leads = sum(running, (s) => s.leads)
  const good = sum(running, (s) => sourceStats(s.code).good)
  const cost = sum(running, (s) => s.cost)

  const registered = sum(events, (s) => s.registered ?? 0)
  const checkedIn = sum(events, (s) => s.checkedIn ?? 0)

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
    good,
    expected,

    openRate: rate(opened, sent),
    replyRate: rate(replied, sent),
    leadRate: rate(leads, replied),
    /** Đạt bao nhiêu phần kỳ vọng của cả kỳ. */
    hitRate: rate(leads, expected),

    cost,
    /** Giá mỗi lead tốt của cả kỳ. `null` khi chưa có lead tốt nào. */
    costPerGood: good > 0 ? Math.round(cost / good) : null,

    /** Sự kiện có mặt người thật — mục 1.3. */
    events: events.length,
    registered,
    checkedIn,
    /** Người đến trên người đăng ký, gộp mọi sự kiện. `null` khi chưa có ai
     *  đăng ký — không quy về 0, vì hai chuyện đó khác nhau. */
    attendRate: registered > 0 ? checkedIn / registered : null,

    /** Đợt nằm ngoài bốn kênh E4 — không có đường gửi thật, người phải tự đăng.
     *  Đây là nợ treo số 2 hiện ra thành một con số đếm được. */
    manualWaves: waves.filter((w) => !E4_CHANNELS.includes(w.channel)).length,

    /** Kỳ của kịch bản: 01/05 → ngày đóng băng. Suy từ `DAY_FROZEN`. */
    period: { fromISO: dayISO(0), toISO: dayISO(DAY_FROZEN) },
  }
}

export type CampaignTotals = Awaited<ReturnType<typeof fetchCampaignTotals>>

export type SourceSort = {
  key: string
  label: string
  compare: (a: SourceRow, b: SourceRow) => number
}

/** Bộ sắp xếp của danh sách: theo ngày · theo tỉ lệ MQL · theo giá trị.
 *
 *  `compare` là hàm so sánh THUẦN, luôn tăng dần. Màn giữ hướng riêng (mặc định
 *  `desc` — mới nhất, cao nhất lên trước) và tự `reverse`; nhét hướng vào đây
 *  thì mỗi mục phải có hai bản và hai bản đó sẽ lệch nhau. */
export const SOURCE_SORTS = [
  {
    key: 'ngay',
    label: 'Theo ngày',
    compare: (a: SourceRow, b: SourceRow) => a.startDay - b.startDay,
  },
  {
    key: 'mql',
    label: 'Theo tỉ lệ MQL',
    compare: (a: SourceRow, b: SourceRow) => a.mqlRate - b.mqlRate,
  },
  {
    key: 'gia-tri',
    label: 'Theo giá trị',
    compare: (a: SourceRow, b: SourceRow) => a.value - b.value,
  },
] as const satisfies readonly SourceSort[]

export type SourceSortKey = (typeof SOURCE_SORTS)[number]['key']

export const sourcesQuery = queryOptions({
  queryKey: ['sales', 'sources'] as const,
  queryFn: fetchSources,
})

export const sourceLeadsQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'sources', code, 'leads'] as const,
    queryFn: () => fetchLeadsOfSource(code),
  })

export const campaignTotalsQuery = queryOptions({
  queryKey: ['sales', 'campaign-totals'] as const,
  queryFn: fetchCampaignTotals,
})
