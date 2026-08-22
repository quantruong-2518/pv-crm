import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { DAS_VINA_LEAD, LEADS, leadTranscript, REQUIRED_SLOTS } from '@pv/engines/fixtures/das-vina'
import { renderRoutes } from '@/test-utils'
import { LeadDetailPage } from './lead-detail'

/** Test màn Hồ sơ lead — `/sales/leads/:code`.
 *
 *  Năm thứ màn này phải nói ra, và đều là thứ dễ mất khi ai đó rút gọn giao diện:
 *   · lead từ ĐÂU về, và mở được sang màn nguồn;
 *   · hồ sơ ghi rõ CẬP NHẬT LẦN THỨ MẤY;
 *   · transcript lưu tiếng Anh và KHÔNG mở sẵn;
 *   · thanh đáy luôn có liên hệ khách + next action;
 *   · giao việc chọn được nhiều người, có "giao cho tôi" đứng đầu. */

const detailRoutes = [
  { path: '/sales/leads/:code', element: <LeadDetailPage /> },
  { path: '/sales/leads', element: <div>MÀN SỔ LEAD</div> },
  { path: '/sales/campaigns', element: <div>MÀN CHIẾN DỊCH</div> },
]

const openLead = (code = DAS_VINA_LEAD, actorId?: string) =>
  renderRoutes(detailRoutes, { route: `/sales/leads/${code}`, actorId })

describe('Module 2 · Hồ sơ lead', () => {
  it('mở đúng dòng của đường dẫn', async () => {
    openLead()
    expect(await screen.findByRole('heading', { name: 'DAS Vina' })).toBeInTheDocument()
    /* Một chỗ duy nhất: chip cạnh tên account. Ô "Mã lead" của hồ sơ nằm trong
       cụm Sổ sách, và cụm đó đóng sẵn. */
    expect(screen.getByText(DAS_VINA_LEAD)).toBeInTheDocument()
  })

  it('mã không có trong sổ thì nói thẳng, không dựng màn trắng', async () => {
    openLead('LD-9999')
    expect(await screen.findByText(/Sổ không có dòng nào mang mã/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Về sổ lead' })).toBeInTheDocument()
  })

  it('nói rõ lead tới từ sự kiện nào, và mở được sang màn sự kiện đó', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Lead đến từ đâu'))

    // DAS Vina về từ hội thảo SK-0103.
    expect(box.getByText('SK-0103')).toBeInTheDocument()
    expect(box.getByText('Sự kiện')).toBeInTheDocument()

    fireEvent.click(box.getByRole('button', { name: 'Xem sự kiện' }))
    expect(screen.getByText('MÀN CHIẾN DỊCH')).toBeInTheDocument()
  })

  it('lead không thuộc sự kiện nào thì nói đúng kiểu của nó', async () => {
    // GT = khách cũ giới thiệu · TM = BD tự mở. Lấy từ sổ, không gõ mã tay.
    const ref = LEADS.find((l) => l.source === 'GT')
    const own = LEADS.find((l) => l.source === 'TM')
    expect(ref && own).toBeTruthy()

    const first = openLead(ref?.code)
    expect(
      within(await screen.findByLabelText('Lead đến từ đâu')).getByText('Được giới thiệu'),
    ).toBeInTheDocument()
    first.unmount()

    openLead(own?.code)
    expect(
      within(await screen.findByLabelText('Lead đến từ đâu')).getByText('Tạo trực tiếp'),
    ).toBeInTheDocument()
  })

  it('hồ sơ ghi rõ cập nhật lần thứ mấy, và số đó bằng số lần chạm', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Hồ sơ lead'))

    const lead = LEADS.find((l) => l.code === DAS_VINA_LEAD)
    const turns = leadTranscript(lead!)
    expect(turns.length).toBeGreaterThan(0)
    expect(box.getByText(new RegExp(`Cập nhật lần thứ ${turns.length}`))).toBeInTheDocument()
  })

  it('transcript lưu tiếng Anh và KHÔNG mở sẵn — docs chốt vậy', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Dòng thời gian'))

    expect(box.getByText(/Lưu nguyên văn bằng tiếng Anh/)).toBeInTheDocument()
    expect(box.queryByText(/Can you confirm the legal entity/)).not.toBeInTheDocument()

    fireEvent.click(box.getAllByRole('button', { name: 'Xem nguyên văn' })[0] as HTMLElement)
    expect(box.getByText(/Can you confirm the legal entity/)).toBeInTheDocument()
  })

  it('cổng vẫn là sáu ô bắt buộc, không phải 10/10', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Bộ 10 câu'))

    expect(box.getByText(`Ô bắt buộc · ${REQUIRED_SLOTS}/${REQUIRED_SLOTS}`)).toBeInTheDocument()
    expect(box.getByText(/Cổng là 6 ô bắt buộc, không phải 10\/10/)).toBeInTheDocument()
  })

  it('thanh công cụ có khách, PIC bên mình, và ba hành động', async () => {
    openLead()
    const bar = within(await screen.findByLabelText('Thanh công cụ'))

    // Tên khách hiện hai chỗ trong thanh: ô liên hệ và nhãn nút gọi.
    expect(bar.getAllByText(/Kim Dae-ho/).length).toBeGreaterThan(1)
    expect(bar.getByText('Khách')).toBeInTheDocument()
    // PIC bên mình đứng ngay cạnh khách — DAS Vina do Đỗ Quang Huy giữ.
    expect(bar.getByText('PIC của lead')).toBeInTheDocument()
    expect(bar.getByText('Đỗ Quang Huy')).toBeInTheDocument()

    expect(bar.getByRole('button', { name: /Gọi Kim Dae-ho/ })).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Lead có vấn đề' })).toBeInTheDocument()
    expect(bar.getByRole('button', { name: /Chuyển thành cơ hội/ })).toBeInTheDocument()
  })

  it('lead chưa moi được người liên hệ thì nói thẳng là chưa gọi được cho ai', async () => {
    const blank = LEADS.find((l) => !l.filled.includes('nguoi-lien-he'))
    expect(blank).toBeDefined()

    openLead(blank?.code)
    const bar = within(await screen.findByLabelText('Thanh công cụ'))
    expect(bar.getByText(/chưa gọi được cho ai/)).toBeInTheDocument()
  })

  it('report lead có ĐÚNG sáu lý do, không có ô "khác"', async () => {
    openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Lead có vấn đề' }))
    const box = within(screen.getByRole('dialog'))

    for (const label of [
      'Không gọi được ai',
      'Không phải khách của mình',
      'Năm nay không có tiền',
      'Người liên hệ nghỉ việc',
      'Khách chọn bên khác',
      'Im sau báo giá',
    ]) {
      expect(box.getByRole('option', { name: label })).toBeInTheDocument()
    }

    // Khớp tên ĐẦY ĐỦ của mục: "khác" nằm sẵn trong "Khách chọn bên khác".
    expect(
      box.queryByRole('option', { name: /^(khác|lý do khác|other)$/i }),
    ).not.toBeInTheDocument()
  })

  it('giao việc: có "giao cho tôi" đứng đầu, chọn được nhiều người, ra pill', async () => {
    openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Giao việc' }))

    // Vai đang đăng nhập là TP Kinh doanh — dòng đầu là chính mình.
    expect(screen.getByText('Giao cho tôi')).toBeInTheDocument()
    expect(screen.getByText('bạn')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Trần Thu Hà/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Đỗ Quang Huy/ }))
    fireEvent.click(screen.getByRole('button', { name: /Giao cho 2 người/ }))

    expect(screen.getByText(/Đã đề nghị giao/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đã giao · 2 người/ })).toBeInTheDocument()
  })

  it('bảng giao việc tìm được người theo vai và theo ngành', async () => {
    openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Giao việc' }))

    fireEvent.change(screen.getByPlaceholderText(/Tìm theo tên, vai hoặc ngành/), {
      target: { value: 'chip' },
    })

    expect(screen.getByRole('checkbox', { name: /Đỗ Quang Huy/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Nguyễn Khánh Linh/ })).not.toBeInTheDocument()
  })

  /* Test "ContextRail có mặt — luật 10" đã xoá cùng chính cái rail, 22/08.
     Đây là NỢ LUẬT có ý thức, lý do ghi ở docblock `lead-detail.tsx`. Trả nợ
     thì viết lại test này trước. */

  it('ghim từ hồ sơ và quay lại được sổ', async () => {
    openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghim' }))
    expect(screen.getByRole('button', { name: 'Đã ghim' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sổ lead' }))
    expect(screen.getByText('MÀN SỔ LEAD')).toBeInTheDocument()
  })
})
