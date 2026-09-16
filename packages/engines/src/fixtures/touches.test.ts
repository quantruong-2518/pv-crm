import { describe, expect, it } from 'vitest'
import { BOOK_SPLIT, FIRST_MEETINGS, LEADS, hasFirstMeeting } from './das-vina'
import type { LeadEvent, LeadEventKind } from './das-vina'

/** Locks the TIMELINE of the frozen book — the one thing `db:seed` now carries
 *  into `sales.touch`, and the one thing no compiler can check.
 *
 *  This is the single exception to "no generated tests" (CLAUDE.md · Test).
 *  Every number here is demo data that reaches a screen: get one wrong and the
 *  activity card still draws, the flow vector still renders, and only the
 *  person demoing finds out — in front of somebody.
 *
 *  Four of the five counts are asserted against a constant that was already
 *  agreed rather than against a number typed here. That is deliberate: a bare
 *  `toBe(52)` is a second place to state one fact, and the two drift. Tying
 *  them together means a change to the book and a change to its history cannot
 *  disagree silently — which is exactly the failure this file exists to catch. */

const HISTORY: LeadEvent[] = LEADS.flatMap((l) => l.history)

const countOf = (kind: LeadEventKind) => HISTORY.filter((e) => e.kind === kind).length

describe('Dòng thời gian · kịch bản 2 · DAS Vina', () => {
  it('mỗi lead vào sổ đúng một lần', () => {
    expect(countOf('created')).toBe(LEADS.length)
  })

  it('số lần ký khớp số hợp đồng của sổ', () => {
    expect(countOf('signed')).toBe(BOOK_SPLIT.signed)
  })

  it('số lần ra khỏi luồng khớp số lead đã rơi', () => {
    expect(countOf('exited')).toBe(BOOK_SPLIT.exited)
  })

  it('số buổi gặp đầu khớp hằng số đã chốt, và khớp điều kiện của nó', () => {
    expect(countOf('first-meeting')).toBe(FIRST_MEETINGS)
    expect(LEADS.filter(hasFirstMeeting).length).toBe(FIRST_MEETINGS)
  })

  /* The volume `db:seed` writes. No older constant says it, so it is stated
     once, here, next to the data it counts. */
  it('cả sổ sinh đúng 498 mốc', () => {
    expect(HISTORY.length).toBe(498)
  })
})

describe('Ràng buộc mà bảng `sales.touch` sẽ từ chối', () => {
  /* Each of these mirrors a CHECK. A row that fails one does not reach a
     screen looking wrong — it aborts `db:seed` with a constraint name, which
     is a worse place to learn about it than here. */

  it('mọi mốc lên bậc đều tự khai bậc — `touch_tier_raised_has_tier`', () => {
    const naked = HISTORY.filter((e) => e.kind === 'tier-raised' && !e.toTier)
    expect(naked).toEqual([])
  })

  it('bậc khai ra dừng đúng ở bậc lead đang đứng', () => {
    for (const lead of LEADS) {
      const rungs = lead.history.filter((e) => e.kind === 'tier-raised')
      const last = rungs.at(-1)?.toTier ?? 'prospect'
      expect(last, lead.code).toBe(lead.tier)
    }
  })

  it('chỉ `handed-over` và `created` chở người nhận — `touch_hand_over_sides`', () => {
    const wrong = HISTORY.filter(
      (e) => e.toName && e.kind !== 'handed-over' && e.kind !== 'created',
    )
    expect(wrong).toEqual([])
  })

  it('chỉ `handed-over` chở người giao — `touch_hand_over_sides`', () => {
    const wrong = HISTORY.filter((e) => e.fromName && e.kind !== 'handed-over')
    expect(wrong).toEqual([])
  })

  it('mọi lần giao đều nêu được ít nhất một đầu — `touch_handed_over_names_an_end`', () => {
    const naked = HISTORY.filter((e) => e.kind === 'handed-over' && !e.fromName && !e.toName)
    expect(naked).toEqual([])
  })
})

describe('Nửa trái của vector luồng', () => {
  it('mọi lead đều có ít nhất một mắt — không hồ sơ nào mở ra trống', () => {
    const blind = LEADS.filter(
      (l) => !l.history.some((e) => e.toName && (e.kind === 'handed-over' || e.kind === 'created')),
    )
    expect(blind).toEqual([])
  })

  it('lead đã qua bậc đầu mối thì chuỗi có hai mắt, và mắt sau nối mắt trước', () => {
    const moved = LEADS.filter((l) => l.tier !== 'prospect')
    expect(moved.length).toBeGreaterThan(0)

    for (const lead of moved) {
      const entered = lead.history.find((e) => e.kind === 'created')
      const handed = lead.history.find((e) => e.kind === 'handed-over')

      /* The chain has to JOIN: whoever received the lead on the way in is
         whoever gives it away next. A break here draws a vector with two
         people who never met. */
      expect(handed?.fromName, lead.code).toBe(entered?.toName)
    }
  })
})
