import { DAS_VINA_FROZEN_AT, DAS_VINA_PERIOD } from '@pv/engines/fixtures/das-vina'

/** Trục thời gian của module Performance — tháng · quý · năm · khoảng ngày tự chọn.
 *
 *  ---------------------------------------------------------------------------
 *  VÌ SAO MÀN NÀY CÓ TRỤC THỜI GIAN (đổi luật ngày 19/08)
 *  ---------------------------------------------------------------------------
 *  Bản trước cấm trục tháng-quý-năm với lý do "fixture là một lát cắt, dựng trục
 *  thời gian thì phải đẻ số không ai ký". Lý do đó SAI ở một chỗ kiểm được: mỗi
 *  dòng sổ lead đã mang sẵn ngày của từng mốc đời nó — vào sổ, lên MQL, vào sổ
 *  cơ hội, ký, ra khỏi luồng. Cắt theo tháng là ĐỌC LẠI những ngày đã có, không
 *  phải đẻ số mới. Bằng chứng nằm ở `scenario.test.ts`: cộng bốn mốc của cả kỳ
 *  ra đúng 100 · 44 · 30 · 6, tức đúng bốn bậc của `FUNNEL`.
 *
 *  ---------------------------------------------------------------------------
 *  HAI MỐC BIÊN, đọc kỹ trước khi sửa bất cứ phép tính nào ở đây
 *  ---------------------------------------------------------------------------
 *  · **Lát cắt** `DAS_VINA_FROZEN_AT` = 17/08 09:10. Sau mốc này KHÔNG có số đo.
 *    Mọi con số thực tế đều dừng ở đây.
 *  · **Chân trời** = hết tháng chứa lát cắt = 31/08. MỤC TIÊU tính tới đây chứ
 *    không tới lát cắt — nếu không thì tháng 8 chỉ được giao 17/31 chỉ tiêu và
 *    câu hỏi "còn bao lâu nữa mới đạt" mất luôn nghĩa.
 *
 *  Một kỳ vì thế có hai khoảng khác nhau, và đừng trộn chúng:
 *    `from`…`cutoff`  khoảng CÓ SỐ ĐO   (đã cắt ở lát cắt)
 *    `from`…`to`      khoảng ĐƯỢC GIAO CHỈ TIÊU (cắt ở chân trời) */

const FROZEN_DAY = DAS_VINA_FROZEN_AT.slice(0, 10)
const DATA_START = DAS_VINA_PERIOD.from.slice(0, 10)

const DAY_MS = 86_400_000

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

const parse = (day: string) => Date.parse(`${day}T00:00:00Z`)

/** Số ngày từ `a` tới `b`, cùng ngày = 1 — kỳ một ngày vẫn là một ngày. */
export function spanDays(a: string, b: string): number {
  return Math.max(0, Math.round((parse(b) - parse(a)) / DAY_MS) + 1)
}

const clampDay = (day: string, lo: string, hi: string) => (day < lo ? lo : day > hi ? hi : day)

const [FROZEN_Y, FROZEN_M] = FROZEN_DAY.split('-').map(Number) as [number, number, number]

/** Chân trời chỉ tiêu — xem khối chú thích ở đầu file. */
export const HORIZON_END = iso(FROZEN_Y, FROZEN_M, daysInMonth(FROZEN_Y, FROZEN_M))

export const DATA_WINDOW = { from: DATA_START, cutoff: FROZEN_DAY, horizon: HORIZON_END } as const

export type Grain = 'thang' | 'quy' | 'nam' | 'ngay'

/** Lựa chọn của người dùng — thứ duy nhất màn giữ trong state. */
export type PeriodChoice = {
  grain: Grain
  /** '2026-07' · '2026-Q3' · '2026'. Bỏ trống khi `grain === 'ngay'`. */
  key: string
  /** chỉ dùng cho `grain === 'ngay'`, dạng yyyy-mm-dd */
  from?: string
  to?: string
}

export type Period = {
  grain: Grain
  key: string
  /** 'Tháng 7 · 2026' */
  label: string
  /** 'T7' — nhãn ngắn cho chip và cột */
  short: string
  /** ngày đầu kỳ, đã cắt vào khoảng dữ liệu */
  from: string
  /** ngày cuối kỳ theo chân trời chỉ tiêu */
  to: string
  /** ngày cuối CÓ SỐ ĐO */
  cutoff: string
  /** số tháng quy đổi của kỳ — hệ số nhân cho mục tiêu tháng */
  months: number
  /** số ngày đã có số đo */
  elapsed: number
  /** số ngày từ lát cắt tới hết kỳ; 0 nghĩa là kỳ đã đóng */
  daysLeft: number
  closed: boolean
}

/** Mục tiêu của một kỳ = mục tiêu tháng × số tháng quy đổi.
 *
 *  Tháng dở dang tính theo tỷ lệ ngày, nên tháng 8 (chỉ có dữ liệu tới 17/08)
 *  vẫn được giao TRỌN chỉ tiêu tháng — phần chưa làm hiện ra ở ô "còn thiếu",
 *  đúng thứ người dùng muốn nhìn. Tháng nằm ngoài khoảng kịch bản đóng góp 0:
 *  quý 2 chỉ có tháng 5 và 6 nên nó là kỳ hai tháng, không phải ba. */
function monthsOf(from: string, to: string): number {
  let total = 0
  let [y, m] = from.split('-').map(Number) as [number, number, number]

  while (iso(y, m, 1) <= to) {
    const dim = daysInMonth(y, m)
    const lo = iso(y, m, 1) < from ? from : iso(y, m, 1)
    const hi = iso(y, m, dim) > to ? to : iso(y, m, dim)
    if (lo <= hi) total += spanDays(lo, hi) / dim
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return total
}

const MONTH_SHORT = (m: number) => `T${m}`

function build(
  grain: Grain,
  key: string,
  label: string,
  short: string,
  rawFrom: string,
  rawTo: string,
): Period {
  const from = clampDay(rawFrom, DATA_START, HORIZON_END)
  const to = clampDay(rawTo, DATA_START, HORIZON_END)
  const cutoff = to < FROZEN_DAY ? to : FROZEN_DAY

  return {
    grain,
    key,
    label,
    short,
    from,
    to,
    cutoff,
    months: monthsOf(from, to),
    elapsed: from <= cutoff ? spanDays(from, cutoff) : 0,
    daysLeft: to > FROZEN_DAY ? spanDays(FROZEN_DAY, to) - 1 : 0,
    closed: to <= FROZEN_DAY,
  }
}

/** Các tháng kịch bản chạm tới — nguồn của thanh thời gian và của bộ chọn. */
export const MONTHS: Period[] = (() => {
  const out: Period[] = []
  let [y, m] = DATA_START.split('-').map(Number) as [number, number, number]

  while (iso(y, m, 1) <= HORIZON_END) {
    out.push(
      build(
        'thang',
        `${y}-${String(m).padStart(2, '0')}`,
        `Tháng ${m} · ${y}`,
        MONTH_SHORT(m),
        iso(y, m, 1),
        iso(y, m, daysInMonth(y, m)),
      ),
    )
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
})()

export const QUARTERS: Period[] = (() => {
  const seen = new Map<string, Period>()
  for (const month of MONTHS) {
    const [y, m] = month.key.split('-').map(Number) as [number, number]
    const q = Math.ceil(m / 3)
    const key = `${y}-Q${q}`
    if (seen.has(key)) continue
    seen.set(
      key,
      build(
        'quy',
        key,
        `Quý ${q} · ${y}`,
        `Q${q}`,
        iso(y, (q - 1) * 3 + 1, 1),
        iso(y, q * 3, daysInMonth(y, q * 3)),
      ),
    )
  }
  return [...seen.values()]
})()

export const YEARS: Period[] = (() => {
  const seen = new Set<number>()
  return MONTHS.flatMap((month) => {
    const y = Number(month.key.slice(0, 4))
    if (seen.has(y)) return []
    seen.add(y)
    return [build('nam', String(y), `Năm ${y}`, String(y), iso(y, 1, 1), iso(y, 12, 31))]
  })
})()

/** Kỳ mặc định: QUÝ chứa lát cắt.
 *
 *  Không phải tháng chứa lát cắt, dù đó là lựa chọn hiển nhiên hơn: tháng đó mới
 *  chạy được 17 ngày và chỉ có 4 lead, nên mở màn ra là gặp một bảng gần rỗng
 *  với mấy tỷ lệ 100% vô nghĩa. Quý là kỳ nhỏ nhất mà kịch bản này còn đủ số để
 *  đọc, và "quý đang chạy" vẫn trả lời đúng câu hỏi của màn. Đổi sang tháng chỉ
 *  mất một cú bấm. */
export const DEFAULT_CHOICE: PeriodChoice = {
  grain: 'quy',
  key: QUARTERS[QUARTERS.length - 1]?.key ?? '',
}

const byKey = (list: Period[], key: string) => list.find((p) => p.key === key)

export function resolvePeriod(choice: PeriodChoice): Period {
  if (choice.grain === 'ngay') {
    const from = clampDay(choice.from ?? DATA_START, DATA_START, HORIZON_END)
    const to = clampDay(choice.to ?? FROZEN_DAY, from, HORIZON_END)
    const label = from === to ? `Ngày ${vn(from)}` : `${vn(from)} → ${vn(to)}`
    return build('ngay', `${from}..${to}`, label, vn(from), from, to)
  }

  const list = choice.grain === 'quy' ? QUARTERS : choice.grain === 'nam' ? YEARS : MONTHS
  const found = byKey(list, choice.key) ?? list[list.length - 1]
  if (!found) throw new Error(`Kịch bản không có kỳ nào ở mức "${choice.grain}"`)
  return found
}

/** Kỳ liền trước cùng loại — mẫu số của ô delta trên thẻ số.
 *
 *  Trả `null` khi kỳ trước nằm ngoài khoảng kịch bản. Đó là lý do thẻ số của
 *  tháng 5 không có delta: so với tháng 4 thì mẫu số bằng 0, mà "tăng vô hạn"
 *  không phải một con số ai đọc được. */
export function previousPeriod(period: Period): Period | null {
  if (period.grain === 'ngay') {
    const len = spanDays(period.from, period.to)
    const to = shift(period.from, -1)
    const from = shift(to, -(len - 1))
    if (to < DATA_START) return null
    return build('ngay', `${from}..${to}`, `${vn(from)} → ${vn(to)}`, vn(from), from, to)
  }

  const list = period.grain === 'quy' ? QUARTERS : period.grain === 'nam' ? YEARS : MONTHS
  const i = list.findIndex((p) => p.key === period.key)
  return i > 0 ? (list[i - 1] ?? null) : null
}

function shift(day: string, delta: number): string {
  const d = new Date(parse(day) + delta * DAY_MS)
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** '2026-08-17' → '17/08' */
export function vn(day: string): string {
  const [, m = '', d = ''] = day.split('-')
  return `${d}/${m}`
}

/** Mốc ISO của kịch bản có rơi vào kỳ này không. So bằng chuỗi ngày: mọi mốc
 *  trong kịch bản đều ở +07:00 nên mười ký tự đầu đã là ngày giờ Việt Nam. */
export function inPeriod(at: string | undefined, period: Period): boolean {
  if (!at) return false
  const day = at.slice(0, 10)
  return day >= period.from && day <= period.cutoff
}
