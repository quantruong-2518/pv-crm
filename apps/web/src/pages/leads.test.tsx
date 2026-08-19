import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { canPromoteToSql, FUNNEL, LEADS } from '@pv/engines/fixtures/das-vina'
import { renderScreen } from '@/test-utils'
import { LeadsPage } from './leads'

/** Test "màn dựng được" + khoá ba luật của module 2 mà mắt người hay bỏ sót.
 *
 *  Sổ có 100 dòng của cả kỳ và mặc định chỉ hiện lead ĐANG CHẠY, phân trang 10
 *  dòng — test vì thế bám vào những thứ không đổi theo trang: phễu đã chốt, sáu
 *  lý do rớt, cổng bộ 10 câu, ContextRail.
 *
 *  Sổ lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ nào cần dòng
 *  thật thì phải `findBy…`, không `getBy…`. */
describe('Module 2 · Sổ lead', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<LeadsPage />)).not.toThrow()
  })

  it('phễu hiện đúng sáu bậc đã chốt, MQL và SQL là bậc 2 và 3', () => {
    renderScreen(<LeadsPage />)

    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('44')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    // Mỗi bậc hiện hai chỗ: badge trên phễu và nút lọc theo bậc.
    expect(screen.getAllByText('MQL').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SQL').length).toBeGreaterThan(0)
  })

  it('report lead chỉ có ĐÚNG sáu lý do, không có ô "khác"', () => {
    renderScreen(<LeadsPage />)

    for (const label of [
      'Không gọi được ai',
      'Không phải khách của mình',
      'Năm nay không có tiền',
      'Người liên hệ nghỉ việc',
      'Khách chọn bên khác',
      'Im sau báo giá',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    // Không có ô hứng lý do thứ bảy. Khớp tên ĐẦY ĐỦ của nút, vì "khác" nằm
    // sẵn trong "Khách chọn bên khác" — regex lỏng sẽ báo nhầm.
    expect(
      screen.queryByRole('button', { name: /^(khác|lý do khác|other)$/i }),
    ).not.toBeInTheDocument()
  })

  it('ContextRail có mặt và dựng từ đồ thị E1 — luật 10', async () => {
    renderScreen(<LeadsPage />)

    // Chuỗi của OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  it('lọc rỗng thì ra EmptyState có nút gỡ lọc, không phải màn trắng', async () => {
    renderScreen(<LeadsPage />)

    // Chờ sổ về trước, nếu không thì đang đọc trạng thái chờ chứ không phải kết
    // quả lọc. Bám vào ô trong BẢNG, vì tên công ty còn hiện ở panel bên phải.
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.change(screen.getByPlaceholderText(/Tìm theo tên công ty/), {
      target: { value: 'không có công ty nào tên thế này' },
    })

    expect(screen.getByText(/Không có lead nào khớp bộ lọc/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Bỏ hết bộ lọc' }).length).toBeGreaterThan(0)
  })

  it('sổ phân trang 10 dòng, không đổ cả 100 dòng ra một lượt', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // 42 lead đang chạy / 10 dòng mỗi trang = 5 trang.
    expect(screen.getByText('1/5')).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(11) // 10 dòng + header
  })

  it('cổng là sáu ô bắt buộc, không phải 10/10', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.getByText(/Ô bắt buộc · 6\/6/)).toBeInTheDocument()
    expect(screen.getByText(/Cổng là 6 ô bắt buộc, không phải 10\/10/)).toBeInTheDocument()
  })

  it('mỗi lead nói rõ mình từ nguồn nào — dây nối sang module 1', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // DAS Vina về từ hội thảo SK-0103.
    expect(screen.getAllByText('SK-0103').length).toBeGreaterThan(0)
    expect(screen.getByText(/Công trạng kéo lead này về/)).toBeInTheDocument()
  })

  it('timeline của lead có mặt, không phải một dòng "đã tạo"', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const heading = screen.getByText(/^Timeline · \d+ mốc$/)
    expect(heading).toBeInTheDocument()
    expect(Number(heading.textContent?.match(/(\d+) mốc/)?.[1])).toBeGreaterThan(2)
  })

  it('timeline chạy xuôi thời gian và không mốc nào vượt ngày đóng băng 17/08', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const card = screen.getByText(/^Timeline · \d+ mốc$/).parentElement
    expect(card).not.toBeNull()

    // Mỗi mốc in ngày dạng dd/mm. Cả kỳ nằm trong một năm nên so bằng mm*100+dd
    // là đủ — không cần dựng Date, và cũng không được dựng: fixture đóng băng.
    const marks = within(card as HTMLElement)
      .getAllByText(/^\d{2}\/\d{2}$/)
      .map((n) => {
        const [d = '0', m = '0'] = (n.textContent ?? '').split('/')
        return Number(m) * 100 + Number(d)
      })

    expect(marks.length).toBeGreaterThan(2)
    expect([...marks].sort((a, b) => a - b)).toEqual(marks)
    expect(Math.max(...marks)).toBeLessThanOrEqual(8 * 100 + 17)
  })

  it('phễu là luỹ kế, bộ lọc là bậc HIỆN TẠI — hai số không mượn của nhau', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.getByText(/Phễu đếm LUỸ KẾ cả kỳ/)).toBeInTheDocument()

    // Số trên nút lọc phải đếm lại từ sổ, KHÔNG lấy `FUNNEL.count` — luỹ kế của
    // bậc `cong-ty-that` đã gộp cả lead nay đã lên SQL.
    const button = screen.getByRole('button', { name: /^MQL · \d+$/ })
    const shown = Number(button.textContent?.match(/(\d+)/)?.[1])
    const now = LEADS.filter((l) => l.tier === 'mql').length
    const cumulative = FUNNEL.find((s) => s.key === 'cong-ty-that')?.count

    expect(shown).toBe(now)
    expect(shown).toBeLessThan(cumulative as number)
  })

  it('nút "Nhận vào pipeline" bấm được thì phải trả lời, không câm', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // Cổng chỉ mở cho vài lead; lấy đúng một lead cổng đang mở từ chính engine,
    // đừng gõ mã tay — đổi fixture là test tự trỏ sang lead khác.
    const open = LEADS.find((l) => canPromoteToSql(l).ok)
    expect(open).toBeDefined()

    fireEvent.change(screen.getByPlaceholderText(/Tìm theo tên công ty/), {
      target: { value: open?.code ?? '' },
    })
    fireEvent.click(screen.getByRole('button', { name: open?.code ?? '' }))

    const promote = screen.getByRole('button', { name: /Nhận vào pipeline/ })
    expect(promote).toBeEnabled()
    fireEvent.click(promote)

    expect(screen.getByText(/^Đã đề nghị · chờ Trần Thu Hà gật$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nhận vào pipeline/ })).not.toBeInTheDocument()
  })

  it('giao tay cũng chỉ là đề nghị, và nói rõ hoa hồng chia lại phần nào', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // Phần chốt 60 chia lại; mở cửa 30 và demo 10 không đụng tới.
    expect(screen.getByText(/phần chốt 60 của hoa hồng chia lại/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Đặng Thanh Bình' }))
    expect(
      screen.getByText(/^Đã đề nghị giao cho Đặng Thanh Bình · chờ Trần Thu Hà gật$/),
    ).toBeInTheDocument()

    // Đề nghị thuộc về ĐÚNG lead vừa bấm, sang dòng khác là sạch.
    fireEvent.click(screen.getByRole('button', { name: 'LD-0101' }))
    expect(screen.queryByText(/^Đã đề nghị giao cho /)).not.toBeInTheDocument()
  })

  it('bật "Quá SLA" thì nói rõ hai bậc đầu chưa ai đặt ngưỡng', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.queryByText(/chưa có ngưỡng — chưa đo được/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quá SLA' }))
    expect(screen.getByText(/đầu mối và MQL chưa có ngưỡng — chưa đo được/)).toBeInTheDocument()
  })

  it('báo lead có vấn đề không dính sang lead khác', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.click(screen.getByRole('button', { name: 'Năm nay không có tiền' }))
    fireEvent.click(screen.getByRole('button', { name: 'Đưa ra khỏi luồng' }))
    expect(screen.getByText(/^Đã báo · Năm nay không có tiền$/)).toBeInTheDocument()

    // Sang dòng khác trong sổ: lead đó chưa ai báo gì, panel phải trắng lại.
    fireEvent.click(screen.getByRole('button', { name: 'LD-0101' }))
    expect(screen.queryByText(/^Đã báo · /)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Năm nay không có tiền' })).toBeEnabled()
  })
})
