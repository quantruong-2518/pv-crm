import { describe, expect, it } from 'vitest'
import { dasVina } from './das-vina'
import { saoDo } from './sao-do'

/** Khoá EMAIL của người đăng nhập — dữ liệu mới thêm 23/08 khi luồng auth thay
 *  màn chọn vai.
 *
 *  Đây là ngoại lệ duy nhất của "không tự sinh test" (CLAUDE.md · mục Test).
 *  Email không phải con số, nhưng nó là dữ liệu fixture mà không compiler nào
 *  gác được: gõ nhầm một ký tự thì màn vẫn dựng, vẫn xanh, chỉ có người demo là
 *  không đăng nhập được và không biết vì sao. Trùng email giữa hai người thì
 *  còn tệ hơn — đăng nhập vào nhầm vai, và mọi màn sau đó nói dối một cách rất
 *  thuyết phục.
 *
 *  Đổi email nào ở đây thì phải sửa fixture trước — test đỏ là lời nhắc đúng lúc. */

const DOMAIN = '@pebblevina.vn'

describe('Email đăng nhập · kịch bản 2 · DAS Vina', () => {
  it('bảy vai, đúng bảy email đã chốt', () => {
    expect(dasVina.actors.map((a) => a.email)).toEqual([
      'ha@pebblevina.vn',
      'chau@pebblevina.vn',
      'nam@pebblevina.vn',
      'huy@pebblevina.vn',
      'binh@pebblevina.vn',
      'linh@pebblevina.vn',
      'anh@pebblevina.vn',
    ])
  })
})

describe('Email đăng nhập · kịch bản 1 · Sao Đỏ', () => {
  it('ba vai, đúng ba email đã chốt', () => {
    expect(saoDo.actors.map((a) => a.email)).toEqual([
      'thang@pebblevina.vn',
      'ha@pebblevina.vn',
      'huy@pebblevina.vn',
    ])
  })
})

describe('Luật chung của email, áp cho cả hai kịch bản', () => {
  const everyone = [...dasVina.actors, ...saoDo.actors]

  it('viết thường và đúng tên miền công ty', () => {
    for (const a of everyone) {
      expect(a.email).toBe(a.email.toLowerCase())
      expect(a.email.endsWith(DOMAIN)).toBe(true)
    }
  })

  it('phần trước @ khớp đuôi của id — u-ha thì phải là ha@', () => {
    for (const a of everyone) {
      expect(a.email).toBe(`${a.id.replace(/^u-/, '')}${DOMAIN}`)
    }
  })

  it('trong một kịch bản không có hai người chung email', () => {
    for (const scenario of [dasVina, saoDo]) {
      const emails = scenario.actors.map((a) => a.email)
      expect(new Set(emails).size).toBe(emails.length)
    }
  })

  it('người xuất hiện ở cả hai kịch bản thì mang cùng một email', () => {
    for (const a of saoDo.actors) {
      const twin = dasVina.actors.find((b) => b.id === a.id)
      if (twin) expect(twin.email).toBe(a.email)
    }
  })
})
