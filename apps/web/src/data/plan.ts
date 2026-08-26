import { queryOptions } from '@tanstack/react-query'
import { billions, millions, percent } from '@pv/ui'
import { costBand } from '@pv/engines'
import {
  DAS_VINA_FROZEN_AT,
  EXIT_REASONS,
  HEAD_OF_SALES,
  LEADS,
  MARKETING,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  ROLE_KPI_MODEL,
  costOfGoodLead,
  dasVina,
  isOverSla,
  isRotting,
  isRunning,
  leadMilestones,
  sourcesOwnedBy,
  sourcesPaid,
  type ExitReason,
  type KpiMeasureUnit,
  type OpenDeal,
} from '@pv/engines/fixtures/das-vina'
import { DATA_WINDOW, MONTHS, inPeriod, spanDays, vn, type Period } from './period'
import { bandText, costGap, rankSources, type CostGap, type SourceCost } from './source-cost'

/** Module 4 · Số liệu & kế hoạch. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy số của module 4. Khi có backend, đổi thân
 *  `fetchPlanBoard` thành lời gọi HTTP; màn không phải sửa.
 *
 *  --------------------------------------------------------------------------
 *  VÌ SAO CÂU "CĂN CỨ" ĐƯỢC VIẾT Ở ĐÂY, KHÔNG PHẢI Ở TẦNG MÀN
 *  --------------------------------------------------------------------------
 *  Luật 9 bắt mọi khối AI có dòng "Căn cứ: …". Dòng đó không phải nhãn trang
 *  trí — nó là LỜI KHAI về dữ liệu trợ lý đã đọc. Nếu câu nằm ở JSX còn con số
 *  nằm ở đây, người sửa chữ sẽ đổi được lời khai mà không đụng vào phép tính,
 *  và tới lúc nào đó câu nói một đằng số một nẻo. Vì thế `suggestion` và
 *  `basis` ra lò cùng chỗ với con số đẻ ra chúng, và màn chỉ việc in.
 *
 *  Không con số nào ở file này được gõ tay: tất cả suy từ `@pv/engines/fixtures
 *  /das-vina` bằng code. Đổi fixture thì câu căn cứ đổi theo, không lệch được. */

/** Đơn lớn nhất đang chạy — mỏ neo của ContextRail (luật 10).
 *
 *  Tính một lần lúc nạp module, KHÔNG đi qua query: rail phải có mặt cả khi
 *  query chưa về. Màn trong lúc chờ vẫn là một màn, và luật 10 không có ngoại
 *  lệ cho trạng thái chờ. */
export const PLAN_ANCHOR: string =
  [...OPEN_DEALS].sort((a, b) => b.amount - a.amount)[0]?.code ?? ''

/** Một ô số của khối "Phòng đang đứng ở đâu".
 *
 *  KHÔNG có trường `delta`. `StatCard` có ô đó, nhưng delta là so với kỳ trước
 *  — mà DAS Vina chỉ có đúng một lát cắt đóng băng 17/08. Vẽ mũi tên lên/xuống
 *  ở đây là bịa ra một xu hướng chưa ai đo. */
export type PlanStat = {
  key: string
  /** Đã format sẵn, theo chuẩn tiền VN của `@pv/ui`. */
  value: string
  /** Tên của chỉ số, một mệnh đề. Không nhồi ngữ cảnh vào đây. */
  label: string
  /** Ngữ cảnh của con số — mẫu số, chỗ nó bám vào, hay số tiền đi kèm. Tách ra
   *  làm trường riêng chứ không nối vào `label` bằng dấu chấm giữa: nhãn trả
   *  lời "số này là gì", hint trả lời "so với cái gì". Nối làm một thì thẻ nào
   *  cũng thành một câu dài đọc bằng mắt mới ra, mà thẻ số sinh ra để liếc. */
  hint: string
}

/** Một dòng của bảng chỉ tiêu — MỘT thước, ở mức PHÒNG.
 *
 *  Đây là con số điều phối cả vòng bốn module, nên mỗi dòng phải tự đứng được:
 *  chỉ tiêu của kỳ · đã đạt · còn thiếu · nhịp cần có. Thiếu một trong bốn thì
 *  dòng chỉ còn là một ô số nữa. */
export type PlanTargetRow = {
  key: string
  /** Tên thước, chép đúng chữ của `ROLE_KPI_MODEL`. */
  metric: string
  /** Vai chịu thước này. */
  role: string
  /** Người mang vai đó. Số lượng của họ là một thừa số của chỉ tiêu phòng, và
   *  tên của họ là câu trả lời cho "ai làm phần còn thiếu". */
  owners: string[]
  /** Chỉ tiêu của MỘT NGƯỜI trong MỘT THÁNG, đúng như `ROLE_KPI_MODEL` ghi. */
  monthlyTarget: number
  /** MẪU SỐ, chép nguyên công thức ở fixture. Một thước không khai mẫu số thì
   *  con số của nó so được với bất cứ thứ gì, tức không so được với gì cả. */
  formula: string
  unit: KpiMeasureUnit
  /** Chỉ tiêu của KỲ = chỉ tiêu tháng × số người × số tháng quy đổi. */
  target: number
  /** Đã đạt, đo tới LÁT CẮT 17/08 — không tới hết kỳ. */
  done: number
  /** `max(0, target − done)`. Bằng 0 là ĐÃ ĐỦ, không phải chưa đo. */
  missing: number
  /** `done ÷ target`. */
  ratio: number
  /** Cần bao nhiêu mỗi ngày để kịp chân trời; `null` khi đã đủ hoặc kỳ đã đóng
   *  — không phải 0, vì 0 đọc ra "không cần làm gì nữa". */
  perDay: number | null
  /** Cùng con số đó, viết thành chữ đọc được.
   *
   *  "0,1 đơn mỗi ngày" là một phép chia đúng mà không ai làm theo được: thứ
   *  người ta cần nghe là "1 đơn trong 14 ngày". Dưới một đơn vị mỗi ngày thì
   *  đổi cách nói, và chữ này ra lò ở tầng dữ liệu để hai màn không tự chế hai
   *  cách nói khác nhau cho cùng một con số. */
  perDayText: string
  /** So nhịp của thước với nhịp của thời gian. */
  pace: 'da-du' | 'du-nhip' | 'hut-nhip'
}

/** Bảng chỉ tiêu của kỳ được giao — khối đứng đầu màn.
 *
 *  KỲ ở đây là THÁNG chứa lát cắt, và nó có hai đầu khác nhau (xem `period.ts`):
 *  chỉ tiêu tính tới chân trời 31/08, còn số đo dừng ở lát cắt 17/08. Trộn hai
 *  đầu là cách êm ái nhất để ra một con số "còn thiếu" sai. */
export type PlanTargets = {
  /** 'Tháng 8 · 2026' */
  label: string
  /** '01/08 → 31/08' — khoảng ĐƯỢC GIAO chỉ tiêu. */
  window: string
  /** '17/08' — mốc cuối CÓ SỐ ĐO. */
  cutoff: string
  /** Số ngày của cả kỳ, và số ngày đã có số đo. */
  days: number
  elapsed: number
  /** Số ngày từ lát cắt tới hết kỳ. */
  daysLeft: number
  /** Phần thời gian đã đi — vạch để chấm đủ nhịp hay hụt nhịp. */
  elapsedShare: number
  rows: PlanTargetRow[]
  /** Thước hụt nhịp nặng nhất — `null` khi cả kỳ đang theo kịp. Tính một lần ở
   *  đây để câu tóm trên màn và đề xuất của trợ lý không chỉ vào hai thước khác
   *  nhau. */
  worst: PlanTargetRow | null
  /** MỌI thước cùng đứng ở chỗ nặng nhất ấy — dài 0 khi không thước nào hụt, và
   *  dài hơn 1 khi hai thước hoà nhau.
   *
   *  Đây là thứ chặn một lỗi im lặng: `worst` lấy phần tử đầu của một mảng đã
   *  sắp xếp, mà `sort` ổn định thì HOÀ nghĩa là thứ tự khai báo ở fixture chọn
   *  hộ. Hôm nay đúng là hoà — "Lead kéo về" 4/24 và "Lead xác minh là công ty
   *  thật" 2/12 bằng nhau tới từng bit — nên nếu chỉ đọc `worst` thì màn khẳng
   *  định một thước nặng hơn thước kia, và dồn việc cho một người, chỉ vì dòng
   *  của họ đứng trên trong `ROLE_KPI_MODEL`. Hoà thì phải nói ra là hoà. */
  worstTied: PlanTargetRow[]
  /** Một câu: mấy thước hụt nhịp, tháng đã đi bao xa, thước nào nặng nhất.
   *
   *  KHÔNG mang "còn N ngày" ở đuôi nữa: trên màn Kế hoạch con số đó đã nằm ở
   *  badge cạnh tiêu đề khối, hai chỗ nói cùng một điều cách nhau vài phân. Màn
   *  nào đọc câu này mà không có badge thì tự in `daysLeft` — nó là một trường
   *  công khai ngay dưới đây. */
  headline: string
  /** Vai KHÔNG có dòng nào ở bảng, và vì sao. Vai vắng mặt mà không ai nói ra
   *  thì bảng đọc như thể cả phòng chỉ có ba vai. */
  absentNote: string
}

/** Một việc trợ lý đề xuất. Đúng hình của `AiActionProps`: có câu đề xuất, có
 *  căn cứ, và chờ nút. Thêm ba thứ mà luật 9 không đòi nhưng kế hoạch thì cần:
 *  ai làm, phải xong trong khoảng nào, và tra ngược được ở object nào. */
export type PlanProposal = {
  id: string
  /** Một câu, có hệ quả rõ. */
  suggestion: string
  /** Số thật, suy từ fixture — không phải câu nói suông. */
  basis: string
  /** Kế hoạch không có việc vô chủ. */
  owner: string
  /** Mã object để người đọc tra ngược sang module 1 hoặc module 2. Rỗng khi đề
   *  xuất không bám vào object nào — nhịp của kỳ là số của cả phòng, không của
   *  một chiến dịch hay một đơn. */
  codes: string[]
  /** Việc này phải xong TRONG khoảng nào. Bắt buộc, và mỗi đề xuất mang chân
   *  trời của chính nó: cứu nhịp của kỳ là việc của mấy ngày còn lại tháng này,
   *  còn đổi cách chạm hay đổi ngân sách là việc tháng tới. Trước 20/08 cả khối
   *  mang một cái tên chung "Đề xuất cho tháng tới", nên việc đầu tiên — cứu
   *  tháng 8 — đi vào một bản kế hoạch tự khai là của tháng khác. */
  horizon: string
  confirmLabel: string
}

export type PlanBoard = {
  /** Chỉ tiêu của kỳ — khối đầu màn, và là thứ ba module kia đọc lại. */
  targets: PlanTargets
  stats: PlanStat[]
  /** Chỗ hai ô số nhìn cùng một thứ — nói ra, đừng để người đọc đếm hai lần. */
  statsNote: string
  /** Nguồn CÓ TIÊU TIỀN, rẻ nhất lên đầu. Xếp theo ĐIỂM, hiện DẢI — quyết định
   *  D-03. Nguồn cỡ mẫu nhỏ vẫn ở đây, mang `enough = false`. */
  ranking: SourceCost[]
  /** Phạm vi của bảng, và hai nguồn 0 đồng đứng ngoài nó vì sao. */
  rankingNote: string
  /** Câu so sánh ĐÃ QUA CỔNG `separableCost`, hoặc câu trung tính khi hai dải
   *  còn chồng nhau. Viết ở tầng dữ liệu vì nó là kết luận của một phép kiểm,
   *  không phải một dòng chữ trang trí. */
  rankingClaim: string
  proposals: PlanProposal[]
  /** Người gật. Lấy từ vai đã chốt, không gõ tên vào màn. */
  approver: string
}

// ---------------------------------------------------------------------------
// Phép tính — mỗi hàm trả về đúng thứ một câu căn cứ cần, không hơn.
// ---------------------------------------------------------------------------

const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))
const STAGE_LIMIT = new Map(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))

/** Đơn đang mục, đơn nằm trong cột LÂU NHẤT lên đầu.
 *
 *  Xếp theo `daysInStage` chứ không theo phần vượt hạn: người đọc kế hoạch hỏi
 *  "đơn nào đứng im lâu nhất", không hỏi "đơn nào vượt hạn nhiều phần trăm". */
function rottingDeals(): OpenDeal[] {
  return OPEN_DEALS.filter(isRotting).sort((a, b) => b.daysInStage - a.daysInStage)
}

function overdueLine(deal: OpenDeal): string {
  return `${deal.code} · ${deal.daysInStage} ngày ở cột ${STAGE_LABEL.get(deal.stage) ?? deal.stage}, hạn ${STAGE_LIMIT.get(deal.stage) ?? 0}`
}

type ExitTally = {
  label: ExitReason
  count: number
  /** Bao nhiêu trong số đó rơi ngay ở bậc đầu mối — tức chưa ai chạm tới. */
  atFirstTier: number
  /** Tổng số ô bắt buộc những lead này kịp điền, dùng để lấy trung bình. */
  filledSum: number
  codes: string[]
}

/** Sáu lý do rơi, đếm lại TỪ SỔ chứ không lấy `count` sẵn của `EXIT_REASONS` —
 *  vì kế hoạch còn cần biết chúng rơi ở bậc nào và điền được mấy ô, hai thứ chỉ
 *  có trong từng dòng lead. */
function exitTally(): { total: number; ranked: ExitTally[] } {
  const exited = LEADS.filter((l) => Boolean(l.exitReason))

  const ranked = EXIT_REASONS.map((r): ExitTally => {
    const mine = exited.filter((l) => l.exitReason === r.label)
    return {
      label: r.label,
      count: mine.length,
      atFirstTier: mine.filter((l) => l.tier === 'dau-moi').length,
      filledSum: mine.reduce((sum, l) => sum + l.requiredFilled, 0),
      codes: mine.map((l) => l.code),
    }
  }).sort((a, b) => b.count - a.count)

  return { total: exited.length, ranked }
}

/** Một chữ số sau dấu phẩy, chuẩn VN. Dùng cho số trung bình và cho nhịp mỗi
 *  ngày — số đếm thì không bao giờ có phần thập phân. */
function oneDecimal(value: number): string {
  return value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function avg(sum: number, n: number): string {
  if (n === 0) return '0,0'
  return oneDecimal(sum / n)
}

// ---------------------------------------------------------------------------
// CHỈ TIÊU CỦA KỲ — con số điều phối cả vòng
// ---------------------------------------------------------------------------
//
// Mục tiêu của đợt là "điều phối bằng con số kế hoạch". Trước 20/08 con số ấy
// nằm đúng một chỗ: bên trong Drawer của màn Performance, sau ba cú bấm không
// cú nào có đường dẫn riêng. Màn mang tên Kế hoạch thì không cầm chỉ tiêu nào.
//
// BA ĐIỀU CỦA KHỐI NÀY, đọc trước khi sửa bất cứ phép tính nào:
//
//  1. **Chỉ tiêu không đẻ ở đây.** Nó sống ở `ROLE_KPI_MODEL.monthlyTarget`
//     (fixture · module 5 · Cấu hình). Module 4 chỉ nhân theo độ dài kỳ và theo
//     số người mang vai, rồi trừ đi phần đã đạt. Không con số nào gõ tay.
//  2. **Hai đầu thời gian, đừng trộn.** Chỉ tiêu tính tới CHÂN TRỜI 31/08; số
//     đã đạt đo tới LÁT CẮT 17/08. Cột "đã đạt" vì thế phải mang chữ "tới 17/08"
//     trên đầu — bỏ chữ đó là biến một tháng đi được nửa đường thành một tháng
//     làm hụt.
//  3. **Mức PHÒNG, không mức người.** "Ai đang làm được, ai đang tắc" là câu của
//     module 3 và đã có bảng người ở đó. Ở đây mỗi dòng là một thước của cả
//     phòng: chỉ tiêu tháng × số người mang vai. Cộng như vậy hợp lệ vì trong
//     một dòng mọi người dùng chung một đơn vị.
//
// NỢ ĐÃ BIẾT: năm phép đếm dưới đây lặp lại đúng vị ngữ mà `data/performance.ts`
// dùng cho nhịp cá nhân (`marketingReadings` · `bdReadings` · `saleReadings`).
// Hai file cùng đọc `BOOK` và cùng `inPeriod`, nên hôm nay chúng bằng nhau theo
// cách dựng; nhưng chúng bằng nhau vì viết giống nhau, không vì dùng chung một
// hàm. Gộp về một chỗ là quyết định kiến trúc giữa module 3 và module 4 — đã ghi
// vào openDecisions, chưa ai gật, nên chưa gộp.

const FROZEN_DAY = DAS_VINA_FROZEN_AT.slice(0, 10)

/** Sổ lead kèm mốc thời gian — dựng một lần cho cả file. */
const BOOK = LEADS.map((lead) => ({ lead, at: leadMilestones(lead) }))

const MKT_CODES = new Set(sourcesOwnedBy(MARKETING).map((s) => s.code))

/** Người mang một vai của `ROLE_KPI_MODEL`, trong nhánh Sales.
 *
 *  'Sale · chip' và 'Sale · dược' cùng thuộc vai 'Sale': thước đo theo VAI chứ
 *  không theo người — cùng phép so mà module 3 dùng. */
function actorsOfRole(role: string): string[] {
  return dasVina.actors
    .filter((a) => a.branches.includes('Sales'))
    .filter((a) => a.role === role || a.role.startsWith(`${role} ·`))
    .map((a) => a.name)
}

const SALE_NAMES = new Set(actorsOfRole('Sale'))

/** Lứa lead của Marketing trong kỳ — lead VÀO SỔ từ nguồn vai này đứng tên. */
function mktCohort(p: Period) {
  return BOOK.filter((r) => MKT_CODES.has(r.lead.source) && inPeriod(r.at.vaoSo, p))
}

/** Cách đo từng thước cộng dồn. Khoá trùng `RoleKpiSpec.key`; thước nào không có
 *  mặt ở đây thì KHÔNG lên bảng — thà vắng một dòng còn hơn một dòng số gần
 *  đúng. */
const MEASURE: Record<string, (p: Period) => number> = {
  'lead-keo-ve': (p) => mktCohort(p).length,
  'lead-tot': (p) => mktCohort(p).filter((r) => r.lead.requiredFilled >= REQUIRED_SLOTS).length,
  'o-bat-buoc': (p) =>
    BOOK.filter((r) => inPeriod(r.at.bdCham, p)).reduce((s, r) => s + r.lead.requiredFilled, 0),
  'lead-xac-minh': (p) => BOOK.filter((r) => inPeriod(r.at.mql, p)).length,
  /* `owner` có thể trống — lead nằm kho chung thì chưa ai giữ. Lead đã ký thì
     luôn có chủ, nhưng phép lọc vẫn hỏi thẳng thay vì tin vào điều đó. */
  'don-chot': (p) =>
    BOOK.filter((r) => r.lead.owner !== undefined && SALE_NAMES.has(r.lead.owner)).filter((r) =>
      inPeriod(r.at.ky, p),
    ).length,
}

/** Số của một thước viết thành chữ, theo đúng đơn vị của nó. */
export function planMeasureText(unit: KpiMeasureUnit, value: number): string {
  if (unit === 'tien') return millions(value)
  if (unit === 'ty-le') return percent(value)
  return value.toLocaleString('vi-VN')
}

/** Kỳ được giao chỉ tiêu: THÁNG chứa lát cắt.
 *
 *  Không phải quý — quý là kỳ của màn Performance, chọn để có đủ số mà đọc.
 *  Kế hoạch hỏi "còn mấy ngày nữa hết kỳ", mà câu đó chỉ gắt khi kỳ là tháng. */
function targetPeriod(): Period {
  const month = MONTHS.find((m) => m.from <= FROZEN_DAY && FROZEN_DAY <= m.to)
  if (!month) throw new Error('Không tháng nào của kịch bản chứa lát cắt — xem data/period.ts')
  return month
}

/** Bảng chỉ tiêu của kỳ. Hàm THUẦN, không qua query: ba màn khác có thể gọi
 *  thẳng để lấy cùng một con số (xem docblock export ở cuối file). */
export function planTargets(): PlanTargets {
  const p = targetPeriod()
  const days = spanDays(p.from, p.to)
  const elapsedShare = days > 0 ? p.elapsed / days : 0

  const rows: PlanTargetRow[] = []
  const absent: string[] = []

  for (const { role, kpis } of ROLE_KPI_MODEL) {
    const people = actorsOfRole(role)
    if (people.length === 0) continue

    const mine = kpis.filter((k) => k.paced && k.monthlyTarget !== null && MEASURE[k.key])
    if (mine.length === 0) {
      absent.push(
        kpis.length === 0
          ? `${role} không có thước cá nhân — vai này phân công, số của phòng chính là số của họ`
          : `${role} chưa thước nào có cả chỉ tiêu tháng lẫn nguồn số để đo`,
      )
      continue
    }

    for (const def of mine) {
      const measure = MEASURE[def.key]
      /* `mine` đã lọc theo hai điều kiện này rồi; hai dòng dưới chỉ để kiểu thu
         hẹp lại. KHÔNG viết `?? 0`: một chỉ tiêu 0 và một chỉ tiêu chưa đặt là
         hai chuyện khác nhau. */
      if (!measure || def.monthlyTarget === null) continue

      const target = def.monthlyTarget * people.length * p.months
      const done = measure(p)
      const missing = Math.max(0, target - done)
      const ratio = target > 0 ? done / target : 0
      const perDay = missing > 0 && p.daysLeft > 0 ? missing / p.daysLeft : null

      rows.push({
        key: def.key,
        metric: def.label,
        role,
        owners: people,
        monthlyTarget: def.monthlyTarget,
        formula: def.formula,
        unit: def.unit,
        target,
        done,
        missing,
        ratio,
        perDay,
        perDayText:
          perDay === null
            ? 'đã đủ chỉ tiêu kỳ'
            : perDay >= 1
              ? `${oneDecimal(perDay)} mỗi ngày`
              : `${planMeasureText(def.unit, missing)} trong ${p.daysLeft} ngày`,
        pace: missing === 0 ? 'da-du' : ratio >= elapsedShare ? 'du-nhip' : 'hut-nhip',
      })
    }
  }

  const behind = rows.filter((r) => r.pace === 'hut-nhip')
  /* Thước hụt nặng nhất — cùng phép so mà đề xuất đầu tiên dùng, để câu tóm và
     câu đề xuất không bao giờ chỉ vào hai thước khác nhau.

     HOÀ THÌ KHÔNG PHÁ HOÀ BẰNG THỨ TỰ MẢNG. `sort` của JS ổn định, nên hai
     thước bằng nhau thì cái đứng trước trong `ROLE_KPI_MODEL` thắng — một luật
     phá hoà không ai viết ra, không ai kiểm được, mà lại quyết ai bị dồn việc
     của mười bốn ngày cuối kỳ. Ở đây giữ CẢ CỤM hoà và bắt câu chữ nói ra; so
     `missing` để phá hoà thì cũng không được, vì hai thước khác đơn vị (lead và
     ô bắt buộc) nên hai con số "còn thiếu" không đứng chung một thang nào. */
  const sorted = [...behind].sort((a, b) => a.ratio - b.ratio)
  const [worst] = sorted
  const worstTied =
    worst === undefined ? [] : sorted.filter((r) => Math.abs(r.ratio - worst.ratio) < 1e-9)

  return {
    label: p.label,
    window: `${vn(p.from)} → ${vn(p.to)}`,
    cutoff: vn(FROZEN_DAY),
    days,
    elapsed: p.elapsed,
    daysLeft: p.daysLeft,
    elapsedShare,
    rows,
    worst: worst ?? null,
    worstTied,
    headline:
      worst === undefined
        ? `Kỳ đã đi ${percent(elapsedShare)} (${p.elapsed}/${days} ngày) và cả ${rows.length} thước đều theo kịp nhịp.`
        : worstTied.length > 1
          ? `Kỳ đã đi ${percent(elapsedShare)} (${p.elapsed}/${days} ngày) mà ${behind.length} trên ${rows.length} thước hụt nhịp; ${worstTied.length} thước cùng nặng nhất, cùng mới đi ${percent(worst.ratio)}: ${worstTied.map((r) => `"${r.metric}"`).join(' và ')}.`
          : `Kỳ đã đi ${percent(elapsedShare)} (${p.elapsed}/${days} ngày) mà ${behind.length} trên ${rows.length} thước hụt nhịp, nặng nhất là "${worst.metric}" mới đi ${percent(worst.ratio)}.`,
    absentNote: absent.length === 0 ? '' : `Vai không có dòng nào ở bảng: ${absent.join(' · ')}.`,
  }
}

/** Một dòng chỉ tiêu, tra theo khoá thước.
 *
 *  Mở ra để MÀN KHÁC đọc được con số kế hoạch mà không phải dựng lại phép tính:
 *  Sổ lead (module 2) hỏi `planTargetOf('don-chot')` để nói cho người Sale biết
 *  tháng này phòng còn thiếu mấy đơn và còn mấy ngày; Trang chủ hỏi cùng hàm cho
 *  dòng brief buổi sáng. `null` = thước không có trên bảng, và màn gọi phải nói
 *  ra chứ đừng hiện 0. */
export function planTargetOf(key: string): PlanTargetRow | null {
  return planTargets().rows.find((r) => r.key === key) ?? null
}

// ---------------------------------------------------------------------------
// Bốn đề xuất. Mỗi cái ăn đầu ra của một module khác nhau:
//   · nhịp của kỳ   ← chỉ tiêu (module 5) đo lại trên sổ lead (module 2)
//   · đơn đang mục   ← module 2 (sổ cơ hội, và SLA cũng là khái niệm của nó —
//                       hạn nằm ở PIPELINE_STAGES; module 3 chỉ ĐỌC lại)
//   · lý do rơi lớn  ← module 2 (sổ lead)
//   · giá lead tốt   ← module 1 (chiến dịch)
// Đó là lý do module 4 làm cuối, và là lý do có đúng bốn khối chứ không phải ba
// mươi: mỗi đề xuất phải chỉ được vào một chỗ đã đo, không phải một linh cảm.
//
// Đề xuất ĐẦU đứng trước có chủ ý: ba cái sau chữa một triệu chứng đã thấy, còn
// cái đầu là khoảng cách tới chỉ tiêu — thứ duy nhất trên màn nói được "tháng
// này phòng còn nợ bao nhiêu, và mỗi ngày phải trả bao nhiêu".
// ---------------------------------------------------------------------------

/** Hai đầu gần nhau nhất của hai dải rời — tử số và mẫu số của câu "ít nhất N
 *  lần", viết ra để người đọc kiểm lại được phép chia.
 *
 *  `costGap` trả `null` ngay khi cận trên của nguồn rẻ là `null`, nên nhánh thứ
 *  hai dưới đây không tới được hôm nay. Nó vẫn phải nói thật: bản trước viết
 *  `?? 0` và in ra "0,0 tr" — một cận trên bằng không, tức khẳng định nguồn rẻ
 *  cho lead tốt miễn phí. Số 0 không bao giờ được thay chỗ cho "chưa có số". */
function narrowestPair(gap: CostGap): string {
  const hi = gap.cheap.band.hi
  return hi === null
    ? `${millions(gap.dear.band.lo)} chia cận trên của ${gap.cheap.code}, mà cận trên đó chưa đo được`
    : `${millions(gap.dear.band.lo)} chia ${millions(hi)}`
}

/** Ai gánh một thước — tên khi vai chỉ có một người, còn lại là "N người vai X".
 *  Kế hoạch không có việc vô chủ, nhưng cũng không được gán tên cho một người
 *  khi cả vai cùng chịu. */
function ownerOf(row: PlanTargetRow): string {
  return row.owners.length === 1
    ? (row.owners[0] ?? row.role)
    : `${row.owners.length} người vai ${row.role}`
}

/** Bốn con số của một dòng chỉ tiêu, viết ra để người gật kiểm lại được. */
function targetDetail(row: PlanTargetRow): string {
  const say = (n: number) => planMeasureText(row.unit, n)
  return `"${row.metric}" ${say(row.target)} (${say(row.monthlyTarget)} một tháng × ${row.owners.length} người vai ${row.role}) · đã đạt ${say(row.done)} · còn thiếu ${say(row.missing)}, nhịp cần có ${row.perDayText} · thước mới đi ${percent(row.ratio)} · công thức: ${row.formula}`
}

function buildProposals(targets: PlanTargets): PlanProposal[] {
  const out: PlanProposal[] = []

  /* 0 · Thước hụt nhịp nặng nhất → dồn việc của những ngày còn lại.
     Chân trời của việc này là MẤY NGÀY CÒN LẠI CỦA KỲ NÀY, không phải tháng
     tới: nó cứu chỉ tiêu đang chạy dở.
     Hoà thì nêu cả cụm — xem `worstTied`. Chọn một cái để dồn việc trong khi
     hai thước bằng nhau đúng tới số lẻ là để thứ tự khai báo ở fixture chỉ định
     người phải làm thêm. */
  const tied = targets.worstTied
  const worstPace = targets.worst
  if (worstPace && tied.length > 0) {
    const many = tied.length > 1
    const say = (row: PlanTargetRow, n: number) => planMeasureText(row.unit, n)

    out.push({
      id: 'dong-nhip-ky',
      suggestion: many
        ? `Dồn việc của ${targets.daysLeft} ngày cuối kỳ vào ${tied.length} thước đang hụt nặng ngang nhau — ${tied.map((r) => `"${r.metric}" còn thiếu ${say(r, r.missing)}`).join(' và ')} mới đủ chỉ tiêu ${targets.label}.`
        : `Dồn việc của ${targets.daysLeft} ngày cuối kỳ vào thước "${worstPace.metric}" — còn thiếu ${say(worstPace, worstPace.missing)} mới đủ chỉ tiêu ${targets.label}.`,
      basis: `Chỉ tiêu kỳ và số đã đạt tính đến ${targets.cutoff}, thời gian đã đi ${percent(targets.elapsedShare)} — ${tied.map(targetDetail).join(' · ')}${many ? ` · ${tied.length} thước này đi được đúng bằng nhau nên không thước nào được gọi là nặng hơn thước nào` : ''}`,
      owner: many ? tied.map(ownerOf).join(' và ') : ownerOf(worstPace),
      codes: [],
      horizon: `${targets.daysLeft} ngày cuối ${targets.label}`,
      confirmLabel: 'Thêm vào kế hoạch',
    })
  }

  // 1 · Đơn đang mục → người gật vào cuộc.
  const rotting = rottingDeals()
  const head = rotting.slice(0, 2)
  const [worst] = head
  if (worst) {
    const value = rotting.reduce((sum, d) => sum + d.amount, 0)
    out.push({
      id: 'don-dang-muc',
      suggestion: `Đưa ${HEAD_OF_SALES} vào cuộc với ${rotting.length} đơn đang mục, bắt đầu từ ${head.map((d) => d.code).join(' và ')} — hai đơn nằm cột lâu nhất.`,
      basis: `${rotting.length}/${OPEN_DEALS.length} đơn quá hạn cột · ${billions(value)} đang treo · ${head.map(overdueLine).join(' · ')}`,
      owner: HEAD_OF_SALES,
      codes: head.map((d) => d.code),
      /* Đơn ĐÃ quá hạn cột rồi, nên đây không phải việc để dành sang tháng sau. */
      horizon: `${targets.daysLeft} ngày cuối ${targets.label}`,
      confirmLabel: 'Thêm vào kế hoạch',
    })
  }

  // 2 · Lý do rơi lớn nhất → agent 1 chạm sớm hơn.
  const { total: exitedTotal, ranked } = exitTally()
  const [top] = ranked
  if (top && top.count > 0) {
    out.push({
      id: 'cham-som-hon',
      suggestion: `Cho agent 1 chạm sớm hơn ở bậc Đầu mối — lý do rơi lớn nhất của kỳ vẫn là "${top.label}".`,
      basis: `${top.count}/${exitedTotal} lead rơi vì lý do này · ${top.atFirstTier}/${top.count} rơi ngay ở bậc Đầu mối · trung bình mới điền ${avg(top.filledSum, top.count)} trên ${REQUIRED_SLOTS} ô bắt buộc`,
      owner: MARKETING,
      codes: top.codes.slice(0, 2),
      /* Đổi CÁCH LÀM của agent 1 là việc của kỳ sau: nó không cứu được lead đã
         rơi, nó đổi tỉ lệ rơi của lứa lead tới. */
      horizon: 'tháng tới',
      confirmLabel: 'Thêm vào kế hoạch',
    })
  }

  /* 3 · Giá mỗi lead tốt → dồn tiền vào nguồn rẻ, cắt nguồn đắt.
     ------------------------------------------------------------------------
     CỔNG `separableCost` ĐỨNG TRƯỚC CÂU CHỮ, KHÔNG PHẢI SAU
     ------------------------------------------------------------------------
     Bản trước lấy hai đầu bảng rồi chia hai ĐIỂM: `48,3 tr ÷ 2,0 tr = 24` và
     in "chênh 24 lần". Con số 24 không sai phép tính, nó sai về thứ nó nói: hai
     điểm ấy đứng trên mẫu số 9 và 3 lead tốt, và khoảng tin cậy của chúng
     rộng tới mức bội số thật nằm đâu đó từ 6,6 lần trở lên — 24 chỉ là một giá
     trị trong dải đó, được in ra như thể nó là kết luận.

     Giờ câu KHẲNG ĐỊNH chỉ ra lò khi hai DẢI rời nhau (`costGap`), và bội số
     lấy từ hai đầu GẦN NHAU NHẤT của hai dải. Hai dải chồng nhau thì đề xuất
     vẫn còn — tiền vẫn phải quyết — nhưng nó đổi sang câu trung tính nói cả hai
     dải, và không nguồn nào bị gọi là đắt hơn nguồn nào. */
  const byPrice = rankSources().ranked
  const cheap = byPrice[0]
  const dear = byPrice[byPrice.length - 1]
  if (cheap && dear && cheap.code !== dear.code) {
    const gap = costGap(cheap, dear)
    const bands = `${cheap.code} chi ${millions(cheap.cost)} ra ${cheap.good} lead tốt trên ${cheap.leads} lead · dải ${bandText(cheap.band)} mỗi lead tốt · ${dear.code} chi ${millions(dear.cost)} ra ${dear.good} lead tốt trên ${dear.leads} lead · dải ${bandText(dear.band)}`

    out.push({
      id: 'don-ngan-sach',
      suggestion: gap
        ? `Dồn ngân sách sang ${gap.cheap.code} và cắt ${gap.dear.code} — ${gap.dear.code} đắt hơn ít nhất ${gap.timesText} lần mỗi lead tốt.`
        : `Giữ nguyên ngân sách của ${cheap.code} và ${dear.code} tháng tới, chạy thêm đợt để dày mẫu số — chưa nguồn nào chứng minh được là rẻ hơn nguồn nào.`,
      basis: gap
        ? `${bands} · hai dải RỜI NHAU, nên bội số lấy từ hai đầu gần nhau nhất (${narrowestPair(gap)}) chứ không phải từ hai điểm`
        : `${bands} · hai dải CHỒNG NHAU, nên không có bội số nào đứng vững — tỉ số hai điểm ở đây là một con số không ai kiểm được`,
      owner: MARKETING,
      codes: [cheap.code, dear.code],
      /* Ngân sách chia theo kỳ, nên việc này bắt đầu ở kỳ sau. */
      horizon: 'tháng tới',
      confirmLabel: 'Thêm vào kế hoạch',
    })
  }

  return out
}

/** Khoảng CÓ SỐ ĐO của cả kịch bản — mẫu số thời gian của bốn ô số.
 *
 *  Bốn ô này đọc CẢ SỔ, không cắt theo tháng như bảng chỉ tiêu ở trên nó. Hai
 *  khối vì thế trả hai con số cho cùng một chữ ("lead tốt": 2 của tháng 8 và 34
 *  của cả sổ), và cùng một chữ khác ("giá mỗi lead tốt": 10,0 tr cả kỳ, mà cắt
 *  riêng tháng 8 thì màn Performance đọc ra 72,5 tr). Cả hai con số đều đúng —
 *  cái sai là để chúng đứng trên một màn mà không ô nào khai mình đo khoảng
 *  nào. */
const DATA_SPAN = `${vn(DATA_WINDOW.from)} → ${vn(DATA_WINDOW.cutoff)}`

function buildStats(targets: PlanTargets): { stats: PlanStat[]; statsNote: string } {
  const rotting = rottingDeals()
  const rottingValue = rotting.reduce((sum, d) => sum + d.amount, 0)
  const overSla = LEADS.filter(isOverSla)
  const running = LEADS.filter(isRunning)
  const good = LEADS.filter((l) => l.requiredFilled >= REQUIRED_SLOTS)

  /* Ô tổng chia bằng hàm chung của fixture, không cộng lại từ bảng xếp hạng ở
     trên: bảng bỏ nguồn chưa ra lead tốt nào, mà tiền của nguồn đó vẫn đã tiêu.
     Cộng từ bảng là làm cả phòng trông rẻ hơn thật. */
  const paid = sourcesPaid()
  const spend = costOfGoodLead(paid)
  /* Ô này KHÔNG được hiện một con số trần (§6.7). Điểm vẫn là số to — nó là thứ
     người ta liếc — nhưng dải đi kèm ngay dưới, ở dòng hint. Cận trên của cả
     phạm vi là 13,6 tr, tức trên ngưỡng 12 tr của thước Marketing: đọc điểm 10,0
     tr một mình thì kết luận ngược hẳn. */
  const paidLeads = paid.reduce((sum, s) => sum + s.leads, 0)
  const paidBand = costBand(spend.cost, spend.good, paidLeads)

  /** Lead quá SLA và đơn đang mục có PHẢI cùng một tập không — kiểm bằng mã
   *  đơn, không suy từ hai con số bằng nhau. */
  const overSlaDeals = new Set(overSla.map((l) => l.dealCode))
  const sameChokepoint =
    overSla.length === rotting.length && rotting.every((d) => overSlaDeals.has(d.code))

  return {
    stats: [
      {
        key: 'dang-muc',
        value: `${rotting.length}/${OPEN_DEALS.length}`,
        label: 'Đơn đang mục',
        hint: `${billions(rottingValue)} đang treo`,
      },
      {
        key: 'qua-sla',
        value: `${overSla.length}`,
        label: 'Lead quá SLA',
        hint: `Trên ${running.length} lead đang chạy`,
      },
      {
        key: 'lead-tot',
        value: `${good.length}/${LEADS.length}`,
        label: 'Lead tốt trên tổng lead',
        hint: `Qua cổng ${REQUIRED_SLOTS} ô bắt buộc`,
      },
      {
        key: 'gia-lead-tot',
        /* Nhãn phải KHAI HAI PHẠM VI, không phải một. TẬP NGUỒN: cùng chữ "giá
           mỗi lead tốt" mà màn Chiến dịch đọc trên nguồn đã chạy đợt, màn
           Performance đọc trên nguồn của Marketing. THỜI GIAN: ô này không cắt
           kỳ, nên nó là 10,0 tr; cùng thước ấy cắt riêng tháng 8 ở màn
           Performance ra 72,5 tr, vì chi của gian hàng rơi trọn vào tháng đó.
           Khai tập mà không khai thời gian thì vẫn còn hai số cho một câu hỏi.

           `perGood === null` là CHƯA ĐO ĐƯỢC, không phải "không áp dụng": chưa
           nguồn nào ra lead tốt thì phép chia không có mẫu số. Dấu "—" ở đây
           từng mang nghĩa của mức khác, mà một dấu gạch không được mang hai
           nghĩa trong cùng một hàng thẻ. */
        value: spend.perGood === null ? 'chưa đo được' : millions(spend.perGood),
        label: 'Giá mỗi lead tốt',
        hint:
          spend.perGood === null
            ? `${paid.length} nguồn có tiêu tiền · ${millions(spend.cost)} đã tiêu mà chưa nguồn nào ra lead tốt, nên phép chia chưa có mẫu số`
            : `${paid.length} nguồn có tiêu tiền, cả kỳ dữ liệu ${DATA_SPAN} · ${millions(spend.cost)} ra ${spend.good} lead tốt · dải ${bandText(paidBand)}. Cắt riêng một tháng thì số khác hẳn — tiền và lead tốt không rơi đều các tháng.`,
      },
    ],
    /* Hai ô đầu NGHI là cùng một chỗ tắc, nhưng "hai số bằng nhau" không đủ để
       khẳng định "cùng một tập". Đối chiếu thật bằng mã đơn rồi mới nói —
       khẳng định quan hệ tập hợp từ hai phép đếm là kiểu bịa dữ liệu tinh vi
       nhất, vì nó đúng cho tới ngày fixture đổi. */
    statsNote:
      /* Câu KHAI KỲ đứng trước mọi câu khác của khối: nó là thứ chặn người đọc
         mang con số của bảng chỉ tiêu ngay trên đầu xuống đây so. */
      `Bốn ô này không cắt theo ${targets.label} của bảng chỉ tiêu ở trên: hai ô đầu đọc trạng thái tại lát cắt ${vn(DATA_WINDOW.cutoff)}, hai ô sau đếm cả kỳ dữ liệu ${DATA_SPAN} — nên "lead tốt" ở đây là ${good.length}/${LEADS.length} của cả sổ, không phải con số của kỳ trên bảng. ` +
      (sameChokepoint
        ? `Hai ô đầu đếm cùng một chỗ tắc từ hai sổ khác nhau: SLA chỉ đo bậc SQL, mà hạn của bậc SQL nằm đúng ở cột của sổ cơ hội. Đối chiếu theo mã đơn thì ${overSla.length} lead quá SLA ở trên đúng là ${rotting.length} đơn đang mục — một vấn đề, không phải hai.`
        : `Hai ô đầu đo hai chỗ khác nhau: ${overSla.length} lead quá SLA và ${rotting.length} đơn đang mục KHÔNG trùng nhau theo mã đơn, nên đừng cộng gộp hay coi là một.`),
  }
}

/** Bảng "nguồn nào rẻ" — bằng chứng đứng ngay dưới đề xuất số 3.
 *
 *  Ba điều bảng này phải giữ, cả ba là quyết định chứ không phải mặc định:
 *
 *   1. **Xếp theo ĐIỂM** như hôm nay (D-03), không theo cận trên. Đổi khoá xếp
 *      hạng là đổi thứ hạng của người làm ra nguồn đó, và chưa ai gật.
 *   2. **Nguồn cỡ mẫu nhỏ Ở LẠI bảng**, mang `enough = false`. Tài liệu §6.5 đề
 *      xuất loại CD-0105 ra ngoài; bản này không loại — một dòng biến mất là một
 *      dòng không ai còn nhớ để hỏi, mà 6 triệu vẫn đã tiêu thật.
 *   3. **Câu so sánh đi qua `costGap`.** Nó chỉ ra lò khi hai dải rời nhau; còn
 *      lại là câu trung tính đọc cả hai dải. */
function buildRanking(): { ranking: SourceCost[]; rankingNote: string; rankingClaim: string } {
  const { ranked, cashless } = rankSources()
  const thin = ranked.filter((r) => !r.enough)
  const cheap = ranked[0]
  const dear = ranked[ranked.length - 1]
  const gap = cheap && dear && cheap.code !== dear.code ? costGap(cheap, dear) : null

  const note = [
    `${ranked.length} nguồn có tiêu tiền, rẻ nhất lên đầu theo ĐIỂM — dải bên cạnh mới là thứ quyết được việc.`,
    cashless.length > 0
      ? `${cashless.map((r) => r.code).join(' và ')} không tốn đồng tiền mặt nào nên đứng ngoài bảng so giá: một bảng có chúng thì nguồn rẻ nhất vĩnh viễn là thứ không mua thêm được bằng ngân sách.`
      : '',
    thin.length > 0
      ? `${thin.map((r) => `${r.code} (${r.why})`).join(' · ')} — dải vẫn hiện, nhưng không câu so sánh nào được dựa vào ${thin.length > 1 ? 'chúng' : 'nó'}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    ranking: ranked,
    rankingNote: note,
    rankingClaim: gap
      ? `Câu so sánh giữa hai đầu bảng: ${gap.cheap.code} rẻ hơn ${gap.dear.code} ít nhất ${gap.timesText} lần mỗi lead tốt, vì dải ${bandText(gap.cheap.band)} và dải ${bandText(gap.dear.band)} rời hẳn nhau.`
      : cheap && dear
        ? `Chưa câu so sánh nào đứng vững trên bảng này: dải của ${cheap.code} (${bandText(cheap.band)}) và dải của ${dear.code} (${bandText(dear.band)}) còn chồng nhau, nên hai đầu bảng chưa phân biệt được với nhau.`
        : 'Chưa nguồn nào tiêu tiền trong kỳ, nên chưa có gì để so.',
  }
}

async function fetchPlanBoard(): Promise<PlanBoard> {
  const targets = planTargets()
  const { stats, statsNote } = buildStats(targets)
  const { ranking, rankingNote, rankingClaim } = buildRanking()
  return {
    targets,
    stats,
    statsNote,
    ranking,
    rankingNote,
    rankingClaim,
    proposals: buildProposals(targets),
    approver: HEAD_OF_SALES,
  }
}

export const planBoardQuery = queryOptions({
  queryKey: ['sales', 'plan-board'] as const,
  queryFn: fetchPlanBoard,
})
