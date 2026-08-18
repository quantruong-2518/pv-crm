import { describe, expect, it } from 'vitest'
import { saoDo } from './sao-do'
import { dasVina, EXIT_REASONS, FUNNEL, isRotting, OPEN_DEALS, PIPELINE_STAGES } from './das-vina'

/** Khoá mọi con số đã CHỐT trong CLAUDE.md.
 *
 *  Đây là loại test đáng giá nhất của repo này: dữ liệu demo không có compiler
 *  nào gác, và một con số sai trên màn demo tốn nhiều hơn một bug. Sửa số nào
 *  ở đây thì phải sửa CLAUDE.md trước — test đỏ là lời nhắc đúng lúc. */

describe('Kịch bản đóng băng — con số đã chốt', () => {
  it('hai kịch bản, không hơn, và không dùng chung mã object nào', () => {
    const codes = new Set(saoDo.objects.map((o) => o.code))
    const overlap = dasVina.objects.filter((o) => codes.has(o.code))
    expect(overlap).toEqual([])
  })

  it('lát cắt thời gian đúng như CLAUDE.md', () => {
    expect(saoDo.frozenAt).toBe('2026-08-10T07:58:00+07:00')
    expect(dasVina.frozenAt).toBe('2026-08-17T09:10:00+07:00')
  })

  it('Sao Đỏ: đơn 1,84 tỷ và đúng một đầu mối bên khách', () => {
    expect(saoDo.graph.get('SO-0891')?.amount).toBe(1_840_000_000)
    expect(saoDo.graph.get('HĐ-2607')?.amount).toBe(1_840_000_000)
  })

  it('DAS Vina: BG-1077 · 4,2 tỷ/năm', () => {
    expect(dasVina.graph.get('BG-1077')?.amount).toBe(4_200_000_000)
    expect(dasVina.graph.get('OP-0288')?.amount).toBe(4_200_000_000)
  })
})

describe('Sổ 10 cơ hội đang mở', () => {
  it('đúng 10 đơn, tổng 18,5 tỷ', () => {
    expect(OPEN_DEALS).toHaveLength(10)
    const total = OPEN_DEALS.reduce((s, d) => s + d.amount, 0)
    expect(total).toBe(18_500_000_000)
  })

  it('chia đúng: Huy 4 · Bình 3 · Linh 3', () => {
    const count = (name: string) => OPEN_DEALS.filter((d) => d.owner === name).length
    expect(count('Đỗ Quang Huy')).toBe(4)
    expect(count('Đặng Thanh Bình')).toBe(3)
    expect(count('Nguyễn Khánh Linh')).toBe(3)
  })

  it('đúng 4 đơn đang mục — bốn dấu ⚠ trong bảng của CLAUDE.md', () => {
    const rotting = OPEN_DEALS.filter(isRotting).map((d) => d.code)
    expect(rotting.sort()).toEqual(['OP-0248', 'OP-0252', 'OP-0263', 'OP-0301'])
  })

  it('mọi đơn nằm trong một trong năm cột, không có cột thứ sáu', () => {
    const stages = new Set(PIPELINE_STAGES.map((s) => s.key))
    expect(PIPELINE_STAGES).toHaveLength(5)
    for (const d of OPEN_DEALS) expect(stages.has(d.stage)).toBe(true)
  })
})

describe('Phễu 01/05 → 17/08', () => {
  it('100 đầu mối → 6 hợp đồng, đơn điệu giảm', () => {
    expect(FUNNEL[0].count).toBe(100)
    expect(FUNNEL[FUNNEL.length - 1]?.count).toBe(6)
    for (let i = 1; i < FUNNEL.length; i++) {
      expect(FUNNEL[i]!.count).toBeLessThan(FUNNEL[i - 1]!.count)
    }
  })

  it('sáu lý do ra khỏi luồng, cộng lại đúng 94 — không có ô "khác"', () => {
    expect(EXIT_REASONS).toHaveLength(6)
    const lost = EXIT_REASONS.reduce((s, r) => s + r.count, 0)
    expect(lost).toBe(94)
    expect(lost + FUNNEL[FUNNEL.length - 1]!.count).toBe(FUNNEL[0].count)
  })
})
