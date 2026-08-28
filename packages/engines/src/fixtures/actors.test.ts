import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS, createAccessControl, type Permission } from '../e2-access'
import type { RoleId } from '../types'
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

const DOMAIN = '@pebblevina.com'

describe('Email đăng nhập · kịch bản 2 · DAS Vina', () => {
  it('bảy vai, đúng bảy email đã chốt', () => {
    expect(dasVina.actors.map((a) => a.email)).toEqual([
      'sales@pebblevina.com',
      'chau@pebblevina.com',
      'nam@pebblevina.com',
      'huy@pebblevina.com',
      'binh@pebblevina.com',
      'linh@pebblevina.com',
      'anh@pebblevina.com',
    ])
  })
})

describe('Email đăng nhập · kịch bản 1 · Sao Đỏ', () => {
  it('ba vai, đúng ba email đã chốt', () => {
    expect(saoDo.actors.map((a) => a.email)).toEqual([
      'thang@pebblevina.com',
      'sales@pebblevina.com',
      'huy@pebblevina.com',
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

  /** Đúng MỘT hòm thư không theo tên riêng, và nó được khoá tên ở đây chứ không
   *  được miễn trừ: `u-ha` giữ hòm thư CHỨC DANH của trưởng phòng kinh doanh.
   *
   *  Người đổi, chức danh thì không. Ngày Trần Thu Hà chuyển việc, thư gửi tới
   *  `sales@` phải rơi vào tay người kế nhiệm mà không ai phải đi sửa danh
   *  thiếp, chữ ký mail và bảy chỗ khác. Đó là lý do nó tồn tại, và cũng là lý
   *  do nó phải là ngoại lệ DUY NHẤT — hòm thư chức danh thứ hai nghĩa là hai
   *  người cùng đăng nhập vào một tài khoản, và nhật ký `platform.audit` không
   *  còn trả lời được câu nó sinh ra để trả lời. */
  const TITLE_MAILBOX: Record<string, string> = { 'u-ha': 'sales' }

  it('phần trước @ khớp đuôi của id — u-huy thì phải là huy@', () => {
    for (const a of everyone) {
      const local = TITLE_MAILBOX[a.id] ?? a.id.replace(/^u-/, '')
      expect(a.email).toBe(`${local}${DOMAIN}`)
    }
  })

  it('chỉ có đúng một hòm thư chức danh', () => {
    expect(Object.keys(TITLE_MAILBOX)).toEqual(['u-ha'])
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

/** Khoá VAI — cùng lý do với email, và nặng hơn một bậc.
 *
 *  Gõ nhầm `roleId` không làm hỏng màn nào: app vẫn dựng, người vẫn đăng nhập
 *  được, chỉ là họ mang quyền của người khác. Một Sale gắn nhầm `trưởng-phòng`
 *  thì nhìn được sổ của cả phòng và gật được phê duyệt — không compiler nào bắt
 *  được, không ai nhìn màn mà thấy, và đó đúng là loại lỗi ngoại lệ "test khoá
 *  dữ liệu fixture" (CLAUDE.md · mục Test) sinh ra để chặn. */
describe('Vai chuẩn hoá của người đăng nhập', () => {
  it('bảy vai DAS Vina — đúng bảng đã chốt', () => {
    expect(dasVina.actors.map((a) => [a.id, a.roleId])).toEqual([
      ['u-ha', 'trưởng-phòng'],
      ['u-chau', 'marketing'],
      ['u-nam', 'bd'],
      ['u-huy', 'sale'],
      ['u-binh', 'sale'],
      ['u-linh', 'sale'],
      ['u-anh', 'presales'],
    ])
  })

  it('ba vai Sao Đỏ — đúng bảng đã chốt', () => {
    expect(saoDo.actors.map((a) => [a.id, a.roleId])).toEqual([
      ['u-thang', 'giám-đốc'],
      ['u-ha', 'trưởng-phòng'],
      ['u-huy', 'sale'],
    ])
  })

  it('người xuất hiện ở cả hai kịch bản thì mang cùng một vai', () => {
    for (const a of saoDo.actors) {
      const twin = dasVina.actors.find((b) => b.id === a.id)
      if (twin) expect(twin.roleId).toBe(a.roleId)
    }
  })

  it('chỉ người `ownOnly` mới là vai sale, và mọi vai sale đều `ownOnly`', () => {
    for (const a of [...dasVina.actors, ...saoDo.actors]) {
      expect(Boolean(a.ownOnly)).toBe(a.roleId === 'sale')
    }
  })
})

/** Khoá MA TRẬN QUYỀN — không khoá cả bảng, chỉ khoá những khẳng định mà đổi
 *  nhầm là hỏng luật nghiệp vụ. Khoá nguyên bảng thì mỗi lần thêm một quyền
 *  mới là một test đỏ vô nghĩa, và test đỏ vô nghĩa dạy người ta sửa test. */
describe('Ma trận vai → quyền', () => {
  const access = createAccessControl()
  const roleOf = (id: string) => [...dasVina.actors, ...saoDo.actors].find((a) => a.id === id)!
  const has = (role: RoleId, p: Permission) => ROLE_PERMISSIONS[role].includes(p)

  it('giao việc và gật phê duyệt chỉ thuộc về người quản lý', () => {
    for (const role of ['giám-đốc', 'trưởng-phòng'] as const) {
      expect(has(role, 'lead.giao')).toBe(true)
      expect(has(role, 'phê-duyệt.duyệt')).toBe(true)
      expect(has(role, 'ghi-vết.xem')).toBe(true)
    }
    for (const role of ['marketing', 'bd', 'presales', 'sale'] as const) {
      expect(has(role, 'lead.giao')).toBe(false)
      expect(has(role, 'phê-duyệt.duyệt')).toBe(false)
      expect(has(role, 'ghi-vết.xem')).toBe(false)
    }
  })

  it('Marketing mang khách về nhưng không định đoạt khách', () => {
    expect(has('marketing', 'chiến-dịch.sửa')).toBe(true)
    expect(has('marketing', 'lead.chuyển-đổi')).toBe(false)
    expect(has('marketing', 'lead.loại')).toBe(false)
  })

  it('Presales dựng số cho cơ hội nhưng không chốt', () => {
    expect(has('presales', 'cơ-hội.sửa')).toBe(true)
    expect(has('presales', 'cơ-hội.chốt')).toBe(false)
  })

  it('vai sale có quyền chốt, nhưng chỉ trên đơn đứng tên mình', () => {
    const huy = roleOf('u-huy')
    const mine = dasVina.objects.find((o) => o.kind === 'OP' && o.owner === huy.name)
    const theirs = dasVina.objects.find((o) => o.kind === 'OP' && o.owner && o.owner !== huy.name)

    expect(access.allows(huy, 'cơ-hội.chốt')).toBe(true)
    if (mine)
      expect(access.check(huy, { ref: mine, permission: 'cơ-hội.chốt' })).toEqual({ ok: true })
    if (theirs) {
      expect(access.check(huy, { ref: theirs, permission: 'cơ-hội.chốt' })).toMatchObject({
        ok: false,
        reason: 'ngoài-phạm-vi',
      })
    }
  })

  it('thiếu license báo `thiếu-nhánh`, không báo thiếu quyền', () => {
    const ha = roleOf('u-ha')
    expect(access.check(ha, { branch: 'Factory' })).toMatchObject({
      ok: false,
      reason: 'thiếu-nhánh',
    })
    expect(access.check(null, { branch: 'Sales' })).toMatchObject({
      ok: false,
      reason: 'chưa-đăng-nhập',
    })
  })
})
