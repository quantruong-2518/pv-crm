import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import {
  DAS_VINA_LEAD,
  LEADS,
  leadOrigin,
  leadTranscript,
  REQUIRED_SLOTS,
} from '@pv/engines/fixtures/das-vina'
import { renderRoutes } from '@/test-utils'
import { LeadDetailPage } from './lead-detail'

/** Test màn Hồ sơ lead — `/sales/leads/:code`.
 *
 *  Năm thứ màn này phải nói ra, và đều là thứ dễ mất khi ai đó rút gọn giao diện:
 *   · lead từ ĐÂU về, và mở được sang màn nguồn;
 *   · báo cáo tìm hiểu ghi rõ CẬP NHẬT LẦN THỨ MẤY;
 *   · transcript lưu tiếng Anh và KHÔNG mở sẵn;
 *   · thanh đáy luôn có liên hệ khách + next action;
 *   · giao việc chọn được nhiều người, có "giao cho tôi" đứng đầu. */

const detailRoutes = [
  { path: '/sales/leads/:code', element: <LeadDetailPage /> },
  { path: '/sales/leads', element: <div>MÀN SỔ LEAD</div> },
  /* Hai màn của module 1, để phân biệt được nút đi ĐÚNG chỗ với nút đổ người
     dùng vào sổ nguồn tám dòng: đích của "Xem sự kiện" là HỒ SƠ nguồn. */
  { path: '/sales/campaigns', element: <div>MÀN SỔ NGUỒN</div> },
  { path: '/sales/campaigns/:code', element: <div>MÀN HỒ SƠ NGUỒN</div> },
]

const openLead = (code = DAS_VINA_LEAD, actorId?: string) =>
  renderRoutes(detailRoutes, { route: `/sales/leads/${code}`, actorId })

describe('Module 2 · Hồ sơ lead', () => {
  it('mở đúng dòng của đường dẫn', async () => {
    openLead()
    expect(await screen.findByRole('heading', { name: 'DAS Vina' })).toBeInTheDocument()
    expect(screen.getByText(DAS_VINA_LEAD)).toBeInTheDocument()
  })

  it('mã không có trong sổ thì nói thẳng, không dựng màn trắng', async () => {
    openLead('LD-9999')
    expect(await screen.findByText(/Sổ không có dòng nào mang mã/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Về sổ lead' })).toBeInTheDocument()
  })

  it('nói rõ lead tới từ sự kiện nào, và mở THẲNG hồ sơ của nguồn đó', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Lead đến từ đâu'))

    // DAS Vina về từ hội thảo SK-0103.
    expect(box.getByText('SK-0103')).toBeInTheDocument()
    expect(box.getByText('Sự kiện')).toBeInTheDocument()

    fireEvent.click(box.getByRole('button', { name: 'Xem sự kiện' }))
    // Hồ sơ nguồn, không phải sổ nguồn: nút mang mã đi thật thay vì bắn
    // `?source=` vào một màn không đọc query.
    expect(screen.getByText('MÀN HỒ SƠ NGUỒN')).toBeInTheDocument()
    expect(screen.queryByText('MÀN SỔ NGUỒN')).not.toBeInTheDocument()
  })

  it('lead đã rơi thì nút "Xem nguồn kéo về" ở thanh đáy cũng đi đúng chỗ đó', async () => {
    const exited = LEADS.find((l) => l.exitReason !== undefined)
    expect(exited).toBeDefined()

    openLead(exited?.code)
    const bar = within(await screen.findByLabelText('Liên hệ và việc tiếp theo'))
    fireEvent.click(bar.getByRole('button', { name: /Xem nguồn kéo về/ }))

    expect(screen.getByText('MÀN HỒ SƠ NGUỒN')).toBeInTheDocument()
  })

  /* Khối "Về từ lô" vắng ở 36/100 dòng, và con số đó phải đứng vững thì comment
     biện minh cho nhánh vắng mới đúng. 64 dòng truy được lô; 36 dòng còn lại =
     22 dòng KHÔNG có lô nào đứng sau + 14 dòng CÓ lô mà không truy được tới mức
     dòng (`Lead` cố tình không mang `waveNo`). Cả ba số đều ở mức DÒNG SỔ. */
  it('khối "Về từ lô" hiện ở 64/100 dòng — 36 dòng còn lại là câu trả lời hợp lệ', () => {
    const withBatch = LEADS.filter((l) => leadOrigin(l).batch !== undefined)
    expect(LEADS).toHaveLength(100)
    expect(withBatch).toHaveLength(64)
  })

  it('lead về từ lô thì chip mã lô mở ĐÚNG lô đó ở kho danh sách', async () => {
    const fromBatch = LEADS.find((l) => leadOrigin(l).batch !== undefined)
    expect(fromBatch).toBeDefined()
    const batchCode = leadOrigin(fromBatch!).batch?.code

    renderRoutes(
      [
        ...detailRoutes,
        {
          path: '/sales/campaigns/kho-danh-sach',
          element: <div>MÀN KHO DANH SÁCH</div>,
        },
      ],
      { route: `/sales/leads/${fromBatch?.code}` },
    )

    const box = within(await screen.findByLabelText('Lead đến từ đâu'))
    fireEvent.click(box.getByRole('button', { name: batchCode }))
    expect(screen.getByText('MÀN KHO DANH SÁCH')).toBeInTheDocument()
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

  it('báo cáo tìm hiểu ghi rõ cập nhật lần thứ mấy, và số đó bằng số lần chạm', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Báo cáo tìm hiểu khách hàng'))

    const lead = LEADS.find((l) => l.code === DAS_VINA_LEAD)
    const turns = leadTranscript(lead!)
    expect(turns.length).toBeGreaterThan(0)
    expect(box.getByText(`Cập nhật lần thứ ${turns.length}`)).toBeInTheDocument()
  })

  it('transcript lưu tiếng Anh và KHÔNG mở sẵn — docs chốt vậy', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Transcript'))

    expect(box.getByText(/Lưu nguyên văn bằng tiếng Anh/)).toBeInTheDocument()
    expect(box.queryByText(/Can you confirm the legal entity/)).not.toBeInTheDocument()

    fireEvent.click(box.getAllByRole('button', { name: 'Xem nguyên văn' })[0] as HTMLElement)
    expect(box.getByText(/Can you confirm the legal entity/)).toBeInTheDocument()
  })

  it('cổng vẫn là sáu ô bắt buộc, không phải 10/10', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Người giữ và bộ 10 câu'))

    expect(box.getByText(`Ô bắt buộc · ${REQUIRED_SLOTS}/${REQUIRED_SLOTS}`)).toBeInTheDocument()
    expect(box.getByText(/Cổng là 6 ô bắt buộc, không phải 10\/10/)).toBeInTheDocument()
  })

  /* Bảy thẻ dồn còn năm. Hai ca dưới khoá đúng hai chỗ dồn — dồn tiếp là mất
     câu trả lời, tách lại là quay về bản cũ. */
  it('"ai đang giữ" và bộ 10 câu ở CHUNG một thẻ', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Người giữ và bộ 10 câu'))

    // DAS Vina do Sale ngành chip giữ.
    expect(box.getByText('Ai đang giữ')).toBeInTheDocument()
    expect(box.getByText(/Người giữ:/)).toBeInTheDocument()
    expect(box.getByText('Bộ 10 câu')).toBeInTheDocument()

    // Câu "giao việc không đổi người giữ" nói ĐÚNG một chỗ: bảng giao việc.
    expect(screen.queryByText(/Giao việc thêm người vào đây/)).not.toBeInTheDocument()
  })

  it('lý do rơi nằm ở CHÂN timeline, không thành thẻ ngang hàng', async () => {
    openLead()
    const timeline = within(await screen.findByLabelText('Timeline'))
    expect(timeline.getByLabelText('Lead có vấn đề')).toBeInTheDocument()
  })

  it('thanh đáy luôn có liên hệ khách VÀ next action', async () => {
    openLead()
    const bar = within(await screen.findByLabelText('Liên hệ và việc tiếp theo'))

    // Tên khách hiện hai chỗ trong thanh: ô liên hệ và nhãn nút gọi.
    expect(bar.getAllByText(/Kim Dae-ho/).length).toBeGreaterThan(1)
    expect(bar.getByText('Liên hệ khách')).toBeInTheDocument()
    expect(bar.getByRole('button', { name: /Gọi Kim Dae-ho/ })).toBeInTheDocument()
    // DAS Vina đang ở cột "Đang tìm hiểu" và còn trong hạn → đề nghị sang cột kế.
    expect(bar.getByRole('button', { name: /Đề nghị sang cột kế/ })).toBeInTheDocument()
  })

  it('lead chưa moi được ô số 4 thì nói thẳng là chưa gọi được cho ai', async () => {
    const blank = LEADS.find((l) => !l.filled.includes('nguoi-lien-he'))
    expect(blank).toBeDefined()

    openLead(blank?.code)
    const bar = within(await screen.findByLabelText('Liên hệ và việc tiếp theo'))
    expect(bar.getByText(/ô số 4 của bộ 10 câu còn trống/)).toBeInTheDocument()
  })

  it('report lead có ĐÚNG sáu lý do, không có ô "khác"', async () => {
    openLead()
    const box = within(await screen.findByLabelText('Lead có vấn đề'))

    for (const label of [
      'Không gọi được ai',
      'Không phải khách của mình',
      'Năm nay không có tiền',
      'Người liên hệ nghỉ việc',
      'Khách chọn bên khác',
      'Im sau báo giá',
    ]) {
      expect(box.getByRole('button', { name: label })).toBeInTheDocument()
    }

    // Khớp tên ĐẦY ĐỦ của nút: "khác" nằm sẵn trong "Khách chọn bên khác".
    expect(
      screen.queryByRole('button', { name: /^(khác|lý do khác|other)$/i }),
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

  it('ContextRail có mặt — luật 10', async () => {
    openLead()
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  /* Ràng buộc 11 · màn phải nói ra thứ nó CỐ TÌNH không làm. Ba dòng đầu của
     khối này là ba chỗ người bấm sẽ tưởng đã xảy ra. */
  it('nói ra thứ màn cố tình không làm — E3 chưa nối, E2 chưa ghi vết', async () => {
    openLead()
    expect(await screen.findByText('Cố tình không làm')).toBeInTheDocument()
    expect(screen.getByText(/E3 chưa nối/)).toBeInTheDocument()
    expect(screen.getByText(/chưa vào sổ ghi vết của E2/)).toBeInTheDocument()
  })

  it('ghim từ hồ sơ và quay lại được sổ', async () => {
    openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghim' }))
    expect(screen.getByRole('button', { name: 'Đã ghim' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sổ lead' }))
    expect(screen.getByText('MÀN SỔ LEAD')).toBeInTheDocument()
  })
})
