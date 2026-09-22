import { describe, expect, it } from 'vitest'
import { OPPORTUNITY_CARE_REASON_OTHER } from '@pv/contracts'
import {
  DAY_FROZEN,
  DAS_VINA_LEAD as DAS_LEAD,
  dayISO,
  draftOpportunity,
  EXIT_REASONS,
  FUNNEL,
  isRotting,
  leadProfile,
  LEADS,
  nextOpportunityCode,
  OPEN_DEALS,
  OPPORTUNITIES,
  opportunityOfLead,
  PIPELINE_STAGES,
} from './das-vina'

/** Khoá con số của SỔ CƠ HỘI — 30 dòng suy ra từ sổ lead.
 *
 *  Đây là ngoại lệ duy nhất của "không tự sinh test" (CLAUDE.md · mục Test):
 *  sổ này KHÔNG khai tay 30 dòng, nó suy ra từ `LEADS`, và một phép suy sai thì
 *  không compiler nào bắt được — nó chỉ hiện ra thành một con số sai trên màn
 *  demo. File nằm ngay cạnh fixture, đúng chỗ luật đòi.
 *
 *  Đổi số nào ở đây thì phải sửa fixture trước — test đỏ là lời nhắc đúng lúc. */

describe('Sổ cơ hội — 30 dòng suy ra từ sổ lead', () => {
  it('đúng 30 dòng, khớp bậc "cơ hội" của phễu và số lead bậc SQL', () => {
    const sql = LEADS.filter((l) => l.tier === 'sql')
    expect(OPPORTUNITIES).toHaveLength(30)
    expect(OPPORTUNITIES).toHaveLength(sql.length)
    expect(OPPORTUNITIES).toHaveLength(FUNNEL[2].count)
  })

  it('chia đúng 10 đang mở · 6 thành hợp đồng · 14 vào danh sách chăm sóc', () => {
    const by = (state: string) => OPPORTUNITIES.filter((o) => o.state === state).length
    expect(by('open')).toBe(10)
    expect(by('won')).toBe(6)
    expect(by('care')).toBe(14)
    expect(OPPORTUNITIES.filter((o) => o.stage !== null)).toHaveLength(10)
  })

  it('năm cột mới, hạn dùng lại của cột cũ tương ứng', () => {
    expect(PIPELINE_STAGES.map((s) => [s.key, s.label, s.limitDays])).toEqual([
      ['new', 'Khởi tạo opp', 2],
      ['assigned', 'Nhận PIC', 14],
      ['sample', 'Sample', 21],
      ['poc', 'POC', 21],
      ['quotation', 'Quotation', 30],
    ])
  })

  it('10 đơn đang mở rải 2 · 2 · 0 · 2 · 4 qua năm cột, và chỉ đơn đang mở mới có cột', () => {
    const at = (k: string) => OPEN_DEALS.filter((d) => d.stage === k).length
    expect(PIPELINE_STAGES.map((s) => at(s.key))).toEqual([2, 2, 0, 2, 4])
    for (const op of OPPORTUNITIES) expect(op.stage !== null, op.code).toBe(op.state === 'open')
  })

  it('đơn thắng và đơn chăm sóc chỉ có careFromStage khi ở chăm sóc: 3 ở Quotation khớp phễu', () => {
    const care = OPPORTUNITIES.filter((o) => o.state === 'care')
    for (const op of OPPORTUNITIES.filter((o) => o.state !== 'care')) {
      expect(op.careFromStage, op.code).toBeNull()
    }
    expect(care.every((o) => o.careFromStage !== null)).toBe(true)
    /* Phễu bậc "Báo giá" = 19 = 10 mở + 6 thắng + 3 rơi SAU báo giá. */
    expect(care.filter((o) => o.careFromStage === 'quotation')).toHaveLength(FUNNEL[3].count - 16)
    expect(care.filter((o) => o.careFromStage === 'new')).toHaveLength(11)
  })

  it('phiếu mới sinh ra ở cột new, không mang trạng thái nào', () => {
    const draft = draftOpportunity(leadProfile(LEADS.find((l) => l.code === DAS_LEAD)!), [])
    expect(draft.stage).toBe('new')
    expect('state' in draft).toBe(false)
  })

  it('10 đơn đang mở giữ nguyên mã, tiền và cột của OPEN_DEALS', () => {
    const open = OPPORTUNITIES.filter((o) => o.stage !== null)
    expect(open.map((o) => o.code)).toEqual(OPEN_DEALS.map((d) => d.code))
    for (const deal of OPEN_DEALS) {
      const op = OPPORTUNITIES.find((o) => o.code === deal.code)
      expect(op?.amount, deal.code).toBe(deal.amount)
      expect(op?.stage, deal.code).toBe(deal.stage)
      expect(op?.account, deal.code).toBe(deal.company)
    }
  })

  it('mọi mã là duy nhất, và mã kế tiếp vẫn là OP-0305', () => {
    const codes = OPPORTUNITIES.map((o) => o.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(nextOpportunityCode()).toBe('OP-0305')
    /* Phiếu vừa gửi trong phiên phải đẩy mã kế tiếp lên — nếu không, hai lần
       đổi lead ra hai đơn TRÙNG MÃ. */
    expect(nextOpportunityCode(['OP-0305'])).toBe('OP-0306')
  })

  it('mỗi cơ hội trỏ về đúng một lead bậc SQL, và đường ngược lại tra được', () => {
    for (const op of OPPORTUNITIES) {
      const lead = LEADS.find((l) => l.code === op.leadCode)
      expect(lead?.tier, op.code).toBe('sql')
      expect(opportunityOfLead(op.leadCode)?.code).toBe(op.code)
    }
    // Lead chưa lên SQL thì chưa có cơ hội nào — không dựng bừa một dòng rỗng.
    expect(opportunityOfLead('LD-0199')).toBeUndefined()
  })

  it('đơn đã đóng sổ có ngày đóng THẬT, không đơn nào đóng sau lát cắt', () => {
    const cut = dayISO(DAY_FROZEN).slice(0, 10)
    for (const op of OPPORTUNITIES.filter((o) => o.stage === null)) {
      expect(op.closedDate <= cut, op.code).toBe(true)
    }
  })

  it('ngày dự kiến chạy theo nhịp SLA — và đơn mục ở cột cuối đã TRỄ hạn đó', () => {
    const cut = dayISO(DAY_FROZEN).slice(0, 10)
    const late = OPPORTUNITIES.filter((o) => o.stage !== null && o.closedDate <= cut)

    /* Cột "Chờ ký" cũ đã gộp vào Quotation (hạn 30), nên OP-0252 (14 ngày) hết
       trễ; đổi lại OP-0248 nằm 31 ngày ở cột cuối, không còn hạn nào phía sau
       để bù, nên ngày dự kiến của nó (16/08) rơi vào quá khứ. */
    expect(late.map((o) => o.code)).toEqual(['OP-0248'])
    /* Đơn mục: 0301 (4>2) · 0263 (24>21) · 0248 (31>30); OP-0252 không còn. */
    expect(OPEN_DEALS.filter(isRotting).map((d) => d.code)).toEqual([
      'OP-0301',
      'OP-0263',
      'OP-0248',
    ])
  })

  it('đúng 2 đơn trống tiền — ô 9 là ô tuỳ chọn, chưa ai moi', () => {
    expect(OPPORTUNITIES.filter((o) => o.amount === null)).toHaveLength(2)
    // Không đơn nào được vẽ 0 thay cho "chưa biết".
    expect(OPPORTUNITIES.some((o) => o.amount === 0)).toBe(false)
  })

  it('14 đơn chăm sóc chưa xếp dòng danh mục, câu thật giữ ở ô ghi thêm, KHÔNG mượn nhãn của EXIT_REASONS', () => {
    const care = OPPORTUNITIES.filter((o) => o.state === 'care')
    const exits = new Set<string>(EXIT_REASONS.map((r) => r.label))
    for (const op of care) {
      expect(op.careReason, op.code).toBe(OPPORTUNITY_CARE_REASON_OTHER)
      expect(exits.has(op.careNote), op.code).toBe(true)
    }
  })

  it('Sale đứng đơn luôn có, BD chỉ có khi BD đã chạm vào lead', () => {
    for (const op of OPPORTUNITIES) expect(op.saleOwners.length, op.code).toBe(1)
    expect(OPPORTUNITIES.some((o) => o.bdOwners.length === 1)).toBe(true)
  })

  it('dòng mồi DAS Vina nối thẳng sang OP-0288 và account AC-0142', () => {
    const op = opportunityOfLead('LD-0103')
    expect(op?.code).toBe('OP-0288')
    expect(op?.accountCode).toBe('AC-0142')
    expect(op?.amount).toBe(4_200_000_000)
  })
})
