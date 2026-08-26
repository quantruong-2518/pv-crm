import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingBlock } from './loading-block'
import { TableSkeleton } from './table-skeleton'

/** Khung chờ chỉ có một luật: cao xấp xỉ nội dung thật. Hai bộ dưới khoá đúng
 *  phép tính đó — dải là aria-hidden nên phải đo bằng DOM, không bằng vai. */
describe('LoadingBlock', () => {
  it('mỗi dải cao đúng `height`, số dải đúng `lines`', () => {
    const { container } = render(<LoadingBlock height={40} lines={2} />)
    const dai = container.querySelectorAll('[aria-hidden]')
    expect(dai).toHaveLength(2)
    expect((dai[0] as HTMLElement).style.height).toBe('40px')
    expect((dai[1] as HTMLElement).style.height).toBe('40px')
  })

  it('lệch pha 200ms mỗi dải', () => {
    const { container } = render(<LoadingBlock height={32} lines={3} />)
    const dai = container.querySelectorAll('[aria-hidden]')
    expect((dai[1] as HTMLElement).style.animationDelay).toBe('200ms')
    expect((dai[2] as HTMLElement).style.animationDelay).toBe('400ms')
  })

  it('có câu đọc cho trình đọc màn hình — chờ khác rỗng', () => {
    render(<LoadingBlock height={96} label="Đang tải sổ nguồn" />)
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải sổ nguồn')
  })
})

describe('TableSkeleton', () => {
  it('mặc định 3 dòng, mỗi dòng cao 44px — đúng h-11 của DataTable', () => {
    render(<TableSkeleton />)
    const dong = Array.from(screen.getByRole('status').children).filter(
      (el) => el.tagName === 'DIV',
    )
    expect(dong).toHaveLength(3)
    expect((dong[0] as HTMLElement).style.height).toBe('44px')
  })

  it('có dải tiêu đề thì thêm đúng một vạch nữa', () => {
    const { container } = render(<TableSkeleton header rows={2} />)
    expect(container.querySelectorAll('[aria-hidden]')).toHaveLength(3)
  })
})
