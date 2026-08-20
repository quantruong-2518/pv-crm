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
  COLD_ROW_LEAD_RATE,
  costOfGoodLead,
  type CostKind,
  CREDIT_RULES,
  dasVina,
  DAY_FROZEN,
  daysBetween,
  EMAIL_VERIFY_PRICE,
  HANDOFF_SLA,
  EXIT_REASONS,
  FUNNEL,
  INIT_DATA_QUESTIONS,
  isRotting,
  isRunning,
  LEADS,
  leadMilestones,
  MARKETING,
  ROLE_KPI_MODEL,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  ROW_PRICE,
  rowsToLeads,
  SOURCES,
  sourcesOwnedBy,
  sourcesPaid,
  sourcesRan,
  sourceStats,
  TOOL_PER_WAVE,
  TOOL_POOL,
  TOOL_POOL_WAVES,
  UNUSED_APOLLO_CREDIT,
  USD_VND,
  VENDOR_RATES,
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

describe('Giá mỗi lead tốt — một phép chia, ba phạm vi có tên', () => {
  /* VÌ SAO khối này tồn tại. Trước 20/08 ba màn tự lọc lấy tập nguồn của mình
     (`cost > 0` ở Kế hoạch · `waves.length > 0` ở Chiến dịch · `owner ===
     Marketing` ở Performance) và hôm nay cả ba tình cờ ra cùng sáu nguồn, cùng
     ra 10,0 tr. Ba câu hỏi khác nhau thật, nên ba phạm vi khác nhau là ĐÚNG —
     cái sai là không ai khoá chuyện chúng đang trùng.

     Ba ca dưới đây khoá đúng chỗ đó: thêm một nguồn TRẢ TIỀN mà chủ không phải
     Marketing — đúng thứ tầng prospect sắp tạo ra — thì hai ca đầu ĐỎ, và người
     sửa buộc phải mở cả ba màn xem nhãn nào còn nói đúng phạm vi của nó. */

  const codesOf = (xs: readonly { code: string }[]) => xs.map((x) => x.code)
  const SIX = ['CD-0101', 'CD-0102', 'SK-0103', 'SK-0104', 'CD-0105', 'SK-0106']

  it('ba phạm vi hôm nay cùng ra sáu nguồn — trùng hợp đã khoá, không phải luật', () => {
    expect(codesOf(sourcesPaid())).toEqual(SIX)
    expect(codesOf(sourcesRan())).toEqual(SIX)
    expect(codesOf(sourcesOwnedBy(MARKETING))).toEqual(SIX)

    // Hai nguồn tự nhiên đứng ngoài cả ba: 0 đồng, 0 đợt, chủ không phải Marketing.
    expect(codesOf(SOURCES.filter((s) => !SIX.includes(s.code)))).toEqual(['GT', 'TM'])
  })

  it('mỗi phạm vi khoá đúng một con số, cả ba đi qua cùng một hàm', () => {
    const same = { cost: 300_000_000, good: 30, perGood: 10_000_000 }
    expect(costOfGoodLead(sourcesPaid())).toEqual(same)
    expect(costOfGoodLead(sourcesRan())).toEqual(same)
    expect(costOfGoodLead(sourcesOwnedBy(MARKETING))).toEqual(same)
  })

  it('giá của một nguồn đi qua đúng hàm chung — hàng bảng và ô tổng không lệch nhau', () => {
    /* `sourceStats` là thứ các màn dùng cho TỪNG hàng; nếu nó giữ phép chia
       riêng thì tổng của bảng và ô tổng phía trên có thể nói hai chuyện. */
    for (const s of SOURCES) {
      const stats = sourceStats(s.code)
      const scope = costOfGoodLead([s])
      expect(stats.cost).toBe(scope.cost)
      expect(stats.good).toBe(scope.good)
      expect(stats.costPerGood).toBe(scope.perGood)
    }
  })

  it('phạm vi rỗng không chia cho 0 — trả null chứ không trả 0', () => {
    // "Chưa đo được" và "không mất đồng nào" là hai chuyện khác nhau trên màn.
    expect(costOfGoodLead([])).toEqual({ cost: 0, good: 0, perGood: null })
  })

  it('thước "giá mỗi lead tốt" thôi là số chụp, nhưng phải khai là chốt muộn', () => {
    /* Trước 20/08: số lead cắt được theo kỳ còn `Source.cost` thì không, nên cờ
       `snapshot` là thứ duy nhất bắt màn in ra "tính đến 17/08".

       Từ 20/08 `costLines[].day` cắt được chi phí, nên `snapshot` phải TẮT —
       để cờ lại là màn tiếp tục in một lời cảnh báo không còn đúng. Đổi lại
       phải BẬT `settlesLate`: tiền của nguồn đang chạy ghi đủ vào kỳ mà lead
       thì chưa về hết, nên kỳ chưa đóng chỉ hiện số, không chấm nhãn. Hai cờ
       này đi cùng nhau; bật tắt lệch nhau là màn nói sai một trong hai chuyện. */
    const kpi = ROLE_KPI_MODEL.find((r) => r.role === 'Marketing')?.kpis.find(
      (k) => k.key === 'gia-moi-lead-tot',
    )
    expect(kpi?.snapshot).toBe(false)
    expect(kpi?.settlesLate).toBe(true)
    expect(kpi?.paced).toBe(false)
    // Rẻ hơn mới là tốt hơn — đảo cờ này là cả đồng hồ KPI chấm ngược.
    expect(kpi?.higherIsBetter).toBe(false)
  })
})

describe('Phân rã 300 triệu — năm loại chi tiền mặt', () => {
  /* VÌ SAO khối này tồn tại. `Source.cost` là một cục tiền: không ai đọc được
     145 triệu của SK-0106 đi đâu, và không cắt được theo ngày. `costLines` phân
     rã nó — nhưng một phân rã KHÔNG cộng khớp còn tệ hơn không phân rã, vì nó
     trông như đã kiểm. Tám ca dưới đây khoá đúng chỗ đó.

     Ranh giới phải giữ: 300 triệu là TIỀN MẶT. Giờ người không có mặt ở đây. */

  const CASH = 300_000_000
  const KINDS: CostKind[] = ['du-lieu', 'kenh', 'noi-dung', 'su-kien', 'cong-cu']
  const lines = SOURCES.flatMap((s) => s.costLines)
  const sumOf = (xs: readonly { amount: number }[]) => xs.reduce((n, x) => n + x.amount, 0)

  it('mỗi nguồn cộng đúng Source.cost, và tám nguồn cộng đúng 300 triệu', () => {
    for (const s of SOURCES) {
      expect(sumOf(s.costLines), `${s.code} lệch`).toBe(s.cost)
    }
    expect(sumOf(lines)).toBe(CASH)
    expect(SOURCES.reduce((n, s) => n + s.cost, 0)).toBe(CASH)
  })

  it('Source.cost KHÔNG đổi một đồng nào — cả mô hình đứng trên tám con số này', () => {
    /* Phân rã được phép giải thích `cost`, không được phép sửa `cost`. Nếu một
       dòng chi không khớp thì sai ở dòng chi, không sai ở tổng đã chốt. */
    expect(SOURCES.map((s) => [s.code, s.cost])).toEqual([
      ['CD-0101', 18_000_000],
      ['CD-0102', 26_000_000],
      ['SK-0103', 84_000_000],
      ['SK-0104', 21_000_000],
      ['CD-0105', 6_000_000],
      ['SK-0106', 145_000_000],
      ['GT', 0],
      ['TM', 0],
    ])
  })

  it('đúng NĂM loại, không có loại thứ sáu và không có ô "khác"', () => {
    // Cùng luật với EXIT_REASONS: một ô "khác" là chỗ mọi hoá đơn khó phân loại
    // chui vào, và sau ba tháng nó thành loại lớn nhất bảng.
    for (const l of lines) expect(KINDS).toContain(l.kind)
    expect(new Set(lines.map((l) => l.kind)).size).toBe(KINDS.length)
  })

  it('cộng ngang theo loại — 65,4% tiền của phòng nằm ở sự kiện', () => {
    const of = (k: CostKind) => sumOf(lines.filter((l) => l.kind === k))
    expect(KINDS.map((k) => [k, of(k)])).toEqual([
      ['du-lieu', 4_580_000],
      ['kenh', 24_480_000],
      ['noi-dung', 48_900_000],
      ['su-kien', 196_100_000],
      ['cong-cu', 25_940_000],
    ])
    /* Con số đáng đọc nhất: câu hỏi gốc của người dùng — "lead từ Apollo giá bao
       nhiêu" — là câu hỏi về 1,5% ngân sách. Dữ liệu là dòng NHỎ NHẤT bảng. */
    expect(of('du-lieu') / CASH).toBeCloseTo(0.0153, 4)
    expect(of('su-kien') / CASH).toBeCloseTo(0.6537, 4)
  })

  it('không dòng nào tiêu trước khi nguồn chạy, không dòng nào vượt lát cắt', () => {
    for (const s of SOURCES) {
      for (const l of s.costLines) {
        expect(l.day, `${s.code} · ${l.label}`).toBeGreaterThanOrEqual(s.startDay)
        expect(l.day, `${s.code} · ${l.label}`).toBeLessThanOrEqual(DAY_FROZEN)
      }
    }
  })

  it('hai nguồn tự nhiên không có dòng nào — 0 đồng tiền mặt là câu trả lời đúng', () => {
    /* Đừng bịa dòng cho đủ bảng. GT và TM tốn GIỜ NGƯỜI chứ không tốn tiền mặt,
       và giờ người là một lớp khác chưa dựng — nhét nó vào đây là đổi nghĩa của
       con số 300 triệu mà không đổi giá trị, kiểu sai không test nào bắt được. */
    for (const code of ['GT', 'TM']) {
      const s = SOURCES.find((x) => x.code === code)
      expect(s?.costLines).toEqual([])
      expect(s?.cost).toBe(0)
    }
  })

  it('khoá phân bổ công cụ: 20 đợt là số ĐẾM ĐƯỢC, không phải số gõ tay', () => {
    expect(SOURCES.reduce((n, s) => n + s.waves.length, 0)).toBe(TOOL_POOL_WAVES)
    expect(TOOL_PER_WAVE).toBe(940_000)
    // Pool chia hết xuống 20 đợt, và 20 đợt đó thuộc đúng sáu nguồn có tiền.
    expect(TOOL_PER_WAVE * TOOL_POOL_WAVES).toBe(TOOL_POOL)
    const tool = SOURCES.flatMap((s) => s.costLines.filter((l) => l.kind === 'cong-cu'))
    const shared = tool.filter((l) => l.label.startsWith('Công cụ dùng chung'))
    expect(sumOf(shared)).toBe(TOOL_POOL)
  })

  it('dây nối credit ↔ tiền: 4.220 dòng Apollo, 4.220.000 đ, phần còn lại là phí xác minh', () => {
    const rows = 1_200 + 640 + 980 + 1_400
    const data = SOURCES.flatMap((s) => s.costLines.filter((l) => l.kind === 'du-lieu'))
    const bought = data.filter((l) => !l.label.startsWith('Xác minh'))
    expect(rows).toBe(4_220)
    expect(sumOf(bought)).toBe(rows * ROW_PRICE)
    expect(sumOf(data) - sumOf(bought)).toBe(1_200 * EMAIL_VERIFY_PRICE)
  })

  it('chi phí chìm nằm NGOÀI 300 triệu — tiền thật ra khỏi tài khoản là 304.122.400', () => {
    /* 300 triệu là *phần gán được cho nguồn*. Credit mua rồi không dùng là kết
       quả của một quyết định MUA GÓI, không của chiến dịch nào — chia nó xuống
       nguồn thì tháng nào phòng mua dư là mọi nguồn tự dưng đắt lên. */
    expect(UNUSED_APOLLO_CREDIT).toBe(4_122_400)
    expect(CASH + UNUSED_APOLLO_CREDIT).toBe(304_122_400)
    expect(sumOf(lines)).not.toBe(304_122_400)
  })
})

describe('Bốn chỉ số giá của một nguồn — bốn mẫu số, không thay nhau được', () => {
  /* Bảng §5.2 của docs/plans/chi-phi-nguon-lead.md, khoá từng ô. Đổi một con số
     ở đây là đổi thứ hạng nguồn trên ba màn cùng lúc. */

  const TABLE = [
    {
      code: 'CD-0101',
      lead: 818_182,
      mql: 1_636_364,
      sql: 2_250_000,
      good: 2_000_000,
      rate: 9 / 22,
    },
    {
      code: 'CD-0102',
      lead: 1_444_444,
      mql: 2_888_889,
      sql: 4_333_333,
      good: 3_714_286,
      rate: 7 / 18,
    },
    {
      code: 'SK-0103',
      lead: 5_250_000,
      mql: 12_000_000,
      sql: 16_800_000,
      good: 14_000_000,
      rate: 6 / 16,
    },
    {
      code: 'SK-0104',
      lead: 1_750_000,
      mql: 3_500_000,
      sql: 5_250_000,
      good: 5_250_000,
      rate: 4 / 12,
    },
    {
      code: 'CD-0105',
      lead: 666_667,
      mql: 3_000_000,
      sql: 6_000_000,
      good: 6_000_000,
      rate: 1 / 9,
    },
    {
      code: 'SK-0106',
      lead: 13_181_818,
      mql: 36_250_000,
      sql: 48_333_333,
      good: 48_333_333,
      rate: 3 / 11,
    },
    { code: 'GT', lead: 0, mql: 0, sql: 0, good: 0, rate: 3 / 7 },
    { code: 'TM', lead: 0, mql: 0, sql: null, good: 0, rate: 1 / 5 },
  ]

  it('bốn mẫu số cho ra bốn con số khác nhau ở cả tám nguồn', () => {
    for (const row of TABLE) {
      const s = sourceStats(row.code)
      expect(s.costPerLead, `${row.code} · mỗi đầu mối`).toBe(row.lead)
      expect(s.costPerMql, `${row.code} · mỗi MQL`).toBe(row.mql)
      expect(s.costPerSql, `${row.code} · mỗi SQL`).toBe(row.sql)
      expect(s.costPerGood, `${row.code} · mỗi lead tốt`).toBe(row.good)
      expect(s.goodRate ?? 0, `${row.code} · tỉ lệ lead tốt`).toBeCloseTo(row.rate, 6)
    }
  })

  it('mẫu số 0 trả null, không trả 0 — "chưa có SQL nào" khác "0 đồng mỗi SQL"', () => {
    // TM chưa đẩy được ai vào sổ cơ hội. In "0 đ/SQL" cho nó là nói nguồn này
    // rẻ nhất sổ, trong khi sự thật là nó chưa có SQL nào để mà tính giá.
    expect(sourceStats('TM').costPerSql).toBeNull()
    expect(sourceStats('TM').costPerLead).toBe(0)
    expect(sourceStats('KHONG-CO-MA-NAY').goodRate).toBeNull()
  })

  it('cả sổ: 34 lead tốt trên 100 đầu mối — trung bình phòng là 34,0%', () => {
    const good = SOURCES.reduce((n, s) => n + sourceStats(s.code).good, 0)
    const leads = SOURCES.reduce((n, s) => n + sourceStats(s.code).leads, 0)
    expect([good, leads]).toEqual([34, 100])
    /* Chi/lead tốt của phòng (8.823.529) RẺ HƠN chi/SQL (10.000.000) vì lead tốt
       có 34 mà SQL chỉ có 30: bốn lead đã qua cổng mà chưa ai nhận vào sổ cơ
       hội. Đó là tồn kho có tiền đứng sau, và hôm nay không màn nào đếm nó. */
    const sql = LEADS.filter((l) => l.tier === 'sql').length
    expect(sql).toBe(30)
    expect(Math.round(300_000_000 / good)).toBeLessThan(Math.round(300_000_000 / sql))
  })
})

describe('Bảng giá nhà cung cấp — số để LẬP KẾ HOẠCH, không phải số đo', () => {
  it('Apollo quy được ra đồng/1.000 dòng, và mua lẻ đắt 5,06 lần gói Professional', () => {
    const apollo = VENDOR_RATES.filter((r) => r.vendor === 'Apollo.io')
    const pro = apollo.find((r) => r.plan === 'Professional')
    const overage = apollo.find((r) => r.plan === 'Mua lẻ · overage')
    expect(pro?.perThousandRows).toBe(1_042_800)
    expect(pro?.perThousandRows).toBe(Math.round((79 * USD_VND * 1_000) / 2_000))
    expect(overage?.perThousandRows).toBe(5_280_000)
    expect((overage?.perThousandRows ?? 0) / (pro?.perThousandRows ?? 1)).toBeCloseTo(5.06, 2)
    // Đơn giá dùng trong fixture là bản làm tròn tới 100 đ của 1.042,80.
    expect(ROW_PRICE).toBe(1_000)
  })

  it('hai ô trống là KẾT LUẬN chứ không phải việc chưa làm', () => {
    /* Sales Navigator bán quyền tìm và xem, không bán dòng — nên nó thuộc loại
       cong-cu. Vietdata công bố giá gói mà không công bố số dòng, nên phép chia
       không tồn tại. Điền bừa một con số vào hai chỗ này là bịa mẫu số. */
    const unpriced = VENDOR_RATES.filter(
      (r) => r.vendor.includes('Sales Navigator') || r.vendor === 'Vietdata',
    )
    expect(unpriced.length).toBeGreaterThan(0)
    for (const r of unpriced) expect(r.perThousandRows).toBeNull()

    // Giá ghế Sales Navigator Core cũng không xác minh được ($89,99 – $119,99).
    const core = VENDOR_RATES.find((r) => r.plan === 'Core')
    expect(core?.confidence).toBe('khong-xac-minh-duoc')
    for (const r of VENDOR_RATES) expect(r.checkedOn).toBe('2026-08-20')
  })
})

describe('1.000 dòng Apollo ra bao nhiêu đầu mối — câu hỏi gốc, trả lời bằng hàm', () => {
  it('1.000 dòng → 880 gửi được → 18,33 đầu mối → 70.909 đ tiền dữ liệu mỗi đầu mối', () => {
    const r = rowsToLeads(1_000)
    expect(r.usableRows).toBe(880)
    expect(r.leads).toBeCloseTo(18.333, 3)
    expect(r.dataCost).toBe(1_300_000)
    expect(r.costPerUsableRow).toBeCloseTo(1_477.27, 2)
    expect(Math.round(r.dataCostPerLead ?? 0)).toBe(70_909)
  })

  it('tỉ lệ ra lead là số ĐO của CD-0101, không phải số đặt', () => {
    const cd = SOURCES.find((s) => s.code === 'CD-0101')
    expect(COLD_ROW_LEAD_RATE).toBe((cd?.leads ?? 0) / (cd?.waves[0]?.sent ?? 1))
    expect(COLD_ROW_LEAD_RATE).toBeCloseTo(0.018333, 6)
  })

  it('không trừ 12% hai lần — tỉ lệ đo trên dòng NHƯ ĐÃ MUA đã chứa phần hỏng', () => {
    /* Đây là chỗ dễ sửa nhầm nhất của cả hàm: nhân thẳng 1,8333% vào 880 dòng
       gửi được thì ra 16,1 đầu mối, hụt đúng 12% so với thứ CD-0101 đã đo. */
    const a = rowsToLeads(1_000)
    const b = rowsToLeads(1_000, { badRowRate: 0 })
    expect(a.leads).toBeCloseTo(b.leads, 9)
    expect(a.leads).not.toBeCloseTo(880 * COLD_ROW_LEAD_RATE, 3)
    // Tỉ lệ hỏng chỉ đổi giá mỗi dòng gửi được, không đổi số đầu mối.
    expect(b.costPerUsableRow).toBe(1_300)
  })

  it('câu hỏi gốc sai đơn vị: 1.000 ĐẦU MỐI cần 54.545 dòng, và tiền dữ liệu chỉ là phần nhỏ', () => {
    const need = 1_000 / COLD_ROW_LEAD_RATE
    expect(Math.round(need)).toBe(54_545)
    const r = rowsToLeads(Math.round(need))
    expect(r.dataCost).toBe(70_908_500)
    /* CPL đầy đủ của CD-0101 là 818.182 đ/đầu mối, nên 1.000 đầu mối ≈ 818
       triệu: tiền dữ liệu chỉ chiếm 8,67%. Tối ưu chỗ mua danh sách gần như
       không đổi được gì — đó là kết luận đắt nhất của cả vòng khảo sát. */
    const full = (sourceStats('CD-0101').costPerLead ?? 0) * 1_000
    expect(r.dataCost / full).toBeCloseTo(0.0867, 4)
  })
})

describe('Khung KPI — tài liệu vòng đời khách hàng & KPI CRM', () => {
  it('mọi thước của CREDIT_RULES đều có mặt trong ROLE_KPI_MODEL của đúng vai', () => {
    /* Hai bảng cùng nói về một thứ: CREDIT_RULES đặt TÊN thước, ROLE_KPI_MODEL
       thêm lớp, công thức và ngưỡng. Không khoá vào nhau thì một hôm ai đó đổi
       tên thước ở bảng này, bảng kia giữ tên cũ, và màn Performance chấm người
       bằng một thước không còn tồn tại. */
    for (const rule of CREDIT_RULES) {
      const row = ROLE_KPI_MODEL.find((r) => r.role === rule.role)
      expect(row, `Vai "${rule.role}" thiếu dòng trong ROLE_KPI_MODEL`).toBeDefined()
      for (const label of rule.metrics) {
        expect(row?.kpis.map((k) => k.label)).toContain(label)
      }
    }
  })

  it('mỗi vai có đúng một thước chính, trừ vai không chấm cá nhân', () => {
    for (const row of ROLE_KPI_MODEL) {
      const primary = row.kpis.filter((k) => k.primary)
      expect(primary.length, `Vai "${row.role}" có ${primary.length} thước chính`).toBe(
        row.kpis.length === 0 ? 0 : 1,
      )
    }
  })

  it('chỉ thước cộng dồn mới được đặt mục tiêu theo tháng', () => {
    // Nhân mục tiêu tỷ lệ với số tháng của kỳ là cách nhanh nhất để cả bảng đỏ.
    for (const row of ROLE_KPI_MODEL) {
      for (const kpi of row.kpis) {
        if (kpi.paced) expect(kpi.unit).not.toBe('ty-le')
      }
    }
  })

  it('Trưởng phòng Kinh doanh không có thước cá nhân nào', () => {
    const head = ROLE_KPI_MODEL.find((r) => r.role === 'Trưởng phòng Kinh doanh')
    expect(head?.kpis).toHaveLength(0)
  })
})

describe('Mốc đời lead — nền của trục tháng · quý · năm', () => {
  const marks = LEADS.map(leadMilestones)

  it('bốn mốc cộng cả kỳ ra đúng bốn bậc của phễu', () => {
    /* ĐÂY là ca test cho phép màn Performance có trục thời gian. Cắt sổ lead
       theo tháng chỉ hợp lệ nếu cộng mọi tháng lại ra đúng con số đã chốt —
       nếu không thì trục thời gian đang đẻ ra số không ai ký. */
    const step = (key: string) => FUNNEL.find((s) => s.key === key)?.count

    expect(marks.length).toBe(step('dau-moi'))
    expect(marks.filter((m) => m.mql).length).toBe(step('cong-ty-that'))
    expect(marks.filter((m) => m.sql).length).toBe(step('co-hoi'))
    expect(marks.filter((m) => m.ky).length).toBe(step('hop-dong'))
    expect(marks.filter((m) => m.roi).length).toBe(BOOK_SPLIT.exited)
  })

  it('mốc đời đi đúng thứ tự: vào sổ → MQL → SQL → ký', () => {
    for (const m of marks) {
      if (m.mql) expect(m.mql >= m.vaoSo).toBe(true)
      if (m.sql) expect(m.mql).toBeDefined()
      if (m.sql && m.mql) expect(m.sql >= m.mql).toBe(true)
      if (m.ky && m.sql) expect(m.ky >= m.sql).toBe(true)
    }
  })

  it('lead nào lên MQL cũng có dấu tay BD, và không lead nào rơi ngoài khoảng kịch bản', () => {
    const first = dayISO(0).slice(0, 10)
    const frozen = dayISO(DAY_FROZEN).slice(0, 10)

    for (const m of marks) {
      for (const at of [m.vaoSo, m.mql, m.sql, m.ky, m.roi, m.bdCham]) {
        if (!at) continue
        expect(at.slice(0, 10) >= first).toBe(true)
        expect(at.slice(0, 10) <= frozen).toBe(true)
      }
    }
    expect(marks.filter((m) => m.bdCham).length).toBeGreaterThan(0)
  })

  it('SLA bàn giao chỉ giữ chặng đo được bằng sổ lead của kịch bản này', () => {
    // Hai chặng sau bán thuộc kịch bản Sao Đỏ — trộn vào đây là phạm luật.
    expect(HANDOFF_SLA.map((s) => s.key)).toEqual(['mkt-bd', 'bd-sale'])

    const legs = marks
      .map((m) => daysBetween(m.vaoSo, m.bdCham))
      .filter((v): v is number => v !== null)
    expect(legs.length).toBeGreaterThan(0)
    for (const d of legs) expect(d).toBeGreaterThanOrEqual(0)
  })
})
