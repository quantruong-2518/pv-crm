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
  BD,
  BOOK_SPLIT,
  canPromoteToSql,
  COLD_ROW_LEAD_RATE,
  costOfGoodLead,
  costOfPaidBatchLead,
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
  leadOrigin,
  MARKETING,
  type OriginKind,
  PROSPECT_BATCHES,
  prospectBatchesImportedBy,
  prospectBatchesOfSource,
  prospectBatchesPaid,
  prospectStats,
  prospectTotals,
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

describe('Kho danh sách prospect — 5.753 dòng đứng NGOÀI phễu', () => {
  /* VÌ SAO khối này tồn tại. Tám lô là bảng số duy nhất của repo nối được ba thứ
     vốn nằm rời nhau: dòng danh sách mua về, khán giả của một đợt gửi, và tiền
     đã tiêu. Ba dây nối ấy chỉ có giá trị khi CÂN — một bảng prospect không cân
     còn tệ hơn không có bảng, vì nó làm màn kho trông như đã kiểm.

     Ranh giới phải giữ: prospect KHÔNG phải bậc thứ bảy của phễu. Nhập 1.200
     dòng không sinh một đầu mối nào; lead sinh khi bên kia trả lời. */

  const T = prospectTotals()
  const dayOf = (code: string, no: number) =>
    SOURCES.find((s) => s.code === code)?.waves.find((w) => w.no === no)?.day ?? Infinity

  /** Ngày đợt SỚM NHẤT lô nuôi. Lô gọi tay thì lấy ngày nguồn bắt đầu chạy. */
  const firstUseDay = (b: (typeof PROSPECT_BATCHES)[number]) => {
    const days = b.usedBy.flatMap((u) => u.waves.map((no) => dayOf(u.source, no)))
    if (b.calledBy) days.push(SOURCES.find((s) => s.code === b.calledBy)?.startDay ?? Infinity)
    return Math.min(...days)
  }

  it('tám lô, mã không trùng, người nhập có tên trong actors', () => {
    const names = new Set(dasVina.actors.map((a) => a.name))
    expect(PROSPECT_BATCHES).toHaveLength(T.batches)
    expect(new Set(PROSPECT_BATCHES.map((b) => b.code)).size).toBe(PROSPECT_BATCHES.length)
    for (const b of PROSPECT_BATCHES) {
      expect(names.has(b.importedBy), `${b.code} · người nhập lạ`).toBe(true)
      // Cả tám lô của kỳ đã vào kho: không lô nào còn dở ở giữa luồng năm bước.
      expect(b.state, `${b.code} · trạng thái`).toBe('da-nhap')
      expect(b.retentionDays, `${b.code} · hạn lưu`).toBe(365)
    }
  })

  /** Phép cân 1 của bảng tám lô. */
  it('cân dòng — thô trừ trùng trừ loại đúng bằng hợp lệ, ở cả tám lô lẫn ở tổng', () => {
    for (const b of PROSPECT_BATCHES) {
      expect(b.rowsRaw - b.rowsDuplicate - b.rowsRejected, `${b.code} lệch`).toBe(b.rowsValid)
    }
    expect([T.rowsRaw, T.rowsDuplicate, T.rowsRejected, T.rowsValid]).toEqual([
      6_818, 424, 641, 5_753,
    ])
    expect(T.rowsRaw - T.rowsDuplicate - T.rowsRejected).toBe(T.rowsValid)

    /* Hai con số kể câu chuyện của cả bảng, nên khoá thẳng: Apollo loại nhiều
       nhất (mua theo dòng thì chất lượng đọc ra tiền), khách mời triển lãm trùng
       nhiều nhất (lô THỨ TƯ nhắm cùng tệp nhà máy phía Bắc). */
    expect(prospectStats('DS-0103').rejectRate ?? 0).toBeCloseTo(0.186, 3)
    expect(prospectStats('DS-0104').duplicateRate ?? 0).toBeCloseTo(0.1106, 4)
  })

  /** Phép cân 2. Tiền danh sách nằm TRONG `Source.cost`, không cộng thêm. */
  it('cân tiền — lô không đắt hơn nguồn nuôi nó, và 31 triệu nằm TRONG 300 triệu', () => {
    for (const b of PROSPECT_BATCHES) {
      for (const code of prospectStats(b.code).sources) {
        const src = SOURCES.find((s) => s.code === code)
        expect(b.cost, `${b.code} đắt hơn nguồn ${code}`).toBeLessThanOrEqual(src?.cost ?? 0)
      }
    }
    /* Dạng mạnh hơn ở mức NGUỒN: SK-0106 có hai lô, và hai lô cộng lại vẫn phải
       nằm trong 145 triệu của nó. */
    for (const s of SOURCES) {
      const of = PROSPECT_BATCHES.filter((b) => prospectStats(b.code).sources.includes(s.code))
      const sum = of.reduce((n, b) => n + b.cost, 0)
      expect(sum, `${s.code} · ${of.length} lô cộng lại vượt chi phí nguồn`).toBeLessThanOrEqual(
        s.cost,
      )
    }

    expect(T.cost).toBe(31_000_000)
    /* Chốt chặn của cả phép cân: bảng lô KHÔNG được đẩy tổng chi kỳ lên. Cộng
       thêm 31 triệu vào 300 là ra 331 — con số không được xuất hiện ở màn nào. */
    expect(SOURCES.reduce((n, s) => n + s.cost, 0)).toBe(300_000_000)
  })

  /** ⚠ CA NÀY ĐANG SKIP, và skip là câu trả lời đúng cho tới khi có người gật.
   *
   *  Đây là dạng MẠNH của phép cân 2: nếu tiền danh sách của lô thật sự nằm
   *  trong `Source.cost`, nó phải nằm trong đúng các dòng chi loại `du-lieu` của
   *  nguồn ấy. Hôm nay không nằm: bốn lô phải trả tiền khai 8 + 6 + 5 + 12 = 31
   *  triệu theo đặc tả §7.1, còn các dòng `du-lieu` của đúng bốn nguồn đó cộng
   *  lại chỉ 4.580.000 đ (1,56 + 0,64 + 0,98 + 1,4) — và 4,58 triệu đang bị ca
   *  "cộng ngang theo loại" cùng ca "4.220 dòng Apollo × ROW_PRICE" khoá chặt.
   *
   *  Gấp 6,8 lần. Hai bảng nói hai số cho cùng một câu hỏi "tiền danh sách là
   *  bao nhiêu", và chỗ lệch sẽ hiện ra ở MÀN chứ không ở CI vì dạng YẾU ở trên
   *  (8≤18 · 6≤84 · 5≤21 · 12≤145) đều qua.
   *
   *  ĐỪNG nới 4,58 triệu cho khớp 31 triệu, và cũng đừng sửa 31 xuống 4,58 ở
   *  đây: cả hai con số đều do người đặt. Người đặt gật xong thì bỏ `.skip`. */
  it.skip('cân tiền dạng mạnh — tiền lô nằm trong đúng dòng chi du-lieu của nguồn', () => {
    for (const b of PROSPECT_BATCHES) {
      if (b.cost === 0) continue
      const src = SOURCES.find((s) => s.code === b.usedBy[0]?.source)
      const data = (src?.costLines ?? [])
        .filter((l) => l.kind === 'du-lieu')
        .reduce((n, l) => n + l.amount, 0)
      expect(b.cost, `${b.code} · tiền lô vượt dòng du-lieu của ${src?.code}`).toBeLessThanOrEqual(
        data,
      )
    }
  })

  /** Phép cân 3. */
  it('cân thời gian — lô nhập TRƯỚC đợt đầu tiên nó nuôi, cả 8/8', () => {
    for (const b of PROSPECT_BATCHES) {
      const first = firstUseDay(b)
      expect(Number.isFinite(first), `${b.code} không nối được vào đợt nào`).toBe(true)
      expect(b.importedDay, `${b.code} nhập sau khi đã gửi`).toBeLessThan(first)
    }
    // Lô sớm nhất là DS-0108 ở d0 — BD cầm danh sách từ ngày đầu tiên của kỳ.
    expect(Math.min(...PROSPECT_BATCHES.map((b) => b.importedDay))).toBe(0)
  })

  /** Phép cân 4. */
  it('giá một dòng của phần PHẢI TRẢ TIỀN — 4.220 dòng, 7.346 đ, không chia cho 5.753', () => {
    expect(T.paidRows).toBe(4_220)
    expect(T.costPerPaidRow).toBe(7_346)
    /* Chia 31 triệu cho cả 5.753 dòng là làm một dòng danh sách trông rẻ hơn
       thật: bốn lô kia không tốn đồng nào, gộp chúng vào mẫu số là lấy sổ cũ của
       phòng đi trợ giá cho danh sách mua. */
    expect(T.costPerPaidRow ?? 0).toBeGreaterThan(Math.round(T.cost / T.rowsValid))
    expect(PROSPECT_BATCHES.filter((b) => b.cost > 0).map((b) => b.code)).toEqual([
      'DS-0101',
      'DS-0102',
      'DS-0103',
      'DS-0104',
    ])
  })

  it('bảy lô neo rowsValid vào Wave.sent; lô thứ tám phải ĐẶT vì không nuôi đợt nào', () => {
    /* Đây là dây nối đắt nhất của cả khối: "dòng hợp lệ" và "người nhận của đợt
       mở màn" phải là CÙNG MỘT con số, nếu không thì hoặc lô rò dòng ra ngoài,
       hoặc đợt gửi cho người không có trong lô nào. Hai trong bảy lô nuôi đợt
       KHÔNG phải đợt mở màn của nguồn (DS-0106 → đợt 4 của CD-0102, DS-0107 →
       đợt 2 của SK-0106), nên phép neo là "đợt đầu tiên LÔ nuôi", không phải
       "đợt mở màn của NGUỒN". */
    const anchored = PROSPECT_BATCHES.filter((b) => prospectStats(b.code).openingSent !== null)
    expect(anchored.map((b) => b.code)).toEqual([
      'DS-0101',
      'DS-0102',
      'DS-0103',
      'DS-0104',
      'DS-0105',
      'DS-0106',
      'DS-0107',
    ])
    for (const b of anchored) {
      expect(prospectStats(b.code).openingSent, `${b.code} · khán giả lệch dòng hợp lệ`).toBe(
        b.rowsValid,
      )
    }

    const floating = PROSPECT_BATCHES.filter((b) => prospectStats(b.code).openingSent === null)
    expect(floating.map((b) => b.code)).toEqual(['DS-0108'])
    /* 180 = 9 ngày × 20 dòng gọi/ngày. Cửa sổ chín ngày đọc được từ `createdAt`
       của năm lead TM; nhịp 20 dòng/ngày là phần ĐẶT bởi Lê Hoàng Nam · 20/08.
       Đổi 180 thì phải đổi cả cột Thô và cột Hợp lệ ở dòng Tổng. */
    expect(floating[0]?.rowsValid).toBe(180)
    expect(floating[0]?.usedBy).toEqual([])
    expect(floating[0]?.calledBy).toBe('TM')
  })

  it('bốn phép trừ — người trả lời rời khán giả, đúng bốn chỗ trong kỳ', () => {
    /* `Wave[n+1].sent = Wave[n].sent − Wave[n].replied`. Luật này đã nằm sẵn
       trong fixture từ trước mà chưa ai viết ra thành câu: một chiến dịch nuôi
       bằng MỘT lô thì đợt sau chỉ bớt đi đúng số người đã trả lời ở đợt trước. */
    const chains = PROSPECT_BATCHES.flatMap((b) =>
      b.usedBy.flatMap((u) => {
        const src = SOURCES.find((s) => s.code === u.source)
        if (!src || src.kind !== 'chien-dich' || u.waves.length < 2) return []
        const ws = src.waves.filter((w) => u.waves.includes(w.no)).sort((a, z) => a.day - z.day)
        return ws.slice(1).map((w, i) => ({ code: src.code, prev: ws[i]!, next: w }))
      }),
    )
    expect(chains.map((c) => `${c.code}/${c.prev.no}→${c.next.no}`)).toEqual([
      'CD-0101/1→2',
      'CD-0101/2→3',
      'CD-0105/1→2',
      'CD-0105/2→3',
    ])
    for (const c of chains) {
      expect(c.prev.sent - c.prev.replied, `${c.code} · đợt ${c.next.no}`).toBe(c.next.sent)
    }
  })

  it('hai đợt của SK-0106 CỐ TÌNH đứng ngoài phép trừ — cùng một tệp 143 người, gửi hai lần', () => {
    /* Đừng "sửa cho đều": 143 người quét mã tại gian là khán giả của CẢ đợt 2
       lẫn đợt 3, nên `sent` không co lại. Nếu áp phép trừ vào đây thì đợt 3 phải
       gửi cho 0 người (đợt 2 có replied = sent = 143), và cộng hai đợt lại để ra
       "286 người" là đếm cùng 143 người hai lần. */
    const sk = SOURCES.find((s) => s.code === 'SK-0106')
    const [w2, w3] = [sk?.waves.find((w) => w.no === 2), sk?.waves.find((w) => w.no === 3)]
    expect([w2?.sent, w3?.sent]).toEqual([143, 143])
    expect(w2?.replied).toBe(w2?.sent)
    expect(prospectStats('DS-0107').rowsValid).toBe(143)
    expect(PROSPECT_BATCHES.find((b) => b.code === 'DS-0107')?.usedBy).toEqual([
      { source: 'SK-0106', waves: [2, 3] },
    ])
  })

  it('61 + 17 + 22 = 100 — mọi dòng sổ trả lời được câu "có lô nào đứng sau không"', () => {
    /* Phép cân này không đẻ con số mới: cả ba phần cộng từ `Wave.leads` đã có.
       22 dòng ở nhóm ba là lý do `LeadOrigin.batch` phải optional — 15 dòng về
       từ ba đợt reach nền tảng của CD-0102 (mua 8.400 địa chỉ nhà máy Bắc Ninh
       là chuyện không có thật) và 7 dòng của GT là khách cũ giới thiệu. */
    expect([T.leadsDirect, T.leadsIndirect, T.leadsNoBatch]).toEqual([61, 17, 22])
    expect(T.leadsDirect + T.leadsIndirect + T.leadsNoBatch).toBe(FUNNEL[0].count)
    expect(T.allLeads).toBe(LEADS.length)

    // Từng lô về từ đâu — khoá cả cột trực tiếp lẫn cột qua một bước đăng ký.
    const BY_BATCH = [
      ['DS-0101', 22, 0],
      ['DS-0102', 6, 10],
      ['DS-0103', 5, 7],
      ['DS-0104', 3, 0],
      ['DS-0105', 9, 0],
      ['DS-0106', 3, 0],
      ['DS-0107', 8, 0],
      ['DS-0108', 5, 0],
    ]
    expect(
      PROSPECT_BATCHES.map((b) => {
        const s = prospectStats(b.code)
        return [b.code, s.leadsDirect, s.leadsIndirect]
      }),
    ).toEqual(BY_BATCH)

    /* Con số đáng đọc nhất của cả khối: 5.753 dòng danh sách còn lại 100 dòng
       sổ. Một phần trăm rưỡi — và đó là lý do màn nhập phải in thẳng câu "nhập
       lô không sinh lead nào". */
    expect(T.allLeads / T.rowsValid).toBeCloseTo(0.0174, 4)
  })
})

describe('Lô đứng sau một dòng sổ — trục THỨ HAI, không phải kiểu xuất xứ thứ năm', () => {
  it('OriginKind vẫn ĐÚNG BỐN giá trị — thêm giá trị thứ năm là đỏ ngay ở đây', () => {
    /* "Về từ chiến dịch" và "về từ lô DS-0103" là hai câu trả lời cho hai câu
       hỏi khác nhau, và một lead trả lời được cả hai. Nhét lô thành giá trị thứ
       năm của `OriginKind` là mất câu thứ nhất — và mất luôn `ORIGIN_FACE` bốn
       dòng ở tầng app.

       Bảng dưới đây là `Record<OriginKind, …>`: thêm một giá trị vào kiểu mà
       quên bảng này thì `pnpm typecheck` đỏ, còn bớt một giá trị thì ca này đỏ. */
    const FACE: Record<OriginKind, string> = {
      'chien-dich': 'Chiến dịch',
      'su-kien': 'Sự kiện',
      'gioi-thieu': 'Được giới thiệu',
      'tu-mo': 'Tạo trực tiếp',
    }
    expect(Object.keys(FACE)).toHaveLength(4)
    const seen = [...new Set(LEADS.map((l) => leadOrigin(l).kind))].sort()
    expect(seen).toEqual(Object.keys(FACE).sort())
  })

  it('mã lô trên một dòng sổ phải có thật trong kho, và chép đúng nhà cung cấp lẫn ngày nhập', () => {
    for (const lead of LEADS) {
      const o = leadOrigin(lead)
      if (!o.batch) continue
      const b = PROSPECT_BATCHES.find((x) => x.code === o.batch?.code)
      expect(b, `${lead.code} trỏ vào lô "${o.batch.code}" không có trong kho`).toBeDefined()
      expect(o.batch.supplier, `${lead.code} · nhà cung cấp lệch`).toBe(b?.supplier)
      expect(o.batch.importedAt, `${lead.code} · ngày nhập lệch`).toBe(dayISO(b?.importedDay ?? 0))
    }
  })

  it('64 dòng sổ mang được mã lô, 78 dòng thật sự có lô — 14 dòng chênh là giá đã trả', () => {
    /* `Lead` cố tình KHÔNG có `waveNo`, nên hệ biết lead về từ NGUỒN nào mà
       không biết về từ ĐỢT nào: ba nguồn có hai lô chia nhau, hoặc có đợt không
       đứng trên lô nào, thì không gắn mã lô cho một dòng sổ được.

       Đừng "bù" 14 dòng bằng cách đoán — cần số theo LÔ thì đọc `prospectStats`,
       nó đếm ở mức đợt và không quét sổ. */
    const carried = LEADS.map(leadOrigin).filter((o) => o.batch).length
    expect(carried).toBe(64)
    expect(prospectTotals().leadsWithBatch).toBe(78)
    expect(prospectTotals().leadsWithBatch - carried).toBe(14)
  })
})

describe('Giá mỗi lead của lô phải trả tiền — một phép chia, ba phạm vi có tên', () => {
  /* VÌ SAO khối này tồn tại. Câu TP Kinh doanh hỏi đầu tiên khi mở kho danh sách
     là "31 triệu tiền mua dòng ra bao nhiêu lead". Trước 20/08 kho chỉ trả lời
     được nửa câu: `costPerPaidRow` nói một DÒNG giá 7.346 đ, không nói một LEAD
     giá bao nhiêu — mà tiền thì tiêu để lấy lead chứ không để lấy dòng.

     Cái bẫy của nửa còn lại: bốn lô 0 đồng có 20 lead thật. Thả chúng vào mẫu số
     là lấy sổ cũ của phòng đi trợ giá cho danh sách mua, y hệt cái bẫy
     `costPerPaidRow` đã tránh ở mẫu số dòng. Ca "lô 0 đồng" dưới đây khoá đúng
     chỗ đó: bỏ phép lọc trong `costOfPaidBatchLead` là ĐỎ ngay. */

  const T = prospectTotals()
  const codesOf = (xs: readonly { code: string }[]) => xs.map((x) => x.code)
  const PAID = ['DS-0101', 'DS-0102', 'DS-0103', 'DS-0104']

  it('ba phạm vi có tên, và bốn lô mất tiền cộng đúng 31 triệu', () => {
    expect(codesOf(prospectBatchesPaid())).toEqual(PAID)
    /* Phạm vi hai — người nhập. Marketing ôm cả bốn lô mất tiền; BD đúng một lô
       0 đồng, và đó là chỗ hàm phải trả `null` chứ không trả 0. */
    expect(codesOf(prospectBatchesImportedBy(MARKETING))).toEqual([
      'DS-0101',
      'DS-0102',
      'DS-0103',
      'DS-0104',
      'DS-0105',
      'DS-0106',
      'DS-0107',
    ])
    expect(codesOf(prospectBatchesImportedBy(BD))).toEqual(['DS-0108'])
    // Phạm vi ba — lô đứng sau một nguồn. SK-0106 là nguồn duy nhất có hai lô.
    expect(codesOf(prospectBatchesOfSource('SK-0106'))).toEqual(['DS-0104', 'DS-0107'])
    expect(prospectBatchesPaid().reduce((n, b) => n + b.cost, 0)).toBe(31_000_000)
  })

  it('31 triệu tiền mua dòng ra 53 lead — 584.906 đ một lead', () => {
    expect(costOfPaidBatchLead(prospectBatchesPaid())).toEqual({
      paidBatches: 4,
      freeBatches: 0,
      cost: 31_000_000,
      leads: 53,
      freeLeads: 0,
      perLead: 584_906,
    })

    /* Lọc trước hay không lọc trước phải ra CÙNG một giá: phép bỏ lô 0 đồng nằm
       TRONG hàm, không nằm ở người gọi. Đây là chỗ đỡ cho mọi màn gọi ẩu. */
    const all = costOfPaidBatchLead(PROSPECT_BATCHES)
    const paidOnly = costOfPaidBatchLead(prospectBatchesPaid())
    expect([all.cost, all.leads, all.perLead]).toEqual([
      paidOnly.cost,
      paidOnly.leads,
      paidOnly.perLead,
    ])
    expect([all.freeBatches, all.freeLeads]).toEqual([4, 25])

    /* Hai thước tiền của kho phải cân với nhau qua đúng một tỉ lệ: 53 lead trên
       4.220 dòng đã mua = 1,26%. Lệch một trong ba số là hai màn nói hai chuyện
       về cùng 31 triệu. */
    expect(T.paidBatchLeads).toBe(53)
    expect(T.costPerPaidBatchLead).toBe(584_906)
    expect(53 / (T.paidRows || 1)).toBeCloseTo(0.0126, 4)
    /* Đi vòng: giá một DÒNG nhân số dòng trên mỗi lead phải quay về giá một
       LEAD. Lệch 2 đ trên 584.906 là phần làm tròn của 7.346, không phải chỗ hở
       — nhưng lệch quá 10 đ thì một trong hai thước đã đổi mẫu số. */
    expect(Math.abs((T.costPerPaidRow ?? 0) * (T.paidRows / 53) - 584_906)).toBeLessThan(10)

    /* Phần để ngoài phép chia cộng lại đúng 78 lead có lô đứng sau: 53 lead mua
       bằng tiền + 25 lead không tốn đồng nào. Màn nào hiện 584.906 mà giấu 25
       kia là để người đọc tưởng kho chỉ ra 53 lead. */
    expect(T.freeBatchLeads).toBe(25)
    expect(T.paidBatchLeads + T.freeBatchLeads).toBe(T.leadsWithBatch)
  })

  it('KHAI PHẠM VI — tiền mua dòng của lô KHÁC chi dữ liệu của nguồn, gấp 6,77 lần', () => {
    /* Quyết định G · 20/08. Hai con số cùng có thể mang nhãn "chi phí dữ liệu"
       mà chênh gần bảy lần: 31 triệu là tiền mua DÒNG của tám lô, 4,58 triệu là
       dòng chi loại `du-lieu` của tám nguồn. Không ô nào được ghi "Chi phí" trỏ
       trống không, và hai số này KHÔNG được đứng cạnh nhau như hai cách đọc của
       cùng một thứ — xem ca `it.skip` "cân tiền dạng mạnh" ở khối kho. */
    const dataLines = SOURCES.flatMap((s) => s.costLines).filter((l) => l.kind === 'du-lieu')
    const dataSpend = dataLines.reduce((n, l) => n + l.amount, 0)
    expect(dataSpend).toBe(4_580_000)
    expect(costOfPaidBatchLead(prospectBatchesPaid()).cost / dataSpend).toBeCloseTo(6.77, 2)
  })

  it('lô 0 đồng KHÔNG được kéo mẫu số xuống — SK-0106 là 4 triệu, không phải 1,09', () => {
    /* SK-0106 mua lô khách mời 12 triệu (ra 3 lead) và quét mã tại gian 0 đồng
       (ra 8 lead). Cộng cả 11 lead vào mẫu số là báo giá 1,09 triệu cho thứ thật
       ra 4 triệu — rẻ đi gần bốn lần, và rẻ đi bằng lead mà tiền ấy không mua. */
    const scope = costOfPaidBatchLead(prospectBatchesOfSource('SK-0106'))
    expect(scope).toEqual({
      paidBatches: 1,
      freeBatches: 1,
      cost: 12_000_000,
      leads: 3,
      freeLeads: 8,
      perLead: 4_000_000,
    })
    // Phần để ngoài phép chia phải ĐẾM ĐƯỢC: bỏ ngoài thì được, giấu thì không.
    expect(scope.freeLeads).toBeGreaterThan(0)
    expect(Math.round(scope.cost / (scope.leads + scope.freeLeads))).toBeLessThan(
      scope.perLead ?? 0,
    )

    // Cùng phép lọc ở phạm vi người nhập: Marketing có 3 lô 0 đồng, 20 lead miễn phí.
    const mkt = costOfPaidBatchLead(prospectBatchesImportedBy(MARKETING))
    expect([mkt.paidBatches, mkt.freeBatches, mkt.freeLeads]).toEqual([4, 3, 20])
    expect(mkt.perLead).toBe(584_906)
  })

  it('không có lô mất tiền nào thì trả null — không 0, không Infinity', () => {
    /* Ràng buộc của cả repo: số 0 KHÔNG BAO GIỜ là "chưa có". BD nhập đúng một
       lô 0 đồng và lô ấy ra 5 lead thật — "chưa đo được giá" là câu trả lời
       đúng, "0 đồng một lead" là câu nói dối. */
    const bd = costOfPaidBatchLead(prospectBatchesImportedBy(BD))
    expect(bd).toEqual({
      paidBatches: 0,
      freeBatches: 1,
      cost: 0,
      leads: 0,
      freeLeads: 5,
      perLead: null,
    })
    expect(Number.isFinite(bd.perLead as number)).toBe(false)

    // Phạm vi rỗng — GT là khách cũ giới thiệu, không có lô nào đứng sau.
    expect(codesOf(prospectBatchesOfSource('GT'))).toEqual([])
    expect(costOfPaidBatchLead([])).toEqual({
      paidBatches: 0,
      freeBatches: 0,
      cost: 0,
      leads: 0,
      freeLeads: 0,
      perLead: null,
    })
  })

  it('giá của MỘT lô đi qua đúng hàm chung — hàng bảng và ô tổng không lệch nhau', () => {
    /* `prospectStats().costPerLead` là thứ màn dùng cho TỪNG hàng của bảng tám
       lô; nếu nó giữ phép chia riêng thì hàng bảng và ô tổng nói hai chuyện. */
    for (const b of PROSPECT_BATCHES) {
      const one = costOfPaidBatchLead([b])
      expect(one.perLead, `${b.code} · giá lệch giữa hàng bảng và hàm chung`).toBe(
        b.cost > 0 ? prospectStats(b.code).costPerLead : null,
      )
    }

    // Bốn lô mất tiền, bốn giá khác nhau — 12 triệu của SK-0106 là đắt nhất bảng.
    expect(prospectBatchesPaid().map((b) => costOfPaidBatchLead([b]).perLead)).toEqual([
      363_636, 375_000, 416_667, 4_000_000,
    ])
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
