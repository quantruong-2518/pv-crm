import { describe, expect, it } from 'vitest'
import { billions, dong, millions, percent } from './format'

/** Luật 6 · docs/luat-thiet-ke.md: "Tiền chuẩn VN: phẩy thập phân, chấm ngăn nghìn."
 *
 *  Test này gác đúng một thứ: nếu ai đó đổi locale hoặc dùng Intl mặc định,
 *  tiền sẽ hiện kiểu Anh (1,840,000,000.00) và không ai nhận ra cho tới lúc
 *  demo trước khách. */
describe('định dạng tiền chuẩn VN', () => {
  it('tỷ — phẩy thập phân', () => {
    expect(billions(1_840_000_000)).toBe('1,84 tỷ')
    expect(billions(4_200_000_000)).toBe('4,20 tỷ')
    expect(billions(18_500_000_000, 1)).toBe('18,5 tỷ')
  })

  it('triệu', () => {
    expect(millions(780_000_000)).toBe('780,0 tr')
    expect(millions(128_500_000)).toBe('128,5 tr')
  })

  it('đồng — chấm ngăn nghìn, không có phần thập phân', () => {
    expect(dong(1_840_000_000)).toBe('1.840.000.000 ₫')
    expect(dong(0)).toBe('0 ₫')
  })

  it('phần trăm — không có khoảng trắng trước dấu %', () => {
    expect(percent(0.68)).toBe('68%')
    expect(percent(0.914, 1)).toBe('91,4%')
  })

  it('số âm vẫn giữ đúng quy ước', () => {
    expect(dong(-1_200_000)).toBe('-1.200.000 ₫')
  })
})
