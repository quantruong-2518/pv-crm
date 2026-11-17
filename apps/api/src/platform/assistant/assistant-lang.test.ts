// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { detectLang } from './assistant-lang'

describe('the language of a first message', () => {
  it('is Korean for any Hangul, over every other signal', () => {
    expect(detectLang('이번 달 계약은 몇 건이에요?', 'vi')).toBe('ko')
    expect(detectLang('Show me 계약 and số liệu', 'en')).toBe('ko')
    expect(detectLang('ㅋㅋ', 'vi')).toBe('ko')
  })

  it('is Vietnamese for any Vietnamese letter, whatever else is written', () => {
    expect(detectLang('Hôm nay có bao nhiêu lead?', 'en')).toBe('vi')
    expect(detectLang('What is đ', 'en')).toBe('vi')
    expect(detectLang('Show me the ĐẶT lịch', 'ko')).toBe('vi')
    expect(detectLang('Hợp đồng'.normalize('NFD'), 'en')).toBe('vi')
  })

  it('is English when only English words appear in unaccented text', () => {
    expect(detectLang('How many leads do I have this month?', 'vi')).toBe('en')
    expect(detectLang('Please show LD-0001', 'ko')).toBe('en')
  })

  it('is Vietnamese when only unaccented Vietnamese words appear', () => {
    expect(detectLang('toi co bao nhieu khach hang', 'en')).toBe('vi')
    expect(detectLang('Xem hop dong LD-0001', 'ko')).toBe('vi')
  })

  it('takes the fallback when no word is known or both sides appear', () => {
    expect(detectLang('LD-0001', 'ko')).toBe('ko')
    expect(detectLang('', 'en')).toBe('en')
    expect(detectLang('12345 ???', 'vi')).toBe('vi')
    expect(detectLang('show khach hang', 'en')).toBe('en')
    expect(detectLang('show khach hang', 'ko')).toBe('ko')
  })
})
