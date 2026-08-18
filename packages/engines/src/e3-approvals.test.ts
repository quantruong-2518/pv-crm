import { describe, expect, it } from 'vitest'
import { createApprovalEngine } from './e3-approvals'
import type { Actor, ObjectRef } from './types'

const PO: ObjectRef = { code: 'PO-0455', kind: 'PO', branch: 'Supply', label: 'Đơn mua thép Ø40' }

const ha: Actor = {
  id: 'u-ha',
  name: 'Trần Thu Hà',
  role: 'Trưởng phòng Kinh doanh',
  branches: ['One', 'Sales', 'Supply'],
}
const huy: Actor = {
  id: 'u-huy',
  name: 'Đỗ Quang Huy',
  role: 'Sale',
  branches: ['One', 'Sales'],
}

const chain = () => [{ role: 'TP Kinh doanh', person: 'Trần Thu Hà', state: 'waiting' as const }]

const base = { id: 'RQ-1', type: 'mua-hàng', ref: PO, raisedBy: 'Trợ lý AI' }

describe('E3 · quy trình duyệt — nơi luật 9 được thực thi', () => {
  it('đề xuất của AI LUÔN vào ở trạng thái chờ, không bao giờ tự chạy', () => {
    const e3 = createApprovalEngine({ clock: () => '2026-08-10T07:58:00+07:00' })
    const req = e3.proposeFromAi({
      ...base,
      chain: chain(),
      basis: 'Tồn kho K1-A2 · hợp đồng SO-0891',
    })

    expect(req.state).toBe('waiting')
    expect(req.fromAi).toBe(true)
    expect(req.basis).toBeTruthy()
  })

  it('đề xuất AI không có căn cứ thì không vào được hệ', () => {
    const e3 = createApprovalEngine()
    expect(() => e3.proposeFromAi({ ...base, chain: chain(), basis: '   ' })).toThrow(/căn cứ/)
  })

  it('chỉ người trong chuỗi mới quyết được', () => {
    const e3 = createApprovalEngine()
    e3.proposeFromAi({ ...base, chain: chain(), basis: 'tồn kho K1-A2' })

    expect(() => e3.decide('RQ-1', huy, 'approved')).toThrow(/đang chờ Trần Thu Hà/)
    expect(e3.get('RQ-1')?.state).toBe('waiting')
  })

  it('người bấm nút thì mới chuyển trạng thái, và ghi lại ai bấm', () => {
    const e3 = createApprovalEngine({ clock: () => '2026-08-10T08:04:00+07:00' })
    e3.proposeFromAi({ ...base, chain: chain(), basis: 'tồn kho K1-A2' })

    const done = e3.decide('RQ-1', ha, 'approved')
    expect(done.state).toBe('approved')
    expect(done.decidedBy).toBe('Trần Thu Hà')
    expect(done.decidedAt).toBe('2026-08-10T08:04:00+07:00')
  })

  it('chuỗi nhiều người thì vẫn chờ cho tới mắt xích cuối', () => {
    const e3 = createApprovalEngine()
    e3.submit({
      ...base,
      raisedBy: 'Đỗ Quang Huy',
      chain: [
        { role: 'TP Kinh doanh', person: 'Trần Thu Hà', state: 'waiting' },
        { role: 'Giám đốc', person: 'Nguyễn Văn Thắng', state: 'waiting' },
      ],
    })

    expect(e3.decide('RQ-1', ha, 'approved').state).toBe('waiting')
    const thang: Actor = {
      id: 'u-thang',
      name: 'Nguyễn Văn Thắng',
      role: 'Giám đốc',
      branches: ['One'],
    }
    expect(e3.decide('RQ-1', thang, 'approved').state).toBe('approved')
  })

  it('đã quyết rồi thì không quyết lại', () => {
    const e3 = createApprovalEngine()
    e3.submit({ ...base, chain: chain() })
    e3.decide('RQ-1', ha, 'approved')
    expect(() => e3.decide('RQ-1', ha, 'rejected')).toThrow(/không quyết lại/)
  })

  it('hộp duyệt chỉ hiện việc đang chờ CHÍNH người đó', () => {
    const e3 = createApprovalEngine()
    e3.submit({ ...base, chain: chain() })
    expect(e3.pending(ha)).toHaveLength(1)
    expect(e3.pending(huy)).toHaveLength(0)
  })
})
