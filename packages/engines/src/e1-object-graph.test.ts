import { describe, expect, it } from 'vitest'
import { createObjectGraph } from './e1-object-graph'
import { saoDo } from './fixtures/sao-do'

describe('E1 · đồ thị object', () => {
  it('dựng đúng chuỗi câu chuyện mà ContextRail cần', () => {
    // CLAUDE.md luật 10 + AGENTS §14 ghi thẳng chuỗi này ra:
    // HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042
    const codes = saoDo.graph.story('WO-1180').map((o) => o.code)

    expect(codes).toContain('HĐ-2607')
    expect(codes).toContain('SO-0891')
    expect(codes).toContain('WO-1180')
    expect(codes).toContain('PO-0455')
    expect(codes).toContain('L-2608-042')

    // Thứ tự là thứ tự SINH RA, không phải thứ tự khai báo.
    expect(codes.indexOf('HĐ-2607')).toBeLessThan(codes.indexOf('SO-0891'))
    expect(codes.indexOf('SO-0891')).toBeLessThan(codes.indexOf('WO-1180'))
    expect(codes.indexOf('PO-0455')).toBeLessThan(codes.indexOf('L-2608-042'))
  })

  it('trả cùng một kết quả ở mọi lần gọi — ContextRail không được nhảy thứ tự', () => {
    const a = saoDo.graph.story('SO-0891').map((o) => o.code)
    const b = saoDo.graph.story('SO-0891').map((o) => o.code)
    expect(a).toEqual(b)
  })

  it('đi từ bất kỳ mắt xích nào cũng ra cùng một câu chuyện', () => {
    const fromTop = saoDo.graph.story('HĐ-2607').map((o) => o.code)
    const fromBottom = saoDo.graph.story('L-2608-042').map((o) => o.code)
    expect(fromBottom).toEqual(fromTop)
  })

  it('object lạ thì trả mảng rỗng, không ném lỗi giữa lúc render', () => {
    expect(saoDo.graph.story('SO-9999')).toEqual([])
  })

  it('không cho hai object trùng mã trong cùng một kịch bản', () => {
    const twin = { code: 'SO-0001', kind: 'SO', branch: 'Supply', label: 'x' } as const
    expect(() => createObjectGraph([twin, twin], [])).toThrow(/trùng nhau/)
  })

  it('không cho cạnh trỏ tới object không tồn tại', () => {
    expect(() =>
      createObjectGraph(
        [{ code: 'SO-0001', kind: 'SO', branch: 'Supply', label: 'x' }],
        [{ from: 'SO-0001', to: 'WO-9999', kind: 'sinh-ra' }],
      ),
    ).toThrow(/không tồn tại/)
  })
})
