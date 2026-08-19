import { describe, expect, it } from 'vitest'
import {
  SAO_DO_CUSTOMER,
  SAO_DO_KPI,
  SAO_DO_QUOTES,
  SAO_DO_RECEIVABLES,
  SAO_DO_TIMELINE,
  saoDo,
} from './sao-do'
import {
  BOOK_SPLIT,
  canPromoteToSql,
  dasVina,
  DAY_FROZEN,
  EXIT_REASONS,
  FUNNEL,
  INIT_DATA_QUESTIONS,
  isRotting,
  isRunning,
  LEADS,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  SOURCES,
  dayISO,
} from './das-vina'

/** Khoá mọi con số đã CHỐT trong docs/kien-truc-san-pham.md.
 *
 *  Đây là loại test đáng giá nhất của repo này: dữ liệu demo không có compiler
 *  nào gác, và một con số sai trên màn demo tốn nhiều hơn một bug. Sửa số nào
 *  ở đây thì phải sửa docs/kien-truc-san-pham.md trước — test đỏ là lời nhắc đúng lúc. */

describe('Kịch bản đóng băng — con số đã chốt', () => {
  it('hai kịch bản, không hơn, và không dùng chung mã object nào', () => {
    const codes = new Set(saoDo.objects.map((o) => o.code))
    const overlap = dasVina.objects.filter((o) => codes.has(o.code))
    expect(overlap).toEqual([])
  })

  it('lát cắt thời gian đúng như docs/kien-truc-san-pham.md', () => {
    expect(saoDo.frozenAt).toBe('2026-08-10T07:58:00+07:00')
    expect(dasVina.frozenAt).toBe('2026-08-17T09:10:00+07:00')
  })

  it('Sao Đỏ: đơn 1,84 tỷ và đúng một đầu mối bên khách', () => {
    expect(saoDo.graph.get('SO-0891')?.amount).toBe(1_840_000_000)
    expect(saoDo.graph.get('HĐ-2607')?.amount).toBe(1_840_000_000)
    expect(SAO_DO_CUSTOMER.contact).toBe('Nguyễn Văn Đạt')
  })

  it('Sao Đỏ: báo giá vật tư — đúng ba bên, bên chọn khớp giá của PO-0455', () => {
    expect(SAO_DO_QUOTES).toHaveLength(3)
    const chosen = SAO_DO_QUOTES.filter((q) => q.chosen)
    expect(chosen).toHaveLength(1)
    expect(chosen[0]?.vendor).toBe('Nam Việt Steel')
    // Bên được chọn KHÔNG phải bên rẻ nhất — Toàn Phát rẻ hơn nhưng chậm 5 ngày.
    expect(chosen[0]?.amount).toBe(saoDo.graph.get('PO-0455')?.amount)
    expect(Math.min(...SAO_DO_QUOTES.map((q) => q.amount))).toBeLessThan(chosen[0]!.amount)
  })

  it('Sao Đỏ: công nợ quá hạn cộng lại đúng bằng KPI 890 tr', () => {
    const kpi = SAO_DO_KPI.find((k) => k.key === 'qua-han')
    expect(kpi?.value).toBe(SAO_DO_RECEIVABLES.reduce((s, r) => s + r.amount, 0))
    expect(kpi?.invoices).toBe(SAO_DO_RECEIVABLES.length)
  })

  it('Sao Đỏ: mốc thời gian trong ngày chạy đúng một chiều', () => {
    const mins = SAO_DO_TIMELINE.map((t) => {
      const [h, m] = t.at.split(':').map(Number)
      return h! * 60 + m!
    })
    expect(mins[0]).toBe(7 * 60 + 58) // brief đóng băng 07:58
    for (let i = 1; i < mins.length; i++) expect(mins[i]!).toBeGreaterThan(mins[i - 1]!)
  })

  it('DAS Vina: BG-1077 · 4,2 tỷ/năm', () => {
    expect(dasVina.graph.get('BG-1077')?.amount).toBe(4_200_000_000)
    expect(dasVina.graph.get('OP-0288')?.amount).toBe(4_200_000_000)
  })
})

describe('Sổ 10 cơ hội đang mở', () => {
  it('đúng 10 đơn, tổng 18,5 tỷ', () => {
    expect(OPEN_DEALS).toHaveLength(10)
    const total = OPEN_DEALS.reduce((s, d) => s + d.amount, 0)
    expect(total).toBe(18_500_000_000)
  })

  it('chia đúng: Huy 4 · Bình 3 · Linh 3', () => {
    const count = (name: string) => OPEN_DEALS.filter((d) => d.owner === name).length
    expect(count('Đỗ Quang Huy')).toBe(4)
    expect(count('Đặng Thanh Bình')).toBe(3)
    expect(count('Nguyễn Khánh Linh')).toBe(3)
  })

  it('đúng 4 đơn đang mục — bốn dấu ⚠ trong bảng của docs/kien-truc-san-pham.md', () => {
    const rotting = OPEN_DEALS.filter(isRotting).map((d) => d.code)
    expect(rotting.sort()).toEqual(['OP-0248', 'OP-0252', 'OP-0263', 'OP-0301'])
  })

  it('mọi đơn nằm trong một trong năm cột, không có cột thứ sáu', () => {
    const stages = new Set(PIPELINE_STAGES.map((s) => s.key))
    expect(PIPELINE_STAGES).toHaveLength(5)
    for (const d of OPEN_DEALS) expect(stages.has(d.stage)).toBe(true)
  })
})

describe('Phễu 01/05 → 17/08', () => {
  it('100 đầu mối → 6 hợp đồng, đơn điệu giảm', () => {
    expect(FUNNEL[0].count).toBe(100)
    expect(FUNNEL[FUNNEL.length - 1]?.count).toBe(6)
    for (let i = 1; i < FUNNEL.length; i++) {
      expect(FUNNEL[i]!.count).toBeLessThan(FUNNEL[i - 1]!.count)
    }
  })

  it('sáu lý do ra khỏi luồng, cộng lại đúng 52 — không có ô "khác"', () => {
    expect(EXIT_REASONS).toHaveLength(6)
    const lost = EXIT_REASONS.reduce((s, r) => s + r.count, 0)
    expect(lost).toBe(BOOK_SPLIT.exited)
  })

  /** Phép cân sửa 19/08: bản cũ ghi 94 + 6 = 100 và quên 42 lead còn sống.
   *  docs/kien-truc-san-pham.md · "Phép cân của sổ lead". */
  it('100 đầu mối = 6 đã ký + 42 đang chạy + 52 đã rơi', () => {
    const { signed, running, exited } = BOOK_SPLIT
    expect(signed + running + exited).toBe(FUNNEL[0].count)
    expect(signed).toBe(FUNNEL[FUNNEL.length - 1]?.count)
  })
})

describe('Sổ lead — 100 dòng, cân với phễu', () => {
  it('đúng 100 dòng, mã không trùng', () => {
    expect(LEADS).toHaveLength(FUNNEL[0].count)
    expect(new Set(LEADS.map((l) => l.code)).size).toBe(LEADS.length)
    expect(new Set(LEADS.map((l) => l.company)).size).toBe(LEADS.length)
  })

  it('bậc của từng dòng khớp ba bậc đầu của phễu', () => {
    const atLeast = (tiers: string[]) => LEADS.filter((l) => tiers.includes(l.tier)).length
    expect(atLeast(['mql', 'sql'])).toBe(FUNNEL[1]?.count)
    expect(atLeast(['sql'])).toBe(FUNNEL[2]?.count)
  })

  it('ba phần của sổ cộng lại đúng 100', () => {
    const signed = LEADS.filter((l) => l.contractCode).length
    const exited = LEADS.filter((l) => l.exitReason).length
    const running = LEADS.filter(isRunning).length
    expect({ signed, running, exited }).toEqual({ ...BOOK_SPLIT })
    expect(signed + running + exited).toBe(LEADS.length)
  })

  it('số dòng mỗi lý do rơi khớp từng con số của EXIT_REASONS', () => {
    for (const r of EXIT_REASONS) {
      expect(LEADS.filter((l) => l.exitReason === r.label)).toHaveLength(r.count)
    }
  })

  it('mười dòng SQL đang mở khớp từng đơn của sổ cơ hội', () => {
    const linked = LEADS.filter((l) => l.dealCode)
    expect(linked.map((l) => l.dealCode)).toEqual(OPEN_DEALS.map((d) => d.code))
    for (const l of linked) {
      const deal = OPEN_DEALS.find((d) => d.code === l.dealCode)
      expect([l.company, l.owner, l.stage, l.daysHere]).toEqual([
        deal?.company,
        deal?.owner,
        deal?.stage,
        deal?.daysInStage,
      ])
    }
  })

  it('mọi dòng SQL đều đã qua cổng; không dòng nào chưa qua mà lọt vào', () => {
    for (const l of LEADS) {
      if (l.tier === 'sql') expect(l.requiredFilled).toBe(REQUIRED_SLOTS)
      expect(l.answered).toBe(l.requiredFilled + l.optionalFilled)
      expect(l.filled).toHaveLength(l.answered)
    }
  })

  it('cổng là sáu ô bắt buộc, không phải 10/10', () => {
    expect(INIT_DATA_QUESTIONS).toHaveLength(10)
    expect(REQUIRED_SLOTS).toBe(6)

    const ready = LEADS.find((l) => l.tier === 'mql' && l.requiredFilled === REQUIRED_SLOTS)
    expect(ready).toBeDefined()
    // Đủ sáu ô bắt buộc là qua cổng, kể cả khi bốn ô tuỳ chọn còn trống.
    expect(ready && ready.optionalFilled < 4).toBe(true)
    expect(ready && canPromoteToSql(ready).ok).toBe(true)

    const short = LEADS.find((l) => l.tier === 'mql' && l.requiredFilled < REQUIRED_SLOTS)
    expect(short && canPromoteToSql(short).ok).toBe(false)
  })

  it('mọi lead có timeline, và timeline không vượt quá ngày đóng băng', () => {
    const frozen = dayISO(DAY_FROZEN)
    for (const l of LEADS) {
      expect(l.history.length).toBeGreaterThan(0)
      for (const e of l.history) expect(e.at <= frozen).toBe(true)
    }
  })
})

describe('Nguồn lead — module 1 Chiến dịch & Sự kiện', () => {
  it('tám nguồn, tổng lead đúng 100 = bậc đầu của phễu', () => {
    expect(SOURCES).toHaveLength(8)
    expect(SOURCES.reduce((s, x) => s + x.leads, 0)).toBe(FUNNEL[0].count)
  })

  it('lead trong sổ chia đúng về từng nguồn', () => {
    for (const s of SOURCES) {
      expect(LEADS.filter((l) => l.source === s.code)).toHaveLength(s.leads)
    }
  })

  it('lead của từng đợt cộng lại đúng lead của chiến dịch', () => {
    for (const s of SOURCES) {
      if (s.waves.length === 0) continue
      expect(s.waves.reduce((n, w) => n + w.leads, 0)).toBe(s.leads)
    }
  })

  it('một đợt không thể có người mở nhiều hơn người nhận', () => {
    for (const s of SOURCES) {
      for (const w of s.waves) {
        expect(w.opened).toBeLessThanOrEqual(w.sent)
        expect(w.replied).toBeLessThanOrEqual(w.sent)
        expect(w.leads).toBeLessThanOrEqual(w.replied)
      }
    }
  })

  it('sự kiện thì người đến không nhiều hơn người đăng ký', () => {
    for (const s of SOURCES.filter((x) => x.kind === 'su-kien')) {
      expect(s.checkedIn ?? 0).toBeLessThanOrEqual(s.registered ?? 0)
      expect(s.venue).toBeTruthy()
    }
  })
})
