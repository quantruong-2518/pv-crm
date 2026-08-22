import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { FIRST_MEETINGS, FUNNEL, LEADS } from '@pv/engines/fixtures/das-vina'
import { renderRoutes, renderScreen } from '@/test-utils'
import { LeadsPage } from './leads'

/** Test màn Sổ lead — DANH SÁCH, không còn là bàn làm việc.
 *
 *  Khoá đúng những thứ dễ trôi mất khi ai đó dọn giao diện lần sau:
 *   · thẻ điểm là số ĐÃ CHỐT của cả kỳ, không chạy theo bộ lọc;
 *   · bộ lọc là MỘT hàng select, không quay lại rừng nút pill;
 *   · bấm một dòng là SANG TRANG, không mở panel;
 *   · tám cột đúng thứ tự, và hai cột người đọc từ fixture chứ không bịa tên;
 *   · ghim theo người và tách khỏi bảng;
 *   · đầu màn KHÔNG mọc lại tab hay rail chip mồi (gỡ 22/08).
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

  it('thẻ điểm là bốn ô, số lấy từ FUNNEL đã chốt', async () => {
    renderScreen(<LeadsPage />)

    const total = FUNNEL[0]?.count ?? 0
    const ops = FUNNEL.find((s) => s.key === 'co-hoi')?.count ?? 0
    const deals = FUNNEL.find((s) => s.key === 'hop-dong')?.count ?? 0

    for (const label of ['Tổng số lead', 'First meeting / lead', 'Ops / lead', 'Deal / lead']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    expect(screen.getAllByText(String(total)).length).toBeGreaterThan(0)
    expect(screen.getByText(`${Math.round((ops / total) * 100)}%`)).toBeInTheDocument()
    expect(screen.getByText(`${Math.round((deals / total) * 100)}%`)).toBeInTheDocument()

    // Phễu sáu bậc đã gỡ cùng đợt — không mọc lại.
    expect(screen.queryByText(/Phễu đếm LUỸ KẾ cả kỳ/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Công ty thật/ })).not.toBeInTheDocument()
  })

  it('ô "First meeting" lấy số từ fixture, không mượn số bậc MQL', () => {
    renderScreen(<LeadsPage />)

    const total = FUNNEL[0]?.count ?? 0
    expect(screen.getByText(`${Math.round((FIRST_MEETINGS / total) * 100)}%`)).toBeInTheDocument()
    expect(
      screen.getByText(`${FIRST_MEETINGS} buổi gặp đầu tiên trên ${total} đầu mối`),
    ).toBeInTheDocument()

    // Vẫn cấm đổ số của bậc MQL (Công ty thật) vào ô này: nhãn nói gặp, số đo khác.
    const mql = FUNNEL.find((s) => s.key === 'cong-ty-that')?.count ?? 0
    expect(screen.queryByText(`${Math.round((mql / total) * 100)}%`)).not.toBeInTheDocument()
  })

  it('thẻ điểm giữ nguyên số khi đổi bộ lọc — điểm của CẢ KỲ', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const total = FUNNEL[0]?.count ?? 0
    const deals = FUNNEL.find((s) => s.key === 'hop-dong')?.count ?? 0
    const dealRate = `${Math.round((deals / total) * 100)}%`

    const owner = LEADS.find((l) => l.owner)?.owner as string
    fireEvent.change(screen.getByLabelText('Lead PIC'), { target: { value: owner } })
    expect(screen.getByText(dealRate)).toBeInTheDocument()
  })

  it('bộ lọc là MỘT hàng select, không phải rừng nút pill', () => {
    renderScreen(<LeadsPage />)

    for (const label of ['Trạng thái', 'Nguồn', 'Lead PIC', 'Account']) {
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
    const row = (await screen.findByRole('cell', { name: 'DAS Vina' })).parentElement as HTMLElement

    /* Cột nguồn còn đúng một hình từ 22/08 — mã và tên nguồn nằm ở nhãn, cho
       chuột và cho trình đọc màn hình. DAS Vina về từ hội thảo SK-0103. */
    expect(within(row).getByLabelText(/SK-0103/)).toBeInTheDocument()
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

  it('sổ có đúng tám cột đã chốt, theo đúng thứ tự', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Ghim',
      'Mã',
      'Account',
      'Người liên hệ',
      'Chức danh',
      'Nguồn',
      'Trạng thái',
      'Lead PIC',
    ])
  })

  it('hai cột người đọc từ leadContact, không phải tên suy ra ở tầng màn', async () => {
    renderScreen(<LeadsPage />)
    const row = (await screen.findByRole('cell', { name: 'DAS Vina' })).parentElement as HTMLElement

    // Dòng mồi lấy người THẬT trong đồ thị object (CT-0391) — fixture chốt vậy.
    expect(within(row).getByText('Kim Dae-ho')).toBeInTheDocument()
    expect(within(row).getByText('Giám đốc nhà máy')).toBeInTheDocument()
  })

  it('lead chưa moi được ô số 4 thì cột người là "—", không phải tên bịa', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const blank = LEADS.find((l) => !l.filled.includes('nguoi-lien-he'))
    expect(blank).toBeDefined()

    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: blank?.company ?? '' } })

    const row = (screen.getAllByRole('cell', { name: blank?.company })[0] as HTMLElement)
      .parentElement as HTMLElement
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('lọc được theo Lead PIC, kể cả mục "chưa ai nhận"', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'all' } })

    const owner = LEADS.find((l) => l.owner)?.owner as string
    fireEvent.change(screen.getByLabelText('Lead PIC'), { target: { value: owner } })
    expect(screen.getByText(/dòng khớp bộ lọc/).textContent).toBe(
      `${LEADS.filter((l) => l.owner === owner).length} dòng khớp bộ lọc`,
    )

    // 33 dòng chưa ai nhận — không có mục này thì chỉ tìm ra chúng bằng mắt.
    const orphan = screen.getByLabelText('Lead PIC') as HTMLSelectElement
    const noOwner = [...orphan.options].find((o) => o.text === 'Chưa ai nhận')
    expect(noOwner).toBeDefined()
    fireEvent.change(orphan, { target: { value: noOwner?.value } })
    expect(screen.getByText(/dòng khớp bộ lọc/).textContent).toBe(
      `${LEADS.filter((l) => !l.owner).length} dòng khớp bộ lọc`,
    )
  })

  it('đầu màn không còn tab và không còn rail chip mồi — gỡ 22/08', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // "Sổ lead" chỉ còn là TIÊU ĐỀ màn, không còn là một nút chọn tab.
    expect(screen.queryByRole('button', { name: 'Sổ lead' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Việc của tôi/ })).not.toBeInTheDocument()

    // Rail gỡ cùng đợt: chuỗi dựng từ dòng mồi cứng, không từ dòng đang xem.
    expect(screen.queryByLabelText('Chuỗi object liên quan')).not.toBeInTheDocument()
  })
})
