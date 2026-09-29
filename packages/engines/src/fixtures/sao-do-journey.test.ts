import { describe, expect, it } from 'vitest'
import { WorkstreamJourneyResponse } from '@pv/contracts'
import { daysUntil } from '../contract-due'
import * as DAS_VINA from './das-vina'
import { PIPELINE_STAGES } from './das-vina'
import {
  saoDo,
  saoDoJourney,
  saoDoJourneys,
  SAO_DO_CONTRACTS,
  SAO_DO_CUSTOMER,
  SAO_DO_FROZEN_AT,
  SAO_DO_SIGNED_AT,
} from './sao-do'

/** Locks every figure `sao-do-journey.ts` introduced — the four journeys of the
 *  rebuilt journey screen. No compiler guards demo numbers (CLAUDE.md · Test),
 *  so a code, amount or day that drifts turns this file red.
 *
 *  Two kinds of lock: literal tables for what was NEW, and cross-checks proving
 *  the journeys agree with facts the scenario already had (the main contract, the lead,
 *  the renewal quote, `SAO_DO_CUSTOMER`) and with the stage limits. */

const JOURNEYS = saoDoJourneys()
const journey = (code: string) => {
  const j = saoDoJourney(code)
  if (!j) throw new Error(`missing ${code}`)
  return j
}
const deals = JOURNEYS.flatMap((j) => j.deals)
const contracts = JOURNEYS.flatMap((j) => j.contracts)
const deal = (code: string) => deals.find((d) => d.code === code)
const contract = (code: string) => contracts.find((c) => c.code === code)

type Rung = { key: string; state: string; at: string | null; days: number | null }
const digest = (rungs: Rung[]) =>
  rungs.map((r) => `${r.key} ${r.state} ${r.at?.slice(0, 16) ?? '-'} ${r.days ?? '-'}`)

describe('Hình dạng — mỗi hành trình qua đúng schema của màn', () => {
  it.each(JOURNEYS.map((j) => [j.code, j] as const))('%s parse không rơi trường nào', (_c, j) => {
    expect(WorkstreamJourneyResponse.parse(j)).toEqual(j)
  })

  it('tra theo mã: bốn mã có, mã lạ thì không', () => {
    expect(JOURNEYS.map((j) => j.code)).toEqual(['WS-0041', 'WS-0088', 'WS-0089', 'WS-0093'])
    expect(saoDoJourney('WS-9999')).toBeUndefined()
  })
})

describe('Mã và đầu hành trình — khoá từng giá trị mới', () => {
  it('bốn đầu hành trình', () => {
    const head = JOURNEYS.map((j) => [
      j.code,
      j.ordinal,
      j.status,
      j.closeReason,
      j.accountCode,
      j.openedAt,
      j.closedAt,
      j.lead.code,
      j.lead.holder?.id ?? null,
    ])
    expect(head).toEqual([
      [
        'WS-0041',
        1,
        'closed',
        'WON',
        null,
        '2025-06-02T09:00:00+07:00',
        '2026-07-08T14:00:00+07:00',
        'LD-0058',
        'u-huy',
      ],
      ['WS-0088', 2, 'open', null, null, '2026-07-08T09:00:00+07:00', null, 'LD-0334', 'u-ha'],
      ['WS-0089', 3, 'open', null, null, '2026-07-08T14:00:00+07:00', null, 'LD-0335', 'u-huy'],
      ['WS-0093', 4, 'open', null, null, '2026-08-08T16:00:00+07:00', null, 'LD-0352', 'u-ha'],
    ])
    expect(new Set(JOURNEYS.map((j) => j.customer))).toEqual(new Set([SAO_DO_CUSTOMER.name]))
  })

  it('cơ hội: mã, tên, người giữ, giá trị, ngày dự kiến, kết quả', () => {
    const rows = deals.map((d) => [
      d.code,
      d.name,
      d.holder?.id ?? null,
      d.amount,
      d.expectedClose,
      d.outcome,
      d.outcomeAt,
      d.contractCodes,
    ])
    expect(rows).toEqual([
      [
        'OP-0074',
        'Bản quyền CMMS',
        'u-huy',
        360_000_000,
        '2025-08-31',
        'won',
        '2025-08-20T15:00:00+07:00',
        ['HĐ-2531'],
      ],
      [
        'OP-0289',
        'Cân tự động cho kho thành phẩm',
        'u-huy',
        180_000_000,
        '2026-09-30',
        'lost',
        '2026-08-03T15:30:00+07:00',
        [],
      ],
      [
        'OP-0290',
        'Đào tạo lập kế hoạch sản xuất trên MES cho phòng Kế hoạch',
        'u-huy',
        120_000_000,
        '2026-07-31',
        'won',
        '2026-07-24T15:00:00+07:00',
        ['HĐ-2609'],
      ],
      [
        'OP-0291',
        'MES xưởng X1',
        'u-huy',
        2_080_000_000,
        '2026-07-24',
        'won',
        SAO_DO_SIGNED_AT,
        ['HĐ-2607', 'HĐ-2608'],
      ],
      ['OP-0292', 'Gia hạn bản quyền CMMS', 'u-huy', 360_000_000, '2026-08-31', 'open', null, []],
      [
        'OP-0293',
        'Mở rộng CMMS sang xưởng X2',
        'u-huy',
        280_000_000,
        '2026-09-15',
        'open',
        null,
        [],
      ],
    ])
  })

  it('hợp đồng: mã, cơ hội, loại, giá trị, ngày ký, người triển khai, bản quyền', () => {
    const rows = contracts.map((c) => [
      c.code,
      c.dealCode,
      c.kind,
      c.amount,
      c.signedAt,
      c.holder?.id ?? null,
      c.implementer?.name ?? null,
      c.licence,
    ])
    expect(rows).toEqual([
      [
        'HĐ-2531',
        'OP-0074',
        'licence',
        360_000_000,
        '2025-08-20T15:00:00+07:00',
        'u-huy',
        null,
        { from: '2025-09-01', to: '2026-08-31' },
      ],
      [
        'HĐ-2609',
        'OP-0290',
        'training',
        120_000_000,
        '2026-07-24T15:00:00+07:00',
        'u-huy',
        'Nguyễn Văn Tú',
        null,
      ],
      [
        'HĐ-2607',
        'OP-0291',
        'deployment',
        1_840_000_000,
        SAO_DO_SIGNED_AT,
        'u-huy',
        'Lê Minh Đức',
        null,
      ],
      [
        'HĐ-2608',
        'OP-0291',
        'licence',
        240_000_000,
        '2026-07-21T16:35:00+07:00',
        'u-huy',
        null,
        { from: '2026-08-01', to: '2027-07-31' },
      ],
    ])
  })

  it('OP-0289 · nhật ký thua mang lý do và người kết luận của cửa chờ cũ; deal khác stop null', () => {
    const ws = journey('WS-0088')
    expect(ws.deals.map((d) => [d.code, d.stop])).toEqual([
      [
        'OP-0289',
        {
          reason: 'Chưa có ngân sách năm nay',
          note: null,
          doNotContact: false,
          concludedBy: { id: 'u-huy', name: expect.any(String) },
        },
      ],
      ['OP-0290', null],
      ['OP-0291', null],
    ])
    expect(
      JOURNEYS.flatMap((j) => j.deals).filter((d) => (d.stop === null) === (d.outcome === 'lost')),
    ).toEqual([])
  })

  it('WS-0088: một lead ra đúng ba cơ hội — một hỏng, một ra 1 hợp đồng, một ra 2', () => {
    const ws = journey('WS-0088')
    expect(ws.deals.map((d) => [d.code, d.outcome, d.contractCodes.length])).toEqual([
      ['OP-0289', 'lost', 0],
      ['OP-0290', 'won', 1],
      ['OP-0291', 'won', 2],
    ])
  })

  /** Every code the journey file mints (lead, deal, contract, journey) must be free in the other
   *  scenario and in the rest of this one; reused facts are listed by name. */
  it('không mã mới nào đụng mã đã có ở DAS Vina hay ở phần còn lại của Sao Đỏ', () => {
    const CODE = /\b(?:LD|OP|WS)-\d{3,6}\b|HĐ-\d{3,6}\b/g
    const codesIn = (v: unknown) => {
      try {
        return JSON.stringify(v)?.match(CODE) ?? []
      } catch {
        return []
      }
    }
    const reused = new Set(['LD-0334', 'HĐ-2607'])
    const mine = new Set(JOURNEYS.flatMap(codesIn).filter((c) => !reused.has(c)))
    const theirs = new Set([
      ...Object.values(DAS_VINA).flatMap(codesIn),
      ...codesIn(saoDo.objects),
      ...codesIn(SAO_DO_CONTRACTS),
    ])
    expect([...mine].sort()).toEqual([
      'HĐ-2531',
      'HĐ-2608',
      'HĐ-2609',
      'LD-0058',
      'LD-0335',
      'LD-0352',
      'OP-0074',
      'OP-0289',
      'OP-0290',
      'OP-0291',
      'OP-0292',
      'OP-0293',
      'WS-0041',
      'WS-0088',
      'WS-0089',
      'WS-0093',
    ])
    expect(['OP-0288', 'HĐ-2711', 'HĐ-2604'].every((c) => theirs.has(c))).toBe(true)
    expect([...mine].filter((c) => theirs.has(c))).toEqual([])
  })
})

describe('Bậc thang — ngày vào bậc, số ngày tính ra, trạng thái', () => {
  it('mọi làn, từng bậc', () => {
    const lanes = Object.fromEntries([
      ...JOURNEYS.map((j) => [j.lead.code, digest(j.lead.rungs)]),
      ...deals.map((d) => [d.code, digest(d.rungs)]),
      ...contracts.map((c) => [c.code, digest(c.rungs)]),
    ])
    expect(lanes).toEqual({
      'LD-0058': [
        'new done 2025-06-02T09:00 0',
        'assigned done 2025-06-02T09:00 2',
        'verifying done 2025-06-04T09:00 5',
        'working done 2025-06-09T09:00 11',
        'converted done 2025-06-20T09:00 -',
      ],
      'OP-0074': [
        'new done 2025-06-20T10:00 1',
        'assigned done 2025-06-21T09:00 11',
        'sample skipped - -',
        'poc done 2025-07-02T09:00 19',
        'quotation done 2025-07-21T09:00 30',
      ],
      'HĐ-2531': [
        'signed done 2025-08-20T15:00 1',
        'deploy skipped - -',
        'accept skipped - -',
        'collect done 2025-08-21T10:00 6',
        'done done 2025-08-28T00:00 -',
      ],
      'LD-0334': [
        'new done 2026-07-08T09:00 0',
        'assigned done 2026-07-08T09:00 1',
        'verifying done 2026-07-09T09:00 1',
        'working done 2026-07-10T09:00 3',
        'converted done 2026-07-13T09:00 -',
      ],
      'OP-0289': [
        'new done 2026-07-13T10:00 0',
        'assigned done 2026-07-13T14:00 1',
        'sample skipped - -',
        'poc stopped 2026-07-14T09:00 20',
        'quotation upcoming - -',
      ],
      'OP-0290': [
        'new done 2026-07-13T11:00 1',
        'assigned done 2026-07-14T09:00 1',
        'sample skipped - -',
        'poc skipped - -',
        'quotation done 2026-07-15T09:00 9',
      ],
      'OP-0291': [
        'new done 2026-07-13T14:00 0',
        'assigned done 2026-07-13T16:00 1',
        'sample skipped - -',
        'poc done 2026-07-14T09:00 3',
        'quotation done 2026-07-17T10:00 4',
      ],
      'HĐ-2609': [
        'signed done 2026-07-24T15:00 4',
        'deploy done 2026-07-28T09:00 9',
        'accept current 2026-08-06T10:00 4',
        'collect upcoming - -',
        'done upcoming - -',
      ],
      'HĐ-2607': [
        'signed done 2026-07-21T16:20 7',
        'deploy current 2026-07-29T00:00 13',
        'accept upcoming - -',
        'collect upcoming - -',
        'done upcoming - -',
      ],
      'HĐ-2608': [
        'signed done 2026-07-21T16:35 1',
        'deploy skipped - -',
        'accept skipped - -',
        'collect done 2026-07-22T10:00 7',
        'done done 2026-07-30T00:00 -',
      ],
      'LD-0335': [
        'new done 2026-07-08T14:00 0',
        'assigned done 2026-07-08T14:00 1',
        'verifying done 2026-07-09T09:00 1',
        'working done 2026-07-10T09:00 4',
        'converted done 2026-07-14T09:00 -',
      ],
      'OP-0292': [
        'new done 2026-07-24T10:00 0',
        'assigned done 2026-07-24T14:00 11',
        'sample skipped - -',
        'poc skipped - -',
        'quotation current 2026-08-04T10:00 6',
      ],
      'OP-0293': [
        'new done 2026-07-14T10:00 0',
        'assigned done 2026-07-14T14:00 2',
        'sample skipped - -',
        'poc current 2026-07-16T09:00 25',
        'quotation upcoming - -',
      ],
      'LD-0352': [
        'new done 2026-08-08T16:00 0',
        'assigned current 2026-08-08T16:00 2',
        'verifying upcoming - -',
        'working upcoming - -',
        'converted upcoming - -',
      ],
    })
  })

  it('số ngày của bậc đang chạy đúng bằng phép tính tới lúc đóng băng', () => {
    const current = [...deals.flatMap((d) => d.rungs), ...contracts.flatMap((c) => c.rungs)].filter(
      (r) => r.state === 'current',
    )
    for (const r of current) expect(r.days).toBe(daysUntil(SAO_DO_FROZEN_AT, r.at ?? ''))
  })

  it('bậc đang chạy của cơ hội mở chấm theo thang hạn; mọi bậc khác null', () => {
    const graded = deals.flatMap((d) =>
      d.rungs.filter((r) => r.dueLevel !== null).map((r) => [d.code, r.key, r.dueLevel]),
    )
    expect(graded).toEqual([
      ['OP-0292', 'quotation', 'upcoming'],
      ['OP-0293', 'poc', 'overdue'],
    ])
  })

  it('hạn bậc lấy từ PIPELINE_STAGES, không gõ tay', () => {
    const limits = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))
    for (const r of deals.flatMap((d) => d.rungs)) expect(r.limitDays).toBe(limits[r.key])
  })

  it('OP-0293 trễ POC (25 > 21); OP-0292 đúng hạn Quotation — BG-0512 "im 6 ngày"', () => {
    const poc = deal('OP-0293')?.rungs.find((r) => r.key === 'poc')
    expect((poc?.days ?? 0) > (poc?.limitDays ?? Infinity)).toBe(true)
    const quote = deal('OP-0292')?.rungs.find((r) => r.key === 'quotation')
    expect((quote?.days ?? Infinity) <= (quote?.limitDays ?? 0)).toBe(true)
    const bg = saoDo.objects.find((o) => o.code === 'BG-0512')
    expect(bg?.state).toBe(`im ${quote?.days} ngày`)
  })
})

describe('Bước con, việc kế tiếp, mốc triển khai', () => {
  it('Bước con hạng Quotation chỉ còn "Gửi lần n"; POC và duyệt chờ nguồn thật', () => {
    const sent = (code: string) =>
      deal(code)?.rungs.flatMap((r) =>
        r.subSteps.map((s) => [
          r.key,
          s.kind,
          s.kind === 'quote-sent' ? s.round : null,
          s.label,
          s.at,
        ]),
      )
    expect(sent('OP-0289')).toEqual([])
    expect(sent('OP-0290')).toEqual([
      ['quotation', 'quote-sent', 1, 'Gửi báo giá', '2026-07-15T10:00:00+07:00'],
    ])
    expect(sent('OP-0291')).toEqual([
      ['quotation', 'quote-sent', 1, 'Gửi báo giá', '2026-07-17T10:00:00+07:00'],
    ])
    expect(sent('OP-0293')).toEqual([])
  })

  it('OP-0293 · việc kế tiếp 12/08 sắp tới hạn', () => {
    const next = deal('OP-0293')?.nextAction
    expect([next?.text, next?.due, next?.doer.id, next?.dueLevel]).toEqual([
      'Hẹn anh Đạt chốt kết quả POC',
      '2026-08-12',
      'u-huy',
      'upcoming',
    ])
  })

  it('HĐ-2609 · ba buổi đào tạo xong, chờ khách ký nghiệm thu', () => {
    const hd = contract('HĐ-2609')
    expect(hd?.milestones.map((m) => [m.label, m.state, m.at])).toEqual([
      ['Buổi 1 · Lập kế hoạch tổng', 'done', '2026-07-28T09:00:00+07:00'],
      ['Buổi 2 · Điều độ theo ca', 'done', '2026-07-31T09:00:00+07:00'],
      ['Buổi 3 · Thực hành trên dữ liệu thật', 'done', '2026-08-05T09:00:00+07:00'],
    ])
    expect(hd?.acceptance).toEqual([
      {
        label: 'Biên bản nghiệm thu đào tạo',
        state: 'awaiting-signature',
        at: '2026-08-06T10:00:00+07:00',
      },
    ])
  })

  it('OP-0292 · gửi BG-0512 04/08 rồi chờ; không việc kế tiếp', () => {
    expect(
      deal('OP-0292')?.rungs.flatMap((r) =>
        r.subSteps.map((s) => [
          r.key,
          s.kind,
          s.kind === 'quote-sent' ? s.round : null,
          s.label,
          s.at,
        ]),
      ),
    ).toEqual([['quotation', 'quote-sent', 1, 'Gửi báo giá BG-0512', '2026-08-04T10:00:00+07:00']])
    expect(deal('OP-0292')?.nextAction).toBeNull()
  })

  it('HĐ-2607 · đang Triển khai thì Thu tiền vẫn chưa tới, dù đợt 1 đã thu', () => {
    const hd = contract('HĐ-2607')
    expect(hd?.rungs.find((r) => r.key === 'collect')?.state).toBe('upcoming')
    expect(hd?.installments[0]?.paidAt).not.toBeNull()
  })

  it('HĐ-2607 · bốn mốc lấy từ điều kiện của hợp đồng, chạy thử trễ', () => {
    const rows = contract('HĐ-2607')?.milestones.map((m) => [
      m.label,
      m.state,
      m.at,
      m.due,
      m.dueLevel,
    ])
    expect(rows).toEqual([
      ['Khởi động', 'done', '2026-07-29T00:00:00+07:00', '2026-07-30T00:00:00+07:00', 'done'],
      ['Cấu hình và tích hợp', 'done', null, null, null],
      ['Chạy thử (UAT)', 'current', null, '2026-08-08T00:00:00+07:00', 'overdue'],
      ['Go-live', 'upcoming', null, null, null],
    ])
    expect(contract('HĐ-2607')?.milestones.map((m) => m.note)).toEqual([
      'Bàn giao máy chủ và cài đặt MES',
      null,
      'Kế hoạch báo chạy thử trễ, hẹn xong 14/08',
      null,
    ])
    expect(contract('HĐ-2607')?.acceptance.map((a) => [a.state, a.at])).toEqual([
      ['awaiting-signature', '2026-08-08T00:00:00+07:00'],
      ['missing', null],
    ])
  })
})

describe('Tiền — khớp với sổ hợp đồng và cộng đúng', () => {
  const book = SAO_DO_CONTRACTS.find((c) => c.code === 'HĐ-2607')

  it('HĐ-2607 · giá trị, người giữ, bốn đợt trùng SAO_DO_CONTRACTS', () => {
    const hd = contract('HĐ-2607')
    expect(hd?.amount).toBe(book?.amount)
    expect(hd?.holder).toEqual({ id: book?.ownerId, name: book?.ownerName })
    expect(
      hd?.installments.map((i) => [i.no, i.label, i.share, i.amount, i.due, i.paidAt]),
    ).toEqual(
      book?.installments.map((i) => [i.no, i.label, i.share, i.amount, i.due, i.paidAt ?? null]),
    )
  })

  it('đợt, hoá đơn ghi nhận, tiền về, bậc hạn của mọi hợp đồng', () => {
    const rows = contracts.flatMap((c) =>
      c.installments.map((i) => [c.code, i.no, i.invoicedAt, i.paidAt, i.paidAmount, i.dueLevel]),
    )
    expect(rows).toEqual([
      ['HĐ-2531', 1, '2025-08-21T10:00:00+07:00', '2025-08-28T00:00:00+07:00', 360_000_000, 'done'],
      ['HĐ-2609', 1, '2026-07-25T10:00:00+07:00', '2026-07-30T00:00:00+07:00', 60_000_000, 'done'],
      ['HĐ-2609', 2, null, null, null, 'due-soon'],
      ['HĐ-2607', 1, '2026-07-22T09:10:00+07:00', '2026-07-25T00:00:00+07:00', 552_000_000, 'done'],
      ['HĐ-2607', 2, null, null, null, 'due-soon'],
      ['HĐ-2607', 3, null, null, null, 'upcoming'],
      ['HĐ-2607', 4, null, null, null, 'upcoming'],
      ['HĐ-2608', 1, '2026-07-22T10:00:00+07:00', '2026-07-30T00:00:00+07:00', 240_000_000, 'done'],
    ])
    expect(contract('HĐ-2531')?.installments[0]?.due).toBe('2025-08-30T00:00:00+07:00')
    expect(contract('HĐ-2608')?.installments[0]?.due).toBe('2026-07-31T00:00:00+07:00')
    expect(contract('HĐ-2609')?.installments.map((i) => [i.label, i.share, i.due])).toEqual([
      ['Tạm ứng sau khi ký', 50, '2026-07-31T00:00:00+07:00'],
      ['Sau nghiệm thu đào tạo', 50, '2026-08-20T00:00:00+07:00'],
    ])
  })

  it('mỗi hợp đồng: các đợt cộng đúng giá trị, đủ 100%', () => {
    for (const c of contracts) {
      expect(c.installments.reduce((n, i) => n + i.amount, 0)).toBe(c.amount)
      expect(c.installments.reduce((n, i) => n + i.share, 0)).toBe(100)
    }
  })

  it('cơ hội đã thắng mang đúng tổng các hợp đồng nó sinh ra', () => {
    for (const d of deals.filter((x) => x.outcome === 'won')) {
      const sum = contracts
        .filter((c) => c.dealCode === d.code)
        .reduce((n, c) => n + (c.amount ?? 0), 0)
      expect(d.amount).toBe(sum)
    }
  })

  it('cơ hội đang mở trên cả bốn hành trình = SAO_DO_CUSTOMER.openDeals', () => {
    expect(deals.filter((d) => d.outcome === 'open')).toHaveLength(SAO_DO_CUSTOMER.openDeals)
  })

  it('đợt quá hạn chưa thu = SAO_DO_CUSTOMER.overdue', () => {
    const late = contracts
      .flatMap((c) => c.installments)
      .filter((i) => i.dueLevel === 'overdue' || i.dueLevel === 'long-overdue')
    expect(late).toHaveLength(SAO_DO_CUSTOMER.overdue)
  })
})

describe('Cửa tiếp nối và cây hành trình', () => {
  it('ba cửa, đủ từng trường — OP-0289 thua không vẽ cửa chờ', () => {
    const doors = JOURNEYS.flatMap((j) =>
      j.doors.map((d) =>
        d.kind === 'growth'
          ? [j.code, d.kind, d.journeyCode, d.leadCode, d.from, d.at, d.need, d.decidedBy.id]
          : [
              j.code,
              d.kind,
              d.leadCode,
              d.from,
              d.at,
              d.reason,
              d.concludedBy?.id,
              d.doNotContact,
              d.campaignName,
              d.lastTouch,
            ],
      ),
    )
    expect(doors).toEqual([
      [
        'WS-0041',
        'growth',
        'WS-0088',
        'LD-0334',
        { code: 'HĐ-2531', rung: 'done' },
        '2026-07-08T09:00:00+07:00',
        'Khách muốn đưa MES vào xưởng X1',
        'u-ha',
      ],
      [
        'WS-0041',
        'growth',
        'WS-0089',
        'LD-0335',
        { code: 'HĐ-2531', rung: 'done' },
        '2026-07-08T14:00:00+07:00',
        'Bản quyền CMMS hết hạn cuối tháng 8 — khách muốn gia hạn',
        'u-huy',
      ],
      [
        'WS-0088',
        'growth',
        'WS-0093',
        'LD-0352',
        { code: 'HĐ-2607', rung: 'deploy' },
        '2026-08-08T16:00:00+07:00',
        'Trong lúc chạy thử dây chuyền 1, khách xin thêm báo cáo hiệu suất theo ca',
        'u-ha',
      ],
    ])
  })

  it('cửa tăng trưởng mở đúng hành trình kia: cùng lead, cùng giờ, người quyết giữ lead', () => {
    for (const d of JOURNEYS.flatMap((j) => j.doors)) {
      if (d.kind !== 'growth') continue
      const born = journey(d.journeyCode)
      expect([born.lead.code, born.openedAt, born.lead.holder]).toEqual([
        d.leadCode,
        d.at,
        d.decidedBy,
      ])
    }
  })

  it('ContextRail: một trước, nhiều sau, hai chiều khớp nhau', () => {
    expect(
      JOURNEYS.map((j) => [j.code, j.previous?.code ?? null, j.next.map((n) => n.code)]),
    ).toEqual([
      ['WS-0041', null, ['WS-0088', 'WS-0089']],
      ['WS-0088', 'WS-0041', ['WS-0093']],
      ['WS-0089', 'WS-0041', []],
      ['WS-0093', 'WS-0088', []],
    ])
    for (const j of JOURNEYS)
      for (const n of j.next) {
        const other = journey(n.code)
        expect([n.status, n.closeReason, n.ordinal]).toEqual([
          other.status,
          other.closeReason,
          other.ordinal,
        ])
        expect(other.previous?.code).toBe(j.code)
      }
  })

  it('WS-0041 đóng lúc cửa tăng trưởng cuối cùng mở', () => {
    const last = journey('WS-0041')
      .doors.map((d) => d.at)
      .sort()
      .at(-1)
    expect(journey('WS-0041').closedAt).toBe(last)
  })
})

describe('Không ngày nào sau lúc đóng băng, trừ hạn và ngày dự kiến', () => {
  /** `due`, `expectedClose` and licence bounds are promises about the future;
   *  every other stamp records something that already happened. */
  const PAST_KEYS = new Set([
    'at',
    'openedAt',
    'closedAt',
    'signedAt',
    'outcomeAt',
    'invoicedAt',
    'paidAt',
  ])
  const frozen = Date.parse(SAO_DO_FROZEN_AT)

  const stamps = (v: unknown, key = ''): [string, string][] => {
    if (Array.isArray(v)) return v.flatMap((x) => stamps(x, key))
    if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => stamps(x, k))
    return typeof v === 'string' && PAST_KEYS.has(key) ? [[key, v]] : []
  }

  it.each(JOURNEYS.map((j) => [j.code, j] as const))('%s', (_c, j) => {
    const late = stamps(j).filter(([, v]) => Date.parse(v) > frozen)
    expect(late).toEqual([])
  })
})

describe('Trạng thái lead — khớp với các bậc của chính nó', () => {
  it.each([
    ['WS-0041', 'LD-0058', 'converted'],
    ['WS-0088', 'LD-0334', 'converted'],
    ['WS-0089', 'LD-0335', 'converted'],
    ['WS-0093', 'LD-0352', 'assigned'],
  ])('%s · %s là %s', (ws, code, state) => {
    expect(journey(ws).lead.code).toBe(code)
    expect(journey(ws).lead.state).toBe(state)
  })

  it('state là bậc cuối đã chạm tới: converted khi bậc converted đã qua, ngược lại là bậc đang chạy', () => {
    for (const j of JOURNEYS) {
      const reached = j.lead.rungs.filter((r) => r.at !== null)
      expect(j.lead.state).toBe(reached[reached.length - 1]!.key)
    }
  })
})
