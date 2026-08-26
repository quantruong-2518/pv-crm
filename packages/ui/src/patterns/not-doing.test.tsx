import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotDoing, type NotDoingItem } from './not-doing'

const ITEMS: NotDoingItem[] = [
  { title: 'Không có bảng lead trên màn này', body: 'Lead thuộc module 2.' },
  { title: 'Không có nút "Gửi ngay"', body: 'Nút cuối của form là gửi duyệt.' },
  { title: 'Không vẽ đường theo thời gian', body: 'Kịch bản là một lát cắt đóng băng.' },
  { title: 'Không chấm điểm từng người ở đây', body: 'Bảng cắt theo thước, không theo người.' },
]

/** Lý do khối này tồn tại là cặp NỀN ↔ MÀU CHỮ, nên đó là thứ phải khoá.
 *  Ba bản rời trước đây lệch nhau đúng ở chỗ này, và lệch theo hướng vi phạm
 *  luật 13: trong InsetPanel (lớp trắng thứ hai trên .glass-a) thì
 *  `--muted-foreground` chỉ còn ~4,19:1. */
describe('NotDoing', () => {
  it('trong InsetPanel thì chữ phụ là --glass-foreground, không phải --muted-foreground', () => {
    render(<NotDoing surface="inset" items={ITEMS} />)
    const than = screen.getByText('Lead thuộc module 2.')
    expect(than.className).toContain('text-glass-foreground')
    expect(than.className).not.toContain('text-muted-foreground')
  })

  it('đi trần hoặc trên GlassCard thì --muted-foreground là đủ', () => {
    const { unmount } = render(<NotDoing surface="plain" items={ITEMS} />)
    expect(screen.getByText('Lead thuộc module 2.').className).toContain('text-muted-foreground')
    unmount()

    render(<NotDoing surface="card" items={ITEMS} />)
    expect(screen.getByText('Lead thuộc module 2.').className).toContain('text-muted-foreground')
  })

  it('quá 3 mục thì xếp hai cột từ lg; 3 mục trở xuống giữ một cột', () => {
    const { container, unmount } = render(<NotDoing items={ITEMS} />)
    expect(container.querySelector('ul')?.className).toContain('lg:grid-cols-2')
    unmount()

    const ba = render(<NotDoing items={ITEMS.slice(0, 3)} />)
    expect(ba.container.querySelector('ul')?.className).not.toContain('lg:grid-cols-2')
  })

  it('mỗi mục là một dòng, tiêu đề mặc định là "Cố tình không làm"', () => {
    render(<NotDoing items={ITEMS} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Cố tình không làm')
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})
