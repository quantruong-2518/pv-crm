import { millions } from '@pv/ui'
import { costBand, separableCost, wilson, type CostBandValue } from '@pv/engines'
import {
  sourceStats,
  sourcesPaid,
  SOURCES,
  type CostKind,
  type CostLine,
} from '@pv/engines/fixtures/das-vina'

/** Tiền của một nguồn lead — dải giá, xếp hạng, phân rã theo loại, phép cắt kỳ.
 *  Kịch bản 2 · DAS Vina. Nền toán ở `@pv/engines` (`stats.ts`), số ở fixture;
 *  file này chỉ ghép hai thứ đó lại thành thứ ba màn cùng đọc.
 *
 *  --------------------------------------------------------------------------
 *  PHÂN BIỆT SỐNG CÒN — `separable` và `separableCost` KHÔNG thay nhau được
 *  --------------------------------------------------------------------------
 *  `separable` so hai khoảng Wilson của **TỈ LỆ**: trên tám nguồn của kịch bản
 *  này nó trả `false` cho **mọi** cặp. Nghĩa là không màn nào được nói nguồn
 *  nào ra lead tốt giỏi hơn nguồn nào — chưa có bằng chứng nào cho chuyện đó.
 *
 *  `separableCost` so hai dải **TIỀN**: 5 trong 15 cặp của sáu nguồn có tiêu
 *  tiền tách được, vì `cost` là số biết chắc và nó chênh nhau tới 24 lần, chỉ
 *  mẫu số mới ngẫu nhiên. Câu "A rẻ hơn B" đứng trên hàm này, không đứng trên
 *  `separable`.
 *
 *  --------------------------------------------------------------------------
 *  XẾP HẠNG THEO ĐIỂM, HIỆN DẢI, CHẶN CÂU KHẲNG ĐỊNH
 *  --------------------------------------------------------------------------
 *  Quyết định D-03: bảng vẫn xếp theo ĐIỂM như hôm nay, mỗi dòng hiện DẢI, và
 *  thứ bị chặn là **câu chữ** chứ không phải thứ tự. Bản này KHÔNG xếp theo cận
 *  trên, cũng KHÔNG loại nguồn trượt cổng khỏi bảng: một nguồn biến mất vì cỡ
 *  mẫu nhỏ là một nguồn không ai còn nhớ để hỏi. Nó ở lại với `enough = false`,
 *  và mọi câu so sánh dính tới nó thì im.
 *
 *  Con số nào cũng suy từ fixture. File này KHÔNG giữ bản sao hằng số nào của
 *  kịch bản — ba ngưỡng ở `ENOUGH_GATE` là luật HIỂN THỊ, không phải
 *  số đo của DAS Vina. */

/** Nhãn tiếng Việt của năm loại chi tiền mặt (luật 14 · tên khoá không lên màn).
 *
 *  `Record<CostKind, …>` là exhaustive: thêm loại thứ sáu vào fixture mà quên
 *  đặt nhãn thì `pnpm typecheck` đỏ, không phải một ô trống trên bảng. */
export const COST_KIND_LABEL: Record<CostKind, string> = {
  'du-lieu': 'Dữ liệu',
  kenh: 'Kênh',
  'noi-dung': 'Nội dung',
  'su-kien': 'Sự kiện',
  'cong-cu': 'Công cụ',
}

/** Thứ tự đọc L1…L5 — dữ liệu trước, công cụ sau.
 *  KHÔNG xếp theo bảng chữ cái và KHÔNG xếp theo số tiền: bảng của
 *  hai nguồn khác nhau phải đọc được cạnh nhau, mà thứ tự chạy theo tiền thì
 *  mỗi nguồn một kiểu. */
export const COST_KINDS = [
  'du-lieu',
  'kenh',
  'noi-dung',
  'su-kien',
  'cong-cu',
] as const satisfies readonly CostKind[]

/** Ba cổng chặn câu khẳng định. Vượt bất kỳ cổng nào
 *  thì dải vẫn HIỆN, nhưng nó không được đứng cạnh một câu khẳng định.
 *
 *  Đây là luật hiển thị, không phải số đo — vì thế nó ở tầng app chứ không ở
 *  fixture. Đổi ngưỡng là đổi mức thận trọng của giao diện, không đổi dữ liệu. */
export const ENOUGH_GATE = { minGood: 3, minLeads: 5, maxStretch: 3 } as const

/** Một chữ số thập phân, dấu phẩy kiểu VN. Số đếm thì không có phần thập phân,
 *  nên helper này chỉ dùng cho bội số và độ giãn. */
function oneDecimal(value: number): string {
  return value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Làm tròn XUỐNG một chữ số thập phân. Câu "ít nhất N lần" mà làm tròn LÊN thì
 *  con số in ra mạnh hơn con số chứng minh được: 3,276 làm tròn thường ra 3,3 —
 *  tức khẳng định thừa 0,024 lần không ai đo. Xuống thì câu luôn đứng vững. */
function floorOneDecimal(value: number): number {
  return Math.floor(value * 10) / 10
}

/** Tiền và dải giá của MỘT nguồn, trong MỘT phạm vi. */
export type SourceCost = {
  code: string
  label: string
  /** Tiền mặt của phạm vi đang xét, đồng. */
  cost: number
  leads: number
  good: number
  /** `lo` rẻ nhất còn hợp lý · `point` số hôm nay · `hi` đắt nhất còn hợp lý.
   *  `point`/`hi` là `null` khi nguồn chưa ra lead tốt nào — xem `costBand`. */
  band: CostBandValue
  /** Dải này có đủ chắc để đứng cạnh một câu khẳng định không. Dòng vẫn
   *  ở lại bảng khi `false`; thứ bị chặn là câu chữ. */
  enough: boolean
  /** Vì sao chưa đủ, một mệnh đề đọc được. Rỗng khi `enough`. */
  why: string
  /** Nguồn không tiêu đồng tiền mặt nào. 0 ở đây là NỘI DUNG ("không tốn tiền
   *  mặt"), không phải chỗ thiếu số — và vì thế nó đứng ngoài bảng so giá: một
   *  bảng có nó thì nguồn rẻ nhất vĩnh viễn là thứ không mua thêm được. */
  cashless: boolean
}

/** Độ giãn `p̂ / p_dưới` — cận dưới cách điểm bao nhiêu lần. `Infinity` khi
 *  `p_dưới = 0`, tức khi nguồn chưa có lead tốt nào. */
function stretchOf(x: number, n: number): number {
  const w = wilson(x, n)
  return w.lo > 0 ? w.p / w.lo : Number.POSITIVE_INFINITY
}

/** Dải giá của một nguồn với số tiền TRUYỀN VÀO, không tự đọc `Source.cost`.
 *
 *  Tham số `cost` rời ra vì màn Performance cắt chi phí theo kỳ: cùng một nguồn,
 *  cùng `leads`/`good` của kỳ, nhưng tử số là phần tiền tiêu TRONG kỳ. Hàm này
 *  không được biết kỳ nào, nó chỉ chia. */
export function costOf(
  src: { code: string; label: string },
  cost: number,
  leads: number,
  good: number,
): SourceCost {
  const stretch = stretchOf(good, leads)
  const why: string[] = []
  if (good < ENOUGH_GATE.minGood) why.push(`mới ${good} lead tốt`)
  if (leads < ENOUGH_GATE.minLeads) why.push(`mới ${leads} lead`)
  if (!(stretch <= ENOUGH_GATE.maxStretch)) {
    why.push(
      Number.isFinite(stretch) ? `dải giãn ${oneDecimal(stretch)} lần` : 'chưa có lead tốt nào',
    )
  }

  return {
    code: src.code,
    label: src.label,
    cost,
    leads,
    good,
    band: costBand(cost, good, leads),
    enough: why.length === 0,
    why: why.join(' · '),
    cashless: cost === 0,
  }
}

/** Dải giá cả kỳ của một nguồn, đọc thẳng `Source.cost` và sổ lead. */
export function sourceCost(code: string): SourceCost | null {
  const stats = sourceStats(code)
  const src = stats.source
  if (!src) return null
  return costOf(src, src.cost, stats.leads, stats.good)
}

/** Dải giá viết thành chữ, dùng cho dòng "Căn cứ" và cho hint của thẻ số — hai
 *  chỗ chỉ nhận chuỗi.
 *
 *  Đầu đắt `null` (nguồn chưa có lead tốt nào) in thành "chưa có cận trên" chứ
 *  KHÔNG in vô cực và cũng không im lặng bỏ đầu đó đi: một dải mất đầu phải nói
 *  ra là nó mất đầu. */
export function bandText(band: CostBandValue): string {
  /* Dải rỗng — không lead nào trong kỳ. "từ 0,0 tr trở lên" là khẳng định một
     sàn giá bằng 0 cho thứ chưa đo được; cùng lỗi mà `CostBand` chặn ở tầng vẽ,
     chặn lại ở tầng chữ vì hai tầng này không gọi lẫn nhau. */
  if (band.point === null && band.lo === 0 && band.hi === null) return 'chưa đo được trong kỳ này'
  if (band.hi === null) return `từ ${millions(band.lo)}, chưa có cận trên`
  return `${millions(band.lo)} – ${millions(band.hi)}`
}

export type Ranking = {
  /** Nguồn CÓ TIÊU TIỀN, rẻ nhất lên đầu — xếp theo ĐIỂM (D-03). Nguồn cỡ mẫu
   *  nhỏ VẪN ở đây, mang `enough = false`. */
  ranked: SourceCost[]
  /** Nguồn 0 đồng tiền mặt — khối riêng, không xếp chung. */
  cashless: SourceCost[]
}

/** Nơi DUY NHẤT sinh thứ hạng nguồn theo giá. Ba màn đọc cùng hàm này; màn nào
 *  tự sắp lấy là ba màn cho ba thứ hạng dưới một nhãn. */
export function rankSources(): Ranking {
  const paid = new Set(sourcesPaid().map((s) => s.code))
  const all = SOURCES.map((s) => sourceCost(s.code)).filter((r): r is SourceCost => r !== null)

  const ranked = all
    .filter((r) => paid.has(r.code))
    .sort(
      (a, b) =>
        (a.band.point ?? Number.POSITIVE_INFINITY) - (b.band.point ?? Number.POSITIVE_INFINITY) ||
        a.code.localeCompare(b.code),
    )

  return { ranked, cashless: all.filter((r) => !paid.has(r.code)) }
}

/** Hai nguồn có được phép nói "A rẻ hơn B" không, và rẻ hơn ÍT NHẤT bao nhiêu.
 *
 *  `null` = hai dải chồng nhau → màn phải đổi sang câu trung tính nói cả hai
 *  dải. Bội số là `dear.lo / cheap.hi`, tức khoảng cách hẹp nhất còn hợp lý —
 *  KHÔNG bao giờ là tỉ số hai điểm. Tỉ số hai điểm của CD-0101 và SK-0106 là 24
 *  lần; thứ chứng minh được chỉ là 6,6 lần. */
export type CostGap = {
  cheap: SourceCost
  dear: SourceCost
  /** Bội số đã làm tròn XUỐNG một chữ số — số dùng cho câu "ít nhất N lần". */
  times: number
  /** Cùng số đó, đã format kiểu VN. */
  timesText: string
}

export function costGap(a: SourceCost, b: SourceCost): CostGap | null {
  /* Cỡ mẫu mỏng thì không phát câu khẳng định, kể cả khi hai dải tình cờ rời
     nhau. Bảng đã gắn "chưa đủ để so" lên dòng đó; một câu so sánh dựa vào
     chính dòng ấy là hai chỗ trên cùng màn nói ngược nhau. */
  if (!a.enough || !b.enough) return null

  const rate = (r: SourceCost) => ({ cost: r.cost, x: r.good, n: r.leads })
  if (!separableCost(rate(a), rate(b))) return null

  const aCheaper = a.band.hi !== null && a.band.hi < b.band.lo
  const cheap = aCheaper ? a : b
  const dear = aCheaper ? b : a
  const hi = cheap.band.hi
  if (hi === null || hi <= 0) return null

  const times = floorOneDecimal(dear.band.lo / hi)
  return { cheap, dear, times, timesText: oneDecimal(times) }
}

/** Một loại chi của một nguồn, kèm tỉ trọng trong tổng chi của chính nguồn đó. */
export type CostSlice = {
  kind: CostKind
  label: string
  amount: number
  /** 0–1. Mẫu số là tổng chi của NGUỒN, không phải của cả phòng. */
  share: number
}

export type CostBreakdown = {
  rows: CostSlice[]
  total: number
  /** Loại nguồn này KHÔNG tiêu đồng nào. Nói tên chúng ra một dòng còn hơn vẽ
   *  năm dòng trong đó ba dòng bằng 0 — bảng đọc bằng mắt, số 0 lặp lại chỉ làm
   *  loãng ba dòng có tiền thật. */
  absent: string[]
}

/** Tiền của một nguồn đi đâu — năm loại L1…L5, số và tỉ trọng.
 *
 *  Nguồn tự nhiên trả mảng rỗng và `total = 0`. Đó là NỘI DUNG chứ không phải
 *  lỗi: GT và TM không tốn đồng tiền mặt nào. Màn phải nói câu đó bằng chữ, đừng
 *  vẽ một cái bảng rỗng. */
export function costBreakdown(lines: readonly CostLine[]): CostBreakdown {
  const total = lines.reduce((sum, l) => sum + l.amount, 0)

  const rows: CostSlice[] = []
  const absent: string[] = []

  for (const kind of COST_KINDS) {
    const amount = lines.filter((l) => l.kind === kind).reduce((sum, l) => sum + l.amount, 0)
    if (amount > 0) {
      rows.push({
        kind,
        label: COST_KIND_LABEL[kind],
        amount,
        share: total > 0 ? amount / total : 0,
      })
    } else {
      absent.push(COST_KIND_LABEL[kind])
    }
  }

  return { rows, total, absent: lines.length > 0 ? absent : [] }
}

/** Tiền tiêu trong một LÁT của trục thời gian.
 *
 *  `CostLine.day` mở khoá phép cắt này: trước 20/08 chi phí là số cả kỳ, nên
 *  màn Performance chia lead của một tháng cho tiền của cả bốn tháng.
 *
 *  Phần `lumped` là chỗ phép cắt còn nợ, và nó phải hiện trên màn chứ không
 *  giấu: dòng GỘP cả chuỗi (gói ESP nhiều tháng, cả bộ nội dung, phần công cụ
 *  chia theo đợt) ghi ở `startDay` của nguồn, nên cắt kỳ ở giữa một chuỗi thì
 *  cả dòng rơi trọn vào lát đầu. Chia mịn hơn cần chứng từ mịn hơn, mà hôm nay
 *  chưa có chứng từ nào. */
export type PeriodSpend = {
  /** Tổng tiền của các dòng rơi vào lát, đồng. */
  cost: number
  /** Phần trong `cost` là dòng gộp ghi ở ngày mở chuỗi, của những nguồn có chi
   *  phí nằm CẢ TRONG lẫn NGOÀI lát. Bằng 0 khi không nguồn nào bị cắt ngang. */
  lumped: number
}

export function spendIn(
  sources: readonly { startDay: number; costLines: readonly CostLine[] }[],
  keep: (line: CostLine) => boolean,
): PeriodSpend {
  let cost = 0
  let lumped = 0

  for (const s of sources) {
    const inside = s.costLines.filter(keep)
    cost += inside.reduce((sum, l) => sum + l.amount, 0)
    /* Chuỗi nằm gọn trong lát thì không có gì bị kéo lệch — chỉ nguồn bị cắt
       ngang mới có phần gộp đáng khai. */
    if (inside.length === s.costLines.length) continue
    lumped += inside.filter((l) => l.day === s.startDay).reduce((sum, l) => sum + l.amount, 0)
  }

  return { cost, lumped }
}
