import { describe, expect, it } from 'vitest'
import { MARKETING, SOURCES, sourcesOwnedBy } from '@pv/engines/fixtures/das-vina'
import { costBreakdown, costGap, rankSources, spendIn } from './source-cost'
import { DATA_WINDOW, MONTHS, QUARTERS, inPeriod, type Period } from './period'
import { performanceQuery } from './performance'
import type { Performance } from './performance'

/** Khoá ba thứ mà mắt người không bắt được, và cả ba đều đã sai ít nhất một lần
 *  trong repo này:
 *
 *   1. **Thứ tự xếp hạng** — xếp theo ĐIỂM (quyết định D-03), không theo cận
 *      trên. Hai khoá cho hai thứ tự khác nhau, nên đổi khoá là đổi thứ hạng của
 *      người làm ra nguồn đó mà không ai thấy.
 *   2. **Cổng `separableCost`** — câu "A rẻ hơn B" chỉ ra lò khi hai DẢI rời
 *      nhau. Trên sáu nguồn có tiêu tiền, đúng 5 trong 15 cặp qua cổng.
 *   3. **Phép cắt chi phí theo kỳ** — bốn tháng cộng lại phải đúng 300 triệu,
 *      không đồng nào rơi ra ngoài mọi lát và không đồng nào bị đếm hai lần.
 *
 *  Con số kỳ vọng: chỗ nào suy lại được từ fixture thì suy lại, chỗ nào là KẾT
 *  LUẬN đã chốt của `docs/plans/chi-phi-nguon-lead.md §6.5 · §6.6` thì ghi thẳng
 *  — đó chính là thứ cần khoá. */

const PAID_ORDER = ['CD-0101', 'CD-0102', 'SK-0104', 'CD-0105', 'SK-0103', 'SK-0106']

const byCode = () => new Map(rankSources().ranked.map((r) => [r.code, r]))

describe('Xếp hạng nguồn theo giá mỗi lead tốt', () => {
  it('xếp theo ĐIỂM, rẻ nhất lên đầu — đúng thứ tự hôm nay, không đổi sang cận trên', () => {
    const { ranked } = rankSources()
    expect(ranked.map((r) => r.code)).toEqual(PAID_ORDER)

    // Suy lại từ chính dữ liệu: dãy điểm phải không giảm.
    const points = ranked.map((r) => r.band.point ?? Number.POSITIVE_INFINITY)
    expect([...points].sort((a, b) => a - b)).toEqual(points)
  })

  it('xếp theo cận trên cho ra thứ tự KHÁC — đây là lý do khoá này phải khoá', () => {
    const { ranked } = rankSources()
    const byHi = [...ranked]
      .sort(
        (a, b) => (a.band.hi ?? Number.POSITIVE_INFINITY) - (b.band.hi ?? Number.POSITIVE_INFINITY),
      )
      .map((r) => r.code)

    /* CD-0105 điểm 6,0 tr đứng hạng tư, nhưng cận trên 33,5 tr thì nó đắt thứ
       nhì cả bảng. Hai khoá KHÔNG cho cùng một bảng — chưa ai gật đổi khoá. */
    expect(byHi).not.toEqual(PAID_ORDER)
    expect(byHi.indexOf('CD-0105')).toBeGreaterThan(PAID_ORDER.indexOf('CD-0105'))
  })

  it('nguồn cỡ mẫu nhỏ Ở LẠI bảng, chỉ mất quyền đứng cạnh câu khẳng định', () => {
    const { ranked } = rankSources()
    const thin = ranked.filter((r) => !r.enough)

    expect(ranked).toHaveLength(6)
    expect(thin.map((r) => r.code)).toEqual(['CD-0105'])
    // Không đủ thì phải nói ra vì sao, chứ không im lặng làm mờ một dòng.
    expect(thin[0]?.why).not.toBe('')
  })

  it('hai nguồn 0 đồng tiền mặt đứng ngoài bảng so giá', () => {
    const { ranked, cashless } = rankSources()

    expect(cashless.map((r) => r.code)).toEqual(['GT', 'TM'])
    for (const r of cashless) {
      expect(r.cashless).toBe(true)
      expect(ranked.some((x) => x.code === r.code)).toBe(false)
    }
  })
})

describe('Cổng separableCost — câu nào được phát, câu nào phải im', () => {
  it('đúng 5 trong 15 cặp được phép nói "rẻ hơn"', () => {
    const rows = rankSources().ranked
    const said: string[] = []
    let pairs = 0

    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        pairs += 1
        const gap = costGap(rows[i]!, rows[j]!)
        if (gap) said.push(`${gap.cheap.code} < ${gap.dear.code}`)
      }
    }

    expect(pairs).toBe(15)
    expect(said.sort()).toEqual(
      [
        'CD-0101 < SK-0103',
        'CD-0101 < SK-0106',
        'CD-0102 < SK-0103',
        'CD-0102 < SK-0106',
        'SK-0104 < SK-0106',
      ].sort(),
    )
  })

  it('hai dải chồng nhau thì trả null — kể cả khi hai điểm chênh nhau rành rành', () => {
    const at = byCode()

    /* 2,0 tr so với 6,0 tr, nghe như gấp ba — nhưng CD-0105 chỉ có 1 lead tốt
       nên dải của nó trùm lên dải của CD-0101. */
    expect(costGap(at.get('CD-0101')!, at.get('CD-0105')!)).toBeNull()
    /* 84 tr ra 6 lead tốt so với 145 tr ra 3. Hai dải chồng nhau ở quãng
       23,3–28,4 tr, nên KHÔNG được nói gian hàng đắt hơn hội thảo. */
    expect(costGap(at.get('SK-0103')!, at.get('SK-0106')!)).toBeNull()
  })

  it('bội số lấy từ hai DẢI, không phải tỉ số hai điểm', () => {
    const at = byCode()
    const cheap = at.get('CD-0101')!
    const dear = at.get('SK-0106')!
    const gap = costGap(cheap, dear)

    expect(gap?.cheap.code).toBe('CD-0101')
    expect(gap?.times).toBe(6.6)
    expect(gap?.timesText).toBe('6,6')

    /* Con số bản trước in ra là 24 — tỉ số hai ĐIỂM. Nó phải lớn hơn hẳn bội số
       chứng minh được; in nó ra là khẳng định thừa gần bốn lần. */
    const pointRatio = Math.round((dear.band.point ?? 0) / (cheap.band.point ?? 1))
    expect(pointRatio).toBe(24)
    expect(gap!.times).toBeLessThan(pointRatio)
  })
})

describe('Phân rã chi phí theo loại', () => {
  it('năm loại cộng lại đúng bằng chi phí của nguồn, không xê một đồng', () => {
    for (const s of SOURCES) {
      const b = costBreakdown(s.costLines)
      expect(b.total).toBe(s.cost)
      expect(b.rows.reduce((n, r) => n + r.amount, 0)).toBe(s.cost)
      if (s.cost > 0) {
        expect(Math.abs(b.rows.reduce((n, r) => n + r.share, 0) - 1)).toBeLessThan(1e-9)
      }
    }
  })

  it('nguồn 0 đồng KHÔNG có bảng rỗng — không dòng nào, và cũng không loại nào "thiếu"', () => {
    for (const s of SOURCES.filter((x) => x.cost === 0)) {
      const b = costBreakdown(s.costLines)
      expect(b.rows).toEqual([])
      expect(b.absent).toEqual([])
    }
  })
})

const MKT = sourcesOwnedBy(MARKETING)
const DAY_MS = 86_400_000

/** Ngày của một dòng chi, quy về ISO — cùng trục với `Wave.day`. */
const dayISOof = (day: number) =>
  new Date(Date.parse(`${DATA_WINDOW.from}T00:00:00Z`) + day * DAY_MS).toISOString()

const cutIn = (p: Period) => spendIn(MKT, (line) => inPeriod(dayISOof(line.day), p))

describe('Cắt chi phí theo kỳ', () => {
  const whole = MKT.reduce((n, s) => n + s.cost, 0)

  it('không cắt thì trả đúng tổng cả kỳ, và không có phần gộp nào phải khai', () => {
    const all = spendIn(MKT, () => true)
    expect(all.cost).toBe(whole)
    expect(all.cost).toBe(300_000_000)
    expect(all.lumped).toBe(0)
  })

  it('bốn tháng cộng lại vẫn đúng tổng — không đồng nào rơi ra ngoài mọi lát', () => {
    expect(MONTHS.reduce((n, p) => n + cutIn(p).cost, 0)).toBe(whole)
    expect(QUARTERS.reduce((n, p) => n + cutIn(p).cost, 0)).toBe(whole)
  })

  it('tháng 8 gánh trọn gian hàng 145 triệu — chỗ cách tính cũ đang che', () => {
    const aug = MONTHS.find((p) => p.key === '2026-08')
    const may = MONTHS.find((p) => p.key === '2026-05')

    expect(aug && cutIn(aug).cost).toBe(145_000_000)
    expect(may && cutIn(may).cost).toBe(23_220_000)
  })

  it('phần chi GỘP cả chuỗi phải khai ra chứ không giấu', () => {
    const may = MONTHS.find((p) => p.key === '2026-05')!
    const jun = MONTHS.find((p) => p.key === '2026-06')!

    /* CD-0101 và CD-0105 đều bị cắt ngang chuỗi ở cuối tháng 5, nên dòng gộp
       ghi ở ngày mở chuỗi rơi trọn vào tháng đó. */
    expect(cutIn(may).lumped).toBe(20_220_000)
    // Tháng 6 không nguồn nào bị cắt ngang ở ngày mở chuỗi.
    expect(cutIn(jun).lumped).toBe(0)
  })
})

describe('Thước "giá mỗi lead tốt" của Marketing sau khi cắt theo kỳ', () => {
  const board = async (grain: 'thang' | 'quy' | 'nam', key: string) => {
    /* Gọi thẳng `queryFn` thay vì dựng cả màn: ba ca dưới hỏi về PHÉP TÍNH, và
       một câu hỏi về phép tính không nên phải đi qua jsdom mới trả lời được. */
    const run = performanceQuery({ grain, key }).queryFn as () => Promise<Performance>
    const data = await run()
    const person = data.people.find((p) => p.name === MARKETING)
    if (!person) throw new Error('Không có thẻ nào của vai Marketing')
    const kpi = person.kpis.find((k) => k.key === 'gia-moi-lead-tot')
    if (!kpi) throw new Error('Vai Marketing không còn thước giá mỗi lead tốt')
    return { person, kpi }
  }

  it('cả kỳ vẫn đúng 10,0 triệu — phép cắt không được làm lệch con số của cả kỳ', async () => {
    const { kpi } = await board('nam', '2026')
    expect(kpi.value).toBe(10_000_000)
    /* Năm 2026 kết thúc 31/12, tức CHƯA ĐÓNG tại lát cắt 17/08 — cùng luật với
       T8 và Q3: hiện số, hoãn nhãn. Con số 10,0 tr vẫn là con số cũ, phép cắt
       không làm lệch nó; chỉ cái nhãn bị hoãn vì kỳ còn đang chạy. */
    expect(kpi.verdict).toBe('chua-chot')
  })

  it('mỗi kỳ một con số khác nhau — không còn bốn kỳ cùng ra 10,0 triệu', async () => {
    const may = await board('thang', '2026-05')
    const jun = await board('thang', '2026-06')

    expect(may.kpi.value).toBe(2_322_000)
    expect(jun.kpi.value).toBe(8_507_692)
    expect(may.kpi.verdict).toBe('dat')
    expect(jun.kpi.verdict).toBe('dat')
  })

  /* CA PHẢI ĐỌC TRƯỚC KHI SỬA. Hai kỳ này vượt ngưỡng 12 tr thật, và Quý 3 là
     kỳ MẶC ĐỊNH của màn nên nó là thứ người dùng gặp ngay khi mở màn.

     Số vượt vì gian hàng 145 tr của SK-0106 rơi TRỌN vào tháng 8 trong khi đợt
     mới đi 17/31 ngày và lead của nó về rải ra các tháng sau — không phải vì ai
     làm kém đi. Quyết ngày 20/08: thước vẫn HIỆN ĐỦ SỐ nhưng HOÃN NHÃN ở kỳ
     chưa đóng (`RoleKpiSpec.settlesLate`), vì chấm Đạt/Trượt trên nó là chấm độ
     trễ kế toán chứ không chấm việc.

     Nếu ca này đỏ: đừng sửa test, hãy hỏi — nó gắn lên tên một con người. */
  it('quý 3 và tháng 8 vượt ngưỡng 12 triệu, nhưng kỳ chưa đóng nên hoãn nhãn', async () => {
    const q3 = await board('quy', '2026-Q3')
    const aug = await board('thang', '2026-08')

    expect(q3.kpi.value).toBe(23_740_000)
    expect(q3.kpi.target).toBe(12_000_000)
    expect(q3.kpi.verdict).toBe('chua-chot')

    expect(aug.kpi.value).toBe(72_500_000)
    expect(aug.kpi.verdict).toBe('chua-chot')

    /* Kỳ ĐÃ ĐÓNG thì chấm bình thường — hoãn nhãn không được biến thành một
       cái cớ để thước này không bao giờ bị chấm. */
    const jul = await board('thang', '2026-07')
    expect(jul.kpi.verdict).toBe('dat')
  })

  it('cắt được theo kỳ thì thôi khai là "số chụp" — hai câu đó chọi nhau', async () => {
    const { kpi } = await board('quy', '2026-Q3')
    expect(kpi.snapshot).toBe(false)
    expect(kpi.note).toMatch(/trong kỳ/)
  })

  it('bảng bằng chứng cắt cùng một lát với thước, và khai phần gộp không chia được', async () => {
    const { person } = await board('thang', '2026-05')
    const rows = person.sources ?? []

    expect(rows.reduce((n, r) => n + r.cost, 0)).toBe(23_220_000)
    // Nguồn chưa tiêu đồng nào trong lát này vẫn ở lại bảng, kèm chi phí cả kỳ.
    expect(rows.find((r) => r.code === 'SK-0106')?.cost).toBe(0)
    expect(rows.find((r) => r.code === 'SK-0106')?.costWhole).toBe(145_000_000)
    expect(person.sourcesNote ?? '').toMatch(/GỘP/)
  })
})
