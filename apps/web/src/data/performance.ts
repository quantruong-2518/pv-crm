import { queryOptions } from '@tanstack/react-query'
import { millions } from '@pv/ui'
import { type CostBandValue } from '@pv/engines'
import {
  BD,
  DAS_VINA_FROZEN_AT,
  dasVina,
  EXIT_REASONS,
  HANDOFF_SLA,
  isRotting,
  KPI_LAYERS,
  LEADS,
  MARKETING,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  ROLE_KPI_MODEL,
  SLA_WATCH_MARGIN,
  daysBetween,
  leadMilestones,
  sourcesOwnedBy,
  type KpiLayer,
  type KpiMeasureUnit,
  type Lead,
  type LeadMilestones,
  type LeadTier,
  type RoleKpiSpec,
  type StageKey,
} from '@pv/engines/fixtures/das-vina'
import {
  DATA_WINDOW,
  MONTHS,
  QUARTERS,
  inPeriod,
  previousPeriod,
  resolvePeriod,
  spanDays,
  vn,
  type Period,
  type PeriodChoice,
} from './period'
import { costOf, spendIn } from './source-cost'
import { api } from '@/app/api'

/** Module 4 · Performance — "ai đang làm được, ai đang tắc". Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy số hiệu suất. Khi có backend, đổi thân
 *  `fetchPerformance` thành lời gọi HTTP; màn không phải sửa.
 *
 *  BỐN LUẬT CỦA FILE NÀY, đọc trước khi thêm bất cứ con số nào:
 *
 *  1. **Kỳ cắt theo NGÀY XẢY RA của từng mốc**, không theo lứa lead. "Lead của
 *     tháng 7" là lead VÀO SỔ trong tháng 7; "hợp đồng của tháng 7" là hợp đồng
 *     KÝ trong tháng 7, dù lead của nó vào sổ từ tháng 5. Đây đúng là cách tài
 *     liệu KPI viết công thức ("COUNT(lead mới phát sinh trong tháng)"), và là
 *     cách duy nhất khiến nhịp cá nhân đọc được. Ngoại lệ DUY NHẤT là win rate —
 *     xem chỗ tính nó ở dưới, có ghi lý do.
 *  2. **Số chụp tại lát cắt thì phải khai là số chụp.** Giá trị đơn đang mở, đơn
 *     đang mục, giá mỗi lead tốt: ba thứ này không có ngày để cắt. Chúng mang cờ
 *     `snapshot` và màn phải in ra chữ "tính đến 17/08".
 *  3. **Thước đo lấy từ `ROLE_KPI_MODEL`** (fixture · module Cấu hình). Màn này chỉ hiển
 *     thị, không tự định nghĩa cách chấm một vai. Thước nào fixture chưa có
 *     nguồn số thì `value: null` — màn hiện "chưa đo được", KHÔNG điền số gần
 *     đúng thay.
 *  4. **Không chia cho 0.** Mẫu số bằng 0 thì tỷ lệ là `null`, không phải 0%.
 *
 *  Sổ lead nằm ở `data/leads.ts`, nguồn lead nằm ở `data/campaigns.ts`. Ba file
 *  đọc cùng một kịch bản qua ba query khác nhau. */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Chia có mẫu số 0 → `null`. Luật 4 của file này, viết một lần dùng khắp nơi. */
const rate = (top: number, bottom: number): number | null => (bottom > 0 ? top / bottom : null)

const STAGES = new Map(PIPELINE_STAGES.map((s) => [s.key, s]))

function stageOf(key: StageKey) {
  const stage = STAGES.get(key)
  if (!stage) throw new Error(`Cột "${key}" không có trong PIPELINE_STAGES`)
  return stage
}

/** Sổ lead kèm mốc thời gian, dựng một lần cho cả file. */
type Row = { lead: Lead; at: LeadMilestones }
const BOOK: Row[] = LEADS.map((lead) => ({ lead, at: leadMilestones(lead) }))

/** Nguồn ĐỨNG TÊN Marketing — phạm vi xin ở fixture chứ không tự lọc. Đây là
 *  một trong ba phạm vi của cùng nhãn "giá mỗi lead tốt"; hai cái kia là "có
 *  tiêu tiền" (Kế hoạch) và "đã chạy đợt" (Chiến dịch). Xem `costOfGoodLead`. */
const MKT_SOURCES = sourcesOwnedBy(MARKETING)
const MKT_CODES = new Set(MKT_SOURCES.map((s) => s.code))

// ---------------------------------------------------------------------------
// Kiểu
// ---------------------------------------------------------------------------

export type { KpiLayer, KpiMeasureUnit, Period, PeriodChoice }

export type RoleKind = 'marketing' | 'bd' | 'sale' | 'presales' | 'truong-phong'

/** Trạng thái của một thước.
 *
 *  Ba cái đầu là của tài liệu KPI, dùng chung cho người và cho SLA. Cái thứ tư
 *  thêm 20/08 và KHÁC HẲN `chua-do`: `chua-do` là chưa có nguồn số; `chua-chot`
 *  là ĐÃ ĐO XONG, số hiện đủ, nhưng kỳ chưa đóng nên chưa chấm nhãn. Gộp hai
 *  cái vào nhau sẽ giấu mất một con số đã có. */
export type Verdict = 'dat' | 'can-cai-thien' | 'chua-do' | 'chua-chot'

/** Một thước đã đo. `value === null` là chưa đo được — nói thẳng chứ không hiện
 *  số 0, vì 0 nghĩa là "đo rồi, kết quả bằng không". */
export type KpiReading = {
  key: string
  label: string
  layer: KpiLayer
  unit: KpiMeasureUnit
  formula: string
  value: number | null
  target: number | null
  /** value ÷ target, đã đảo chiều cho thước "càng thấp càng tốt" */
  ratio: number | null
  verdict: Verdict
  /** Số trên đến từ đâu, hoặc vì sao chưa đo được. */
  note: string
  /** Số chụp tại lát cắt, không cắt được theo kỳ. */
  snapshot: boolean
  primary: boolean
}

/** Một mốc của nhịp KPI — "còn bao lâu nữa mới đạt". Ba mốc: ngày · tháng · quý,
 *  luôn neo vào lát cắt 17/08 chứ KHÔNG theo kỳ đang xem: kỳ đang xem trả lời
 *  "đã làm được gì", nhịp trả lời "hôm nay còn phải làm gì". */
export type PaceRow = {
  key: 'ngay' | 'thang' | 'quy'
  label: string
  window: string
  target: number
  done: number
  /** max(0, target − done) */
  missing: number
  ratio: number
  /** số ngày còn lại tới hết mốc; 0 = mốc đã đóng */
  daysLeft: number
  /** cần mỗi ngày để kịp; `null` khi đã đạt hoặc mốc đã đóng */
  perDay: number | null
}

/** Một nguồn của Marketing, ĐÃ CẮT THEO KỲ — cả lead lẫn tiền.
 *
 *  Trước 20/08 dòng này trộn hai khoảng thời gian: `leads`/`good` cắt theo kỳ
 *  còn `cost` là chi phí cả kỳ, vì `Source.cost` chưa có trục ngày. Giờ mỗi
 *  `CostLine` mang `day`, nên tử số và mẫu số đứng chung một khoảng. */
export type SourceRow = {
  code: string
  label: string
  waves: number
  leads: number
  good: number
  /** Tiền tiêu TRONG KỲ, đồng — tổng các `costLine` có ngày rơi vào kỳ. */
  cost: number
  /** Chi phí cả kỳ của nguồn, để dòng nói được "trong kỳ bao nhiêu trên tổng
   *  bao nhiêu". Thiếu nó thì một nguồn 145 triệu hiện 0 đồng ở tháng 5 đọc như
   *  thể nó miễn phí. */
  costWhole: number
  costPerGood: number | null
  /** Dải giá mỗi lead tốt của kỳ. */
  band: CostBandValue
  /** Dải đủ chắc để đứng cạnh câu khẳng định chưa. */
  enough: boolean
  why: string
}

export type LeadRow = {
  code: string
  company: string
  tier: LeadTier
  requiredFilled: number
  daysHere: number
}

export type DealRow = {
  code: string
  company: string
  stage: string
  days: number
  limitDays: number
  amount: number
  rotting: boolean
}

export type PersonCard = {
  actorId: string
  name: string
  /** Vai như fixture ghi, ví dụ 'Sale · chip'. */
  role: string
  /** Vai gốc dùng để lọc — 'Sale' cho cả ba Sale. */
  roleKey: string
  kind: RoleKind
  /** Thước đứng ở tâm đồng hồ. `null` cho vai không chấm cá nhân. */
  primary: KpiReading | null
  kpis: KpiReading[]
  verdict: Verdict
  /** Bao nhiêu thước chấm được, và bao nhiêu trong số đó đạt. Thiếu con số này
   *  thì một dòng "100%" đứng cạnh nhãn "Cần cải thiện" đọc ra như lỗi — sự thật
   *  là thước chính đạt còn một thước khác thì không. */
  scored: { ok: number; total: number }
  pace: PaceRow[]
  /** Câu phải hiện khi vai này không chấm bằng số cá nhân. */
  note?: string
  sources?: SourceRow[]
  /** Câu phải in ngay trên bảng nguồn: kỳ đang cắt là kỳ nào, và phần chi phí
   *  nào KHÔNG chia nhỏ hơn được. Ở tầng dữ liệu vì nó đổi cùng lúc với phép
   *  cắt — để ở JSX thì một hôm nào đó câu nói một đằng, số một nẻo. */
  sourcesNote?: string
  leads?: LeadRow[]
  deals?: DealRow[]
}

export type RoleFilter = { key: string; label: string; count: number }

export type FunnelStep = {
  key: string
  label: string
  count: number
  /** so với bậc ngay trước; `null` ở bậc đầu */
  ratio: number | null
  /** so với bậc đầu */
  ofTop: number | null
}

export type MonthPoint = {
  key: string
  short: string
  leads: number
  signed: number
  selected: boolean
}

export type ExitRow = { label: string; count: number; share: number }

export type SlaRow = {
  key: string
  label: string
  note: string
  targetDays: number
  actualDays: number | null
  count: number
  verdict: Verdict
  /** 'Đúng hạn' · 'Cần theo dõi' · 'Trễ hạn' · 'Chưa đo được' */
  state: string
}

export type Overview = {
  /** Lứa của kỳ: lead VÀO SỔ trong kỳ. Mẫu số của cả phễu. */
  leads: number
  /** Ba số dưới là phần của LỨA đã đi tới bậc đó, tính tới lát cắt. */
  mql: number
  sql: number
  won: number
  /** Hợp đồng KÝ trong kỳ — đếm theo ngày xảy ra, khác `won`. */
  signedInPeriod: number
  /** Lead RA KHỎI LUỒNG trong kỳ — cũng theo ngày xảy ra. */
  exited: number
  mqlRate: number | null
  sqlRate: number | null
  winRate: number | null
  /** Ba số dưới là SỐ CHỤP tại lát cắt, không cắt theo kỳ. */
  openDeals: number
  openValue: number
  rotting: number
  biggestDealCode: string
}

export type Performance = {
  period: Period
  overview: Overview
  /** Kỳ liền trước cùng loại; `null` khi nó nằm ngoài khoảng kịch bản. */
  previous: { label: string; overview: Overview } | null
  funnel: FunnelStep[]
  months: MonthPoint[]
  exits: ExitRow[]
  exitedTotal: number
  sla: SlaRow[]
  people: PersonCard[]
  roles: RoleFilter[]
}

// ---------------------------------------------------------------------------
// Tổng quan — số của cả phòng trong kỳ
// ---------------------------------------------------------------------------

function buildOverview(p: Period): Overview {
  const firstDeal = OPEN_DEALS[0]
  if (!firstDeal) throw new Error('OPEN_DEALS rỗng — sổ cơ hội phải có ít nhất một đơn đang mở')
  const biggest = OPEN_DEALS.reduce((a, d) => (d.amount > a.amount ? d : a), firstDeal)

  /* LỨA của kỳ = lead VÀO SỔ trong kỳ. Phễu và ba tỷ lệ đọc trên lứa này, và
     đó là lý do phễu không bao giờ phình ra ở bậc dưới: mỗi bậc là một tập con
     của bậc trên. Đếm theo ngày xảy ra thì tháng 8 có thể ra "2 SQL trên 2 MQL
     = 100%" chỉ vì hai lead đó lên MQL từ tháng 6 — một con số đúng phép tính
     mà sai câu chuyện. */
  const cohort = BOOK.filter((r) => inPeriod(r.at.vaoSo, p))
  const mql = cohort.filter((r) => r.at.mql).length
  const sql = cohort.filter((r) => r.at.sql).length
  const won = cohort.filter((r) => r.at.ky).length

  return {
    leads: cohort.length,
    mql,
    sql,
    won,
    /* Hai số này đếm theo NGÀY XẢY RA, không theo lứa: "phòng ký được mấy hợp
       đồng trong tháng này" là câu hỏi về tháng này, không về lứa lead nào. Nhãn
       trên màn phải nói rõ "trong kỳ" để không ai đọc nhầm thành bậc của phễu. */
    signedInPeriod: BOOK.filter((r) => inPeriod(r.at.ky, p)).length,
    exited: BOOK.filter((r) => inPeriod(r.at.roi, p)).length,
    mqlRate: rate(mql, cohort.length),
    sqlRate: rate(sql, mql),
    winRate: rate(won, sql),
    openDeals: OPEN_DEALS.length,
    openValue: sum(OPEN_DEALS.map((d) => d.amount)),
    rotting: OPEN_DEALS.filter(isRotting).length,
    biggestDealCode: biggest.code,
  }
}

/** Bốn bậc phễu của tài liệu KPI (Biểu đồ 1): lead → MQL → SQL → hợp đồng.
 *
 *  Phễu sáu bậc của `FUNNEL` có thêm "Báo giá" và "Chờ ký" — hai bậc đó là
 *  trạng thái của sổ cơ hội, không có mốc ngày trên từng dòng lead, nên KHÔNG
 *  cắt được theo kỳ. Vẽ chúng ở đây là bịa ngày. Cộng cả kỳ thì bốn bậc dưới ra
 *  đúng bốn bậc cùng tên của `FUNNEL` — `scenario.test.ts` khoá đẳng thức đó. */
function buildFunnel(o: Overview): FunnelStep[] {
  const raw = [
    { key: 'dau-moi', label: 'Lead vào sổ', count: o.leads },
    { key: 'mql', label: 'MQL — công ty thật', count: o.mql },
    { key: 'sql', label: 'SQL — vào sổ cơ hội', count: o.sql },
    { key: 'hop-dong', label: 'Hợp đồng', count: o.won },
  ]

  return raw.map((step, i) => {
    const prev = raw[i - 1]
    return {
      ...step,
      ratio: prev ? rate(step.count, prev.count) : null,
      ofTop: i === 0 ? null : rate(step.count, o.leads),
    }
  })
}

function buildMonths(p: Period): MonthPoint[] {
  return MONTHS.map((m) => ({
    key: m.key,
    short: m.short,
    leads: BOOK.filter((r) => inPeriod(r.at.vaoSo, m)).length,
    signed: BOOK.filter((r) => inPeriod(r.at.ky, m)).length,
    /* Tháng nào nằm trong kỳ đang xem thì sáng lên — thanh thời gian vừa là đồ
       thị vừa là chỗ nhìn ra kỳ hiện tại phủ những tháng nào. */
    /* Phủ nhau là đủ, không cần nằm trọn: chọn "05/05 → 20/05" thì tháng 5 vẫn
       phải sáng, dù nó bắt đầu trước ngày đầu kỳ. */
    selected: m.from <= p.to && m.to >= p.from,
  }))
}

function buildExits(p: Period): { exits: ExitRow[]; total: number } {
  const rows = BOOK.filter((r) => inPeriod(r.at.roi, p))
  const total = rows.length

  const exits = EXIT_REASONS.map((reason) => {
    const count = rows.filter((r) => r.lead.exitReason === reason.label).length
    return { label: reason.label, count, share: rate(count, total) ?? 0 }
  })
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)

  return { exits, total }
}

/** SLA bàn giao — "Nhóm 2" của tài liệu KPI. Ba mức: trong mục tiêu là đúng
 *  hạn, vượt không quá 20% là cần theo dõi, hơn nữa là trễ hạn. */
function buildSla(p: Period): SlaRow[] {
  const legs: Record<string, (r: Row) => number | null> = {
    'mkt-bd': (r) => (inPeriod(r.at.bdCham, p) ? daysBetween(r.at.vaoSo, r.at.bdCham) : null),
    'bd-sale': (r) => (inPeriod(r.at.sql, p) ? daysBetween(r.at.mql, r.at.sql) : null),
  }

  return HANDOFF_SLA.map((leg) => {
    const measure = legs[leg.key]
    const days = measure ? BOOK.map(measure).filter((v): v is number => v !== null) : []
    const actualDays = days.length > 0 ? sum(days) / days.length : null

    if (actualDays === null) {
      return {
        ...leg,
        actualDays: null,
        count: 0,
        verdict: 'chua-do' as const,
        state: 'Chưa có bàn giao nào trong kỳ',
      }
    }

    const over = actualDays / leg.targetDays
    return {
      ...leg,
      actualDays,
      count: days.length,
      verdict: over <= 1 ? 'dat' : ('can-cai-thien' as Verdict),
      state: over <= 1 ? 'Đúng hạn' : over <= 1 + SLA_WATCH_MARGIN ? 'Cần theo dõi' : 'Trễ hạn',
    }
  })
}

// ---------------------------------------------------------------------------
// Thước của từng người — ROLE_KPIS × kỳ
// ---------------------------------------------------------------------------

const KIND: Record<string, RoleKind> = {
  Marketing: 'marketing',
  BD: 'bd',
  Sale: 'sale',
  Presales: 'presales',
  'Trưởng phòng Kinh doanh': 'truong-phong',
}

/** Vai của một người → dòng KPI của vai đó. 'Sale · chip' và 'Sale · dược' cùng
 *  trỏ vào dòng 'Sale': thước đo theo VAI, không theo người. */
function roleOf(actorRole: string): { key: string; kind: RoleKind; kpis: RoleKpiSpec[] } {
  const row = ROLE_KPI_MODEL.find(
    (r) => actorRole === r.role || actorRole.startsWith(`${r.role} ·`),
  )
  if (!row) throw new Error(`Vai "${actorRole}" chưa có dòng trong ROLE_KPI_MODEL`)
  const kind = KIND[row.role]
  if (!kind) throw new Error(`ROLE_KPI_MODEL có vai "${row.role}" mà màn Performance chưa biết đo`)
  return { key: row.role, kind, kpis: row.kpis }
}

/** Giá trị đo được của một thước, cùng câu giải thích số đó ở đâu ra.
 *  `value: null` = fixture không có nguồn số. */
type Measured = {
  value: number | null
  note: string
  /** Ghi đè cờ `snapshot` của `ROLE_KPI_MODEL`.
   *
   *  Cờ ở fixture nói "thước này không cắt được theo kỳ". Với
   *  `gia-moi-lead-tot` điều đó đúng cho tới 20/08, khi `CostLine.day` xuất
   *  hiện và chi phí cắt được. Sửa cờ ở fixture là việc của `packages/**`;
   *  cho tới lúc đó màn không được in "số chụp tại 17/08" dưới một con số đã
   *  cắt theo kỳ — câu đó sai, và sai theo hướng làm người đọc tin nhầm. */
  snapshot?: boolean
}

function read(def: RoleKpiSpec, p: Period, measured: Measured): KpiReading {
  /* CHỈ thước cộng dồn mới nhân mục tiêu theo độ dài kỳ. Tỷ lệ và số chụp thì
     không: "win rate 31%" là 31% ở mọi kỳ, nhân với hai tháng ra 62% thì không
     ai đạt nổi, và cả bảng đỏ vì một phép nhân sai chứ không vì ai làm kém. */
  const target =
    def.monthlyTarget === null ? null : def.paced ? def.monthlyTarget * p.months : def.monthlyTarget
  const { value } = measured

  let ratio: number | null = null
  let verdict: Verdict = 'chua-do'

  if (value !== null && target !== null && target > 0) {
    /* Thước "càng thấp càng tốt" (giá mỗi lead tốt) đảo tử số với mẫu số, nhờ
       vậy 1,0 luôn là "vừa đúng mục tiêu" cho mọi thước và đồng hồ đọc được
       bằng một cách duy nhất. */
    ratio = def.higherIsBetter ? value / target : rate(target, value)
    verdict = ratio !== null && ratio >= 1 ? 'dat' : 'can-cai-thien'

    /* Kỳ chưa đóng + thước chốt muộn = hiện số, hoãn nhãn. Tiền của nguồn đang
       chạy đã ghi đủ vào kỳ, lead của nó thì chưa về hết, nên tỉ số đọc ra một
       con số thật mà chấm điểm trên nó là chấm độ trễ. `ratio` giữ nguyên để
       đồng hồ vẫn vẽ được — chỉ cái NHÃN bị hoãn. */
    if (def.settlesLate && !p.closed) verdict = 'chua-chot'
  }

  return {
    key: def.key,
    label: def.label,
    layer: def.layer,
    unit: def.unit,
    formula: def.formula,
    value,
    target,
    ratio,
    verdict,
    note: measured.note,
    snapshot: measured.snapshot ?? def.snapshot === true,
    primary: def.primary === true,
  }
}

/** Marketing — lead kéo về, phần qua được cổng, và giá của nó.
 *
 *  --------------------------------------------------------------------------
 *  CHI PHÍ GIỜ CẮT ĐƯỢC THEO KỲ (20/08) — TRẢ MỘT MÓN NỢ, MỞ MỘT CÂU HỎI
 *  --------------------------------------------------------------------------
 *  Trước hôm nay `gia-moi-lead-tot` chia lead CỦA KỲ cho chi phí CẢ KỲ: tháng 5
 *  có 10 lead tốt đứng trên 300 triệu của bốn tháng, và mọi kỳ đều ra đúng
 *  10,0 triệu vì tử số lẫn mẫu số đều là số của cả kỳ. Mỗi `CostLine` giờ có
 *  `day`, nên hai vế đứng chung một khoảng được.
 *
 *  **Con số đổi rất mạnh, và với hai kỳ nó đổi cả NHÃN:** quý 3 đi từ 10,0 tr
 *  lên 23,7 tr và tháng 8 lên 72,5 tr — cả hai vượt ngưỡng 12 tr, tức thước của
 *  một người đổi từ Đạt sang Cần cải thiện. Lý do không phải ai làm kém đi: gian
 *  hàng triển lãm 145 triệu rơi trọn vào tháng 8 trong khi lead của nó mới về
 *  bốn dòng. Đó là sự thật mà cách tính cũ đang che, nhưng nó là sự thật về MỘT
 *  NGƯỜI — nên nó phải được nói to ở chỗ người ta chấm công, không lẳng lặng
 *  đổi màu một cái nhãn.
 *
 *  Chỗ phép cắt còn nợ nằm ở `spendIn().lumped` và phải hiện lên màn: dòng gộp
 *  cả chuỗi ghi ở `startDay` không chia nhỏ hơn được. */
function marketingReadings(p: Period): {
  measured: Record<string, Measured>
  sources: SourceRow[]
  sourcesNote: string
} {
  const mine = BOOK.filter((r) => MKT_CODES.has(r.lead.source) && inPeriod(r.at.vaoSo, p))
  const good = mine.filter((r) => r.lead.requiredFilled >= REQUIRED_SLOTS)
  const waves = MKT_SOURCES.flatMap((s) => s.waves.filter((w) => inPeriod(waveDay(w.day), p)))

  /** Dòng chi có rơi vào kỳ đang xem không. Cùng trục ngày với `Wave.day`. */
  const inThisPeriod = (line: { day: number }) => inPeriod(waveDay(line.day), p)

  const sources: SourceRow[] = MKT_SOURCES.map((s) => {
    const rows = BOOK.filter((r) => r.lead.source === s.code && inPeriod(r.at.vaoSo, p))
    const hits = rows.filter((r) => r.lead.requiredFilled >= REQUIRED_SLOTS).length
    const cut = spendIn([s], inThisPeriod)
    const priced = costOf(s, cut.cost, rows.length, hits)

    return {
      code: s.code,
      label: s.label,
      waves: s.waves.filter((w) => inPeriod(waveDay(w.day), p)).length,
      leads: rows.length,
      good: hits,
      cost: cut.cost,
      costWhole: s.cost,
      costPerGood: priced.band.point,
      band: priced.band,
      enough: priced.enough,
      why: priced.why,
    }
  })

  const spend = spendIn(MKT_SOURCES, inThisPeriod)
  const perGood = good.length > 0 ? Math.round(spend.cost / good.length) : null

  return {
    sources,
    sourcesNote: [
      `Cắt theo kỳ đang xem, cả lead lẫn tiền: ${millions(spend.cost)} tiêu trong kỳ trên ${good.length} lead tốt của kỳ.`,
      spend.lumped > 0
        ? `Trong đó ${millions(spend.lumped)} là dòng chi GỘP cả chuỗi — gói gửi nhiều tháng, cả bộ nội dung, phần công cụ chia theo đợt — ghi ở ngày mở chuỗi, nên nó rơi trọn vào lát này dù chuỗi còn chạy sang kỳ sau. Chia mịn hơn cần chứng từ mịn hơn, hôm nay chưa có.`
        : 'Không nguồn nào bị cắt ngang chuỗi trong kỳ này, nên không có phần chi phí nào rơi lệch lát.',
    ].join(' '),
    measured: {
      'lead-keo-ve': {
        value: mine.length,
        note: `${MKT_SOURCES.length} chiến dịch và sự kiện đứng tên vai này · ${waves.length} đợt chạy trong kỳ`,
      },
      'lead-tot': {
        value: good.length,
        note: `Qua cổng ${REQUIRED_SLOTS} ô bắt buộc · ${good.length} trên ${mine.length} lead của kỳ`,
      },
      'ty-le-lead-tot': {
        value: rate(good.length, mine.length),
        note: `${good.length} lead tốt trên ${mine.length} lead kéo về trong kỳ`,
      },
      'lead-tot-moi-dot': {
        value: rate(good.length, waves.length),
        note:
          waves.length > 0
            ? `Chia đều ${good.length} lead tốt cho ${waves.length} đợt chạy trong kỳ`
            : 'Kỳ này không đợt nào chạy — không có mẫu số để chia',
      },
      'gia-moi-lead-tot': {
        value: perGood,
        note:
          good.length > 0
            ? `${millions(spend.cost)} tiêu trong kỳ trên ${MKT_SOURCES.length} nguồn của ${MARKETING}, chia cho ${good.length} lead tốt của kỳ · đã cắt theo kỳ như bốn thước trên, không còn là số chụp tại ${vn(DAS_VINA_FROZEN_AT.slice(0, 10))}`
            : `${millions(spend.cost)} tiêu trong kỳ mà chưa lead tốt nào về — không có mẫu số để chia, và 0 đồng mỗi lead tốt là câu nói ngược`,
        /* Cắt được theo kỳ rồi thì nó không còn là số chụp. Cờ ở fixture vẫn
           đang bật; đổi nó là việc của `packages/**`, ghi trong báo cáo. */
        snapshot: false,
      },
    },
  }
}

/** Ngày chạy của một đợt, quy về ISO. `Wave.day` đếm từ 01/05 giống mọi mốc
 *  khác của kịch bản, nên cộng thẳng vào ngày đầu khoảng dữ liệu. */
function waveDay(day: number): string {
  const base = Date.parse(`${DATA_WINDOW.from}T00:00:00Z`)
  return new Date(base + day * 86_400_000).toISOString()
}

/** BD — ô bắt buộc moi được và phần đẩy được sang SQL.
 *
 *  Mẫu số là lead BD **đã chạm**, đọc từ mốc `dien-o` do BD ghi trong lịch sử —
 *  KHÔNG phải lead BD đang giữ. Lead lên SQL thì đổi chủ sang Sale, nhưng công
 *  trạng của BD nằm ở lần chạm đó (docs · "Hoa hồng và công trạng"). Đọc bằng
 *  `owner === BD` chỉ thấy 12 lead còn trong tay anh, bỏ mất 32 lead anh đã moi
 *  ô rồi giao đi. */
function bdReadings(p: Period): { measured: Record<string, Measured>; leads: LeadRow[] } {
  const touched = BOOK.filter((r) => inPeriod(r.at.bdCham, p))
  const slots = sum(touched.map((r) => r.lead.requiredFilled))
  const mqlCohort = BOOK.filter((r) => inPeriod(r.at.mql, p))

  const leads: LeadRow[] = [...touched]
    .sort(
      (a, b) => b.lead.requiredFilled - a.lead.requiredFilled || b.lead.daysHere - a.lead.daysHere,
    )
    .map((r) => ({
      code: r.lead.code,
      company: r.lead.company,
      tier: r.lead.tier,
      requiredFilled: r.lead.requiredFilled,
      daysHere: r.lead.daysHere,
    }))

  return {
    leads,
    measured: {
      'o-bat-buoc': {
        value: slots,
        note: `${touched.length} lead BD chạm trong kỳ · tối đa ${touched.length * REQUIRED_SLOTS} ô`,
      },
      'lead-xac-minh': {
        value: mqlCohort.length,
        note: `${mqlCohort.length} lead lên bậc MQL trong kỳ`,
      },
      'mql-sang-sql': {
        /* Lứa MQL của kỳ, xem bao nhiêu đã đi tiếp — cùng cách đọc với phễu ở
           khối tổng quan, để hai con số không bao giờ nói ngược nhau. */
        value: rate(mqlCohort.filter((r) => r.at.sql).length, mqlCohort.length),
        note: `${mqlCohort.filter((r) => r.at.sql).length} lead vào sổ cơ hội trên ${mqlCohort.length} lead lên MQL trong kỳ`,
      },
      'phan-hoi-nguoc': {
        value: null,
        note: 'Chưa đo được: sổ lead không ghi lần nào BD trả phản hồi về đợt cho Marketing.',
      },
    },
  }
}

/** Sale — đơn chốt trong kỳ, giá trị đang mở, và tốc độ qua cột. */
function saleReadings(
  p: Period,
  name: string,
): { measured: Record<string, Measured>; deals: DealRow[] } {
  const signed = BOOK.filter((r) => r.lead.owner === name && inPeriod(r.at.ky, p))
  /* Win rate cắt theo LỨA, không theo ngày ký: "của lô SQL giao trong kỳ này,
     chốt được bao nhiêu". Cắt theo ngày ký thì mẫu số là SQL nhận cùng tháng —
     mà một đơn hiếm khi nhận và ký trong cùng tháng, nên mẫu số hay bằng 0 và
     cả cột thành "chưa đo được". Đây là ngoại lệ DUY NHẤT của luật 1. */
  const cohort = BOOK.filter((r) => r.lead.owner === name && inPeriod(r.at.sql, p))
  const cohortWon = cohort.filter((r) => r.lead.contractCode)

  const mine = OPEN_DEALS.filter((d) => d.owner === name)
  const rotting = mine.filter(isRotting)
  const onTime = mine.length - rotting.length

  const deals: DealRow[] = mine.map((d) => {
    const stage = stageOf(d.stage)
    return {
      code: d.code,
      company: d.company,
      stage: stage.label,
      days: d.daysInStage,
      limitDays: stage.limitDays,
      amount: d.amount,
      rotting: isRotting(d),
    }
  })

  return {
    deals,
    measured: {
      'don-chot': {
        value: signed.length,
        note:
          signed.length > 0
            ? `${signed.map((r) => r.lead.company).join(' · ')}`
            : 'Kỳ này chưa hợp đồng nào đứng tên vai này',
      },
      'gia-tri-don': {
        value: sum(mine.map((d) => d.amount)),
        note: `${mine.length} đơn đang mở tại lát cắt. Fixture không ghi giá trị hợp đồng đã ký nên không cộng vào đây.`,
      },
      'win-rate': {
        value: rate(cohortWon.length, cohort.length),
        note:
          cohort.length > 0
            ? `${cohortWon.length} đã ký trên ${cohort.length} SQL nhận trong kỳ`
            : 'Kỳ này không SQL nào được giao cho vai này — không có mẫu số',
      },
      'toc-do-cot': {
        value: rate(onTime, mine.length),
        note: `${onTime} trên ${mine.length} đơn còn trong hạn cột đang đứng · ${rotting.length} đơn đã mục`,
      },
    },
  }
}

function presalesReadings(): Record<string, Measured> {
  /* KHÔNG viết "fixture không có buổi demo nào" — sai sự thật: sổ cơ hội có đơn
     đứng ở cột "Đã demo" và phễu có bậc báo giá. Thứ THIẾU là TRƯỜNG "ai đi cùng
     buổi demo", nên demo không ghép được với người. */
  const note = 'Sổ cơ hội không có trường "ai đi cùng buổi demo" — không ghép được demo với người'
  return {
    'demo-di-cung': { value: null, note },
    'demo-ra-bao-gia': { value: null, note },
  }
}

// ---------------------------------------------------------------------------
// Nhịp KPI — "còn bao lâu nữa mới đạt"
// ---------------------------------------------------------------------------

const FROZEN_DAY = DAS_VINA_FROZEN_AT.slice(0, 10)

/** Ba mốc neo vào lát cắt: hôm nay · tháng chứa lát cắt · quý chứa lát cắt.
 *
 *  Chỉ dựng cho thước cộng dồn (`paced`). Tỷ lệ không cộng dồn được — "còn thiếu
 *  0,4 của một tỷ lệ" là câu vô nghĩa. */
function buildPace(def: RoleKpiSpec | undefined, measure: (p: Period) => number | null): PaceRow[] {
  if (!def || !def.paced || def.monthlyTarget === null) return []

  const monthly = def.monthlyTarget
  const month = MONTHS.find((m) => m.from <= FROZEN_DAY && FROZEN_DAY <= m.to)
  if (!month) return []
  const quarter = QUARTERS.find((q) => q.from <= FROZEN_DAY && FROZEN_DAY <= q.to)

  const rows: { key: PaceRow['key']; label: string; period: Period }[] = [
    { key: 'ngay', label: `Hôm nay · ${vn(FROZEN_DAY)}`, period: dayPeriod(month) },
    { key: 'thang', label: month.label, period: month },
    ...(quarter ? [{ key: 'quy' as const, label: quarter.label, period: quarter }] : []),
  ]

  return rows.map(({ key, label, period }) => {
    const target = monthly * period.months
    const done = measure(period) ?? 0
    const missing = Math.max(0, target - done)

    return {
      key,
      label,
      window: `${vn(period.from)} → ${vn(period.to)}`,
      target,
      done,
      missing,
      ratio: target > 0 ? done / target : 0,
      daysLeft: period.daysLeft,
      perDay: missing > 0 && period.daysLeft > 0 ? missing / period.daysLeft : null,
    }
  })
}

/** Kỳ một ngày — mốc "hôm nay" của nhịp. Giữ nguyên tháng làm khung để `months`
 *  và `daysLeft` không phải tính lại từ đầu. */
function dayPeriod(month: Period): Period {
  return {
    ...month,
    grain: 'ngay',
    key: `pace-${FROZEN_DAY}`,
    label: `Ngày ${vn(FROZEN_DAY)}`,
    short: vn(FROZEN_DAY),
    from: FROZEN_DAY,
    to: FROZEN_DAY,
    cutoff: FROZEN_DAY,
    months: 1 / spanDays(month.from, month.to),
    elapsed: 1,
    /* Ngày đóng băng là 09:10 — còn nguyên buổi chiều, nên mốc "hôm nay" chưa
       đóng. Làm tròn về 1 ngày để phép chia "cần bao nhiêu mỗi ngày" có nghĩa. */
    daysLeft: 1,
    closed: false,
  }
}

// ---------------------------------------------------------------------------
// Ghép thành thẻ người
// ---------------------------------------------------------------------------

function buildPeople(p: Period, overview: Overview): PersonCard[] {
  return dasVina.actors
    .filter((a) => a.branches.includes('Sales'))
    .map((actor): PersonCard => {
      const role = roleOf(actor.role)
      const base = {
        actorId: actor.id,
        name: actor.name,
        role: actor.role,
        roleKey: role.key,
        kind: role.kind,
      }

      const { measured, extras, pacer } = measureFor(role.kind, p, actor.name)
      const kpis = role.kpis.map((def) =>
        read(def, p, measured[def.key] ?? { value: null, note: 'Thước chưa có nguồn số.' }),
      )
      const primary = kpis.find((k) => k.primary) ?? null
      const primaryDef = role.kpis.find((k) => k.primary)

      /* Xếp hạng CHỈ dựa vào lớp hoạt động và lớp chuyển đổi — đúng bảng "Hiệu
         suất theo nhân sự" của tài liệu, nơi trạng thái nằm cạnh hai cột đó còn
         điểm chất lượng là một cột RIÊNG. Cho lớp chất lượng quyền đánh trượt
         thì một Sale chốt đủ đơn vẫn bị gắn "Cần cải thiện" chỉ vì một đơn cũ
         nằm quá hạn cột, và nhãn mất luôn khả năng phân biệt ai đang tắc. */
      const scored = kpis.filter((k) => k.verdict !== 'chua-do' && k.layer !== 'chat-luong')
      const verdict: Verdict =
        scored.length === 0
          ? 'chua-do'
          : scored.every((k) => k.verdict === 'dat')
            ? 'dat'
            : 'can-cai-thien'

      return {
        ...base,
        primary,
        kpis,
        verdict,
        scored: { ok: scored.filter((k) => k.verdict === 'dat').length, total: scored.length },
        pace: pacer ? buildPace(primaryDef, pacer) : [],
        note: noteFor(role.kind, overview),
        ...extras,
      }
    })
}

/** Đo một vai: bảng giá trị theo khoá thước, bảng bằng chứng, và cách đo lại
 *  thước chính ở một kỳ khác (dùng cho nhịp ngày/tháng/quý). */
function measureFor(
  kind: RoleKind,
  p: Period,
  name: string,
): {
  measured: Record<string, Measured>
  extras: Partial<Pick<PersonCard, 'sources' | 'sourcesNote' | 'leads' | 'deals'>>
  pacer?: (period: Period) => number | null
} {
  switch (kind) {
    case 'marketing': {
      const { measured, sources, sourcesNote } = marketingReadings(p)
      return {
        measured,
        extras: { sources, sourcesNote },
        pacer: (period) => marketingReadings(period).measured['lead-keo-ve']?.value ?? null,
      }
    }
    case 'bd': {
      const { measured, leads } = bdReadings(p)
      return {
        measured,
        extras: { leads },
        pacer: (period) => bdReadings(period).measured['o-bat-buoc']?.value ?? null,
      }
    }
    case 'sale': {
      const { measured, deals } = saleReadings(p, name)
      return {
        measured,
        extras: { deals },
        pacer: (period) => saleReadings(period, name).measured['don-chot']?.value ?? null,
      }
    }
    case 'presales':
      return { measured: presalesReadings(), extras: {} }
    case 'truong-phong':
      return { measured: {}, extras: {} }
  }
}

function noteFor(kind: RoleKind, o: Overview): string | undefined {
  if (kind === 'truong-phong') {
    return `Không tính công trạng cá nhân — vai này phân công, số của phòng chính là số của họ: ${o.leads} lead vào sổ, ${o.signedInPeriod} hợp đồng ký trong kỳ.`
  }
  if (kind === 'presales') {
    return 'Hai thước của vai này để trống có chủ ý: sổ cơ hội không có trường "ai đi cùng buổi demo". Điền số vào đây là bịa.'
  }
  return undefined
}

/** Bộ lọc xếp theo VÒNG ĐỜI khách hàng — Marketing → BD → Sale → Presales →
 *  Trưởng phòng — chứ không theo thứ tự `actors`. Đây là thứ tự tài liệu KPI
 *  dùng, và cũng là thứ tự người dùng đọc phễu ở khối trên. */
function buildRoleFilters(people: PersonCard[]): RoleFilter[] {
  const order = ROLE_KPI_MODEL.map((r) => r.role)
  const seen = new Map<string, number>()
  for (const person of people) seen.set(person.roleKey, (seen.get(person.roleKey) ?? 0) + 1)
  return [...seen]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([key, count]) => ({ key, label: key, count }))
}

// ---------------------------------------------------------------------------
// ContextRail · luật 10
// ---------------------------------------------------------------------------

/** Một chip của ContextRail. `onOpen` là việc của màn, không của tầng dữ liệu. */
export type RailChip = { code: string; source: boolean }

/** Chuỗi E1 → danh sách chip.
 *
 *  Nhánh dự phòng mới là phần đáng giá: trong kịch bản DAS Vina chỉ OP-0288 có
 *  mặt trong đồ thị object, chín đơn còn lại của sổ cơ hội thì chưa. Chỉ cần đơn
 *  lớn nhất đổi sang một mã khác là `story()` trả mảng rỗng — map thẳng thì rail
 *  biến mất im lặng và màn mất luật 10 mà không test nào đỏ. */
export function railChips(story: readonly { code: string }[], code: string): RailChip[] {
  if (story.length === 0) return [{ code, source: false }]
  return story.map((obj) => ({ code: obj.code, source: obj.code !== code }))
}

// ---------------------------------------------------------------------------

/** Ba lớp KPI của tài liệu, tái xuất để màn không phải import thẳng fixture. */
export const LAYERS = KPI_LAYERS

/** Vai BD — nhãn bảng bằng chứng gọi tên anh, không gọi "người giữ lead". */
export const BD_NAME = BD

async function fetchPerformance(period: Period): Promise<Performance> {
  const overview = buildOverview(period)
  const prev = previousPeriod(period)
  const { exits, total } = buildExits(period)
  const people = buildPeople(period, overview)

  return {
    period,
    overview,
    previous: prev ? { label: prev.label, overview: buildOverview(prev) } : null,
    funnel: buildFunnel(overview),
    months: buildMonths(period),
    exits,
    exitedTotal: total,
    sla: buildSla(period),
    people,
    roles: buildRoleFilters(people),
  }
}

export function performanceQuery(choice: PeriodChoice) {
  const period = resolvePeriod(choice)
  return queryOptions({
    queryKey: ['sales', 'performance', period.key] as const,
    queryFn: () =>
      api.read(`/sales/performance/${period.key}`, {
        need: { branch: 'Sales', permission: 'hiệu-suất.xem' },
        load: () => fetchPerformance(period),
      }),
  })
}
