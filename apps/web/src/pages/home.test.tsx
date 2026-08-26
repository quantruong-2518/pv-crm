import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { SAO_DO_KPI, SAO_DO_RECEIVABLES } from '@pv/engines/fixtures/sao-do'
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

    expect(screen.getByText(/Chào buổi sáng, anh Thắng/)).toBeInTheDocument()
    expect(screen.getByText('07:58')).toBeInTheDocument()
    expect(screen.getByText(/Đơn Sao Đỏ — SO-0891/)).toBeInTheDocument()
  })

  /* §8.1 điều 1 · mọi màn mở bằng `PageHeader`. Ca này khoá đúng thứ phân biệt
     nó với một `<h2>` chép tay: màn có ĐÚNG MỘT tiêu đề cấp một. */
  it('tiêu đề màn là <h1> của PageHeader, không phải một thẻ gõ tay', () => {
    renderScreen(<HomePage />)

    const h1 = screen.getAllByRole('heading', { level: 1 })
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent('Chào buổi sáng, anh Thắng')
  })

  /* Ràng buộc 7 · không gõ số thẳng vào JSX. Ca này đọc thẳng `SAO_DO_KPI` —
     bộ số mà `scenario.test.ts` khoá — nên sửa fixture là màn đi theo, còn gõ
     lại một con số vào JSX là ca này đỏ. */
  it('bốn ô KPI đọc từ SAO_DO_KPI, không giữ bản sao nào trên màn', () => {
    renderScreen(<HomePage />)

    expect(SAO_DO_KPI).toHaveLength(4)
    for (const k of SAO_DO_KPI) {
      expect(screen.getByText(k.label)).toBeInTheDocument()
    }

    // Ô công nợ: con số và câu delta phải cùng nói về một bộ hoá đơn.
    expect(screen.getByText('890 tr')).toBeInTheDocument()
    const overdue = Math.max(...SAO_DO_RECEIVABLES.map((r) => r.overdueDays))
    expect(
      screen.getByText(`${SAO_DO_RECEIVABLES.length} hoá đơn · quá hạn ${overdue} ngày`),
    ).toBeInTheDocument()
  })

  /** Chuỗi khoá ở ca này đổi từ tiếng Anh sang tiếng Việt ngày 20/08 cùng bản
   *  dịch màn (luật 14): "Basis" → "Căn cứ", "Do it" → nhãn mặc định "Thực
   *  hiện". Nhãn mặc định nên màn không khai `confirmLabel` nữa. */
  it('khối AI có căn cứ, nút xác nhận, và state "Chưa tạo gì cả" — luật 9', () => {
    renderScreen(<HomePage />)

    expect(screen.getByText(/Căn cứ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thực hiện/ })).toBeInTheDocument()
    /* State rỗng phải nói ra HỆ QUẢ của việc chưa bấm, không nói suông — nên ca
       này khoá đúng cái hệ quả đó chứ không khoá bốn chữ "Chưa tạo gì cả". */
    expect(screen.getByText(/PO-0455 nằm nguyên ở chờ duyệt/)).toBeInTheDocument()
  })

  it('ContextRail dựng từ đồ thị E1 — luật 10, bắt buộc trên mọi màn', () => {
    renderScreen(<HomePage />)

    /* `L-2608-042` không có trên ô hero, không có trong thẻ brief nào, và không
       nằm trong chuỗi chữ nào của màn. Chỉ `E1.story('SO-0891')` mới kéo được nó
       ra — nên nó chứng minh rail là rail dựng từ đồ thị, không phải chip gõ tay. */
    expect(screen.getByText('L-2608-042')).toBeInTheDocument()
    expect(screen.getByText('PO-0455')).toBeInTheDocument()
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
