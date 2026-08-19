import { queryOptions } from '@tanstack/react-query'
import { billions, millions } from '@pv/ui'
import {
  EXIT_REASONS,
  HEAD_OF_SALES,
  LEADS,
  MARKETING,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  SOURCES,
  isOverSla,
  isRotting,
  isRunning,
  sourceStats,
  type ExitReason,
  type OpenDeal,
} from '@pv/engines/fixtures/das-vina'

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
  label: string
}

/** Một đề xuất cho tháng tới. Đúng hình của `AiActionProps`: có câu đề xuất, có
 *  căn cứ, và chờ nút. Thêm hai thứ mà luật 9 không đòi nhưng kế hoạch thì cần:
 *  ai làm, và tra ngược được ở object nào. */
export type PlanProposal = {
  id: string
  /** Một câu, có hệ quả rõ. */
  suggestion: string
  /** Số thật, suy từ fixture — không phải câu nói suông. */
  basis: string
  /** Kế hoạch không có việc vô chủ. */
  owner: string
  /** Mã object để người đọc tra ngược sang module 1 hoặc module 2. */
  codes: string[]
  confirmLabel: string
}

export type PlanBoard = {
  stats: PlanStat[]
  /** Chỗ hai ô số nhìn cùng một thứ — nói ra, đừng để người đọc đếm hai lần. */
  statsNote: string
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

type SourceCost = {
  code: string
  label: string
  cost: number
  good: number
  costPerGood: number
}

/** Giá mỗi lead tốt của từng nguồn CÓ TIÊU TIỀN, rẻ nhất lên đầu.
 *
 *  Hai nguồn tự nhiên (khách cũ giới thiệu, BD tự mở) chi 0 đồng nên giá của
 *  chúng luôn là 0 — để chúng vào bảng so giá thì nguồn rẻ nhất vĩnh viễn là
 *  một thứ không mua thêm được bằng ngân sách. Câu hỏi của khối này là "tiền
 *  nên dồn vào đâu", nên chỉ so những chỗ tiền đi qua. */
function paidSourceCosts(): SourceCost[] {
  const out: SourceCost[] = []

  for (const s of SOURCES) {
    if (s.cost <= 0) continue
    const stats = sourceStats(s.code)
    if (stats.costPerGood === null) continue
    out.push({
      code: s.code,
      label: s.label,
      cost: s.cost,
      good: stats.good,
      costPerGood: stats.costPerGood,
    })
  }

  return out.sort((a, b) => a.costPerGood - b.costPerGood)
}

/** Một chữ số sau dấu phẩy, chuẩn VN. Dùng cho số trung bình — số đếm thì không
 *  bao giờ có phần thập phân. */
function avg(sum: number, n: number): string {
  if (n === 0) return '0,0'
  return (sum / n).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// ---------------------------------------------------------------------------
// Ba đề xuất. Mỗi cái ăn đầu ra của một module khác nhau:
//   · đơn đang mục   ← module 2 (sổ cơ hội, và SLA cũng là khái niệm của nó —
//                       hạn nằm ở PIPELINE_STAGES; module 3 chỉ ĐỌC lại)
//   · lý do rơi lớn  ← module 2 (sổ lead)
//   · giá lead tốt   ← module 1 (chiến dịch)
// Đó là lý do module 4 làm cuối, và là lý do có đúng ba khối chứ không phải ba
// mươi: mỗi đề xuất phải chỉ được vào một chỗ đã đo, không phải một linh cảm.
// ---------------------------------------------------------------------------

function buildProposals(): PlanProposal[] {
  const out: PlanProposal[] = []

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
      confirmLabel: 'Thêm vào kế hoạch',
    })
  }

  // 3 · Giá mỗi lead tốt → dồn tiền vào nguồn rẻ, cắt nguồn đắt.
  const costs = paidSourceCosts()
  const cheap = costs[0]
  const dear = costs[costs.length - 1]
  if (cheap && dear && cheap.code !== dear.code) {
    const times = Math.round(dear.costPerGood / cheap.costPerGood)
    out.push({
      id: 'don-ngan-sach',
      suggestion: `Dồn ngân sách sang ${cheap.code} và cắt ${dear.code} — chênh ${times} lần giá mỗi lead tốt.`,
      basis: `${cheap.code} chi ${millions(cheap.cost)} ra ${cheap.good} lead tốt, ${millions(cheap.costPerGood)} mỗi lead tốt · ${dear.code} chi ${millions(dear.cost)} ra ${dear.good} lead tốt, ${millions(dear.costPerGood)} mỗi lead tốt`,
      owner: MARKETING,
      codes: [cheap.code, dear.code],
      confirmLabel: 'Thêm vào kế hoạch',
    })
  }

  return out
}

function buildStats(): { stats: PlanStat[]; statsNote: string } {
  const rotting = rottingDeals()
  const rottingValue = rotting.reduce((sum, d) => sum + d.amount, 0)
  const overSla = LEADS.filter(isOverSla)
  const running = LEADS.filter(isRunning)
  const good = LEADS.filter((l) => l.requiredFilled >= REQUIRED_SLOTS)

  const costs = paidSourceCosts()
  const paidCost = costs.reduce((sum, c) => sum + c.cost, 0)
  const paidGood = costs.reduce((sum, c) => sum + c.good, 0)

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
        label: `Đơn đang mục · ${billions(rottingValue)} đang treo`,
      },
      {
        key: 'qua-sla',
        value: `${overSla.length}`,
        label: `Lead quá SLA · trên ${running.length} lead đang chạy`,
      },
      {
        key: 'lead-tot',
        value: `${good.length}/${LEADS.length}`,
        label: `Lead tốt trên tổng lead · qua cổng ${REQUIRED_SLOTS} ô bắt buộc`,
      },
      {
        key: 'gia-lead-tot',
        value: paidGood > 0 ? millions(Math.round(paidCost / paidGood)) : '—',
        label: `Giá mỗi lead tốt · ${costs.length} nguồn có chi phí`,
      },
    ],
    /* Hai ô đầu NGHI là cùng một chỗ tắc, nhưng "hai số bằng nhau" không đủ để
       khẳng định "cùng một tập". Đối chiếu thật bằng mã đơn rồi mới nói —
       khẳng định quan hệ tập hợp từ hai phép đếm là kiểu bịa dữ liệu tinh vi
       nhất, vì nó đúng cho tới ngày fixture đổi. */
    statsNote: sameChokepoint
      ? `Hai ô đầu đếm cùng một chỗ tắc từ hai sổ khác nhau: SLA chỉ đo bậc SQL, mà hạn của bậc SQL nằm đúng ở cột của sổ cơ hội. Đối chiếu theo mã đơn thì ${overSla.length} lead quá SLA ở trên đúng là ${rotting.length} đơn đang mục — một vấn đề, không phải hai.`
      : `Hai ô đầu đo hai chỗ khác nhau: ${overSla.length} lead quá SLA và ${rotting.length} đơn đang mục KHÔNG trùng nhau theo mã đơn, nên đừng cộng gộp hay coi là một.`,
  }
}

async function fetchPlanBoard(): Promise<PlanBoard> {
  const { stats, statsNote } = buildStats()
  return { stats, statsNote, proposals: buildProposals(), approver: HEAD_OF_SALES }
}

export const planBoardQuery = queryOptions({
  queryKey: ['sales', 'plan-board'] as const,
  queryFn: fetchPlanBoard,
})
