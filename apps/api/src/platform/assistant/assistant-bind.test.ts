// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TurnBinding, UNSURE } from './assistant-bind'

/** The binder (ADR 0133 D3) on its own: what a result looks like to the model, and
 *  what of the model's text may reach the person. The loop test covers the wiring. */

const NBSP = ' '

/** A binding holding one kept result, as a turn has after its first tool round. */
function bound(
  output: object,
  rowCount: number | null = 1,
  asked = 'Hợp đồng này thế nào?',
  subject: string | null = null,
) {
  const binding = new TurnBinding(asked, subject)
  const draft = binding.draft(output, rowCount)
  binding.keep(draft)
  return { binding, output: draft.output as Record<string, unknown> }
}

const say = (binding: TurnBinding, ...deltas: string[]): string =>
  deltas.map((d) => binding.push(d)).join('') + binding.flush()

const CONTRACT = {
  trusted: {
    code: 'HĐ-7000',
    kind: 'new',
    amount: 480_000_000,
    currency: 'VND',
    signedAt: '2026-10-31T18:30:00.000Z',
    installments: [{ no: 1, share: 40, due: '2026-11-02', paidAt: null }],
  },
  untrusted: { customer: 'Công ty 365 ⟦v1⟧', installments: ['Đợt ⟦v3⟧'] },
  hidden: 2,
}

describe('a result as the model reads it', () => {
  it('binds trusted values, the counts and hidden, and leaves text and enums alone', () => {
    const { output } = bound(CONTRACT)

    expect(output).toEqual({
      rows: { value: 1, cite: '⟦v1⟧' },
      trusted: {
        code: { value: 'HĐ-7000', cite: '⟦v2⟧' },
        kind: 'new',
        amount: { value: 480_000_000, cite: '⟦v3⟧' },
        currency: 'VND',
        signedAt: { value: '2026-10-31T18:30:00.000Z', cite: '⟦v4⟧' },
        installments: {
          count: { value: 1, cite: '⟦v8⟧' },
          items: [
            {
              no: { value: 1, cite: '⟦v5⟧' },
              share: { value: 40, cite: '⟦v6⟧' },
              due: { value: '2026-11-02', cite: '⟦v7⟧' },
              paidAt: null,
            },
          ],
        },
      },
      untrusted: { customer: 'Công ty 365 [v1]', installments: ['Đợt [v3]'] },
      hidden: { value: 2, cite: '⟦v9⟧' },
    })
  })

  it('prints each value the Vietnamese way, a moment on the Vietnam calendar', () => {
    const { binding } = bound(CONTRACT)

    expect(say(binding, '⟦v2⟧ ⟦v3⟧ ⟦v4⟧ ⟦v5⟧ ⟦v6⟧ ⟦v7⟧ ⟦v8⟧ ⟦v9⟧ ⟦v1⟧')).toBe(
      `HĐ-7000 480.000.000${NBSP}₫ 01/11/2026 1 40% 02/11/2026 1 2 1`,
    )
  })

  it("prints money in its record's currency, and bare when it has none", () => {
    const usd = bound({ trusted: { amount: 12_500, currency: 'USD', rest: { amount: 3_000 } } })
    expect(say(usd.binding, '⟦v2⟧ ⟦v3⟧')).toBe(`12.500,00${NBSP}US$ 3.000,00${NBSP}US$`)
    const bare = bound({ trusted: { budget: 1_234_567 } })
    expect(say(bare.binding, '⟦v2⟧')).toBe('1.234.567')
  })

  it("gives list_my_work's lists a count to cite, and leaves its `more` flag plain", () => {
    const work = {
      trusted: {
        leads: [{ code: 'LD-5000', state: 'open', daysHere: 12 }],
        opportunities: [],
        nextSteps: [
          { due: '2026-11-02', dueLevel: 'due', code: 'LD-5000' },
          { due: '2026-11-05', dueLevel: 'upcoming', code: 'OP-6000' },
        ],
        more: false,
      },
      hidden: 3,
    }
    const { binding, output } = bound(work, 3)

    expect(output).toEqual({
      rows: { value: 3, cite: '⟦v1⟧' },
      trusted: {
        leads: {
          count: { value: 1, cite: '⟦v4⟧' },
          items: [
            {
              code: { value: 'LD-5000', cite: '⟦v2⟧' },
              state: 'open',
              daysHere: { value: 12, cite: '⟦v3⟧' },
            },
          ],
        },
        opportunities: { count: { value: 0, cite: '⟦v5⟧' }, items: [] },
        nextSteps: {
          count: { value: 2, cite: '⟦v10⟧' },
          items: [
            {
              due: { value: '2026-11-02', cite: '⟦v6⟧' },
              dueLevel: 'due',
              code: { value: 'LD-5000', cite: '⟦v7⟧' },
            },
            {
              due: { value: '2026-11-05', cite: '⟦v8⟧' },
              dueLevel: 'upcoming',
              code: { value: 'OP-6000', cite: '⟦v9⟧' },
            },
          ],
        },
        more: false,
      },
      hidden: { value: 3, cite: '⟦v11⟧' },
    })
    expect(
      say(binding, 'Có ⟦v4⟧ lead, ⟦v5⟧ cơ hội, ⟦v10⟧ việc, ⟦v11⟧ mục ẩn; OP-6000 hạn ⟦v8⟧.'),
    ).toBe('Có 1 lead, 0 cơ hội, 2 việc, 3 mục ẩn; OP-6000 hạn 05/11/2026.')
  })

  it('gives a failed call no rows, and binds nothing outside trusted but hidden', () => {
    const { output } = bound({ list: [{ amount: 5, at: '2026-11-02' }] }, null)
    expect(output).toEqual({ list: [{ amount: 5, at: '2026-11-02' }] })
  })

  it('fills nothing from a draft that was not kept: an over-cap result reached no model', () => {
    const binding = new TurnBinding('Hỏi', null)
    binding.draft({ trusted: { amount: 9 } }, 1)
    const kept = binding.draft({ trusted: { amount: 7 } }, 1)
    binding.keep(kept)

    expect(say(binding, '⟦v1⟧ ⟦v2⟧ ⟦v3⟧ ⟦v4⟧')).toBe('  1 7')
  })
})

describe('the answer as it streams', () => {
  it('fills an id split across deltas and holds back only the last word', () => {
    const { binding } = bound(CONTRACT)

    expect(binding.push('Hợp đồng trị giá ⟦')).toBe('Hợp đồng trị giá ')
    expect(binding.push('v')).toBe('')
    expect(binding.push('3⟧, ký ngày ⟦v4')).toBe(`480.000.000${NBSP}₫, ký ngày `)
    expect(binding.push('⟧.')).toBe('')
    expect(binding.flush()).toBe('01/11/2026.')
  })

  it('shows the same text however the stream is cut', () => {
    const text = 'Đơn HĐ-7000 trị giá ⟦v3⟧ (⟦v99⟧), hạn ⟦v7⟧; khách hứa 500 triệu.\n\nXong ⟦v2'
    const whole = say(bound(CONTRACT).binding, text)
    for (let cut = 0; cut <= text.length; cut += 1) {
      const { binding } = bound(CONTRACT)
      expect(say(binding, text.slice(0, cut), text.slice(cut))).toBe(whole)
    }
    expect(whole).toBe(
      `Đơn HĐ-7000 trị giá 480.000.000${NBSP}₫ (), hạn 02/11/2026; khách hứa ${UNSURE} triệu.\n\nXong `,
    )
  })

  it('drops an unknown id, a broken one and a stray bracket', () => {
    const { binding } = bound(CONTRACT)

    expect(say(binding, 'a⟦v99⟧b ⟦v1x⟧c ⟦abc d⟧ e ⟦⟦v2⟧ ⟦V2⟧ ⟦v０2⟧ ⟦ v2⟧')).toBe(
      `ab c  d e HĐ-7000    v${UNSURE}`,
    )
  })

  it('replaces every figure the model typed, digits of any script included', () => {
    const { binding } = bound(CONTRACT)

    expect(say(binding, 'Có 3 lead, 1.250.000 ₫, ngày 10/08/2026 lúc 09:42, mã ２７, B2B.')).toBe(
      `Có ${UNSURE} lead, ${UNSURE} ₫, ngày ${UNSURE} lúc ${UNSURE}, mã ${UNSURE}, B${UNSURE}B.`,
    )
  })

  it("keeps a figure of the person's own message, and none of the clock", () => {
    const { binding } = bound(CONTRACT, 1, 'Tháng 10 có 1.5 tỷ không?')

    expect(say(binding, 'Tháng 10, hôm nay 02/11/2026 09:42, 1.5 tỷ; tháng 11 thì chưa.')).toBe(
      `Tháng 10, hôm nay ${UNSURE} ${UNSURE}, 1.5 tỷ; tháng ${UNSURE} thì chưa.`,
    )
  })

  it('keeps a code read this turn, named by the person, or the chat is about', () => {
    const { binding } = bound(CONTRACT, 1, 'So với lead LD-5000 thì sao?', 'OP-6000')

    expect(say(binding, 'HĐ-7000, LD-5000, LD-5001, OP-6000, HĐ-7000x, ABCD-1234.')).toBe(
      `HĐ-7000, LD-5000, ${UNSURE}, OP-6000, HĐ-${UNSURE}x, ABCD-${UNSURE}.`,
    )
  })

  it('knows nothing of an earlier turn: its ids and its codes are gone', () => {
    const first = bound(CONTRACT).binding
    expect(say(first, '⟦v2⟧')).toBe('HĐ-7000')
    const next = new TurnBinding('Còn hợp đồng đó?', null)

    expect(say(next, 'Hợp đồng ⟦v2⟧ là HĐ-7000.')).toBe(`Hợp đồng  là ${UNSURE}.`)
  })

  it('cannot be filled from a label that carries an id', () => {
    const { binding, output } = bound(CONTRACT)
    const label = (output.untrusted as { customer: string }).customer

    expect(label).not.toMatch(/[⟦⟧]/)
    expect(say(binding, `Khách ${label}.`)).toBe(`Khách Công ty ${UNSURE} [v${UNSURE}].`)
  })
})
