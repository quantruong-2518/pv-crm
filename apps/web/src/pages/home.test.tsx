import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { SALES_MODULES } from '@/app/chrome'
import { renderScreen } from '@/test-utils'
import { HomePage } from './home'

/** Test "màn dựng được".
 *
 *  `tsc` chỉ chứng minh code hợp kiểu, không chứng minh màn render nổi. Test
 *  này mount cả cây thật — AppShell · Sidebar · TopBar · 4 StatCard · 2
 *  BriefCard · AiAction — nên bắt được mọi lỗi runtime ở tầng dựng: prop thiếu,
 *  import vòng, component ném lỗi khi thiếu dữ liệu.
 *
 *  Nó cũng khoá vài chuỗi lấy thẳng từ bản vẽ gốc: đổi số trên màn mà quên
 *  đổi spec thì test đỏ. */
describe('Màn 01 · Home / Morning brief', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<HomePage />)).not.toThrow()
  })

  it('hiện lát cắt dữ liệu đúng của kịch bản Sao Đỏ', () => {
    renderScreen(<HomePage />)

    expect(screen.getByText(/Good morning, Mr\. Thắng/)).toBeInTheDocument()
    expect(screen.getByText('07:58')).toBeInTheDocument()
    expect(screen.getByText(/Sao Đỏ order — SO-0891/)).toBeInTheDocument()
  })

  it('khối AI có dòng căn cứ và nút xác nhận — luật 9, không bao giờ tự chạy', () => {
    renderScreen(<HomePage />)

    expect(screen.getByText(/Basis/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Do it/ })).toBeInTheDocument()
  })

  it('ContextRail có mặt — luật 10, bắt buộc trên mọi màn', () => {
    renderScreen(<HomePage />)

    expect(screen.getByText('HĐ-2607')).toBeInTheDocument()
    expect(screen.getByText('Supply · SO-0891')).toBeInTheDocument()
  })

  /** Năm từ 19/08 — module 1 đổi tên thành "Chiến dịch & Sự kiện" và thêm
   *  module 5 · Cấu hình (docs/kien-truc-san-pham.md · "Năm module Pebble Sales").
   *  Đọc thẳng từ SALES_MODULES nên đổi bảng đó là test tự đi theo. */
  it('nav có ĐỦ năm module Sales, không phải một mục Kinh doanh', () => {
    renderScreen(<HomePage />)

    /* Từ 19/08 nav là hai tầng: module nằm trong dropdown của nhánh, không trải
       sẵn trên màn. Phải MỞ nhánh ra rồi mới đếm — trải sẵn chín ứng dụng cùng
       module của chúng là thứ đã làm nav dọc cũ vỡ. */
    const branch = screen.getByRole('button', { name: /Kinh doanh/ })
    expect(branch).toHaveAttribute('aria-haspopup', 'menu')
    expect(branch).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(branch)
    expect(branch).toHaveAttribute('aria-expanded', 'true')

    expect(SALES_MODULES).toHaveLength(5)
    const menu = screen.getByRole('menu', { name: 'Kinh doanh' })
    for (const m of SALES_MODULES) {
      expect(within(menu).getByRole('menuitem', { name: m.label })).toBeEnabled()
    }
  })

  it('nhánh không có license thì tự khoá, không gõ cứng locked từng dòng', () => {
    renderScreen(<HomePage />)

    // Trần Thu Hà chỉ có One + Sales.
    expect(screen.getByRole('button', { name: /Cung ứng/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Tài chính/ })).toBeDisabled()
  })
})
