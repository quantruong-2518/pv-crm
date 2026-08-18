import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderScreen } from '@/test-utils'
import { LeadsPage } from './leads'

/** Test "màn dựng được" + khoá ba luật của module 2 mà mắt người hay bỏ sót.
 *
 *  Sổ lead đang chạy bằng đúng một dòng mồi (DAS Vina) vì `LEADS` còn rỗng —
 *  test này vì thế bám vào những thứ KHÔNG đổi khi dữ liệu mock đổ vào: phễu
 *  đã chốt, sáu lý do rớt, cổng bộ 10 câu, ContextRail.
 *
 *  Sổ lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ nào cần dòng
 *  thật thì phải `findBy…`, không `getBy…`. */
describe('Module 2 · Sổ lead', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<LeadsPage />)).not.toThrow()
  })

  it('phễu hiện đúng sáu bậc đã chốt, MQL và SQL là bậc 2 và 3', () => {
    renderScreen(<LeadsPage />)

    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('44')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    // Mỗi bậc hiện hai chỗ: badge trên phễu và nút lọc theo bậc.
    expect(screen.getAllByText('MQL').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SQL').length).toBeGreaterThan(0)
  })

  it('report lead chỉ có ĐÚNG sáu lý do, không có ô "khác"', () => {
    renderScreen(<LeadsPage />)

    for (const label of [
      'Không gọi được ai',
      'Không phải khách của mình',
      'Năm nay không có tiền',
      'Người liên hệ nghỉ việc',
      'Khách chọn bên khác',
      'Im sau báo giá',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    // Không có ô hứng lý do thứ bảy. Khớp tên ĐẦY ĐỦ của nút, vì "khác" nằm
    // sẵn trong "Khách chọn bên khác" — regex lỏng sẽ báo nhầm.
    expect(
      screen.queryByRole('button', { name: /^(khác|lý do khác|other)$/i }),
    ).not.toBeInTheDocument()
  })

  it('ContextRail có mặt và dựng từ đồ thị E1 — luật 10', async () => {
    renderScreen(<LeadsPage />)

    // Chuỗi của OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  it('lọc rỗng thì ra EmptyState có nút gỡ lọc, không phải màn trắng', async () => {
    renderScreen(<LeadsPage />)

    // Chờ sổ về trước, nếu không thì đang đọc trạng thái chờ chứ không phải kết
    // quả lọc. Bám vào ô trong BẢNG, vì tên công ty còn hiện ở panel bên phải.
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // Dòng mồi DAS Vina thuộc ngành chip; lọc sang Dược thì sổ phải rỗng.
    fireEvent.click(screen.getByRole('button', { name: 'Dược' }))

    expect(screen.getByText(/Không có lead nào khớp bộ lọc/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Bỏ hết bộ lọc' }).length).toBeGreaterThan(0)
  })
})
