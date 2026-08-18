import { describe, expect, it } from 'vitest'
import { initialsOf } from './avatar'

describe('initialsOf — chữ cái đầu của họ và của tên gọi', () => {
  it('tên Việt đầy đủ', () => {
    expect(initialsOf('Nguyễn Văn Thắng')).toBe('NT')
    expect(initialsOf('Trần Thu Hà')).toBe('TH')
    expect(initialsOf('Đỗ Quang Huy')).toBe('ĐH')
  })

  it('tên nước ngoài hai từ', () => {
    expect(initialsOf('Kim Dae-ho')).toBe('KD')
  })

  it('một từ thì lấy hai ký tự đầu', () => {
    expect(initialsOf('Hải')).toBe('HẢ')
  })

  it('chuỗi rỗng hoặc toàn khoảng trắng không làm vỡ màn', () => {
    expect(initialsOf('')).toBe('')
    expect(initialsOf('   ')).toBe('')
  })

  it('nhiều khoảng trắng giữa các từ vẫn ra đúng', () => {
    expect(initialsOf('  Nguyễn   Văn   Thắng  ')).toBe('NT')
  })
})
