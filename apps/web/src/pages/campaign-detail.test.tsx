import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { millions } from '@pv/ui'
import { HEAD_OF_SALES, SOURCES } from '@pv/engines/fixtures/das-vina'
import { renderRoutes } from '@/test-utils'
import { ANCHOR_SOURCE } from '@/data/campaigns'
import { COST_KIND_LABEL } from '@/data/source-cost'
import { CHANNEL_LABEL } from '@/data/sales-config'
import { CampaignDetailPage } from './campaign-detail'
import { CampaignsPage } from './campaigns'

/** Hồ sơ MỘT nguồn — màn tách ra từ module 1 ngày 19/08.
 *
 *  Bốn ca đầu chuyển nguyên từ `campaigns.test.tsx`: trước đây chúng chạy trên
 *  panel bên phải sổ nguồn, giờ chạy trên màn riêng. Giữ nguyên phần khẳng định
 *  vì thứ được kiểm KHÔNG đổi — chỉ chỗ ở của nó đổi.
 *
 *  Con số kỳ vọng không gõ tay: chúng đọc lại từ fixture, nên đổi fixture mà
 *  quên đổi màn thì test đỏ chứ không im lặng trôi qua. */

const ANCHOR = SOURCES.find((s) => s.code === ANCHOR_SOURCE)

function anchor() {
  if (!ANCHOR) throw new Error('Fixture không có nguồn mồi nào')
  return ANCHOR
}

/** Mở hồ sơ của một nguồn qua đúng đường dẫn thật của nó. */
function openSource(code = ANCHOR_SOURCE) {
  return renderRoutes([{ path: '/sales/campaigns/:code', element: <CampaignDetailPage /> }], {
    route: `/sales/campaigns/${code}`,
  })
}

/** Chờ hồ sơ về. Tên nguồn chỉ hiện khi đã có dữ liệu thật. */
async function openProfile(code = ANCHOR_SOURCE) {
  const s = SOURCES.find((x) => x.code === code)
  if (!s) throw new Error(`Fixture không có nguồn ${code}`)
  await screen.findAllByText(s.label)
}

describe('Module 1 · Hồ sơ nguồn', () => {
  it('dựng được toàn bộ cây, không ném lỗi', async () => {
    openSource()
    await openProfile()
  })

  it('mã không có trong kỳ thì nói thẳng, và chừa lối về sổ', async () => {
    openSource('KHONG-CO-MA-NAY')
    expect(await screen.findByText(/Không có nguồn nào mang mã/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Về sổ nguồn' })).toBeInTheDocument()
  })

  it('timeline nói rõ đợt mấy, gửi bằng gì, và bao nhiêu lead trên KỲ VỌNG bao nhiêu', async () => {
    openSource()
    await openProfile()

    for (const w of anchor().waves) {
      expect(screen.getByText(`Đợt ${w.no}`)).toBeInTheDocument()
      // Kỳ vọng là số đặt TRƯỚC khi chạy, không phải điểm màn tự chấm.
      expect(
        screen.getAllByText(`${w.leads} lead trên kỳ vọng ${w.expected}`).length,
      ).toBeGreaterThan(0)
    }

    // Mỗi kênh có hình định danh riêng — nhìn là biết đợt đó gửi đi đâu.
    for (const c of new Set(anchor().waves.map((w) => w.channel))) {
      expect(screen.getAllByText(CHANNEL_LABEL[c]).length).toBeGreaterThan(0)
    }

    // Bảng lead thuộc module 2; ở đây còn đúng một con số và một lối đi.
    expect(screen.getByRole('button', { name: 'Mở Sổ lead' })).toBeInTheDocument()
    expect(screen.queryByText(/Lead đổ về từ/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Giao chủ' })).not.toBeInTheDocument()
  })

  it('theo dõi và đóng là state của màn — đóng rồi thì chuỗi không nhận thêm đợt', async () => {
    openSource()
    await openProfile()

    // `renderRoutes` đăng nhập bằng TP Kinh doanh, nên nút đọc theo chỗ người đó
    // đã có trong danh sách theo dõi của nguồn hay chưa.
    const before = anchor().followers ?? []
    const watching = before.includes(HEAD_OF_SALES)
    fireEvent.click(screen.getByRole('button', { name: watching ? 'Bỏ theo dõi' : 'Theo dõi' }))

    const after = watching ? before.length - 1 : before.length + 1
    if (after > 0) {
      expect(screen.getByText(`${after} người theo dõi`)).toBeInTheDocument()
    } else {
      expect(screen.getByText('Chưa ai theo dõi')).toBeInTheDocument()
    }

    expect(screen.getByRole('button', { name: 'Thêm đợt vào chuỗi' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Đóng / }))

    expect(screen.getByText('Đã đóng')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm đợt vào chuỗi' })).not.toBeInTheDocument()
  })

  it('khối AI có dòng "Căn cứ", có nút, và có "Chưa tạo gì cả" — luật 9', async () => {
    openSource()
    await openProfile()

    expect(screen.getAllByText(/^Căn cứ:/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Chưa tạo gì cả/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Soạn nội dung' })).toBeInTheDocument()
  })

  it('ContextRail dựng từ đồ thị E1 — luật 10', async () => {
    openSource()
    await openProfile()

    // Nguồn mồi kéo về DAS Vina → OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(screen.getByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  it('nút Sửa mở ĐÚNG màn tạo, đổ sẵn tên và chuỗi đợt của nguồn đang mở', async () => {
    openSource()
    await openProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }))

    expect(screen.getByText(`Sửa ${ANCHOR_SOURCE}`)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Tên' })).toHaveValue(anchor().label)

    const value = (el: HTMLElement) => (el as HTMLInputElement).value
    expect(screen.getAllByRole('textbox', { name: 'Tên đợt' }).map(value)).toEqual(
      anchor().waves.map((w) => w.label),
    )

    /* Kịch bản không lưu nội dung đã soạn — form nói ra thay vì bịa lại bài cũ,
       và nói lại một lần dưới TỪNG ô soạn trống chứ không chỉ ở đầu section. */
    expect(screen.getAllByText(/Kịch bản không lưu nội dung đã soạn/).length).toBeGreaterThan(1)
  })

  /* Hồ sơ nguồn là chỗ ĐÚNG để thấy tiền của một nguồn đi đâu — sổ nguồn chỉ có
     chỗ cho một con số mỗi dòng. Hai ca dưới gác hai nhánh của khối đó. */
  it('bày tiền đi đâu — từng loại có số và tỉ trọng, cộng đúng chi phí của nguồn', async () => {
    const paid = SOURCES.find((s) => s.costLines.length > 0)
    if (!paid) throw new Error('Fixture không có nguồn nào tiêu tiền')

    openSource(paid.code)
    await openProfile(paid.code)

    expect(screen.getByText('Tiền đi đâu')).toBeInTheDocument()
    for (const kind of new Set(paid.costLines.map((l) => l.kind))) {
      expect(screen.getAllByText(COST_KIND_LABEL[kind]).length).toBeGreaterThan(0)
    }

    /* Tổng của bảng phải là chi phí của nguồn, không phải một con số khác —
       câu hint khai thẳng ra để người đọc đối chiếu được bằng mắt. */
    expect(screen.getByText(new RegExp(`cộng đúng ${millions(paid.cost)}`))).toBeInTheDocument()
  })

  it('nguồn 0 đồng KHÔNG có bảng chi phí rỗng — nó có một câu nói vì sao', async () => {
    const free = SOURCES.find((s) => s.cost === 0)
    if (!free) throw new Error('Fixture không có nguồn nào 0 đồng')

    openSource(free.code)
    await openProfile(free.code)

    expect(screen.getAllByText(/không tốn đồng tiền mặt nào/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Loại chi')).not.toBeInTheDocument()
  })

  it('lối về trả đúng người dùng lại sổ nguồn', async () => {
    renderRoutes(
      [
        { path: '/sales/campaigns', element: <CampaignsPage /> },
        { path: '/sales/campaigns/:code', element: <CampaignDetailPage /> },
      ],
      { route: `/sales/campaigns/${ANCHOR_SOURCE}` },
    )
    await openProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Sổ nguồn' }))
    expect(await screen.findByRole('button', { name: 'Chiến dịch mới' })).toBeInTheDocument()
  })
})
