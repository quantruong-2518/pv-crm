import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomePage } from './home'

/** Test "màn dựng được".
 *
 *  `tsc` chỉ chứng minh code hợp kiểu, không chứng minh màn render nổi. Test
 *  này mount cả cây thật — AppShell · Sidebar · TopBar · 4 StatCard · 2
 *  BriefCard · AiAction — nên bắt được mọi lỗi runtime ở tầng dựng: prop thiếu,
 *  import vòng, component ném lỗi khi thiếu dữ liệu.
 *
 *  Nó cũng khoá vài chuỗi lấy thẳng từ file .dc.html: đổi số trên màn mà quên
 *  đổi spec thì test đỏ. */
describe('Màn 01 · Home / Morning brief', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => render(<HomePage />)).not.toThrow()
  })

  it('hiện lát cắt dữ liệu đúng của kịch bản Sao Đỏ', () => {
    render(<HomePage />)

    expect(screen.getByText(/Good morning, Mr\. Thắng/)).toBeInTheDocument()
    expect(screen.getByText('07:58')).toBeInTheDocument()
    expect(screen.getByText(/Sao Đỏ order — SO-0891/)).toBeInTheDocument()
  })

  it('khối AI có dòng căn cứ và nút xác nhận — luật 9, không bao giờ tự chạy', () => {
    render(<HomePage />)

    expect(screen.getByText(/Basis/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Do it/ })).toBeInTheDocument()
  })

  it('ContextRail có mặt — luật 10, bắt buộc trên mọi màn', () => {
    render(<HomePage />)

    expect(screen.getByText('HĐ-2607')).toBeInTheDocument()
    expect(screen.getByText('Supply · SO-0891')).toBeInTheDocument()
  })
})
