import { queryOptions } from '@tanstack/react-query'
import { billions, millions } from '@pv/ui'
import { costBand } from '@pv/engines'
import {
  EXIT_REASONS,
  HEAD_OF_SALES,
  LEADS,
  MARKETING,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  costOfGoodLead,
  isOverSla,
  isRotting,
  isRunning,
  sourcesPaid,
  type ExitReason,
  type OpenDeal,
} from '@pv/engines/fixtures/das-vina'
import { bandText, costGap, rankSources, type SourceCost } from './source-cost'
import { api } from '@/app/api'
import { formatNumber, message, translate, type Lang } from '@/app/i18n'

/** Module 5 · Số liệu & kế hoạch. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy số của module này. Khi có backend, đổi thân
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

/** One line per language from three spellings; every builder below uses it. */
const speak = (lang: Lang) => (vi: string, en: string, ko: string) =>
  translate(message(vi, en, ko), lang)

function overdueLine(deal: OpenDeal, lang: Lang): string {
  const stage = STAGE_LABEL.get(deal.stage) ?? deal.stage
  const limit = STAGE_LIMIT.get(deal.stage) ?? 0
  const msg = speak(lang)
  return msg(
    `${deal.code} · ${deal.daysInStage} ngày ở cột ${stage}, hạn ${limit}`,
    `${deal.code} · ${deal.daysInStage} days in column ${stage}, limit ${limit}`,
    `${deal.code} · ${stage} 단계 ${deal.daysInStage}일 체류, 기준 ${limit}`,
  )
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
      atFirstTier: mine.filter((l) => l.tier === 'prospect').length,
      filledSum: mine.reduce((sum, l) => sum + l.requiredFilled, 0),
      codes: mine.map((l) => l.code),
    }
  }).sort((a, b) => b.count - a.count)

  return { total: exited.length, ranked }
}

/** Một chữ số sau dấu phẩy, chuẩn VN. Dùng cho số trung bình — số đếm thì không
 *  bao giờ có phần thập phân. */
function avg(sum: number, n: number, lang: Lang): string {
  return formatNumber(n === 0 ? 0 : sum / n, lang, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

// ---------------------------------------------------------------------------
// Ba đề xuất. Mỗi cái ăn đầu ra của một module khác nhau:
//   · đơn đang mục   ← module 2 (sổ cơ hội, và SLA cũng là khái niệm của nó —
//                       hạn nằm ở PIPELINE_STAGES; module Performance chỉ ĐỌC lại)
//   · lý do rơi lớn  ← module 2 (sổ lead)
//   · giá lead tốt   ← module 1 (chiến dịch)
// Đó là lý do module này làm cuối, và là lý do có đúng ba khối chứ không phải ba
// mươi: mỗi đề xuất phải chỉ được vào một chỗ đã đo, không phải một linh cảm.
// ---------------------------------------------------------------------------

function buildProposals(lang: Lang): PlanProposal[] {
  const msg = speak(lang)
  const out: PlanProposal[] = []
  const and = msg(' và ', ' and ', ' 및 ')
  const addToPlan = msg('Thêm vào kế hoạch', 'Add to plan', '계획에 추가')

  // 1 · Đơn đang mục → người gật vào cuộc.
  const rotting = rottingDeals()
  const head = rotting.slice(0, 2)
  const [worst] = head
  if (worst) {
    const value = rotting.reduce((sum, d) => sum + d.amount, 0)
    out.push({
      id: 'rotting-deals',
      suggestion: msg(
        `Đưa ${HEAD_OF_SALES} vào xử lý ${rotting.length} đơn quá hạn cột. Bắt đầu từ ${head.map((d) => d.code).join(and)}.`,
        `Bring ${HEAD_OF_SALES} in to handle ${rotting.length} deals past their column limit. Start with ${head.map((d) => d.code).join(and)}.`,
        `${HEAD_OF_SALES}님이 단계 기한을 넘긴 기회 ${rotting.length}건을 처리하도록 투입하세요. ${head.map((d) => d.code).join(and)}부터 시작합니다.`,
      ),
      basis: msg(
        `${rotting.length}/${OPEN_DEALS.length} đơn quá hạn cột · ${billions(value)} đang treo · ${head.map((d) => overdueLine(d, 'vi')).join(' · ')}`,
        `${rotting.length}/${OPEN_DEALS.length} deals past column limit · ${billions(value)} stuck · ${head.map((d) => overdueLine(d, 'en')).join(' · ')}`,
        `단계 기한 초과 ${rotting.length}/${OPEN_DEALS.length}건 · ${billions(value)} 정체 · ${head.map((d) => overdueLine(d, 'ko')).join(' · ')}`,
      ),
      owner: HEAD_OF_SALES,
      codes: head.map((d) => d.code),
      confirmLabel: addToPlan,
    })
  }

  // 2 · Lý do rơi lớn nhất → agent 1 chạm sớm hơn.
  const { total: exitedTotal, ranked } = exitTally()
  const [top] = ranked
  if (top && top.count > 0) {
    out.push({
      id: 'touch-earlier',
      suggestion: msg(
        `Cho agent 1 liên hệ sớm hơn ở bậc Đầu mối. Lý do ra khỏi luồng nhiều nhất của kỳ là "${top.label}".`,
        `Have agent 1 make contact earlier at the Prospect tier. The most common reason for leaving the flow this period is "${top.label}".`,
        `에이전트 1이 '잠재 고객' 단계에서 더 일찍 연락하도록 하세요. 이번 기간 가장 많은 이탈 사유는 "${top.label}"입니다.`,
      ),
      basis: msg(
        `${top.count}/${exitedTotal} lead ra khỏi luồng vì lý do này · ${top.atFirstTier}/${top.count} ra ngay ở bậc Đầu mối · trung bình mới điền ${avg(top.filledSum, top.count, 'vi')} trên ${REQUIRED_SLOTS} ô bắt buộc`,
        `${top.count}/${exitedTotal} leads left the flow for this reason · ${top.atFirstTier}/${top.count} left right at the Prospect tier · on average only ${avg(top.filledSum, top.count, 'en')} of ${REQUIRED_SLOTS} required fields filled`,
        `이 사유로 이탈한 리드 ${top.count}/${exitedTotal}건 · ${top.atFirstTier}/${top.count}건은 잠재 고객 단계에서 바로 이탈 · 필수 항목 ${REQUIRED_SLOTS}개 중 평균 ${avg(top.filledSum, top.count, 'ko')}개만 입력`,
      ),
      owner: MARKETING,
      codes: top.codes.slice(0, 2),
      confirmLabel: addToPlan,
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
    const bands = (l: Lang) => {
      const msg = speak(l)
      return msg(
        `${cheap.code} chi ${millions(cheap.cost)} ra ${cheap.good} lead tốt trên ${cheap.leads} lead · dải ${bandText(cheap.band, l)} mỗi lead tốt · ${dear.code} chi ${millions(dear.cost)} ra ${dear.good} lead tốt trên ${dear.leads} lead · dải ${bandText(dear.band, l)}`,
        `${cheap.code} spent ${millions(cheap.cost)} for ${cheap.good} good leads out of ${cheap.leads} leads · range ${bandText(cheap.band, l)} per good lead · ${dear.code} spent ${millions(dear.cost)} for ${dear.good} good leads out of ${dear.leads} leads · range ${bandText(dear.band, l)}`,
        `${cheap.code}: ${millions(cheap.cost)} 지출, 리드 ${cheap.leads}건 중 우수 리드 ${cheap.good}건 · 우수 리드당 범위 ${bandText(cheap.band, l)} · ${dear.code}: ${millions(dear.cost)} 지출, 리드 ${dear.leads}건 중 우수 리드 ${dear.good}건 · 범위 ${bandText(dear.band, l)}`,
      )
    }

    out.push({
      id: 'shift-budget',
      suggestion: gap
        ? msg(
            `Dồn ngân sách sang ${gap.cheap.code}, cắt ${gap.dear.code}. ${gap.dear.code} đắt hơn ít nhất ${gap.timesText} lần mỗi lead tốt.`,
            `Shift the budget to ${gap.cheap.code}, cut ${gap.dear.code}. ${gap.dear.code} costs at least ${gap.timesText}x more per good lead.`,
            `예산을 ${gap.cheap.code}로 옮기고 ${gap.dear.code}는 줄이세요. ${gap.dear.code}는 우수 리드당 비용이 최소 ${gap.timesText}배 높습니다.`,
          )
        : msg(
            `Giữ nguyên ngân sách của ${cheap.code} và ${dear.code} tháng tới, chạy thêm đợt để có thêm dữ liệu. Chưa nguồn nào chứng minh được là rẻ hơn.`,
            `Keep the budgets of ${cheap.code} and ${dear.code} unchanged next month and run another wave to collect more data. No source has been shown to be cheaper yet.`,
            `다음 달에도 ${cheap.code}와 ${dear.code}의 예산을 유지하고, 웨이브를 더 진행해 데이터를 모으세요. 아직 어느 출처가 더 저렴하다고 입증되지 않았습니다.`,
          ),
      basis: gap
        ? msg(
            `${bands('vi')} · hai dải không chồng nhau, bội số tính từ hai đầu gần nhau nhất (${millions(gap.dear.band.lo)} chia ${millions(gap.cheap.band.hi ?? 0)})`,
            `${bands('en')} · the two ranges do not overlap; the multiple uses the two nearest ends (${millions(gap.dear.band.lo)} divided by ${millions(gap.cheap.band.hi ?? 0)})`,
            `${bands('ko')} · 두 범위가 겹치지 않으며, 배수는 서로 가장 가까운 두 끝값으로 계산 (${millions(gap.dear.band.lo)} ÷ ${millions(gap.cheap.band.hi ?? 0)})`,
          )
        : msg(
            `${bands('vi')} · hai dải chồng nhau, chưa tính được bội số`,
            `${bands('en')} · the two ranges overlap, so no multiple can be computed`,
            `${bands('ko')} · 두 범위가 겹쳐 배수를 계산할 수 없음`,
          ),
      owner: MARKETING,
      codes: [cheap.code, dear.code],
      confirmLabel: addToPlan,
    })
  }

  return out
}

function buildStats(lang: Lang): { stats: PlanStat[]; statsNote: string } {
  const msg = speak(lang)
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
  /* Ô này KHÔNG được hiện một con số trần. Điểm vẫn là số to — nó là thứ
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
        key: 'rotting',
        value: `${rotting.length}/${OPEN_DEALS.length}`,
        label: msg('Đơn đang mục', 'Stale deals', '정체된 기회'),
        hint: msg(
          `${billions(rottingValue)} đang treo`,
          `${billions(rottingValue)} stuck`,
          `${billions(rottingValue)} 정체`,
        ),
      },
      {
        key: 'over-sla',
        value: `${overSla.length}`,
        label: msg('Lead quá SLA', 'Leads over SLA', 'SLA 초과 리드'),
        hint: msg(
          `Trên ${running.length} lead đang chạy`,
          `Out of ${running.length} active leads`,
          `진행 중인 리드 ${running.length}건 중`,
        ),
      },
      {
        key: 'good-leads',
        value: `${good.length}/${LEADS.length}`,
        label: msg(
          'Lead tốt trên tổng lead',
          'Good leads out of all leads',
          '전체 리드 대비 우수 리드',
        ),
        hint: msg(
          `Qua cổng ${REQUIRED_SLOTS} ô bắt buộc`,
          `Passed the ${REQUIRED_SLOTS} required fields gate`,
          `필수 항목 ${REQUIRED_SLOTS}개 기준 통과`,
        ),
      },
      {
        key: 'good-lead-cost',
        /* Nhãn phải KHAI PHẠM VI: cùng chữ "giá mỗi lead tốt" mà màn Chiến dịch
           đọc trên nguồn đã chạy đợt, màn Performance đọc trên nguồn của
           Marketing. Không nói ra tập nào thì ba con số trông như một. */
        value: spend.perGood === null ? '—' : millions(spend.perGood),
        label: msg('Giá mỗi lead tốt', 'Cost per good lead', '우수 리드당 비용'),
        hint: msg(
          `${paid.length} nguồn có tiêu tiền · ${millions(spend.cost)} ra ${spend.good} lead tốt · dải ${bandText(paidBand, 'vi')}`,
          `${paid.length} paid sources · ${millions(spend.cost)} for ${spend.good} good leads · range ${bandText(paidBand, 'en')}`,
          `비용 지출 출처 ${paid.length}곳 · ${millions(spend.cost)}으로 우수 리드 ${spend.good}건 · 범위 ${bandText(paidBand, 'ko')}`,
        ),
      },
    ],
    /* Hai ô đầu NGHI là cùng một chỗ tắc, nhưng "hai số bằng nhau" không đủ để
       khẳng định "cùng một tập". Đối chiếu thật bằng mã đơn rồi mới nói —
       khẳng định quan hệ tập hợp từ hai phép đếm là kiểu bịa dữ liệu tinh vi
       nhất, vì nó đúng cho tới ngày fixture đổi. */
    statsNote: sameChokepoint
      ? msg(
          `Hai ô đầu cùng đếm một chỗ tắc: ${overSla.length} lead quá SLA chính là ${rotting.length} đơn đang mục.`,
          `The first two tiles count the same bottleneck: the ${overSla.length} leads over SLA are the ${rotting.length} stale deals.`,
          `처음 두 칸은 같은 병목을 셉니다. SLA 초과 리드 ${overSla.length}건이 곧 정체된 기회 ${rotting.length}건입니다.`,
        )
      : msg(
          `Hai ô đầu đo hai chỗ khác nhau: ${overSla.length} lead quá SLA và ${rotting.length} đơn đang mục không trùng mã đơn.`,
          `The first two tiles measure different things: the ${overSla.length} leads over SLA and the ${rotting.length} stale deals do not share deal codes.`,
          `처음 두 칸은 서로 다른 것을 측정합니다. SLA 초과 리드 ${overSla.length}건과 정체된 기회 ${rotting.length}건은 거래 코드가 일치하지 않습니다.`,
        ),
  }
}

/** Bảng "nguồn nào rẻ" — bằng chứng đứng ngay dưới đề xuất số 3.
 *
 *  Ba điều bảng này phải giữ, cả ba là quyết định chứ không phải mặc định:
 *
 *   1. **Xếp theo ĐIỂM** như hôm nay (D-03), không theo cận trên. Đổi khoá xếp
 *      hạng là đổi thứ hạng của người làm ra nguồn đó, và chưa ai gật.
 *   2. **Nguồn cỡ mẫu nhỏ Ở LẠI bảng**, mang `enough = false`. Có đề xuất loại
 *      CD-0105 ra ngoài; bản này không loại — một dòng biến mất là một
 *      dòng không ai còn nhớ để hỏi, mà 6 triệu vẫn đã tiêu thật.
 *   3. **Câu so sánh đi qua `costGap`.** Nó chỉ ra lò khi hai dải rời nhau; còn
 *      lại là câu trung tính đọc cả hai dải. */
function buildRanking(lang: Lang): {
  ranking: SourceCost[]
  rankingNote: string
  rankingClaim: string
} {
  const msg = speak(lang)
  const and = msg(' và ', ' and ', ' 및 ')
  const { ranked, cashless } = rankSources()
  const thin = ranked.filter((r) => !r.enough)
  const cheap = ranked[0]
  const dear = ranked[ranked.length - 1]
  const gap = cheap && dear && cheap.code !== dear.code ? costGap(cheap, dear) : null

  const note = [
    msg(
      `${ranked.length} nguồn có tiêu tiền, xếp rẻ nhất lên đầu. Xem dải bên cạnh khi so sánh.`,
      `${ranked.length} paid sources, cheapest first. Check the range next to each when comparing.`,
      `비용을 지출한 출처 ${ranked.length}곳, 저렴한 순서입니다. 비교할 때는 옆의 범위를 확인하세요.`,
    ),
    cashless.length > 0
      ? msg(
          `${cashless.map((r) => r.code).join(and)} không tốn tiền mặt nên không có trong bảng so giá.`,
          `${cashless.map((r) => r.code).join(and)} cost no cash, so they are not in the price table.`,
          `${cashless.map((r) => r.code).join(and)}은(는) 현금 지출이 없어 가격 비교표에 없습니다.`,
        )
      : '',
    thin.length > 0
      ? msg(
          `${thin.map((r) => `${r.code} (${r.why})`).join(' · ')}: chưa đủ để so sánh.`,
          `${thin.map((r) => `${r.code} (${r.why})`).join(' · ')}: not enough to compare.`,
          `${thin.map((r) => `${r.code} (${r.why})`).join(' · ')}: 비교하기에 부족합니다.`,
        )
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    ranking: ranked,
    rankingNote: note,
    rankingClaim: gap
      ? msg(
          `${gap.cheap.code} rẻ hơn ${gap.dear.code} ít nhất ${gap.timesText} lần mỗi lead tốt. Dải ${bandText(gap.cheap.band, 'vi')} và dải ${bandText(gap.dear.band, 'vi')} không chồng nhau.`,
          `${gap.cheap.code} is at least ${gap.timesText}x cheaper than ${gap.dear.code} per good lead. Range ${bandText(gap.cheap.band, 'en')} and range ${bandText(gap.dear.band, 'en')} do not overlap.`,
          `우수 리드당 ${gap.cheap.code}가 ${gap.dear.code}보다 최소 ${gap.timesText}배 저렴합니다. 범위 ${bandText(gap.cheap.band, 'ko')}와 범위 ${bandText(gap.dear.band, 'ko')}는 겹치지 않습니다.`,
        )
      : cheap && dear
        ? msg(
            `Chưa so sánh được hai đầu bảng: dải của ${cheap.code} (${bandText(cheap.band, 'vi')}) và dải của ${dear.code} (${bandText(dear.band, 'vi')}) chồng nhau.`,
            `Cannot compare the two ends of the table yet: the range of ${cheap.code} (${bandText(cheap.band, 'en')}) and the range of ${dear.code} (${bandText(dear.band, 'en')}) overlap.`,
            `표의 양 끝을 아직 비교할 수 없습니다. ${cheap.code}의 범위(${bandText(cheap.band, 'ko')})와 ${dear.code}의 범위(${bandText(dear.band, 'ko')})가 겹칩니다.`,
          )
        : msg(
            'Kỳ này chưa nguồn nào tiêu tiền.',
            'No source has spent money this period.',
            '이번 기간에는 비용을 지출한 출처가 없습니다.',
          ),
  }
}

async function fetchPlanBoard(lang: Lang): Promise<PlanBoard> {
  const { stats, statsNote } = buildStats(lang)
  const { ranking, rankingNote, rankingClaim } = buildRanking(lang)
  return {
    stats,
    statsNote,
    ranking,
    rankingNote,
    rankingClaim,
    proposals: buildProposals(lang),
    approver: HEAD_OF_SALES,
  }
}

/** Keyed by language: the board's sentences are built for one language. */
export const planBoardQuery = (lang: Lang) =>
  queryOptions({
    queryKey: ['sales', 'plan-board', lang] as const,
    queryFn: () =>
      api.read('/sales/plan', {
        need: { branch: 'Sales', permission: 'plan.view' },
        load: () => fetchPlanBoard(lang),
      }),
  })
