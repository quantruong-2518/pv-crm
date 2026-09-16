import { describe, expect, it } from 'vitest'
import { dueLevelOf } from '../contract-due'
import { SAO_DO_CONTRACTS, SAO_DO_FROZEN_AT, SAO_DO_KPI, SAO_DO_SIGNED_AT } from './sao-do'

/** No compiler guards contract figures: four installments that add up a million
 *  short still build green, still render beautifully, and only surface when
 *  someone adds them by hand during a demo. This file is the only mechanism that
 *  stops them drifting silently — see the "Test" exception in CLAUDE.md.
 *
 *  Every number locked here ALREADY EXISTED in the scenario; the contract file
 *  is not allowed to contradict them. */

const CONTRACT = SAO_DO_CONTRACTS.find((c) => c.code === 'HĐ-2607')

describe('HĐ-2607 — khớp với chuỗi object của kịch bản', () => {
  it('có mặt, và mang đúng giá trị 1,84 tỷ mà `objects` đã khai', () => {
    expect(CONTRACT).toBeDefined()
    expect(CONTRACT?.amount).toBe(1_840_000_000)
  })

  it('ngày ký trùng `SAO_DO_SIGNED_AT` — một hợp đồng, một thời điểm', () => {
    expect(CONTRACT?.signedAt).toBe(SAO_DO_SIGNED_AT)
  })
})

describe('Bốn đợt cộng lại đúng giá trị hợp đồng', () => {
  it.each(SAO_DO_CONTRACTS.map((c) => [c.code, c] as const))(
    '%s — tổng tiền các đợt bằng `amount`',
    (_code, contract) => {
      const sum = contract.installments.reduce((n, d) => n + d.amount, 0)
      expect(sum).toBe(contract.amount)
    },
  )

  it.each(SAO_DO_CONTRACTS.map((c) => [c.code, c] as const))(
    '%s — tổng phần trăm các đợt bằng 100',
    (_code, contract) => {
      const share = contract.installments.reduce((n, d) => n + d.share, 0)
      expect(share).toBe(100)
    },
  )
})

describe('Công nợ tới hạn cộng lại đúng KPI của Trang chủ', () => {
  /** The overdue KPI says 890,000,000 across 2 invoices, and the receivables
   *  list splits that into 520 + 370. The three contracts must reproduce exactly
   *  that figure, otherwise the home screen and the contract book say two
   *  different things about one and the same day. */
  it('đợt chưa thu và đã tới hạn cộng lại = 890.000.000 ₫, đúng 2 đợt', () => {
    const duePast = SAO_DO_CONTRACTS.flatMap((c) => c.installments).filter(
      (d) => !d.paidAt && d.due <= SAO_DO_FROZEN_AT,
    )
    const kpi = SAO_DO_KPI.find((k) => k.key === 'overdue')

    expect(duePast).toHaveLength(kpi?.invoices ?? 0)
    expect(duePast.reduce((n, d) => n + d.amount, 0)).toBe(kpi?.value)
  })
})

describe('Bậc hạn đọc ra đúng thứ màn đang vẽ', () => {
  const installment2 = CONTRACT?.installments.find((d) => d.no === 2)

  it('đợt 2 là `due-soon` tại ngày đóng băng — còn 2 ngày', () => {
    expect(dueLevelOf(installment2?.due ?? '', SAO_DO_FROZEN_AT)).toBe('due-soon')
  })

  it('đợt 1 đã thu thì luôn `done`, kể cả khi so với ngày nào', () => {
    const installment1 = CONTRACT?.installments.find((d) => d.no === 1)
    expect(dueLevelOf(installment1?.due ?? '', SAO_DO_FROZEN_AT, installment1?.paidAt)).toBe('done')
  })

  it('đợt duy nhất của Minh Quang là `overdue` — trễ 12 ngày, chưa tới bậc lâu', () => {
    const mq = SAO_DO_CONTRACTS.find((c) => c.code === 'HĐ-2604')?.installments[0]
    expect(dueLevelOf(mq?.due ?? '', SAO_DO_FROZEN_AT)).toBe('overdue')
  })

  it('điều kiện khách chưa ký của đợt 2 là `overdue` — trễ 4 ngày', () => {
    const unsignedCondition = installment2?.conditions.find(
      (c) => c.side === 'customer' && !c.doneAt,
    )
    expect(unsignedCondition).toBeDefined()
    expect(dueLevelOf(unsignedCondition?.due ?? '', SAO_DO_FROZEN_AT)).toBe('overdue')
  })
})

describe('Mỗi điều kiện có đúng một bên chịu, và id không trùng', () => {
  it('không id nào lặp trong cả ba hợp đồng', () => {
    const ids = SAO_DO_CONTRACTS.flatMap((c) =>
      c.installments.flatMap((d) => [
        ...d.conditions.map((x) => x.id),
        ...d.docs.map((x) => x.id),
        ...d.records.map((x) => x.id),
        ...d.notes.map((x) => x.id),
      ]),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
})
