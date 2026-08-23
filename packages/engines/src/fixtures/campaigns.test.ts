import { describe, expect, it } from 'vitest'
import {
  DAY_FROZEN,
  LEADS,
  OPPORTUNITIES,
  SOURCES,
  WAVE_REPLY_WINDOW,
  opsFromSource,
  sourcesRan,
  type Source,
  type WaveChannel,
} from './das-vina'

/** Khoá số của SỔ CHIẾN DỊCH — hai chiều mới thêm 23/08: mail hỏng và lead đổi
 *  thành cơ hội.
 *
 *  Đây là ngoại lệ duy nhất của "không tự sinh test" (CLAUDE.md · mục Test):
 *  `bounced` là số MỚI thêm vào fixture, và số liệu demo là thứ không compiler
 *  nào gác được — nó chỉ hiện ra thành một cột sai trên màn. File nằm ngay cạnh
 *  fixture, đúng chỗ luật đòi.
 *
 *  Đổi số nào ở đây thì phải sửa fixture trước — test đỏ là lời nhắc đúng lúc. */

/** Kênh GỬI TỚI MỘT ĐỊA CHỈ — chỉ những kênh này mới hỏng được. Ba kênh đăng bài
 *  và kênh quét mã tại chỗ không có địa chỉ nào để dội. */
const ADDRESSED: WaveChannel[] = ['email', 'zalo-oa', 'telegram']

const totalOf = (s: Source, pick: (w: Source['waves'][number]) => number) =>
  s.waves.reduce((n, w) => n + pick(w), 0)

describe('Mail hỏng — `bounced` của 20 đợt', () => {
  it('mọi đợt đều khai, không đợt nào âm và không đợt nào hỏng quá số đã gửi', () => {
    const waves = SOURCES.flatMap((s) => s.waves)
    expect(waves).toHaveLength(20)
    for (const w of waves) {
      expect(w.bounced).toBeGreaterThanOrEqual(0)
      expect(w.bounced).toBeLessThanOrEqual(w.sent)
    }
  })

  it('đợt KHÔNG gửi tới địa chỉ thì luôn bằng 0 — bài đăng và quét mã không dội được', () => {
    const posts = SOURCES.flatMap((s) => s.waves).filter((w) => !ADDRESSED.includes(w.channel))
    expect(posts.length).toBeGreaterThan(0)
    expect(posts.every((w) => w.bounced === 0)).toBe(true)
  })

  it('cả kỳ hỏng 234 trên 29.419 lượt gửi', () => {
    const sent = sourcesRan().reduce((n, s) => n + totalOf(s, (w) => w.sent), 0)
    const bounced = sourcesRan().reduce((n, s) => n + totalOf(s, (w) => w.bounced), 0)
    expect(sent).toBe(29_419)
    expect(bounced).toBe(234)
  })

  it('mỗi nguồn hỏng đúng số đã chốt', () => {
    const byCode = Object.fromEntries(
      sourcesRan().map((s) => [s.code, totalOf(s, (w) => w.bounced)]),
    )
    expect(byCode).toEqual({
      'CD-0101': 82,
      'CD-0102': 21,
      'SK-0103': 21,
      'SK-0104': 28,
      'CD-0105': 33,
      'SK-0106': 49,
    })
  })

  /** Đây là ràng buộc đáng giá nhất của cả file: nó buộc `bounced` phải khớp với
   *  `sent` — hai con số nằm cách nhau vài dòng, và không có test thì chúng trôi
   *  khỏi nhau lặng lẽ. Chỉ áp cho chuỗi dùng lại CÙNG một danh sách; sự kiện
   *  đổi sang danh sách người đã đăng ký giữa chừng nên đứng ngoài. */
  it('chuỗi dùng lại một danh sách: đợt sau gửi đúng bằng đợt trước trừ số hỏng', () => {
    for (const code of ['CD-0101', 'CD-0105']) {
      const waves = SOURCES.find((s) => s.code === code)?.waves ?? []
      expect(waves.length).toBeGreaterThan(1)
      for (let i = 1; i < waves.length; i++) {
        const prev = waves[i - 1]!
        expect(waves[i]!.sent).toBe(prev.sent - prev.bounced)
      }
    }
  })
})

describe('Lead đổi thành cơ hội — cột "→ Ops" của sổ chiến dịch', () => {
  it('cộng cả tám nguồn ra đúng 30 dòng của sổ cơ hội', () => {
    const all = SOURCES.reduce((n, s) => n + opsFromSource(s.code), 0)
    expect(all).toBe(OPPORTUNITIES.length)
    expect(all).toBe(30)
  })

  it('sáu nguồn CÓ ĐỢT đẻ 27 cơ hội — 3 dòng còn lại là khách tự tìm tới', () => {
    const ran = sourcesRan().reduce((n, s) => n + opsFromSource(s.code), 0)
    expect(ran).toBe(27)
    expect(30 - ran).toBe(3)
  })

  it('mỗi nguồn đổi đúng số đã chốt, và không nguồn nào đổi nhiều hơn số lead của nó', () => {
    const byCode = Object.fromEntries(sourcesRan().map((s) => [s.code, opsFromSource(s.code)]))
    expect(byCode).toEqual({
      'CD-0101': 8,
      'CD-0102': 6,
      'SK-0103': 5,
      'SK-0104': 4,
      'CD-0105': 1,
      'SK-0106': 3,
    })

    for (const s of SOURCES) {
      const leads = LEADS.filter((l) => l.source === s.code).length
      expect(opsFromSource(s.code)).toBeLessThanOrEqual(leads)
    }
  })
})

describe('Trạng thái chiến dịch — cửa sổ còn nhận trả lời', () => {
  it('cửa sổ là 14 ngày, và mọi đợt của kỳ đều đã gửi trước ngày đóng băng', () => {
    expect(WAVE_REPLY_WINDOW).toBe(14)
    const last = Math.max(...SOURCES.flatMap((s) => s.waves.map((w) => w.day)))
    expect(last).toBe(103)
    expect(last).toBeLessThan(DAY_FROZEN)
  })

  /** Cửa sổ 14 ngày chia sáu nguồn thành 1 đang chạy · 5 đã xong. Không có test
   *  này thì đổi `WAVE_REPLY_WINDOW` thành 4 (mọi nguồn "đã xong") hay 70 (mọi
   *  nguồn "đang chạy") đều lặng lẽ qua — và hai ô đầu của hàng score card là
   *  thứ người xem liếc trước nhất. */
  it('chia đúng 1 nguồn đang chạy · 5 nguồn đã xong', () => {
    const running = sourcesRan().filter((s) => {
      const last = Math.max(...s.waves.map((w) => w.day))
      return DAY_FROZEN - last <= WAVE_REPLY_WINDOW
    })
    expect(running.map((s) => s.code)).toEqual(['SK-0106'])
    expect(sourcesRan()).toHaveLength(6)
  })
})
