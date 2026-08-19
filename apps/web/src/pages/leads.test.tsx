import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { FUNNEL, LEADS } from '@pv/engines/fixtures/das-vina'
import { useLeadDesk } from '@/app/desk'
import { renderRoutes, renderScreen } from '@/test-utils'
import { LeadsPage } from './leads'

/** Test màn Sổ lead — DANH SÁCH, không còn là bàn làm việc.
 *
 *  Khoá đúng những thứ dễ trôi mất khi ai đó dọn giao diện lần sau:
 *   · phễu vẫn là số ĐÃ CHỐT và vẫn nói ra tỉ lệ qua bậc;
 *   · bộ lọc là MỘT hàng select, không quay lại rừng nút pill;
 *   · bấm một dòng là SANG TRANG, không mở panel;
 *   · ghim theo người và tách khỏi bảng;
 *   · tab "Việc của tôi" xếp việc theo cột kanban.
 *
 *  Sổ lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ nào cần dòng
 *  thật thì phải `findBy…`, không `getBy…`. */

/** Sổ lead + một màn giả đứng ở chỗ hồ sơ lead, để kiểm việc điều hướng. */
const bookRoutes = [
  { path: '/sales/leads', element: <LeadsPage /> },
  { path: '/sales/leads/:code', element: <div>MÀN HỒ SƠ LEAD</div> },
]

describe('Module 2 · Sổ lead', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<LeadsPage />)).not.toThrow()
  })

  it('phễu hiện đúng sáu bậc đã chốt và tỉ lệ qua từng bậc', () => {
    renderScreen(<LeadsPage />)

    for (const step of FUNNEL) {
      expect(screen.getAllByText(String(step.count)).length).toBeGreaterThan(0)
    }

    // 44/100 · 30/44 · 19/30 · 11/19 · 6/11 — năm tỉ lệ, một cho mỗi bước rớt.
    expect(screen.getByText('44%')).toBeInTheDocument()
    expect(screen.getByText('68%')).toBeInTheDocument()
    expect(screen.getByText(/Phễu đếm LUỸ KẾ cả kỳ/)).toBeInTheDocument()
  })

  it('bấm một bậc trên phễu là lọc theo bậc đó — thẻ điểm cũng là bộ lọc', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const mql = LEADS.filter((l) => l.tier === 'mql').length
    fireEvent.click(screen.getByRole('button', { name: /Công ty thật/ }))

    expect((screen.getByLabelText('Bậc') as HTMLSelectElement).value).toBe('mql')
    expect(screen.getByText(`MQL · ${mql}`)).toBeInTheDocument()
  })

  it('bộ lọc là MỘT hàng select, không phải rừng nút pill', () => {
    renderScreen(<LeadsPage />)

    for (const label of ['Trạng thái', 'Bậc', 'Ngành', 'Nguồn']) {
      expect(screen.getByLabelText(label).tagName).toBe('SELECT')
    }

    // Bốn ô lọc + ô tìm là toàn bộ thanh lọc. Nút lọc dạng pill chỉ còn đúng
    // một cái ("Quá SLA") vì nó là công tắc hai trạng thái, không phải danh sách.
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
    expect(screen.getByPlaceholderText(/Tìm theo tên công ty/)).toBeInTheDocument()
  })

  it('bấm một dòng thì SANG TRANG hồ sơ, không mở panel bên phải', async () => {
    renderRoutes(bookRoutes, { route: '/sales/leads' })

    fireEvent.click(await screen.findByRole('cell', { name: 'DAS Vina' }))
    expect(screen.getByText('MÀN HỒ SƠ LEAD')).toBeInTheDocument()
  })

  it('ghim tách hẳn ra khỏi bảng và ghim theo NGƯỜI đang đăng nhập', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.queryByText(/^Ghim của tôi/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ghim DAS Vina' }))
    expect(screen.getByText('Ghim của tôi · 1')).toBeInTheDocument()

    // Bỏ ghim ở khối ghim thì bảng cũng phải hết sáng — một nguồn sự thật.
    fireEvent.click(screen.getAllByRole('button', { name: 'Bỏ ghim DAS Vina' })[0] as HTMLElement)
    expect(screen.queryByText(/^Ghim của tôi/)).not.toBeInTheDocument()
  })

  it('mỗi dòng nói rõ mình từ nguồn nào — dây nối sang module 1', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // DAS Vina về từ hội thảo SK-0103.
    expect(screen.getAllByText('SK-0103').length).toBeGreaterThan(0)
  })

  it('sổ phân trang 10 dòng, không đổ cả 100 dòng ra một lượt', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // 42 lead đang chạy / 10 dòng mỗi trang = 5 trang.
    expect(screen.getAllByText('1/5').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(11) // 10 dòng + header
  })

  it('lọc rỗng thì ra EmptyState có nút gỡ lọc, không phải màn trắng', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.change(screen.getByPlaceholderText(/Tìm theo tên công ty/), {
      target: { value: 'không có công ty nào tên thế này' },
    })

    expect(screen.getByText(/Không có lead nào khớp bộ lọc/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Bỏ hết bộ lọc' }).length).toBeGreaterThan(0)
  })

  it('bật "Quá SLA" thì nói rõ hai bậc đầu chưa ai đặt ngưỡng', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.queryByText(/chưa có ngưỡng — chưa đo được/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quá SLA' }))
    expect(screen.getByText(/đầu mối và MQL chưa có ngưỡng — chưa đo được/)).toBeInTheDocument()
  })

  it('ContextRail có mặt và dựng từ đồ thị E1 — luật 10', async () => {
    renderScreen(<LeadsPage />)

    // Chuỗi của OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  it('tab "Việc của tôi" xếp việc theo cột kanban và nói rõ vì sao là việc của mình', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    // Sáu cột: chưa vào sổ cơ hội + năm cột của PIPELINE_STAGES.
    for (const label of [
      'Chưa vào sổ cơ hội',
      'Mới',
      'Đang tìm hiểu',
      'Đã demo',
      'Đã báo giá',
      'Chờ ký',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }

    // TP Kinh doanh không giữ khách: việc của vai này là thứ chờ mình gật.
    expect(screen.getAllByText(/chờ bạn gật cho vào pipeline/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Không có nút "hoàn thành" ở đây/)).toBeInTheDocument()
  })

  it('bấm hành động trên thẻ việc là ĐỀ NGHỊ, không phải làm luôn', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })
    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    /* Đúng cái NÚT, không phải cả thẻ: thẻ có tên trợ năng riêng
       ("Mở hồ sơ …") nên hai thứ không lẫn vào nhau. */
    const first = screen.getAllByRole('button', { name: 'Đề nghị nhận vào pipeline' })[0]
    expect(first).toBeDefined()
    fireEvent.click(first as HTMLElement)

    expect(screen.getAllByText('Đã đề nghị').length).toBeGreaterThan(0)
  })

  it('việc vừa được giao rơi vào ĐÚNG cột của nó và đeo nhãn "mới"', async () => {
    // Huy là Sale ngành chip; lead dưới đây do Linh giữ, đang ở cột "Đã demo".
    const other = LEADS.find((l) => l.stage === 'da-demo' && l.owner !== 'Đỗ Quang Huy')
    expect(other).toBeDefined()

    renderScreen(<LeadsPage />, { actorId: 'u-huy' })
    await screen.findByRole('cell', { name: 'DAS Vina' })

    act(() => {
      useLeadDesk.getState().assign(other?.code ?? '', ['u-huy'], 'Báo tắc')
    })
    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    const card = screen.getByRole('button', { name: `Mở hồ sơ ${other?.company}` })
    expect(within(card).getByText('mới')).toBeInTheDocument()
    expect(within(card).getByText(/Vừa được giao · Báo tắc/)).toBeInTheDocument()

    // Thẻ nằm trong cột "Đã demo", không nằm trong một hộp "việc mới" riêng.
    const column = card.parentElement?.parentElement as HTMLElement
    expect(within(column).getByText('Đã demo')).toBeInTheDocument()
  })

  it('vai Sale thấy việc của chính mình, không thấy việc của vai khác', async () => {
    renderScreen(<LeadsPage />, { actorId: 'u-huy' })
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    const board = screen.getByText(/Bấm hành động trên thẻ là ĐỀ NGHỊ/).parentElement as HTMLElement
    expect(within(board).getAllByText(/Bạn đang giữ/).length).toBeGreaterThan(0)
    expect(within(board).queryByText(/chờ bạn gật cho vào pipeline/)).not.toBeInTheDocument()
  })
})
