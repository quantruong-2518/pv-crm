import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { percent } from '@pv/ui'
import {
  BOOK_SPLIT,
  dasVina,
  FUNNEL,
  HANDOFF_SLA,
  LEADS,
  leadMilestones,
  MARKETING,
  ROLE_KPI_MODEL,
  sourcesOwnedBy,
} from '@pv/engines/fixtures/das-vina'
import { renderRoutes, renderScreen } from '@/test-utils'
import { railChips } from '@/data/performance'
import { MONTHS, QUARTERS, YEARS } from '@/data/period'
import { PerformancePage } from './performance'

/** Test "màn dựng được" + khoá những thứ của module 3 mà mắt người hay bỏ sót.
 *
 *  Số lấy qua `useQuery` nên lần render đầu là trạng thái chờ; mọi ca cần số
 *  thật đều phải `findBy…`, không `getBy…`.
 *
 *  Con số kỳ vọng lấy THẲNG từ fixture, không gõ lại: ai đó sửa phễu thì test
 *  đỏ ở đúng chỗ nó sai, chứ không đỏ vì test cũ hơn dữ liệu. */
describe('Module 3 · Performance', () => {
  /** Kỳ rộng nhất kịch bản có — chọn nó thì phễu trên màn phải bằng `FUNNEL`. */
  const wholePeriod = YEARS[YEARS.length - 1]

  const pickPeriod = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))

  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<PerformancePage />)).not.toThrow()
  })

  it('mở màn ra là quý chứa lát cắt, không phải cả kỳ', async () => {
    renderScreen(<PerformancePage />)
    const bar = await screen.findByLabelText('Thước của phòng trong kỳ')

    expect(bar).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: QUARTERS[QUARTERS.length - 1]?.label }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  /* CA QUAN TRỌNG NHẤT CỦA MÀN. Trục thời gian chỉ hợp lệ nếu cắt cả kỳ ra ĐÚNG
     những con số đã chốt — nếu không thì nó đang đẻ số không ai ký. */
  it('chọn cả kỳ thì phễu trên màn khớp từng bậc của FUNNEL', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Thước của phòng trong kỳ')

    fireEvent.click(screen.getByRole('button', { name: 'Năm' }))
    pickPeriod(wholePeriod?.label ?? '')

    const box = within(await screen.findByLabelText('Thước của phòng trong kỳ'))
    const step = (key: string) => String(FUNNEL.find((s) => s.key === key)?.count)

    expect(box.getAllByText(step('dau-moi')).length).toBeGreaterThan(0)
    expect(box.getAllByText(step('cong-ty-that')).length).toBeGreaterThan(0)
    expect(box.getAllByText(step('co-hoi')).length).toBeGreaterThan(0)
    expect(box.getAllByText(step('hop-dong')).length).toBeGreaterThan(0)
  })

  it('đổi kỳ thì số đổi theo — tháng 5 không cho ra số của cả kỳ', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Thước của phòng trong kỳ')

    const may = MONTHS[0]
    const inMay = LEADS.map(leadMilestones).filter((m) => m.vaoSo.slice(0, 7) === may?.key).length

    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
    pickPeriod(may?.label ?? '')

    const box = within(await screen.findByLabelText('Thước của phòng trong kỳ'))
    expect(box.getAllByText(String(inMay)).length).toBeGreaterThan(0)
    expect(inMay).toBeLessThan(FUNNEL[0].count)
  })

  it('thanh thời gian bấm được và nó chuyển kỳ về đúng tháng đó', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Thước của phòng trong kỳ')

    const july = MONTHS[2]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${july?.short}$`) }))

    expect(await screen.findByText(july?.label ?? '', { exact: false })).toBeInTheDocument()
  })

  it('bộ lọc chức năng xếp theo vòng đời và lọc đúng vai', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    // Ba Sale nằm cùng một nhóm — lọc 'Sale' phải còn đúng ba dòng.
    const sales = dasVina.actors.filter((a) => a.role.startsWith('Sale'))
    fireEvent.click(box.getByRole('button', { name: /^Sale/ }))

    for (const actor of sales) expect(box.getByText(actor.name)).toBeInTheDocument()
    expect(box.queryByText('Vũ Minh Châu')).not.toBeInTheDocument()
  })

  it('người hiện dạng LIST, không phải bảy thẻ chi tiết trải màn', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    for (const actor of dasVina.actors.filter((a) => a.branches.includes('Sales'))) {
      expect(box.getByText(actor.name)).toBeInTheDocument()
    }
    // Bảng bằng chứng của từng người chỉ có trong drawer, không nằm sẵn trên màn.
    expect(screen.queryByText(/Đơn đang mở · tốc độ qua cột/)).not.toBeInTheDocument()
  })

  it('bấm một dòng thì mở drawer KPI của đúng người đó', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText('Đỗ Quang Huy'))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getByText('Đỗ Quang Huy')).toBeInTheDocument()
    expect(drawer.getByText('Đơn đang mở · tốc độ qua cột')).toBeInTheDocument()
  })

  it('cùng một vai thì cùng một bộ thước — hai Sale đọc y hệt nhau', async () => {
    const labels = async (name: string) => {
      const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))
      fireEvent.click(box.getByText(name))
      const drawer = within(await screen.findByRole('dialog'))
      const sale = ROLE_KPI_MODEL.find((r) => r.role === 'Sale')
      for (const kpi of sale?.kpis ?? []) {
        expect(drawer.getAllByText(kpi.label).length).toBeGreaterThan(0)
      }
      fireEvent.click(drawer.getAllByRole('button', { name: 'Đóng' })[0] as HTMLElement)
    }

    renderScreen(<PerformancePage />)
    await labels('Đỗ Quang Huy')
    await labels('Nguyễn Khánh Linh')
  })

  it('drawer trả lời "còn bao lâu nữa mới đạt" bằng ba mốc ngày · tháng · quý', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText('Lê Hoàng Nam'))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getByText('Còn bao lâu nữa mới đạt')).toBeInTheDocument()
    expect(drawer.getByText(/Hôm nay ·/)).toBeInTheDocument()
    expect(drawer.getAllByText(/còn thiếu/).length).toBeGreaterThan(0)
    expect(drawer.getAllByText(/còn \d+ ngày/).length).toBeGreaterThan(0)
  })

  it('ai cũng mở được drawer của người khác — không có cửa quyền nào ở đây', async () => {
    // Ba Sale là vai `ownOnly`; đứng ở phiên của Sale vẫn phải xem được vai khác.
    renderScreen(<PerformancePage />, { actorId: 'u-huy' })
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText('Nguyễn Khánh Linh'))
    expect(
      within(await screen.findByRole('dialog')).getByText('Nguyễn Khánh Linh'),
    ).toBeInTheDocument()
  })

  it('vai chưa có nguồn số nói thẳng "chưa đo được", không hiện số 0', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText('Phạm Diệu Anh'))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getAllByText('chưa đo được').length).toBeGreaterThan(0)
    expect(drawer.getAllByText(/ai đi cùng buổi demo/).length).toBeGreaterThan(0)
  })

  it('TP Kinh doanh không chấm cá nhân, và ô của vai đó không trống', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText('Trần Thu Hà'))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getByText(/Không tính công trạng cá nhân/)).toBeInTheDocument()
    expect(drawer.getByText('Lead vào sổ trong kỳ')).toBeInTheDocument()
  })

  it('SLA bàn giao chỉ có chặng đo được, không bịa chặng sau bán', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Dòng chảy'))

    for (const leg of HANDOFF_SLA) expect(box.getByText(leg.label)).toBeInTheDocument()
    expect(box.queryByText(/Sales → Onboarding \(/)).not.toBeInTheDocument()
  })

  it('lý do rời luồng ghi cả count lẫn %, mẫu số là lead rơi TRONG KỲ', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Dòng chảy')

    fireEvent.click(screen.getByRole('button', { name: 'Năm' }))
    pickPeriod(wholePeriod?.label ?? '')

    const box = within(await screen.findByLabelText('Dòng chảy'))
    expect(box.getByText(new RegExp(`${BOOK_SPLIT.exited} lead rơi trong kỳ`))).toBeInTheDocument()
  })

  it('kỳ rỗng thì nói ra vì sao rỗng và mở đường đi tiếp, không để ô trắng', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Dòng chảy')

    // Tháng 8 không lead nào rơi — đây là kỳ rỗng thật của kịch bản.
    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
    pickPeriod(MONTHS[MONTHS.length - 1]?.label ?? '')

    const box = within(await screen.findByLabelText('Dòng chảy'))
    expect(box.getByText(/Không lead nào ra khỏi luồng/)).toBeInTheDocument()
    expect(box.getByRole('button', { name: 'Xem cả kỳ' })).toBeInTheDocument()
  })

  it('thẻ số có delta khi có kỳ trước, và KHÔNG có delta ở kỳ đầu', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Thước của phòng trong kỳ')

    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
    pickPeriod(MONTHS[1]?.label ?? '')
    expect(
      within(await screen.findByLabelText('Thước của phòng trong kỳ')).getAllByText(
        new RegExp(`so với ${MONTHS[0]?.label}`, 'i'),
      ).length,
    ).toBeGreaterThan(0)

    pickPeriod(MONTHS[0]?.label ?? '')
    expect(
      within(await screen.findByLabelText('Thước của phòng trong kỳ')).getAllByText(
        /kỳ đầu — chưa có mốc so/,
      ).length,
    ).toBeGreaterThan(0)
  })

  it('khối AI chờ nút và có dòng "Chưa tạo gì cả" — luật 9', async () => {
    renderScreen(<PerformancePage />)
    const button = await screen.findByRole('button', { name: 'Dựng bản tóm tắt' })

    expect(screen.getByText(/Chưa tạo gì cả/)).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.queryByText(/Chưa tạo gì cả/)).not.toBeInTheDocument()
  })

  it('ContextRail có mặt và dựng từ đồ thị E1 — luật 10', async () => {
    renderScreen(<PerformancePage />)

    // Chuỗi của đơn lớn nhất đang mở: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  /* Chín trên mười đơn của sổ cơ hội KHÔNG có trong đồ thị object. Đơn lớn nhất
     đổi mã là `story()` trả rỗng — rail phải còn một chip, không được biến mất
     im lặng (luật 10). Ca này là thứ duy nhất giữ nhánh đó sống. */
  it('rail vẫn còn một chip khi đơn lớn nhất chưa có trong đồ thị — luật 10', () => {
    const fallback = railChips([], 'OP-9999')

    expect(fallback).toHaveLength(1)
    expect(fallback[0]?.code).toBe('OP-9999')
    expect(fallback[0]?.source).toBe(false)
  })

  it('tỷ lệ chuyển đổi đọc trên LỨA nên phễu không bao giờ phình ở bậc dưới', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Thước của phòng trong kỳ')

    for (const month of MONTHS) {
      fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
      pickPeriod(month.label)

      const box = within(await screen.findByLabelText('Thước của phòng trong kỳ'))
      for (const rate of box.getAllByText(/^\d+%$/)) {
        expect(Number(rate.textContent?.replace('%', ''))).toBeLessThanOrEqual(100)
      }
    }
  })

  /* Tới 20/08 màn vẽ phễu hai lần: ô hero đầu màn, và một bản y hệt trong
     drawer của vai không chấm cá nhân. Hai bản cùng đọc `data.funnel` là hai
     chỗ để lệch nhau. Ca này giữ cho bản thứ hai không mọc lại. */
  it('phễu vẽ ĐÚNG MỘT LẦN — drawer dẫn sang phễu đầu màn, không vẽ lại', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText('Trần Thu Hà'))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getByText(/Phễu của phòng trong kỳ nằm ở khối/)).toBeInTheDocument()
    // Nhãn bậc phễu chỉ được có mặt một lần trên cả cây, kể cả khi drawer mở.
    expect(screen.getAllByText('SQL — vào sổ cơ hội')).toHaveLength(1)
  })

  /* Luật 10 · rail biến mất trong nhịp chờ cũng là rail biến mất. Vì thế chuỗi
     object dựng ngoài `useQuery` và phải có mặt ngay lần render đầu. */
  it('ContextRail có mặt ngay trong nhịp màn đang chờ số — luật 10', () => {
    renderScreen(<PerformancePage />)

    expect(screen.getByText('AC-0142')).toBeInTheDocument()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })

  it('SLA không dùng dấu gạch để nói "chưa đo được"', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Dòng chảy'))

    expect(box.queryAllByText('—')).toHaveLength(0)
  })

  /* Ba lý do khác nhau làm cột Tiến độ không có thanh. Vai Presales chưa có
     nguồn số — ô phải nói "chưa đo được", KHÔNG phải 0% và không phải "chưa
     chấm" (một chữ gộp cả ba lý do lại). */
  it('cột tiến độ nói "chưa đo được" cho vai chưa có nguồn số', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    expect(box.getAllByText('chưa đo được').length).toBeGreaterThan(0)
    expect(box.queryByText('chưa chấm')).not.toBeInTheDocument()
  })

  it('không còn khối "Cố tình không làm" trên màn này', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Thước của phòng trong kỳ')

    expect(screen.queryByText('Cố tình không làm')).not.toBeInTheDocument()
  })

  it('số chụp tại lát cắt phải tự khai là số chụp', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Thước của phòng trong kỳ'))

    // Giá trị đang mở và đơn đang mục không có ngày để cắt theo kỳ.
    expect(box.getAllByText(/số chụp tại 17\/08/).length).toBeGreaterThanOrEqual(2)
  })

  /* Câu "chi phí của một nguồn không chia được theo ngày" đúng cho tới 20/08,
     khi mỗi dòng chi có `day`. Giữ lại nó là để trên màn một lời thú nhận đã
     sai — kiểu nợ tệ nhất, vì nó trông như một quyết định có chủ ý. */
  it('bảng nguồn của Marketing cắt theo kỳ, và khai phần chi không chia nhỏ được', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText(MARKETING))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getByText(/Cắt theo kỳ đang xem, cả lead lẫn tiền/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/không chia được theo ngày/)
  })

  /* `chua-chot` KHÁC `chua-do`: số đã đo xong và hiện đủ, chỉ cái NHÃN bị hoãn
     vì kỳ chưa đóng. Gộp hai trạng thái là giấu mất một con số đã có; chấm nó
     là chấm độ trễ chứ không chấm hiệu quả. */
  it('thước chốt muộn hiện đủ số mà không chấm Đạt/Trượt khi kỳ chưa đóng', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText(MARKETING))
    const drawer = within(await screen.findByRole('dialog'))

    const late = ROLE_KPI_MODEL.find((r) => r.role === 'Marketing')?.kpis.find(
      (kpi) => kpi.settlesLate,
    )
    expect(late).toBeDefined()
    expect(drawer.getByText(late?.label ?? '')).toBeInTheDocument()
    expect(drawer.getAllByText('Chưa chốt').length).toBeGreaterThan(0)
    expect(drawer.getByText(/chưa chấm Đạt hay Trượt/)).toBeInTheDocument()
  })

  it('mục tiêu tỷ lệ KHÔNG bị nhân theo độ dài kỳ', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText('Đỗ Quang Huy'))
    const drawer = within(await screen.findByRole('dialog'))

    // Quý là kỳ hai tháng; win rate 31% phải vẫn là 31%, không thành 62%.
    const winRate = ROLE_KPI_MODEL.find((r) => r.role === 'Sale')?.kpis.find(
      (k) => k.key === 'win-rate',
    )
    expect(drawer.getByText(`mục tiêu ${percent(winRate?.monthlyTarget ?? 0)}`)).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Vòng soát 21/08 — những chỗ màn từng nói thiếu hoặc nói ngược
  // -------------------------------------------------------------------------

  /** Hàng của một người trong bảng nhân sự. */
  const personRow = async (name: string) => {
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))
    const row = box.getByText(name).closest('[role="row"]')
    if (!row) throw new Error(`Không tìm thấy hàng của ${name}`)
    return within(row as HTMLElement)
  }

  /* Một thước CHỤP tại 17/08 không được quyết một cái nhãn theo kỳ: nó đọc ra
     y hệt nhau ở mọi kỳ, kể cả tháng 5 — tháng màn đồng thời in "Hợp đồng ký
     trong kỳ = 0" mà vẫn chấm mỗi Sale bằng pipeline của ngày 17/08. Nhãn ấy
     chảy thẳng vào `behind` và vào khối AI gửi Trưởng phòng.

     Sale có bốn thước: Đơn chốt · Giá trị đơn (số chụp) · Win rate · Tốc độ qua
     cột (lớp chất lượng). Bỏ lớp chất lượng và bỏ số chụp thì ở kỳ mặc định Huy
     chỉ còn Đơn chốt chấm được — Win rate kỳ này chưa có mẫu số. Con số "1/1"
     là chỗ ca này bám: cho số chụp chấm điểm trở lại thì nó thành "2/2". */
  it('thước là SỐ CHỤP không nằm trong mẫu số chấm điểm của kỳ', async () => {
    renderScreen(<PerformancePage />)

    expect((await personRow('Đỗ Quang Huy')).getByText('1/1 thước')).toBeInTheDocument()

    // Thước vẫn HIỆN trong drawer, và tự khai là số chụp — chỉ không chấm điểm.
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))
    fireEvent.click(box.getByText('Đỗ Quang Huy'))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getByText('Giá trị đơn')).toBeInTheDocument()
    expect(drawer.getAllByText(/số chụp tại 17\/08/).length).toBeGreaterThan(0)
  })

  it('nhãn của một Sale đổi được khi đổi kỳ, không đứng yên theo lát cắt', async () => {
    renderScreen(<PerformancePage />)

    expect((await personRow('Đỗ Quang Huy')).getByText('Đạt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
    pickPeriod(MONTHS[0]?.label ?? '')

    expect((await personRow('Đỗ Quang Huy')).getByText('Cần cải thiện')).toBeInTheDocument()
  })

  it('kết luận của màn đứng ở đầu, không chỉ trong câu quảng cáo của khối AI', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Thước của phòng trong kỳ'))

    expect(box.getByText(/dưới mục tiêu kỳ/)).toBeInTheDocument()
    expect(box.getByText(/phễu hẹp nhất ở/)).toBeInTheDocument()
  })

  it('bảng người mở đầu bằng người đang tắc, khép lại bằng người chưa chấm được', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    // Hàng đầu của DataTable là hàng tiêu đề.
    const rows = box.getAllByRole('row').slice(1)
    expect(within(rows[0] as HTMLElement).getByText('Cần cải thiện')).toBeInTheDocument()
    expect(
      within(rows[rows.length - 1] as HTMLElement).getByText('Chưa đo được'),
    ).toBeInTheDocument()
  })

  /* "2/3 thước" nói CÓ trượt mà không nói trượt ở đâu — và ô ngay bên trái có
     thể đang vẽ thanh xanh đầy (31/24) vì thước chính vẫn đạt. */
  it('ô trạng thái nói TÊN thước đang trượt khi chỉ có một cái trượt', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Hiệu suất theo nhân sự')

    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
    pickPeriod(MONTHS[0]?.label ?? '')

    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))
    const marked = box.getAllByText(/^trượt: /)
    const labels = ROLE_KPI_MODEL.flatMap((r) => r.kpis.map((k) => k.label))

    expect(marked.length).toBeGreaterThan(0)
    for (const el of marked) {
      expect(labels).toContain((el.textContent ?? '').replace('trượt: ', ''))
    }
  })

  it('phễu nói ra nó là phần nào của sổ lead cả kỳ', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Thước của phòng trong kỳ'))

    expect(box.getByText(new RegExp(`trên ${LEADS.length} lead cả sổ`))).toBeInTheDocument()
  })

  /* Quyết định D + G: `ProspectBatch.cost` nằm TRONG `Source.cost`. Câu cũ viết
     "không phải tiền mua dòng của lô danh sách" nên đọc ra thành hai thước rời
     nhau, và người đi tìm 31 triệu ở ngoài 300 triệu sẽ không thấy nó ở đâu. */
  it('nhãn tiền của bảng nguồn khai QUAN HỆ với tiền mua dòng, không loại trừ nó', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))

    fireEvent.click(box.getByText(MARKETING))
    const drawer = within(await screen.findByRole('dialog'))

    expect(drawer.getByText(/là một phần nằm trong số này/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/không phải tiền mua dòng/)
  })

  /* Vòng "nguồn → chia việc → đo → chỉnh" đứt đúng ở khớp "đo": tới 20/08 cả
     màn không có một `navigate` nào. Ba ca dưới khoá ba đường mới, và cả ba đều
     tới một màn CÓ THẬT trong `routes.tsx`. */
  it('màn mở đường sang bước "chỉnh" của vòng — nút đi tới màn Kế hoạch', async () => {
    renderRoutes(
      [
        { path: '/sales/performance', element: <PerformancePage /> },
        { path: '/sales/plan', element: <p>Màn kế hoạch</p> },
      ],
      { route: '/sales/performance' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /Xem kế hoạch của kỳ/ }))
    expect(await screen.findByText('Màn kế hoạch')).toBeInTheDocument()
  })

  it('dòng bảng nguồn trong drawer mở hồ sơ nguồn', async () => {
    renderRoutes(
      [
        { path: '/sales/performance', element: <PerformancePage /> },
        { path: '/sales/campaigns/:code', element: <p>Hồ sơ nguồn</p> },
      ],
      { route: '/sales/performance' },
    )

    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))
    fireEvent.click(box.getByText(MARKETING))

    const drawer = within(await screen.findByRole('dialog'))
    fireEvent.click(drawer.getByText(sourcesOwnedBy(MARKETING)[0]?.code ?? ''))

    expect(await screen.findByText('Hồ sơ nguồn')).toBeInTheDocument()
  })

  it('dòng bảng lead của BD trong drawer mở hồ sơ lead', async () => {
    renderRoutes(
      [
        { path: '/sales/performance', element: <PerformancePage /> },
        { path: '/sales/leads/:code', element: <p>Hồ sơ lead</p> },
      ],
      { route: '/sales/performance' },
    )

    const box = within(await screen.findByLabelText('Hiệu suất theo nhân sự'))
    fireEvent.click(box.getByText('Lê Hoàng Nam'))

    const drawer = within(await screen.findByRole('dialog'))
    const rows = drawer.getAllByRole('row')
    fireEvent.click(rows[rows.length - 1] as HTMLElement)

    expect(await screen.findByText('Hồ sơ lead')).toBeInTheDocument()
  })
})
