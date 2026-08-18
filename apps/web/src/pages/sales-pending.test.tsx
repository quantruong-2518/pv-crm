import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { SALES_MODULES } from '@/app/chrome'
import { renderScreen } from '@/test-utils'
import { SalesPendingPage } from './sales-pending'

/** Bộ bốn module là bảng CHỐT. Hai ca đầu khoá chính cái đó: đủ bốn, đúng số
 *  thứ tự, và module nào chưa dựng thì phải nói ra vướng gì — nút chết trên nav
 *  là thứ làm người xem tưởng sản phẩm hỏng chứ không phải chưa làm. */
describe('Module Sales chưa dựng', () => {
  it('bảng module có đủ bốn, đánh số 1–4, chỉ Lead là đã dựng', () => {
    expect(SALES_MODULES.map((m) => m.no)).toEqual([1, 2, 3, 4])

    const pending = SALES_MODULES.filter((m) => m.blocked)
    expect(pending.map((m) => m.label)).toEqual(['Thị trường', 'Performance', 'Số liệu & kế hoạch'])
  })

  it('mỗi module chưa dựng nói đúng thứ đang vướng của nó', () => {
    renderScreen(<SalesPendingPage />, { route: '/sales/market' })

    expect(screen.getByText(/Module 1 · Thị trường/)).toBeInTheDocument()
    expect(screen.getByText(/không thêm kịch bản thứ ba/)).toBeInTheDocument()
  })

  it('module 3 nêu đúng nợ "tiêu chí chấm từng vai", không nói chung chung', () => {
    renderScreen(<SalesPendingPage />, { route: '/sales/performance' })

    expect(screen.getByText(/Module 3 · Performance/)).toBeInTheDocument()
    expect(screen.getByText(/Tiêu chí chấm từng vai/)).toBeInTheDocument()
  })
})
