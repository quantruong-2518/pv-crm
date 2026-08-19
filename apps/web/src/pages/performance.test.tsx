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
  ROLE_KPI_MODEL,
} from '@pv/engines/fixtures/das-vina'
import { renderScreen } from '@/test-utils'
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
    const bar = await screen.findByLabelText('Chỉ số tổng quan')

    expect(bar).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: QUARTERS[QUARTERS.length - 1]?.label }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  /* CA QUAN TRỌNG NHẤT CỦA MÀN. Trục thời gian chỉ hợp lệ nếu cắt cả kỳ ra ĐÚNG
     những con số đã chốt — nếu không thì nó đang đẻ số không ai ký. */
  it('chọn cả kỳ thì phễu trên màn khớp từng bậc của FUNNEL', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Chỉ số tổng quan')

    fireEvent.click(screen.getByRole('button', { name: 'Năm' }))
    pickPeriod(wholePeriod?.label ?? '')

    const box = within(await screen.findByLabelText('Chỉ số tổng quan'))
    const step = (key: string) => String(FUNNEL.find((s) => s.key === key)?.count)

    expect(box.getAllByText(step('dau-moi')).length).toBeGreaterThan(0)
    expect(box.getAllByText(step('cong-ty-that')).length).toBeGreaterThan(0)
    expect(box.getAllByText(step('co-hoi')).length).toBeGreaterThan(0)
    expect(box.getAllByText(step('hop-dong')).length).toBeGreaterThan(0)
  })

  it('đổi kỳ thì số đổi theo — tháng 5 không cho ra số của cả kỳ', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Chỉ số tổng quan')

    const may = MONTHS[0]
    const inMay = LEADS.map(leadMilestones).filter((m) => m.vaoSo.slice(0, 7) === may?.key).length

    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
    pickPeriod(may?.label ?? '')

    const box = within(await screen.findByLabelText('Chỉ số tổng quan'))
    expect(box.getAllByText(String(inMay)).length).toBeGreaterThan(0)
    expect(inMay).toBeLessThan(FUNNEL[0].count)
  })

  it('thanh thời gian bấm được và nó chuyển kỳ về đúng tháng đó', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Chỉ số tổng quan')

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
    await screen.findByLabelText('Chỉ số tổng quan')

    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
    pickPeriod(MONTHS[1]?.label ?? '')
    expect(
      within(await screen.findByLabelText('Chỉ số tổng quan')).getAllByText(
        new RegExp(`so với ${MONTHS[0]?.label}`, 'i'),
      ).length,
    ).toBeGreaterThan(0)

    pickPeriod(MONTHS[0]?.label ?? '')
    expect(
      within(await screen.findByLabelText('Chỉ số tổng quan')).getAllByText(
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
    await screen.findByLabelText('Chỉ số tổng quan')

    for (const month of MONTHS) {
      fireEvent.click(screen.getByRole('button', { name: 'Tháng' }))
      pickPeriod(month.label)

      const box = within(await screen.findByLabelText('Chỉ số tổng quan'))
      for (const rate of box.getAllByText(/^\d+%$/)) {
        expect(Number(rate.textContent?.replace('%', ''))).toBeLessThanOrEqual(100)
      }
    }
  })

  it('không còn khối "Cố tình không làm" trên màn này', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByLabelText('Chỉ số tổng quan')

    expect(screen.queryByText('Cố tình không làm')).not.toBeInTheDocument()
  })

  it('số chụp tại lát cắt phải tự khai là số chụp', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByLabelText('Chỉ số tổng quan'))

    // Giá trị đang mở và đơn đang mục không có ngày để cắt theo kỳ.
    expect(box.getAllByText(/số chụp tại 17\/08/).length).toBeGreaterThanOrEqual(2)
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
})
