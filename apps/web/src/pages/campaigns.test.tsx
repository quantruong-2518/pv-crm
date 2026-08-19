import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { percent } from '@pv/ui'
import { HEAD_OF_SALES, LEAD_CATEGORIES, SOURCES, sourceStats } from '@pv/engines/fixtures/das-vina'
import { renderScreen } from '@/test-utils'
import { ANCHOR_SOURCE, DRAFT_TEMPLATE } from '@/data/campaigns'
import { CampaignsPage } from './campaigns'

/** Ba Sale nhận được lead — tính lại từ fixture đúng như màn, không gõ tên. */
const SALES = [...new Set(LEAD_CATEGORIES.map((c) => c.sale))]

/** Test "màn dựng được" + khoá bốn thứ của module 1 mà mắt người hay bỏ sót.
 *
 *  Con số kỳ vọng KHÔNG gõ tay: chúng tính lại từ fixture ngay trong test, nên
 *  đổi fixture mà quên đổi màn thì test đỏ chứ không im lặng trôi qua.
 *
 *  Nguồn và lead lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ
 *  nào cần dòng thật thì phải `findBy…`, không `getBy…`. */
describe('Module 1 · Chiến dịch & Sự kiện', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<CampaignsPage />)).not.toThrow()
  })

  it('tám nguồn cộng lại đúng 100 lead, và KPI đo bằng lead chứ không bằng lượt xem', async () => {
    renderScreen(<CampaignsPage />)

    const total = SOURCES.reduce((n, s) => n + sourceStats(s.code).leads, 0)
    expect(total).toBe(100)

    // Ô "Lead cả kỳ" phải là chính con số đó, không phải một số khác gõ tay.
    expect(await screen.findByText(String(total))).toBeInTheDocument()
    expect(screen.getByText('Lead cả kỳ')).toBeInTheDocument()

    // Đủ tám nguồn trên bảng — sáu chiến dịch/sự kiện + hai nguồn tự nhiên.
    expect(SOURCES).toHaveLength(8)
    for (const s of SOURCES) {
      expect(screen.getAllByText(s.code).length).toBeGreaterThan(0)
    }

    // Thước đo của module 1 là lead, không phải lượt xem (docs · mục 1.4).
    expect(screen.queryByText(/lượt xem/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/lượt hiển thị/i)).not.toBeInTheDocument()

    // Tỉ lệ qua cổng nằm trong NHÃN, không nằm ở khe `delta` của StatCard: khe
    // đó nghĩa là biến thiên so với kỳ trước, mà kịch bản đóng băng không có kỳ
    // trước nào để so.
    const good = SOURCES.reduce((n, s) => n + sourceStats(s.code).good, 0)
    expect(
      screen.getByText(`Lead tốt · ${percent(good / total)} qua cổng init data`),
    ).toBeInTheDocument()
  })

  it('đổi bộ lọc thì panel không giữ một nguồn đã bị lọc giấu', async () => {
    renderScreen(<CampaignsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // Nguồn mồi là một SỰ KIỆN — lọc sang "Chiến dịch" phải đẩy nó khỏi màn.
    const anchor = SOURCES.find((s) => s.code === ANCHOR_SOURCE)
    expect(anchor?.kind).toBe('su-kien')

    fireEvent.click(screen.getByRole('button', { name: 'Chiến dịch' }))

    const firstCampaign = SOURCES.find((s) => s.kind === 'chien-dich')?.code
    if (!firstCampaign) throw new Error('Fixture không có chiến dịch nào')
    expect(screen.queryByText(ANCHOR_SOURCE)).not.toBeInTheDocument()
    expect(screen.getAllByText(firstCampaign).length).toBeGreaterThan(0)

    // Nguồn này chưa có object nào trong đồ thị E1 → rail rút về đúng một chip
    // của chính mã nguồn, chứ không mượn chuỗi của nguồn khác.
    expect(screen.queryByText('AC-0142')).not.toBeInTheDocument()

    // Bỏ lọc thì nguồn cũ tự mở lại — màn nhớ chỗ người dùng đang đứng.
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }))
    expect(screen.getAllByText(ANCHOR_SOURCE).length).toBeGreaterThan(0)
  })

  it('bản nháp tab "Tạo mới" chép nhịp từ fixture, không gõ tay con số nào', async () => {
    renderScreen(<CampaignsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))

    // Nguồn mẫu = nguồn đã chạy đợt và ra nhiều lead nhất trong kỳ.
    const sample = [...SOURCES]
      .filter((s) => s.waves.length > 0)
      .sort((a, b) => b.leads - a.leads)[0]
    const opening = sample?.waves[0]
    if (!sample || !opening) throw new Error('Fixture không có nguồn nào đã chạy đợt')
    expect(DRAFT_TEMPLATE.fromCode).toBe(sample.code)

    // Khán giả mặc định = số người nhận đợt mở màn của chính nguồn đó.
    expect(screen.getByLabelText(/Khán giả/)).toHaveValue(String(opening.sent))

    // Nhịp đợt = hiệu ngày giữa các đợt của nguồn đó, không phải 14/28 gõ tay.
    for (const w of sample.waves.slice(1)) {
      expect(screen.getAllByText(`Sau ${w.day - opening.day} ngày`).length).toBeGreaterThan(0)
    }
  })

  it('bảng lead đổ về nói rõ ĐANG TRONG TAY AI — ba trạng thái, không ô trống', async () => {
    renderScreen(<CampaignsPage />)

    // Nguồn mồi là nguồn đã kéo chính DAS Vina về.
    expect(await screen.findByRole('cell', { name: 'DAS Vina' })).toBeInTheDocument()
    expect(screen.getByText(/Lead đổ về từ/)).toBeInTheDocument()

    // 1 · đang trong tay một Sale · 2 · còn ở kho chung · 3 · đã rời luồng.
    expect(screen.getAllByText('Đỗ Quang Huy').length).toBeGreaterThan(0)
    expect(screen.getAllByText('kho chung').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^đã rời luồng ·/).length).toBeGreaterThan(0)
  })

  it('lead ở kho chung giao được chủ — đề nghị chờ TP gật, bậc không đổi (mục 1.5)', async () => {
    renderScreen(<CampaignsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const gateBefore = screen.getByText(/lead đã qua cổng/).textContent
    const [assign] = screen.getAllByRole('button', { name: 'Giao chủ' })
    if (!assign) throw new Error('Không lead nào ở kho chung có nút "Giao chủ"')
    fireEvent.click(assign)

    // Chọn được ĐÚNG ba Sale. TP Kinh doanh gật chứ không giữ khách.
    for (const name of SALES) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: HEAD_OF_SALES })).not.toBeInTheDocument()

    const [first] = SALES
    if (!first) throw new Error('Fixture không có Sale nào nhận lead')
    fireEvent.click(screen.getByRole('button', { name: first }))

    // Mới là ĐỀ NGHỊ: lead chưa rời kho chung, và cổng init data không nhúc nhích.
    expect(screen.getByText(new RegExp(`Đã đề nghị giao · ${first}`))).toBeInTheDocument()
    expect(screen.getByText(/lead đã qua cổng/).textContent).toBe(gateBefore)
    expect(screen.getByText(/lead rời kho chung khi/)).toBeInTheDocument()
  })

  it('tạo phiếu việc KHÔNG đổi bậc lead và không đổi số đã qua cổng', async () => {
    renderScreen(<CampaignsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const gateBefore = screen.getByText(/lead đã qua cổng/).textContent
    const sqlBefore = screen.getAllByText('SQL').length
    expect(sqlBefore).toBeGreaterThan(0)

    const [first] = screen.getAllByRole('button', { name: 'Tạo phiếu việc' })
    if (!first) throw new Error('Không có nút "Tạo phiếu việc" nào trên bảng lead đổ về')
    fireEvent.click(first)

    // Phiếu việc có thật — nút đổi thành nhãn "Đã tạo".
    expect(screen.getAllByText('Đã tạo')).toHaveLength(1)

    // …nhưng cổng init data không có đường vòng: bậc và số lead tốt y nguyên.
    expect(screen.getAllByText('SQL')).toHaveLength(sqlBefore)
    expect(screen.getByText(/lead đã qua cổng/).textContent).toBe(gateBefore)
    expect(screen.getByText(/không phải cơ hội/)).toBeInTheDocument()
  })

  it('mọi khối AI có dòng "Căn cứ", có nút, và có "Chưa tạo gì cả" — luật 9', async () => {
    renderScreen(<CampaignsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.getAllByText(/^Căn cứ:/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Chưa tạo gì cả/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Soạn nội dung' }).length).toBeGreaterThan(0)

    // Tab tạo mới có khối AI riêng — nó cũng phải chịu đủ ba thứ trên.
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    expect(screen.getAllByText(/^Căn cứ:/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Chưa tạo gì cả/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Soạn nội dung' }))
    expect(screen.queryByText(/Chưa tạo gì cả/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/chưa gửi cho ai/).length).toBeGreaterThan(0)
  })

  it('ContextRail dựng từ đồ thị E1 và có mặt ở CẢ hai tab — luật 10', async () => {
    renderScreen(<CampaignsPage />)

    // Nguồn mồi kéo về DAS Vina → OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    expect(screen.getByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  it('kênh E4 chưa mở đường thì nói thẳng, không giả vờ gửi được', async () => {
    renderScreen(<CampaignsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    // Ba đợt mặc định đều nằm trong bốn kênh E4 — chưa có gì để cảnh báo.
    expect(screen.queryByText(/E4 chưa mở đường/)).not.toBeInTheDocument()

    const [linkedin] = screen.getAllByRole('button', { name: 'LinkedIn' })
    if (!linkedin) throw new Error('Không có nút chọn kênh LinkedIn trong chuỗi đợt')
    fireEvent.click(linkedin)

    expect(screen.getAllByText(/E4 chưa mở đường cho LinkedIn/).length).toBeGreaterThan(0)
  })

  it('nút cuối là gửi duyệt, không phải gửi ngay — E5 chỉ bung đợt sau khi có người gật', async () => {
    renderScreen(<CampaignsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))

    const label = `Gửi ${HEAD_OF_SALES} duyệt`
    expect(screen.getByRole('button', { name: label })).toBeDisabled()

    /* Tìm ô theo NHÃN chứ không theo placeholder: placeholder nay suy từ nguồn
       mẫu trong fixture, đổi fixture là test đỏ vì lý do không liên quan. */
    fireEvent.change(screen.getByLabelText('Tên'), {
      target: { value: 'Chuỗi email — nhà máy dược Hà Nam' },
    })
    const submit = screen.getByRole('button', { name: label })
    expect(submit).not.toBeDisabled()

    fireEvent.click(submit)
    expect(screen.getByText(new RegExp(`chờ ${HEAD_OF_SALES} gật`))).toBeInTheDocument()
    expect(screen.getByText(/E4 không nhận lệnh gửi nào/)).toBeInTheDocument()
  })
})
