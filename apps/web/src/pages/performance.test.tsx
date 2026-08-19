import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { percent } from '@pv/ui'
import {
  BD,
  BOOK_SPLIT,
  dasVina,
  EXIT_REASONS,
  FUNNEL,
  isRunning,
  LEADS,
  MARKETING,
} from '@pv/engines/fixtures/das-vina'
import { renderScreen } from '@/test-utils'
import { railChips } from '@/data/performance'
import { PerformancePage } from './performance'

/** Test "màn dựng được" + khoá bốn thứ của module 3 mà mắt người hay bỏ sót.
 *
 *  Số lấy qua `useQuery` nên lần render đầu là trạng thái chờ; mọi ca cần số
 *  thật đều phải `findBy…`, không `getBy…`.
 *
 *  Con số kỳ vọng lấy THẲNG từ fixture, không gõ lại: nếu ai đó sửa phễu thì
 *  test đỏ ở đúng chỗ nó sai, chứ không đỏ vì test cũ hơn dữ liệu. */
describe('Module 3 · Performance', () => {
  const lastStep = FUNNEL[FUNNEL.length - 1]!

  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<PerformancePage />)).not.toThrow()
  })

  it('tổng quan khớp phễu và phép cân của sổ lead', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByRole('region', { name: 'Tổng quan' }))

    // 100 đầu mối = 6 đã ký + 42 đang chạy + 52 đã ra khỏi luồng.
    expect(box.getByText(String(FUNNEL[0].count))).toBeInTheDocument()
    expect(box.getByText(String(lastStep.count))).toBeInTheDocument()
    expect(box.getByText(String(BOOK_SPLIT.running))).toBeInTheDocument()
    expect(box.getByText(String(BOOK_SPLIT.exited))).toBeInTheDocument()
  })

  it('khối theo vai có đủ bảy vai của kịch bản', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByRole('region', { name: 'Xét theo vai' })

    for (const actor of dasVina.actors) {
      expect(screen.getAllByText(actor.name).length).toBeGreaterThan(0)
    }
  })

  it('TP Kinh doanh không tính công trạng cá nhân, và ô của vai đó không trống', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByRole('region', { name: 'Xét theo vai' }))

    expect(box.getByText(/Không tính công trạng cá nhân/)).toBeInTheDocument()
    // Vai này vẫn phải thấy số của phòng — ô trống sẽ bị đọc thành "chưa làm gì".
    expect(box.getByText('Lead cả kỳ')).toBeInTheDocument()
  })

  it('thước chưa có dữ liệu nói thẳng "chưa đo được", không hiện số 0', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByRole('region', { name: 'Xét theo vai' })

    // Phản hồi BD → Marketing (1) + hai thước của Presales (2).
    expect(screen.getAllByText('chưa đo được').length).toBeGreaterThanOrEqual(3)
  })

  it('con số chuyển đổi ghi CẢ số tuyệt đối lẫn phần trăm', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByRole('region', { name: 'Top các con số chuyển đổi' }))

    expect(box.getByText(`${FUNNEL[0].count} → ${FUNNEL[1].count}`)).toBeInTheDocument()
    expect(box.getByText(percent(FUNNEL[1].count / FUNNEL[0].count))).toBeInTheDocument()
    expect(box.getByText(`${FUNNEL[1].count} → ${FUNNEL[2].count}`)).toBeInTheDocument()
  })

  it('top lý do rơi ghi cả count lẫn %, mẫu số là 52 lead đã rơi', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByRole('region', { name: 'Top các con số chuyển đổi' }))

    const top = [...EXIT_REASONS].sort((a, b) => b.count - a.count)[0]!
    const total = EXIT_REASONS.reduce((a, r) => a + r.count, 0)

    expect(box.getByText(top.label)).toBeInTheDocument()
    expect(box.getByText(String(top.count))).toBeInTheDocument()
    expect(box.getByText(percent(top.count / total))).toBeInTheDocument()
  })

  it('chọn một vai thì chỉ còn thẻ của vai đó', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByRole('region', { name: 'Xét theo vai' })

    // "Đơn chốt" là thước của vai Sale — chọn Marketing thì nó phải biến mất.
    expect(screen.getAllByText('Đơn chốt').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: MARKETING }))
    expect(screen.queryByText('Đơn chốt')).not.toBeInTheDocument()
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

  /* Công trạng ghi ở MỌI lần chạm, nên hai lead đã rơi vẫn đứng trong bảng của
     BD. Nhưng gọi cả nhóm là "đang giữ" là khai khống số lead sống của một
     người — ca này khoá đúng chữ. */
  it('nhãn của BD là "đã chạm", và tách rõ bao nhiêu lead còn trong luồng', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByRole('region', { name: 'Xét theo vai' }))

    const touched = LEADS.filter((l) => l.owner === BD)
    const stillIn = touched.filter(isRunning).length
    const dropped = touched.length - stillIn

    // Nếu fixture đổi tới mức BD không còn lead rơi nào thì ca này mất nghĩa.
    expect(dropped).toBeGreaterThan(0)
    expect(box.getByText(`Lead BD đã chạm · ${touched.length} dòng`)).toBeInTheDocument()
    expect(box.queryByText(/lead đang giữ/i)).not.toBeInTheDocument()
    expect(
      box.getByText(
        new RegExp(
          `${touched.length} lead đã chạm · ${stillIn} còn trong luồng · ${dropped} đã rơi`,
        ),
      ),
    ).toBeInTheDocument()
  })

  /* Fixture CÓ buổi demo (đơn đứng ở cột "Đã demo", phễu có bậc báo giá) — thứ
     nó thiếu là TRƯỜNG "ai đi cùng". Nói nhầm hai thứ đó là bịa dữ kiện. */
  it('Presales nói đúng thứ fixture thiếu: trường "ai đi cùng buổi demo"', async () => {
    renderScreen(<PerformancePage />)
    const box = within(await screen.findByRole('region', { name: 'Xét theo vai' }))

    expect(box.queryByText(/không ghi buổi demo nào/)).not.toBeInTheDocument()
    expect(box.getAllByText(/ai đi cùng buổi demo/).length).toBeGreaterThan(0)
  })

  it('khối AI chờ nút và có dòng "Chưa tạo gì cả" — luật 9', async () => {
    renderScreen(<PerformancePage />)
    const button = await screen.findByRole('button', { name: 'Dựng bản tóm tắt' })

    expect(screen.getByText(/Chưa tạo gì cả/)).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.queryByText(/Chưa tạo gì cả/)).not.toBeInTheDocument()
  })

  it('nói thẳng là không có trục thời gian', async () => {
    renderScreen(<PerformancePage />)
    await screen.findByRole('region', { name: 'Tổng quan' })

    expect(screen.getByText(/Không có trục tháng-quý-năm/)).toBeInTheDocument()
  })
})
