import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { HEAD_OF_SALES, SOURCES, dasVina, sourceStats } from '@pv/engines/fixtures/das-vina'
import { renderScreen } from '@/test-utils'
import { ANCHOR_SOURCE, DRAFT_TEMPLATE } from '@/data/campaigns'
import { CHANNEL_LABEL, E4_CHANNELS } from '@/data/sales-config'
import { CampaignsPage } from './campaigns'

/** Test "màn dựng được" + khoá những thứ của module 1 mà mắt người hay bỏ sót.
 *
 *  Con số kỳ vọng KHÔNG gõ tay: chúng tính lại từ fixture ngay trong test, nên
 *  đổi fixture mà quên đổi màn thì test đỏ chứ không im lặng trôi qua.
 *
 *  Nguồn lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ nào cần
 *  dòng thật thì phải `findBy…`, không `getBy…`.
 *
 *  Đổi 19/08: bảng lead rời khỏi màn (thuộc module 2) nên ba ca cũ về giao chủ
 *  và phiếu việc đã bỏ. Thay vào là sắp xếp cột, bấm cả dòng, timeline kỳ vọng,
 *  đóng/theo dõi, và form sửa. */

/** Sáu nguồn CÓ ĐỢT — tức có người chạy. Hai nguồn tự nhiên không nằm trong đây. */
const RUNNING = SOURCES.filter((s) => s.waves.length > 0)
const WAVES = RUNNING.flatMap((s) => s.waves)

/** Nguồn mồi mọi lần mở màn, suy từ fixture đúng như tầng data. */
const ANCHOR = SOURCES.find((s) => s.code === ANCHOR_SOURCE)

function anchor() {
  if (!ANCHOR) throw new Error('Fixture không có nguồn mồi nào')
  return ANCHOR
}

/** Chờ SỔ NGUỒN thật sự về trước khi tra bằng `getBy…`.
 *
 *  KHÔNG chờ bằng `findAllByText(ANCHOR_SOURCE)`: ContextRail vẽ chip mã nguồn
 *  mồi ngay từ lần render ĐẦU, lúc bảng còn là skeleton — nên lời chờ đó xanh
 *  tức thì và mọi `getBy…` sau nó chạy trên một màn chưa có dữ liệu. Tên nguồn
 *  thì chỉ xuất hiện khi đã có dòng thật, nên nó mới là mốc chờ đúng.
 *
 *  Dùng `findAllByText` vì tên nguồn đang mở có mặt ở hai chỗ: dòng bảng và
 *  panel chi tiết. */
async function openBook() {
  await screen.findAllByText(anchor().label)
}

/** Mã của dòng đầu bảng. Dòng 0 là hàng header — `DataTable` đánh `role="row"`
 *  cho cả nó. */
function firstRowCode() {
  const [, first] = screen.getAllByRole('row')
  if (!first) throw new Error('Bảng chưa có dòng nào')
  const [code] = within(first).getAllByRole('cell')
  return code?.textContent?.trim()
}

describe('Module 1 · Chiến dịch & Sự kiện', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<CampaignsPage />)).not.toThrow()
  })

  it('score card đo CHIẾN DỊCH — đợt, người tiếp cận, kỳ vọng; không đo bằng lượt xem', async () => {
    renderScreen(<CampaignsPage />)

    /* Ô "Đạt kỳ vọng lead" cộng lead của SÁU nguồn có đợt, không phải cả 100
       dòng sổ: 12 lead của hai nguồn tự nhiên không đợt nào kéo về. Nhãn phải
       nói ra điều đó, nếu không người đọc tưởng sổ lead mất 12 dòng. */
    const leads = RUNNING.reduce((n, s) => n + sourceStats(s.code).leads, 0)
    const expected = WAVES.reduce((n, w) => n + w.expected, 0)
    const all = SOURCES.reduce((n, s) => n + sourceStats(s.code).leads, 0)

    expect(await screen.findByText(`${leads}/${expected} lead từ các đợt`)).toBeInTheDocument()
    expect(leads).toBeLessThan(all)
    expect(all).toBe(100)

    // Số ĐỢT là thước đo của module 1, và đợt nằm ngoài E4 phải đếm được.
    const manual = WAVES.filter((w) => !E4_CHANNELS.includes(w.channel)).length
    expect(screen.getByText('Đợt đã gửi')).toBeInTheDocument()
    expect(screen.getByText(`${manual} đợt người tự đăng`)).toBeInTheDocument()

    // "Chiến dịch đã chạy đợt" nói đúng nghĩa: nguồn có người chạy, không phải
    // đợt còn đang gửi.
    const events = SOURCES.filter((s) => s.kind === 'su-kien').length
    expect(
      screen.getByText(`${SOURCES.length} nguồn cả kỳ · ${events} sự kiện`),
    ).toBeInTheDocument()

    // Thước đo của module 1 là lead, không phải lượt xem (docs · mục 1.4).
    expect(screen.queryByText(/lượt xem/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/lượt hiển thị/i)).not.toBeInTheDocument()
  })

  it('đủ tám nguồn trên bảng, và đổi bộ lọc thì panel không giữ nguồn đã bị lọc giấu', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()

    expect(SOURCES).toHaveLength(8)
    for (const s of SOURCES) {
      expect(screen.getAllByText(s.code).length).toBeGreaterThan(0)
    }

    // Nguồn mồi là một SỰ KIỆN — lọc sang "Chiến dịch" phải đẩy nó khỏi màn.
    expect(anchor().kind).toBe('su-kien')
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

  it('sắp xếp nằm ở header cột, và thứ tự là state của màn — bảng không tự sắp mảng', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()

    const byDay = [...SOURCES].sort((a, b) => a.startDay - b.startDay)
    const oldest = byDay[0]?.code
    const newest = byDay[byDay.length - 1]?.code

    // Mặc định: theo ngày, mới nhất lên trước.
    expect(screen.getByRole('columnheader', { name: /Bắt đầu/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(firstRowCode()).toBe(newest)

    // Bấm lại cùng cột thì đảo chiều.
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu/ }))
    expect(screen.getByRole('columnheader', { name: /Bắt đầu/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(firstRowCode()).toBe(oldest)

    // Đổi sang cột khác thì cột cũ nhả khoá sắp xếp.
    fireEvent.click(screen.getByRole('button', { name: /Giá trị/ }))
    expect(screen.getByRole('columnheader', { name: /Bắt đầu/ })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })

  it('bấm CẢ DÒNG mở chi tiết, không phải mỗi cái mã', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()

    const other = SOURCES.find((s) => s.code !== ANCHOR_SOURCE && s.waves.length > 0)
    if (!other) throw new Error('Fixture không có nguồn thứ hai đã chạy đợt')

    // Trước khi bấm, tên nguồn chỉ có mặt ở dòng bảng.
    expect(screen.getAllByText(other.label)).toHaveLength(1)

    const row = screen.getByText(other.label).closest('[role="row"]')
    if (!row) throw new Error('Ô tên không nằm trong một dòng bảng')
    fireEvent.click(row)

    // Dòng sáng lên và panel phải mở đúng nguồn đó → tên có mặt ở hai chỗ.
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText(other.label)).toHaveLength(2)
  })

  it('timeline nói rõ đợt mấy, gửi bằng gì, và bao nhiêu lead trên KỲ VỌNG bao nhiêu', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()

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

    // Bảng lead đã dời sang module 2; còn lại đúng một con số và một lối đi.
    expect(screen.getByRole('button', { name: 'Mở Sổ lead' })).toBeInTheDocument()
    expect(screen.queryByText(/Lead đổ về từ/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Giao chủ' })).not.toBeInTheDocument()
  })

  it('theo dõi và đóng là state của màn — đóng rồi thì chuỗi không nhận thêm đợt', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()

    // `renderScreen` đăng nhập bằng TP Kinh doanh, nên nút đọc theo chỗ người đó
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

  it('mọi khối AI có dòng "Căn cứ", có nút, và có "Chưa tạo gì cả" — luật 9', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()

    expect(screen.getAllByText(/^Căn cứ:/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Chưa tạo gì cả/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Soạn nội dung' })).toBeInTheDocument()

    // Form có khối AI riêng — nó cũng phải chịu đủ ba thứ trên.
    fireEvent.click(screen.getByRole('button', { name: 'Chiến dịch mới' }))
    expect(screen.getAllByText(/^Căn cứ:/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Chưa tạo gì cả/)).toBeInTheDocument()

    // Bản nháp đổ thẳng vào ô nội dung của TỪNG đợt, không in ra một danh sách rời.
    fireEvent.click(screen.getByRole('button', { name: 'Soạn nội dung' }))
    expect(screen.queryByText(/Chưa tạo gì cả/)).not.toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`Đã đổ nháp vào ${DRAFT_TEMPLATE.waves.length} đợt`)),
    ).toBeInTheDocument()
  })

  it('ContextRail dựng từ đồ thị E1 và có mặt ở CẢ hai chế độ — luật 10', async () => {
    renderScreen(<CampaignsPage />)

    // Nguồn mồi kéo về DAS Vina → OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Chiến dịch mới' }))
    expect(screen.getByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  it('form tạo chép nhịp và kỳ vọng từ fixture, và nói thẳng kênh E4 chưa mở đường', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()
    fireEvent.click(screen.getByRole('button', { name: 'Chiến dịch mới' }))

    // Nguồn mẫu = nguồn đã chạy đợt và ra nhiều lead nhất trong kỳ.
    const sample = [...RUNNING].sort((a, b) => b.leads - a.leads)[0]
    const waves = sample?.waves ?? []
    const opening = waves[0]
    const closing = waves[waves.length - 1]
    if (!sample || !opening || !closing) throw new Error('Fixture không có nguồn nào đã chạy đợt')
    expect(DRAFT_TEMPLATE.fromCode).toBe(sample.code)

    // Khán giả chép từ chính nguồn đó, không phải số tròn. Số ngày chạy KHÔNG
    // có ô nhập riêng — nó suy từ nhịp các đợt, nên đọc ở dòng tổng của chuỗi.
    expect(screen.getByLabelText('Khán giả · số người nhận')).toHaveValue(String(opening.sent))
    expect(
      screen.getByText(new RegExp(`trải ${closing.day - opening.day} ngày`)),
    ).toBeInTheDocument()

    // Nhịp và kỳ vọng của từng đợt cũng vậy.
    const value = (el: HTMLElement) => (el as HTMLInputElement).value
    expect(screen.getAllByLabelText('Sau bao nhiêu ngày').map(value)).toEqual(
      sample.waves.map((w) => String(w.day - opening.day)),
    )
    /* Tra ô bắt buộc bằng `getByRole` chứ không `getByLabelText`: dấu sao là
       `aria-hidden` nên TÊN của ô là "Kỳ vọng bao nhiêu lead", không phải
       "Kỳ vọng bao nhiêu lead *". `getByLabelText` đọc thẳng `textContent` của
       thẻ label nên không thấy được điều đó; `getByRole` tính đúng tên mà trình
       đọc màn hình sẽ đọc. */
    expect(screen.getAllByRole('textbox', { name: 'Kỳ vọng bao nhiêu lead' }).map(value)).toEqual(
      sample.waves.map((w) => String(w.expected)),
    )

    // Kỳ vọng cả chiến dịch cộng từ các đợt, không có ô cho người gõ tay.
    const total = sample.waves.reduce((n, w) => n + w.expected, 0)
    expect(screen.getByText(String(total))).toBeInTheDocument()

    /* Đợt mặc định đều nằm trong bốn kênh E4 — chưa có gì để cảnh báo. Tên
       engine KHÔNG lên giao diện (luật 14): màn nói "hệ", không nói "E4". */
    expect(screen.queryByText(/chưa nối đường gửi/)).not.toBeInTheDocument()
    const [linkedin] = screen.getAllByRole('button', { name: 'LinkedIn' })
    if (!linkedin) throw new Error('Không có nút chọn kênh LinkedIn trong chuỗi đợt')
    fireEvent.click(linkedin)
    expect(screen.getAllByText(/Hệ chưa nối đường gửi cho LinkedIn/).length).toBeGreaterThan(0)
  })

  it('nút cuối là gửi duyệt, không phải gửi ngay — và chuỗi duyệt thêm được người', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()
    fireEvent.click(screen.getByRole('button', { name: 'Chiến dịch mới' }))

    const label = `Gửi ${HEAD_OF_SALES} duyệt`
    expect(screen.getByRole('button', { name: label })).toBeDisabled()
    // Nút xám phải nói ra nó đang chờ gì.
    expect(screen.getByText(/còn thiếu tên/)).toBeInTheDocument()

    /* Tìm ô theo NHÃN chứ không theo placeholder: placeholder suy từ nguồn mẫu
       trong fixture, đổi fixture là test đỏ vì lý do không liên quan. */
    fireEvent.change(screen.getByRole('textbox', { name: 'Tên' }), {
      target: { value: DRAFT_TEMPLATE.name },
    })
    expect(screen.getByRole('button', { name: label })).not.toBeDisabled()

    // Chuỗi duyệt thêm được mắt xích; người đầu vẫn là TP Kinh doanh.
    fireEvent.click(screen.getByRole('button', { name: 'Thêm người duyệt' }))
    const second = dasVina.actors.find((a) => a.name !== HEAD_OF_SALES)
    if (!second) throw new Error('Kịch bản chỉ có một người')
    fireEvent.click(screen.getByRole('button', { name: second.name }))
    expect(screen.getAllByText(second.name).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(screen.getByText(new RegExp(`chờ ${HEAD_OF_SALES} gật`))).toBeInTheDocument()
    // Gửi xong là có lối ra, và màn nói thẳng dòng này chưa lên bảng nguồn.
    expect(screen.getByText(/không lệnh gửi nào được phát/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Về sổ nguồn' })).toBeInTheDocument()
  })

  it('nút Sửa mở ĐÚNG màn tạo, đổ sẵn tên và chuỗi đợt của nguồn đang mở', async () => {
    renderScreen(<CampaignsPage />)
    await openBook()

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
})
