import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import {
  HEAD_OF_SALES,
  LEADS,
  OPEN_DEALS,
  REQUIRED_SLOTS,
  SOURCES,
  isRotting,
} from '@pv/engines/fixtures/das-vina'
import { renderScreen } from '@/test-utils'
import { costGap, rankSources } from '@/data/source-cost'
import { PlanPage } from './plan'

/** Module 4 là màn AI nặng nhất của hệ, nên test ở đây gác đúng một thứ: LUẬT 9.
 *
 *  Ba câu hỏi mắt người hay bỏ sót, và cả ba đều trả lời được bằng máy:
 *   · mọi khối AI có "Căn cứ:" chưa, và căn cứ đó có SỐ hay chỉ là lời hứa;
 *   · trước khi ai bấm gì, màn có nói "Chưa tạo gì cả" không, hay nó im lặng
 *     tỏ ra như đã làm hộ;
 *   · có nút nào rút ba bước (thêm → gửi duyệt → người gật) thành một không.
 *
 *  Số của kỳ vọng tính lại TỪ FIXTURE, không gõ tay: sửa fixture thì test đỏ vì
 *  màn sai, không đỏ vì test cũ.
 *
 *  Màn lấy số qua `useQuery` nên lần render đầu là trạng thái chờ — chỗ nào cần
 *  số thật thì `findBy…`, không `getBy…`. */
describe('Module 4 · Số liệu & kế hoạch', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<PlanPage />)).not.toThrow()
  })

  it('mọi khối AI đều có dòng "Căn cứ" và căn cứ nào cũng có số — luật 9', async () => {
    renderScreen(<PlanPage />)

    const bases = await screen.findAllByText(/^Căn cứ:/)
    const buttons = screen.getAllByRole('button', { name: 'Thêm vào kế hoạch' })

    // Đúng một dòng căn cứ cho mỗi nút — không khối AI nào lọt lưới.
    expect(bases.length).toBe(buttons.length)
    expect(bases.length).toBeGreaterThanOrEqual(3)

    for (const b of bases) {
      // "Căn cứ: sẽ tốt hơn" không phải căn cứ. Phải có con số đọc được.
      expect(b.textContent ?? '').toMatch(/\d/)
    }
  })

  it('chưa ai bấm thì mọi khối nói "Chưa tạo gì cả", kể cả ô kế hoạch', async () => {
    renderScreen(<PlanPage />)

    const buttons = await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })
    // Mỗi khối AI một dòng, cộng ô "Kế hoạch đã chốt" đang rỗng.
    expect(screen.getAllByText(/Chưa tạo gì cả/).length).toBe(buttons.length + 1)

    expect(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })).toBeDisabled()
  })

  it('không nút nào rút gọn ba bước — không có "Gửi ngay" hay "Chạy ngay"', async () => {
    renderScreen(<PlanPage />)
    await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })

    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent ?? '').not.toMatch(/\bngay\b/i)
    }

    // Nút cuối cùng của màn là gửi cho người gật, không phải tự làm.
    expect(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })).toBeInTheDocument()
  })

  it('đề xuất ngân sách nêu đúng mã nguồn có thật trong SOURCES', async () => {
    renderScreen(<PlanPage />)

    const codes = new Set(SOURCES.map((s) => s.code))
    const text = (await screen.findAllByText(/^Căn cứ:/))
      .map((n) => n.textContent ?? '')
      .join(' | ')

    const mentioned = text.match(/\b(?:CD|SK)-\d{4}\b/g) ?? []
    expect(mentioned.length).toBeGreaterThan(0)
    for (const code of mentioned) expect(codes.has(code)).toBe(true)
  })

  it('bốn ô số bám sổ, không phải số gõ tay', async () => {
    renderScreen(<PlanPage />)

    const rotting = OPEN_DEALS.filter(isRotting)
    expect(await screen.findByText(`${rotting.length}/${OPEN_DEALS.length}`)).toBeInTheDocument()

    const good = LEADS.filter((l) => l.requiredFilled >= REQUIRED_SLOTS)
    expect(screen.getByText(`${good.length}/${LEADS.length}`)).toBeInTheDocument()
  })

  it('bấm thêm mới có kế hoạch, và kế hoạch chỉ đi khi bấm gửi duyệt', async () => {
    renderScreen(<PlanPage />)

    const [first] = await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })
    expect(first).toBeDefined()
    fireEvent.click(first!)

    // Việc đã vào kế hoạch thì mang theo người làm và căn cứ của chính nó.
    expect(screen.getByText(/^Người làm:/)).toBeInTheDocument()

    const send = screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })
    expect(send).not.toBeDisabled()

    fireEvent.click(send)
    expect(screen.getByText(new RegExp(`Đã gửi ${HEAD_OF_SALES}`))).toBeInTheDocument()
    // Vẫn rút lại được — gửi duyệt là một trạng thái, không phải cửa một chiều.
    expect(screen.getByRole('button', { name: 'Rút lại' })).toBeInTheDocument()
  })

  it('sửa kế hoạch sau khi gửi thì kéo về nháp, không im lặng đổi bản đang chờ', async () => {
    renderScreen(<PlanPage />)

    const [first] = await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })
    fireEvent.click(first!)
    fireEvent.click(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` }))
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ khỏi kế hoạch' }))

    expect(screen.queryByRole('button', { name: 'Rút lại' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })).toBeDisabled()
  })

  it('ContextRail có mặt ngay cả lúc chờ dữ liệu — luật 10', () => {
    renderScreen(<PlanPage />)

    // Chuỗi của OP-0288 do E1 dựng: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(screen.getByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  /* Ba ca dưới đây gác cùng một thứ: màn KHÔNG được nói quá về tiền.
     Bản trước in "chênh 24 lần" — tỉ số hai ĐIỂM đứng trên mẫu số 9 và 3 lead
     tốt. Thứ chứng minh được chỉ là 6,6 lần. */
  it('bảng xếp hạng hiện đúng sáu nguồn có tiêu tiền, rẻ nhất lên đầu theo điểm', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    const shown = screen
      .getAllByText(/^(?:CD|SK)-\d{4}$/)
      .map((n) => n.textContent ?? '')
      .slice(0, 6)

    expect(shown).toEqual(rankSources().ranked.map((r) => r.code))
  })

  it('câu so sánh giá đi qua cổng dải — "ít nhất N lần", không phải tỉ số hai điểm', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    const rows = rankSources().ranked
    const gap = costGap(rows[0]!, rows[rows.length - 1]!)
    expect(gap).not.toBeNull()

    expect(screen.getAllByText(new RegExp(`ít nhất ${gap!.timesText} lần`)).length).toBeGreaterThan(
      0,
    )
  })

  it('không chỗ nào trên màn in tỉ số hai điểm dưới dạng "chênh N lần"', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    expect(document.body.textContent ?? '').not.toMatch(/chênh \d+ lần/)
  })

  it('nguồn cỡ mẫu nhỏ vẫn có mặt trên bảng, kèm lý do chưa đủ để so', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    const thin = rankSources().ranked.filter((r) => !r.enough)
    expect(thin.length).toBeGreaterThan(0)
    for (const r of thin) expect(screen.getByText(r.code)).toBeInTheDocument()
    expect(screen.getAllByText('chưa đủ để so').length).toBe(thin.length)
  })

  it('nói thẳng thứ cố tình không làm, trước hết là dự báo doanh số', () => {
    renderScreen(<PlanPage />)

    expect(screen.getByText('Cố tình không làm')).toBeInTheDocument()
    expect(screen.getByText(/Không dự báo doanh số tháng tới/)).toBeInTheDocument()
  })
})
