import { describe, expect, it } from 'vitest'
import {
  chiSquareHomogeneity,
  costBand,
  minSampleFor,
  separable,
  separableCost,
  shrink,
  wilson,
  type PricedRate,
} from './stats'

/** Test của tầng toán — `docs/plans/chi-phi-nguon-lead.md §6`.
 *
 *  Mọi con số dưới đây là **số tính tay trong §6**, chép vào đây bằng tay, KHÔNG
 *  đọc từ `fixtures/das-vina.ts`. Đó là chủ ý: `stats.ts` không biết kịch bản
 *  nào, nên test của nó cũng không được biết. Fixture đổi mà bảng §6 không đổi
 *  thì file này vẫn phải xanh — và ngược lại, ai sửa công thức để chiều một màn
 *  thì đỏ ở đây trước khi kịp đẩy lên giao diện.
 *
 *  Tám dòng dưới đây là tám nguồn của DAS Vina ở §5.2 / §6.2: `x` lead tốt trên
 *  `n` lead, `cost` là **tiền mặt** (không gồm nhân công — §4). */
const SOURCES = [
  { code: 'CD-0101', cost: 18_000_000, x: 9, n: 22 },
  { code: 'CD-0102', cost: 26_000_000, x: 7, n: 18 },
  { code: 'SK-0103', cost: 84_000_000, x: 6, n: 16 },
  { code: 'SK-0104', cost: 21_000_000, x: 4, n: 12 },
  { code: 'CD-0105', cost: 6_000_000, x: 1, n: 9 },
  { code: 'SK-0106', cost: 145_000_000, x: 3, n: 11 },
  { code: 'GT', cost: 0, x: 3, n: 7 },
  { code: 'TM', cost: 0, x: 1, n: 5 },
] as const satisfies readonly (PricedRate & { code: string })[]

/** Sáu nguồn có tiêu tiền — khối mà §6.5 xếp hạng. GT và TM đứng ngoài khi bảng
 *  đo tiền mặt, vì `cost = 0` (§6.7). */
const PAID = SOURCES.filter((s) => s.cost > 0)

const at = (code: string) => {
  const found = SOURCES.find((s) => s.code === code)
  if (!found) throw new Error(`Không có nguồn ${code} trong bảng §6`)
  return found
}

/** Trung bình phòng và sức mạnh prior của §6.4. Cả hai là số của KỊCH BẢN, nên
 *  chúng đứng ở đây chứ không nằm trong `stats.ts`. */
const DEPT_MEAN = 0.34
const PRIOR_K = 25

describe('wilson · khoảng tin cậy (§6.2)', () => {
  // Bảng §6.2, cột "Cận dưới" và "Cận trên". Sáu chữ số của cột p_dưới lấy ở
  // bảng xếp hạng §6.5.
  const TABLE = [
    { code: 'CD-0101', lo: 0.232556, hi: 0.612655 },
    { code: 'CD-0102', lo: 0.20305, hi: 0.613813 },
    { code: 'SK-0103', lo: 0.18481, hi: 0.613594 },
    { code: 'SK-0104', lo: 0.138118, hi: 0.609382 },
    { code: 'CD-0105', lo: 0.01989, hi: 0.435006 },
    { code: 'SK-0106', lo: 0.097459, hi: 0.56565 },
    { code: 'GT', lo: 0.158217, hi: 0.749546 },
    { code: 'TM', lo: 0.036223, hi: 0.624472 },
  ]

  it.each(TABLE)('$code khớp bảng §6.2 tới 4 chữ số thập phân', ({ code, lo, hi }) => {
    const s = at(code)
    const w = wilson(s.x, s.n)
    expect(w.p).toBeCloseTo(s.x / s.n, 10)
    expect(w.lo).toBeCloseTo(lo, 4)
    expect(w.hi).toBeCloseTo(hi, 4)
  })

  it('cả phòng 34/100 ra [25,46% ; 43,72%] — khoảng hẹp nhất bảng', () => {
    const w = wilson(34, 100)
    expect(w.lo).toBeCloseTo(0.254614, 4)
    expect(w.hi).toBeCloseTo(0.437225, 4)
    // 18,3 pp, so với 38–59 pp của từng nguồn: gộp lại mới đo được cái gì.
    expect((w.hi - w.lo) * 100).toBeCloseTo(18.3, 1)
  })

  it('ví dụ tính tay của §6.2 (9/22) khớp tới 6 chữ số', () => {
    const w = wilson(9, 22)
    expect(w.lo).toBeCloseTo(0.232556, 6)
    expect(w.hi).toBeCloseTo(0.612655, 6)
  })

  it('tám khoảng CHỒNG NHAU HẾT — tồn tại dải nằm trong cả tám', () => {
    const all = SOURCES.map((s) => wilson(s.x, s.n))
    const maxLo = Math.max(...all.map((w) => w.lo))
    const minHi = Math.min(...all.map((w) => w.hi))
    // Cận dưới cao nhất 23,26% (CD-0101) < cận trên thấp nhất 43,50% (CD-0105).
    expect(maxLo).toBeCloseTo(0.232556, 4)
    expect(minHi).toBeCloseTo(0.435006, 4)
    expect(maxLo).toBeLessThan(minHi)
  })

  it('0 ≤ lo ≤ x/n ≤ hi ≤ 1 với mọi (x, n) trong n = 1..30 — đúng thứ Wald sai', () => {
    for (let n = 1; n <= 30; n += 1) {
      for (let x = 0; x <= n; x += 1) {
        const w = wilson(x, n)
        expect(w.lo).toBeGreaterThanOrEqual(0)
        expect(w.lo).toBeLessThanOrEqual(x / n)
        expect(w.hi).toBeGreaterThanOrEqual(x / n)
        expect(w.hi).toBeLessThanOrEqual(1)
      }
    }
  })

  it('x = 0 cho khoảng có bề rộng THẬT, không phải [0% ; 0%] như Wald', () => {
    // §6.2: 0 lead tốt trên 9 lead — Wald nói "chắc chắn 0%", Wilson nói tới 29,92%.
    const w = wilson(0, 9)
    expect(w.lo).toBe(0)
    expect(w.hi).toBeCloseTo(0.299153, 5)
  })

  it('biên: n = 0 trả dải rộng hết cỡ, không ném, không NaN', () => {
    expect(wilson(0, 0)).toEqual({ p: 0, lo: 0, hi: 1 })
    expect(Number.isNaN(wilson(0, 0).p)).toBe(false)
  })

  it('biên: x = 0 thì lo ĐÚNG BẰNG 0, x = n thì hi ĐÚNG BẰNG 1', () => {
    expect(wilson(0, 5).lo).toBe(0)
    expect(wilson(0, 5).hi).toBeCloseTo(0.434491, 5)
    expect(wilson(5, 5).hi).toBe(1)
    expect(wilson(5, 5).lo).toBeCloseTo(0.565509, 5)
  })

  it('biên: n = 1 vẫn ra khoảng dùng được', () => {
    expect(wilson(1, 1)).toEqual({ p: 1, lo: expect.closeTo(0.206543, 5), hi: 1 })
    expect(wilson(0, 1)).toEqual({ p: 0, lo: 0, hi: expect.closeTo(0.793457, 5) })
  })

  it('độ giãn p̂/p_dưới khớp cột "Cổng" của §6.5 — CD-0105 và TM trượt cổng 3,0', () => {
    const stretch = (code: string) => {
      const s = at(code)
      const w = wilson(s.x, s.n)
      return w.p / w.lo
    }
    expect(stretch('CD-0101')).toBeCloseTo(1.76, 2)
    expect(stretch('CD-0102')).toBeCloseTo(1.92, 2)
    expect(stretch('SK-0103')).toBeCloseTo(2.03, 2)
    expect(stretch('SK-0104')).toBeCloseTo(2.41, 2)
    expect(stretch('SK-0106')).toBeCloseTo(2.8, 2)
    expect(stretch('GT')).toBeCloseTo(2.71, 2)
    expect(stretch('CD-0105')).toBeCloseTo(5.59, 2)
    expect(stretch('TM')).toBeCloseTo(5.52, 2)
    expect(stretch('CD-0105')).toBeGreaterThan(3)
    expect(stretch('TM')).toBeGreaterThan(3)
  })

  it('z nhỏ hơn cho khoảng hẹp hơn — z là tham số, không phải hằng chôn', () => {
    const at95 = wilson(9, 22)
    const at90 = wilson(9, 22, 1.645)
    expect(at90.lo).toBeGreaterThan(at95.lo)
    expect(at90.hi).toBeLessThan(at95.hi)
  })
})

describe('chiSquareHomogeneity · tám nguồn có khác nhau thật không (§6.3)', () => {
  it('tám nguồn ra X² = 3,7539 · df = 7 · p ≈ 0,81', () => {
    const r = chiSquareHomogeneity(SOURCES)
    expect(r.chi2).toBeCloseTo(3.7539, 4)
    expect(r.df).toBe(7)
    expect(r.p).toBeCloseTo(0.81, 2)
  })

  it('quan sát THẤP HƠN kỳ vọng của χ²(7) — chênh lệch 11%–43% là nhiễu', () => {
    const r = chiSquareHomogeneity(SOURCES)
    // Kỳ vọng của χ² với df bậc tự do đúng bằng df. 3,75 < 7.
    expect(r.chi2).toBeLessThan(r.df)
    // p lớn thế này nghĩa là không bác được giả thuyết "tám nguồn như nhau".
    expect(r.p).toBeGreaterThan(0.5)
  })

  it('p khớp bảng tra χ² ở hai điểm kiểm được — gác hàm gamma không đầy đủ', () => {
    // 8/10 so 2/10: X² = 7,2 · df = 1 → p = 0,007290 (bảng tra chuẩn).
    const a = chiSquareHomogeneity([
      { x: 8, n: 10 },
      { x: 2, n: 10 },
    ])
    expect(a.chi2).toBeCloseTo(7.2, 10)
    expect(a.df).toBe(1)
    expect(a.p).toBeCloseTo(0.0072904, 7)

    // 15/20 so 5/20: X² = 10 · df = 1 → p = 0,0015654.
    const b = chiSquareHomogeneity([
      { x: 15, n: 20 },
      { x: 5, n: 20 },
    ])
    expect(b.chi2).toBeCloseTo(10, 10)
    expect(b.p).toBeCloseTo(0.0015654, 7)
  })

  it('biên: nhóm có n = 0 bị loại khỏi cả tổng lẫn df', () => {
    const withEmpty = chiSquareHomogeneity([...SOURCES, { x: 0, n: 0 }])
    const plain = chiSquareHomogeneity(SOURCES)
    // Nhóm rỗng không mang thông tin; tính nó vào df sẽ đẩy p về 1 và GIẤU MẤT
    // một khác biệt thật.
    expect(withEmpty).toEqual(plain)
  })

  it('biên: không nhóm nào, hoặc đúng một nhóm, thì không có gì để so', () => {
    expect(chiSquareHomogeneity([])).toEqual({ chi2: 0, df: 0, p: 1 })
    expect(chiSquareHomogeneity([{ x: 3, n: 7 }])).toEqual({ chi2: 0, df: 0, p: 1 })
    expect(chiSquareHomogeneity([{ x: 0, n: 0 }])).toEqual({ chi2: 0, df: 0, p: 1 })
  })

  it('biên: mọi nhóm cùng 0 lead tốt thì trả 0 và p = 1, không NaN', () => {
    const r = chiSquareHomogeneity([
      { x: 0, n: 5 },
      { x: 0, n: 7 },
    ])
    expect(r).toEqual({ chi2: 0, df: 1, p: 1 })
    const allGood = chiSquareHomogeneity([
      { x: 5, n: 5 },
      { x: 7, n: 7 },
    ])
    expect(allGood).toEqual({ chi2: 0, df: 1, p: 1 })
  })

  it('khác biệt thật thì bắt được — hàm không phải cái máy in p lớn', () => {
    const r = chiSquareHomogeneity([
      { x: 90, n: 100 },
      { x: 10, n: 100 },
    ])
    expect(r.p).toBeLessThan(0.0001)
  })
})

describe('shrink · co ngót về trung bình phòng (§6.4)', () => {
  // Bảng §6.4, cột "Co ngót", với m = 0,34 và k = 25.
  const TABLE = [
    { code: 'CD-0101', shrunk: 0.37234 },
    { code: 'CD-0102', shrunk: 0.360465 },
    { code: 'GT', shrunk: 0.359375 },
    { code: 'SK-0103', shrunk: 0.353659 },
    { code: 'SK-0104', shrunk: 0.337838 },
    { code: 'SK-0106', shrunk: 0.319444 },
    { code: 'TM', shrunk: 0.316667 },
    { code: 'CD-0105', shrunk: 0.279412 },
  ]

  it.each(TABLE)('$code co ngót đúng bảng §6.4', ({ code, shrunk }) => {
    const s = at(code)
    expect(shrink(s.x, s.n, DEPT_MEAN, PRIOR_K)).toBeCloseTo(shrunk, 5)
  })

  it('luôn nằm giữa x/n và trung bình phòng — co ngót sai chiều là lỗi im lặng', () => {
    for (let n = 1; n <= 30; n += 1) {
      for (let x = 0; x <= n; x += 1) {
        const p = x / n
        const s = shrink(x, n, DEPT_MEAN, PRIOR_K)
        expect(s).toBeGreaterThanOrEqual(Math.min(p, DEPT_MEAN) - 1e-12)
        expect(s).toBeLessThanOrEqual(Math.max(p, DEPT_MEAN) + 1e-12)
      }
    }
  })

  it('GT tụt từ hạng 1 xuống hạng 3 — đúng thứ co ngót sinh ra để làm', () => {
    const rankBy = (score: (s: (typeof SOURCES)[number]) => number) =>
      [...SOURCES].sort((a, b) => score(b) - score(a)).map((s) => s.code)

    const raw = rankBy((s) => s.x / s.n)
    const shrunk = rankBy((s) => shrink(s.x, s.n, DEPT_MEAN, PRIOR_K))

    expect(raw[0]).toBe('GT')
    expect(shrunk.indexOf('GT')).toBe(2)
    expect(shrunk[0]).toBe('CD-0101')
    expect(shrunk[1]).toBe('CD-0102')
    // Hạng chót không đổi: CD-0105 vẫn cuối, nhưng bằng 27,94% chứ không 11,11%.
    expect(shrunk[shrunk.length - 1]).toBe('CD-0105')
  })

  it('bề rộng bảng sụp từ ~31,7 pp xuống ~9,3 pp', () => {
    const raws = SOURCES.map((s) => s.x / s.n)
    const shrunks = SOURCES.map((s) => shrink(s.x, s.n, DEPT_MEAN, PRIOR_K))
    expect((Math.max(...raws) - Math.min(...raws)) * 100).toBeCloseTo(31.746, 3)
    expect((Math.max(...shrunks) - Math.min(...shrunks)) * 100).toBeCloseTo(9.293, 3)
  })

  it('biên: n = 0 trả prior · k = 0 trả thô · cả hai bằng 0 thì vẫn trả prior', () => {
    expect(shrink(0, 0, DEPT_MEAN, PRIOR_K)).toBe(DEPT_MEAN)
    expect(shrink(9, 22, DEPT_MEAN, 0)).toBeCloseTo(9 / 22, 12)
    expect(shrink(0, 0, DEPT_MEAN, 0)).toBe(DEPT_MEAN)
  })

  it('k càng lớn càng co mạnh, k = 25 phải nặng hơn n lớn nhất (22)', () => {
    const s = at('CD-0105')
    const weak = shrink(s.x, s.n, DEPT_MEAN, 5)
    const strong = shrink(s.x, s.n, DEPT_MEAN, 100)
    expect(weak).toBeLessThan(strong)
    expect(strong).toBeGreaterThan(0.3)
    // Với k = 25, nguồn lớn nhất (n = 22) không tự thắng được prior của nó.
    const biggest = at('CD-0101')
    const pulled = shrink(biggest.x, biggest.n, DEPT_MEAN, PRIOR_K)
    expect(Math.abs(pulled - DEPT_MEAN)).toBeLessThan(Math.abs(biggest.x / biggest.n - DEPT_MEAN))
  })
})

describe('separable · tách được theo TỈ LỆ (§6.2)', () => {
  // Đúng 15 cặp của sáu nguồn có tiền. Theo tỉ lệ thì KHÔNG cặp nào tách được —
  // kể cả cặp cực đoan nhất. Đó là phát hiện chính của §6.2.
  const PAIRS: [string, string][] = [
    ['CD-0101', 'CD-0102'],
    ['CD-0101', 'SK-0103'],
    ['CD-0101', 'SK-0104'],
    ['CD-0101', 'CD-0105'],
    ['CD-0101', 'SK-0106'],
    ['CD-0102', 'SK-0103'],
    ['CD-0102', 'SK-0104'],
    ['CD-0102', 'CD-0105'],
    ['CD-0102', 'SK-0106'],
    ['SK-0103', 'SK-0104'],
    ['SK-0103', 'CD-0105'],
    ['SK-0103', 'SK-0106'],
    ['SK-0104', 'CD-0105'],
    ['SK-0104', 'SK-0106'],
    ['CD-0105', 'SK-0106'],
  ]

  it.each(PAIRS)('%s và %s KHÔNG tách được về tỉ lệ lead tốt', (a, b) => {
    expect(separable(at(a), at(b))).toBe(false)
  })

  it('cả 28 cặp của tám nguồn đều không tách được — kể cả GT 42,86% với CD-0105 11,11%', () => {
    let count = 0
    for (const [i, a] of SOURCES.entries()) {
      for (const b of SOURCES.slice(i + 1)) {
        count += 1
        expect(separable(a, b)).toBe(false)
      }
    }
    expect(count).toBe(28)
  })

  it('đối chứng: cỡ mẫu đủ thì tách được — 8/10 so 1/10', () => {
    expect(separable({ x: 8, n: 10 }, { x: 1, n: 10 })).toBe(true)
    expect(separable({ x: 1, n: 10 }, { x: 8, n: 10 })).toBe(true)
  })

  it('biên: nguồn không có lead nào thì không tách được với ai', () => {
    expect(separable({ x: 0, n: 0 }, { x: 8, n: 10 })).toBe(false)
    expect(separable({ x: 0, n: 0 }, { x: 0, n: 0 })).toBe(false)
  })
})

describe('costBand · dải chi phí mỗi lead tốt (§6.5)', () => {
  // Bảng xếp hạng §6.5, đơn vị đồng. `hi` là cột "Cận trên" — số dùng để xếp hạng.
  const TABLE = [
    { code: 'CD-0101', point: 2_000_000, lo: 1_335_469, hi: 3_518_220 },
    { code: 'CD-0102', point: 3_714_286, lo: 2_353_231, hi: 7_113_741 },
    { code: 'SK-0103', point: 14_000_000, lo: 8_556_153, hi: 28_407_581 },
    { code: 'SK-0104', point: 5_250_000, lo: 2_871_760, hi: 12_670_340 },
    { code: 'CD-0105', point: 6_000_000, lo: 1_532_545, hi: 33_517_055 },
    { code: 'SK-0106', point: 48_333_333, lo: 23_303_830, hi: 135_255_281 },
  ]

  it.each(TABLE)('$code ra đúng ba số của §6.5', ({ code, point, lo, hi }) => {
    const s = at(code)
    expect(costBand(s.cost, s.x, s.n)).toEqual({ point, lo, hi })
  })

  it('xếp theo cận trên thì CD-0105 tụt từ hạng 4 xuống đắt thứ nhì, rồi trượt cổng', () => {
    const byPoint = [...PAID]
      .map((s) => ({ code: s.code, band: costBand(s.cost, s.x, s.n) }))
      .sort((a, b) => (a.band.point ?? 0) - (b.band.point ?? 0))
      .map((r) => r.code)
    // Bảng hôm nay: CD-0105 đứng hạng 4 với nhãn "6 triệu, rẻ thứ tư".
    expect(byPoint).toEqual(['CD-0101', 'CD-0102', 'SK-0104', 'CD-0105', 'SK-0103', 'SK-0106'])

    const ranked = [...PAID]
      .map((s) => ({ code: s.code, band: costBand(s.cost, s.x, s.n) }))
      .sort(
        (a, b) => (a.band.hi ?? Number.MAX_SAFE_INTEGER) - (b.band.hi ?? Number.MAX_SAFE_INTEGER),
      )
      .map((r) => r.code)
    // Bảng theo cận trên: CD-0105 rơi xuống áp chót — 33,5 triệu, đắt thứ nhì.
    expect(ranked).toEqual(['CD-0101', 'CD-0102', 'SK-0104', 'SK-0103', 'CD-0105', 'SK-0106'])

    // Và nó không chỉ tụt hạng: nó rớt khỏi bảng, vì trượt CỔNG độ giãn (§6.7).
    const c = at('CD-0105')
    const w = wilson(c.x, c.n)
    expect(w.p / w.lo).toBeGreaterThan(3)
    const gated = ranked.filter((code) => {
      const s = at(code)
      const iv = wilson(s.x, s.n)
      return iv.p / iv.lo <= 3
    })
    expect(gated).toEqual(['CD-0101', 'CD-0102', 'SK-0104', 'SK-0103', 'SK-0106'])
  })

  it('điểm luôn nằm trong dải với mọi (x, n) có lead tốt', () => {
    for (let n = 1; n <= 30; n += 1) {
      for (let x = 1; x <= n; x += 1) {
        const b = costBand(50_000_000, x, n)
        expect(b.point).not.toBeNull()
        expect(b.lo).toBeLessThanOrEqual(b.point ?? 0)
        expect(b.point ?? 0).toBeLessThanOrEqual(b.hi ?? Number.POSITIVE_INFINITY)
      }
    }
  })

  it('biên x = 0: KHÔNG in "0 đồng/lead tốt", và KHÔNG in vô cực', () => {
    // 145 triệu, 0 lead tốt trên 11 lead. Điểm không tồn tại; đầu đắt không tồn
    // tại; đầu rẻ vẫn là một câu đọc được: "ít nhất 50,9 triệu mỗi lead tốt".
    const b = costBand(145_000_000, 0, 11)
    expect(b.point).toBeNull()
    expect(b.hi).toBeNull()
    expect(b.lo).toBe(50_926_508)
    expect(Number.isFinite(b.lo)).toBe(true)
  })

  it('biên n = 0: không lead nào thì không có cận nào', () => {
    expect(costBand(1_000_000, 0, 0)).toEqual({ point: null, lo: 0, hi: null })
  })

  it('biên n = 1: một lead, một lead tốt — dải rộng nhưng có thật', () => {
    const b = costBand(10_000_000, 1, 1)
    expect(b.point).toBe(10_000_000)
    expect(b.lo).toBe(10_000_000)
    expect(b.hi).toBe(48_416_000)
  })

  it('cost = 0 thì cả ba đầu bằng 0 — GT và TM khi bảng đo TIỀN MẶT', () => {
    expect(costBand(0, 3, 7)).toEqual({ point: 0, lo: 0, hi: 0 })
    expect(costBand(0, 1, 5)).toEqual({ point: 0, lo: 0, hi: 0 })
  })

  it('chuyển sang CHI ĐẦY ĐỦ thì hai nguồn "0 đồng" có giá thật (§4 · §6.5)', () => {
    // GT: 4,2 triệu nhân công ÷ 3 lead tốt → rẻ nhất cả sổ theo điểm.
    const gt = costBand(4_200_000, 3, 7)
    expect(gt.point).toBe(1_400_000)
    expect(gt.hi).toBe(3_792_262)
    // TM: 9 triệu cho một lead tốt duy nhất, và trượt cổng độ giãn.
    const tm = costBand(9_000_000, 1, 5)
    expect(tm.point).toBe(9_000_000)
    expect(tm.hi).toBe(49_691_964)
  })

  it('thước Marketing: cận trên 13.615.131 đ vượt ngưỡng 12 triệu (§6.7)', () => {
    // Sáu nguồn của Marketing gộp lại là 30/88 trên 300 triệu. Chấm theo điểm là
    // 10 triệu → Đạt; chấm theo cận trên là 13,6 triệu → Cần cải thiện.
    const b = costBand(300_000_000, 30, 88)
    expect(b.point).toBe(10_000_000)
    expect(b.hi).toBe(13_615_131)
    expect(b.hi ?? 0).toBeGreaterThan(12_000_000)
  })
})

describe('separableCost · cặp nào được phép nói "rẻ hơn" (§6.6)', () => {
  // Đủ 15 cặp của sáu nguồn có tiền. `true` là năm cặp của bảng §6.6.
  const PAIRS: [string, string, boolean][] = [
    ['CD-0101', 'CD-0102', false],
    ['CD-0101', 'SK-0103', true],
    ['CD-0101', 'SK-0104', false],
    ['CD-0101', 'CD-0105', false],
    ['CD-0101', 'SK-0106', true],
    ['CD-0102', 'SK-0103', true],
    ['CD-0102', 'SK-0104', false],
    ['CD-0102', 'CD-0105', false],
    ['CD-0102', 'SK-0106', true],
    ['SK-0103', 'SK-0104', false],
    ['SK-0103', 'CD-0105', false],
    ['SK-0103', 'SK-0106', false],
    ['SK-0104', 'CD-0105', false],
    ['SK-0104', 'SK-0106', true],
    ['CD-0105', 'SK-0106', false],
  ]

  it.each(PAIRS)('%s vs %s → tách được = %s', (a, b, expected) => {
    expect(separableCost(at(a), at(b))).toBe(expected)
    // Đối xứng: thứ tự tham số không đổi kết luận.
    expect(separableCost(at(b), at(a))).toBe(expected)
  })

  it('đúng 5 trong 15 cặp — không phải 15, và cũng không phải 0', () => {
    let pairs = 0
    let count = 0
    for (const [i, a] of PAID.entries()) {
      for (const b of PAID.slice(i + 1)) {
        pairs += 1
        if (separableCost(a, b)) count += 1
      }
    }
    expect(pairs).toBe(15)
    expect(count).toBe(5)
    expect(PAIRS.filter(([, , ok]) => ok)).toHaveLength(5)
  })

  it('hai cặp gây bất ngờ vẫn KHÔNG tách được', () => {
    // Điểm 2,0 triệu so 6,0 triệu, nghe rành rành — nhưng dải chồng nhau.
    expect(separableCost(at('CD-0101'), at('CD-0105'))).toBe(false)
    // 84 triệu ra 6 lead tốt so 145 triệu ra 3: [8,56 ; 28,41] chồng [23,30 ; 135,26].
    expect(separableCost(at('SK-0103'), at('SK-0106'))).toBe(false)
    const a = costBand(84_000_000, 6, 16)
    const b = costBand(145_000_000, 3, 11)
    expect(b.lo).toBeLessThan(a.hi ?? 0)
  })

  it('câu AI đổi từ "chênh 24 lần" xuống "ít nhất 6,6 lần" (§6.6)', () => {
    const cheap = costBand(18_000_000, 9, 22)
    const dear = costBand(145_000_000, 3, 11)
    // Tỉ số hai ĐIỂM — con số hôm nay `plan.ts:228` đang in.
    expect((dear.point ?? 0) / (cheap.point ?? 1)).toBeCloseTo(24.17, 2)
    // Con số đứng vững được: cận dưới bên đắt ÷ cận trên bên rẻ.
    expect(dear.lo / (cheap.hi ?? 1)).toBeCloseTo(6.624, 3)
  })

  it('bốn cặp tách được còn lại có "ít nhất N lần" khớp §6.6', () => {
    const band = (code: string) => {
      const s = at(code)
      return costBand(s.cost, s.x, s.n)
    }
    const times = (cheap: string, dear: string) => band(dear).lo / (band(cheap).hi ?? 1)
    expect(times('CD-0101', 'SK-0103')).toBeCloseTo(2.43, 2)
    expect(times('CD-0102', 'SK-0103')).toBeCloseTo(1.2, 2)
    expect(times('CD-0102', 'SK-0106')).toBeCloseTo(3.28, 2)
    expect(times('SK-0104', 'SK-0106')).toBeCloseTo(1.84, 2)
  })

  it('nguồn chưa có lead tốt nào không bao giờ được đứng ở vế RẺ', () => {
    const noGood = { cost: 145_000_000, x: 0, n: 11 }
    const cheap = at('CD-0101')
    const nb = costBand(noGood.cost, noGood.x, noGood.n)
    const cb = costBand(cheap.cost, cheap.x, cheap.n)

    // Cặp này TÁCH ĐƯỢC, nhưng chỉ theo đúng một chiều: CD-0101 rẻ hơn.
    expect(separableCost(noGood, cheap)).toBe(true)
    expect(cb.hi ?? 0).toBeLessThan(nb.lo)
    // Vế rẻ bắt buộc phải có đầu đắt hữu hạn — nguồn 0 lead tốt thì không có.
    expect(nb.hi).toBeNull()
    expect(separableCost(noGood, { cost: 900_000_000, x: 0, n: 11 })).toBe(false)
  })
})

describe('minSampleFor · cỡ mẫu để phân biệt hai nguồn (§6.1)', () => {
  it('40% so 25% cần 152 lead mỗi nguồn', () => {
    expect(minSampleFor(0.4, 0.25)).toBe(152)
  })

  it('40% so 20% — chênh gấp đôi — vẫn cần 82 lead mỗi nguồn', () => {
    expect(minSampleFor(0.4, 0.2)).toBe(82)
  })

  it('152 lớn hơn cả sổ lead của cả kỳ — câu sắc nhất của §6.1', () => {
    const biggest = Math.max(...SOURCES.map((s) => s.n))
    const wholeBook = SOURCES.reduce((s, x) => s + x.n, 0)
    expect(biggest).toBe(22)
    expect(wholeBook).toBe(100)
    expect(minSampleFor(0.4, 0.25)).toBeGreaterThan(wholeBook)
  })

  it('đối xứng, và tham số mặc định đúng là 95% · lực 80%', () => {
    expect(minSampleFor(0.25, 0.4)).toBe(minSampleFor(0.4, 0.25))
    expect(minSampleFor(0.4, 0.25, 0.05, 0.8)).toBe(152)
  })

  it('đòi chắc hơn hoặc lực mạnh hơn thì cần nhiều mẫu hơn', () => {
    expect(minSampleFor(0.4, 0.25, 0.01)).toBeGreaterThan(152)
    expect(minSampleFor(0.4, 0.25, 0.05, 0.9)).toBeGreaterThan(152)
    expect(minSampleFor(0.4, 0.25, 0.1)).toBeLessThan(152)
  })

  it('chênh càng nhỏ càng cần nhiều mẫu, và bằng nhau thì vô hạn', () => {
    expect(minSampleFor(0.4, 0.39)).toBeGreaterThan(minSampleFor(0.4, 0.25))
    expect(minSampleFor(0.34, 0.34)).toBe(Number.POSITIVE_INFINITY)
    expect(Number.isNaN(minSampleFor(0.34, 0.34))).toBe(false)
  })

  it('trả số nguyên, luôn làm tròn LÊN', () => {
    const cases: [number, number][] = [
      [0.4, 0.25],
      [0.4, 0.2],
      [0.34, 0.1111],
      [0.5, 0.1],
    ]
    for (const [a, b] of cases) {
      const n = minSampleFor(a, b)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThan(0)
    }
  })
})
