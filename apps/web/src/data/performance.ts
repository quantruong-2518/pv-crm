import { queryOptions } from '@tanstack/react-query'
import {
  BD,
  CREDIT_RULES,
  dasVina,
  EXIT_REASONS,
  FUNNEL,
  isRotting,
  isRunning,
  LEADS,
  MARKETING,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  SOURCES,
  sourceStats,
  type LeadTier,
  type StageKey,
} from '@pv/engines/fixtures/das-vina'

/** Module 3 · Performance — "ai đang làm được, ai đang tắc". Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy số hiệu suất. Khi có backend, đổi thân
 *  `fetchPerformance` thành lời gọi HTTP; màn không phải sửa.
 *
 *  HAI LUẬT CỦA FILE NÀY, đọc trước khi thêm bất cứ con số nào:
 *
 *  1. **Không có trục thời gian.** Fixture là một LÁT CẮT đóng băng 17/08 · 09:10,
 *     không phải chuỗi số theo tháng. Mọi thứ ở đây là số của cả kỳ tính đến lát
 *     cắt đó. Thêm một hàm kiểu `theoThang()` là bắt đầu đẻ số không ai ký.
 *  2. **Thước đo lấy nguyên từ `CREDIT_RULES`.** Module 3 chỉ hiển thị, không tự
 *     định nghĩa cách chấm một vai (docs/kien-truc-san-pham.md · module 3). Thước
 *     nào fixture chưa có dữ liệu thì `value: null` — màn hiện "chưa đo được",
 *     KHÔNG điền số gần đúng thay.
 *
 *  Sổ lead nằm ở `data/leads.ts`, nguồn lead nằm ở `data/campaigns.ts`. Ba file
 *  đọc cùng một kịch bản qua ba query khác nhau. */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Sáu bậc phễu, nới kiểu khỏi tuple `as const` để duyệt được bằng vòng lặp. */
const FUNNEL_STEPS: readonly { key: string; label: string; count: number }[] = FUNNEL

const STAGES = new Map(PIPELINE_STAGES.map((s) => [s.key, s]))

function stageOf(key: StageKey) {
  const stage = STAGES.get(key)
  if (!stage) throw new Error(`Cột "${key}" không có trong PIPELINE_STAGES`)
  return stage
}

// ---------------------------------------------------------------------------
// Kiểu
// ---------------------------------------------------------------------------

/** Ba cách đọc một con số. `tien` là đồng, `ty-le` là 0–1. */
export type MetricUnit = 'so' | 'tien' | 'ty-le'

export type Metric = {
  /** Tên thước — lấy nguyên từ `CREDIT_RULES`, màn không tự đặt tên thước. */
  label: string
  /** `null` = fixture chưa có dữ liệu cho thước này. Ô trống là có chủ ý. */
  value: number | null
  unit: MetricUnit
  /** Số trên đến từ đâu, hoặc vì sao chưa đo được. */
  note: string
}

export type RoleKind = 'marketing' | 'bd' | 'sale' | 'presales' | 'truong-phong'

/** Một đợt chiến dịch/sự kiện nhìn từ phía công trạng Marketing. */
export type SourceRow = {
  code: string
  label: string
  waves: number
  leads: number
  good: number
  cost: number
  costPerGood: number | null
}

/** Một lead BD đang giữ — bằng chứng cho hai thước đầu của vai BD. */
export type LeadRow = {
  code: string
  company: string
  tier: LeadTier
  requiredFilled: number
  daysHere: number
}

/** Một đơn đang mở của Sale — bằng chứng cho thước "tốc độ qua từng cột". */
export type DealRow = {
  code: string
  company: string
  stage: string
  days: number
  limitDays: number
  amount: number
  rotting: boolean
}

export type RoleCard = {
  actorId: string
  name: string
  /** Vai như fixture ghi, ví dụ 'Sale · chip'. */
  role: string
  kind: RoleKind
  metrics: Metric[]
  /** Câu phải hiện khi vai này không chấm bằng số cá nhân, hoặc chưa đo được. */
  note?: string
  sources?: SourceRow[]
  leads?: LeadRow[]
  deals?: DealRow[]
}

/** Một bước rớt của phễu. Giữ CẢ hai đầu số tuyệt đối, không chỉ tỷ lệ — %
 *  đứng một mình giấu mất mẫu số (docs · module 3). */
export type Conversion = {
  fromLabel: string
  fromCount: number
  toLabel: string
  toCount: number
  ratio: number
}

export type ExitRow = { label: string; count: number; share: number }

export type Overview = {
  leads: number
  signed: number
  running: number
  exited: number
  openDeals: number
  openValue: number
  rotting: number
  /** Điểm cho Sparkline, hệ viewBox 0–26 của `@pv/ui`. Đường này chạy theo SÁU
   *  BẬC PHỄU — bậc là số đã chốt — chứ không theo thời gian. */
  funnelPoints: number[]
  /** Đơn lớn nhất đang mở. ContextRail dựng từ chuỗi E1 của mã này. */
  biggestDealCode: string
}

export type Performance = {
  overview: Overview
  roles: RoleCard[]
  conversions: Conversion[]
  /** Cả phễu, bậc đầu → bậc cuối. */
  overall: Conversion
  exits: ExitRow[]
  exitedTotal: number
}

// ---------------------------------------------------------------------------
// Khối 1 · Tổng quan — số của cả phòng
// ---------------------------------------------------------------------------

function buildOverview(): Overview {
  const top = FUNNEL_STEPS[0]?.count ?? 0
  /* Không dùng `OPEN_DEALS[0]!` làm mồi: sổ cơ hội rỗng thì `!` ném TypeError
     trần, đọc log không ra vì sao. Hỏng thì hỏng ở đây, kèm câu người đọc hiểu. */
  const firstDeal = OPEN_DEALS[0]
  if (!firstDeal) throw new Error('OPEN_DEALS rỗng — sổ cơ hội phải có ít nhất một đơn đang mở')
  const biggest = OPEN_DEALS.reduce((a, d) => (d.amount > a.amount ? d : a), firstDeal)

  return {
    leads: LEADS.length,
    signed: LEADS.filter((l) => l.contractCode).length,
    running: LEADS.filter(isRunning).length,
    exited: LEADS.filter((l) => l.exitReason).length,
    openDeals: OPEN_DEALS.length,
    openValue: sum(OPEN_DEALS.map((d) => d.amount)),
    rotting: OPEN_DEALS.filter(isRotting).length,
    /* Bậc đầu chạm mép trên (y=2), bậc cuối gần mép dưới. Trục y của SVG đi
       xuống nên số càng lớn thì y càng nhỏ. */
    funnelPoints: top > 0 ? FUNNEL_STEPS.map((s) => 24 - Math.round((s.count / top) * 22)) : [],
    biggestDealCode: biggest.code,
  }
}

// ---------------------------------------------------------------------------
// Khối 2 · Xét theo vai — thước đo lấy từ CREDIT_RULES
// ---------------------------------------------------------------------------

/** Dòng công trạng của `CREDIT_RULES` → cách màn này tính ra số.
 *  Khoá là chuỗi vai trong fixture; thiếu một dòng thì `creditOf` ném lỗi ngay
 *  lúc dựng, chứ không im lặng bỏ vai đó khỏi màn. */
const KIND: Record<string, RoleKind> = {
  Marketing: 'marketing',
  BD: 'bd',
  Sale: 'sale',
  Presales: 'presales',
  'Trưởng phòng Kinh doanh': 'truong-phong',
}

/** Vai của một người → dòng công trạng của vai đó. 'Sale · chip' và 'Sale · dược'
 *  cùng trỏ vào dòng 'Sale': thước đo theo VAI, không theo người. */
function creditOf(actorRole: string): { kind: RoleKind; labels: readonly string[] } {
  const rule = CREDIT_RULES.find((r) => actorRole === r.role || actorRole.startsWith(`${r.role} ·`))
  if (!rule) throw new Error(`Vai "${actorRole}" chưa có dòng trong CREDIT_RULES`)
  const kind = KIND[rule.role]
  if (!kind) throw new Error(`CREDIT_RULES có vai "${rule.role}" mà màn Performance chưa biết đo`)
  return { kind, labels: rule.metrics }
}

/** Ghép giá trị vào đúng tên thước thứ `i` của vai. Lệch số thước là lỗi thật:
 *  ai đó vừa sửa `CREDIT_RULES` mà quên màn này. */
function metric(labels: readonly string[], i: number, rest: Omit<Metric, 'label'>): Metric {
  const label = labels[i]
  if (!label) throw new Error(`CREDIT_RULES thiếu thước thứ ${i + 1} của vai`)
  return { label, ...rest }
}

/** Marketing — đo bằng lead kéo về, trong đó bao nhiêu lead TỐT, và giá mỗi lead
 *  tốt. "Lead tốt" là khái niệm của cổng init data nên `sourceStats` tính, không
 *  phải màn tự đếm. */
function marketingScore(labels: readonly string[]) {
  const mine = SOURCES.filter((s) => s.owner === MARKETING)
  const sources: SourceRow[] = mine.map((s) => {
    const stats = sourceStats(s.code)
    return {
      code: s.code,
      label: s.label,
      waves: s.waves.length,
      leads: stats.leads,
      good: stats.good,
      cost: stats.cost,
      costPerGood: stats.costPerGood,
    }
  })

  const leads = sum(sources.map((s) => s.leads))
  const good = sum(sources.map((s) => s.good))
  const cost = sum(sources.map((s) => s.cost))
  const waves = sum(sources.map((s) => s.waves))

  const metrics: Metric[] = [
    metric(labels, 0, {
      value: leads,
      unit: 'so',
      note: `${sources.length} chiến dịch và sự kiện đứng tên vai này · ${waves} đợt đã chạy`,
    }),
    metric(labels, 1, {
      value: good,
      unit: 'so',
      note: `Qua cổng ${REQUIRED_SLOTS} ô bắt buộc · ${good} trên ${leads} lead kéo về`,
    }),
    metric(labels, 2, {
      value: waves > 0 ? good / waves : null,
      unit: 'so',
      note: `Chia đều ${good} lead tốt cho ${waves} đợt đã chạy`,
    }),
    {
      /* Thước thứ tư nằm ở bảng công trạng của docs ("giá mỗi lead tốt") và đã
         được `sourceStats` tính sẵn — không phải màn tự đẻ ra một thước mới. */
      label: 'Giá mỗi lead tốt',
      value: good > 0 ? Math.round(cost / good) : null,
      unit: 'tien',
      note: `Tổng chi của ${sources.length} nguồn chia cho ${good} lead tốt`,
    },
  ]

  return { metrics, sources }
}

/** BD — đo bằng ô bắt buộc moi được và lead xác minh là công ty thật. Thước thứ
 *  ba (phản hồi trả ngược cho Marketing) chưa có dữ liệu, để trống.
 *
 *  Mẫu số là lead BD **đã chạm**, không phải lead BD **đang giữ**: công trạng ghi
 *  ở mọi lần chạm (docs · module 3), nên hai lead đã rơi vẫn tính ô bắt buộc mà
 *  BD moi được lúc còn trong luồng. Nhãn phải nói đúng chữ đó — gọi cả nhóm là
 *  "đang giữ" là khai khống số lead sống của một người. */
function bdScore(labels: readonly string[]) {
  const touched = LEADS.filter((l) => l.owner === BD)
  const stillIn = touched.filter(isRunning).length
  const dropped = touched.length - stillIn
  const slots = sum(touched.map((l) => l.requiredFilled))
  const verified = touched.filter((l) => l.tier !== 'dau-moi').length

  const leads: LeadRow[] = [...touched]
    .sort((a, b) => b.requiredFilled - a.requiredFilled || b.daysHere - a.daysHere)
    .map((l) => ({
      code: l.code,
      company: l.company,
      tier: l.tier,
      requiredFilled: l.requiredFilled,
      daysHere: l.daysHere,
    }))

  const metrics: Metric[] = [
    metric(labels, 0, {
      value: slots,
      unit: 'so',
      note: `${touched.length} lead đã chạm · ${stillIn} còn trong luồng · ${dropped} đã rơi · tối đa ${touched.length * REQUIRED_SLOTS} ô`,
    }),
    metric(labels, 1, {
      value: verified,
      unit: 'so',
      note: `${verified} trên ${touched.length} lead đã chạm đã lên bậc MQL trở lên. Mẫu số là lead BD chạm, mà trong kịch bản này BD chỉ nhận lead đã lên MQL — nên ${verified}/${touched.length} là hệ quả của cách chia việc, không phải điểm tuyệt đối.`,
    }),
    metric(labels, 2, {
      value: null,
      unit: 'so',
      note: 'Chưa đo được: sổ lead không ghi lần nào BD trả phản hồi về đợt cho Marketing.',
    }),
  ]

  return { metrics, leads }
}

/** Sale — đơn chốt, giá trị, tốc độ qua cột. Tốc độ đọc bằng `isRotting`, tức
 *  đúng phép so `daysInStage` với `limitDays` của cột, không đẻ ngưỡng thứ hai. */
function saleScore(labels: readonly string[], name: string) {
  const signed = LEADS.filter((l) => l.contractCode && l.owner === name)
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

  const metrics: Metric[] = [
    metric(labels, 0, {
      value: signed.length,
      unit: 'so',
      note: `Hợp đồng đứng tên vai này trong sổ lead`,
    }),
    metric(labels, 1, {
      value: sum(mine.map((d) => d.amount)),
      unit: 'tien',
      note: `${mine.length} đơn đang mở. Fixture không ghi giá trị hợp đồng đã ký nên không cộng vào đây.`,
    }),
    metric(labels, 2, {
      value: mine.length > 0 ? onTime / mine.length : null,
      unit: 'ty-le',
      note: `${onTime} trên ${mine.length} đơn còn trong hạn cột đang đứng · ${rotting.length} đơn đã mục`,
    }),
  ]

  return { metrics, deals }
}

/** Presales — cả hai thước đều CHƯA ĐO ĐƯỢC. Sổ cơ hội không có trường "ai đi
 *  cùng buổi demo", nên không có cách nào ghép buổi demo với người. */
function presalesScore(labels: readonly string[]) {
  const metrics: Metric[] = labels.map((label, i) =>
    metric(labels, i, {
      value: null,
      unit: 'so',
      /* KHÔNG viết "fixture không có buổi demo nào" — sai sự thật: sổ cơ hội có
         đơn đang đứng ở cột "Đã demo" và phễu có bậc báo giá. Thứ THIẾU là
         TRƯỜNG "ai đi cùng buổi demo", nên demo không ghép được với người. */
      note: `Sổ cơ hội không có trường "ai đi cùng buổi demo" · ${label.toLowerCase()} không ghép được buổi demo với người`,
    }),
  )

  return {
    metrics,
    note: 'Hai thước của vai này để trống có chủ ý: sổ cơ hội không có trường "ai đi cùng buổi demo". Điền số vào đây là bịa.',
  }
}

/** TP Kinh doanh — KHÔNG tính công trạng cá nhân. Câu này là luật ở bảng công
 *  trạng của docs, không phải cách nói tránh của màn. */
function headScore() {
  return {
    metrics: [] as Metric[],
    note: 'Không tính công trạng cá nhân — vai này phân công, số của phòng chính là số của họ.',
  }
}

function buildRoles(): RoleCard[] {
  return dasVina.actors
    .filter((a) => a.branches.includes('Sales'))
    .map((actor): RoleCard => {
      const { kind, labels } = creditOf(actor.role)
      const base = { actorId: actor.id, name: actor.name, role: actor.role, kind }

      switch (kind) {
        case 'marketing':
          return { ...base, ...marketingScore(labels) }
        case 'bd':
          return { ...base, ...bdScore(labels) }
        case 'sale':
          return { ...base, ...saleScore(labels, actor.name) }
        case 'presales':
          return { ...base, ...presalesScore(labels) }
        case 'truong-phong':
          return { ...base, ...headScore() }
      }
    })
}

// ---------------------------------------------------------------------------
// Khối 3 · Top các con số chuyển đổi
// ---------------------------------------------------------------------------

function buildConversions(): Conversion[] {
  return FUNNEL_STEPS.slice(0, -1).flatMap((step, i) => {
    const next = FUNNEL_STEPS[i + 1]
    if (!next) return []
    return [
      {
        fromLabel: step.label,
        fromCount: step.count,
        toLabel: next.label,
        toCount: next.count,
        ratio: step.count > 0 ? next.count / step.count : 0,
      },
    ]
  })
}

function buildOverall(): Conversion {
  const first = FUNNEL_STEPS[0]
  const last = FUNNEL_STEPS[FUNNEL_STEPS.length - 1]
  if (!first || !last) throw new Error('FUNNEL rỗng — phễu phải có ít nhất hai bậc')
  return {
    fromLabel: first.label,
    fromCount: first.count,
    toLabel: last.label,
    toCount: last.count,
    ratio: first.count > 0 ? last.count / first.count : 0,
  }
}

/** Sáu lý do rơi, xếp từ nặng xuống. Mẫu số là 52 lead ĐÃ RƠI, không phải 100
 *  đầu mối — trộn hai mẫu số là cách nhanh nhất để đọc sai màn này. */
function buildExits(): { exits: ExitRow[]; total: number } {
  const total = sum(EXIT_REASONS.map((r) => r.count))
  const exits = [...EXIT_REASONS]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ label: r.label, count: r.count, share: total > 0 ? r.count / total : 0 }))
  return { exits, total }
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
 *  biến mất im lặng và màn mất luật 10 mà không test nào đỏ. Khi đó hiện đúng
 *  một chip mã đơn, y như `pages/leads.tsx` làm cho lead chưa vào sổ cơ hội. */
export function railChips(story: readonly { code: string }[], code: string): RailChip[] {
  if (story.length === 0) return [{ code, source: false }]
  return story.map((obj) => ({ code: obj.code, source: obj.code !== code }))
}

// ---------------------------------------------------------------------------

async function fetchPerformance(): Promise<Performance> {
  const { exits, total } = buildExits()
  return {
    overview: buildOverview(),
    roles: buildRoles(),
    conversions: buildConversions(),
    overall: buildOverall(),
    exits,
    exitedTotal: total,
  }
}

export const performanceQuery = queryOptions({
  queryKey: ['sales', 'performance'] as const,
  queryFn: fetchPerformance,
})
