import { describe, expect, it } from 'vitest'
import { WORKSTREAM_PRIORITY_LADDER } from './workstream-priority'

/** The repository translates this ladder into `ORDER BY` by hand. Nothing in
 *  the compiler notices when the SQL and the ladder drift apart, so the rungs
 *  and the side each one sends its nulls to are pinned here. */

describe('Thang ưu tiên của sổ hành trình', () => {
  it('bốn bậc, đúng thứ tự đã chốt', () => {
    expect(WORKSTREAM_PRIORITY_LADDER.map((r) => r.key)).toEqual([
      'overdueBy',
      'waitingOverdue',
      'lastContactedAt',
      'openedAt',
    ])
  })

  it('trễ nhiều lên trên, và không có hạn thì xuống cuối', () => {
    expect(WORKSTREAM_PRIORITY_LADDER[0]).toEqual({
      key: 'overdueBy',
      dir: 'desc',
      nulls: 'last',
    })
  })

  it('chưa liên lạc bao giờ lên ĐẦU, không phải xuống cuối', () => {
    expect(WORKSTREAM_PRIORITY_LADDER[2]).toEqual({
      key: 'lastContactedAt',
      dir: 'asc',
      nulls: 'first',
    })
  })

  it('bậc chót là mở lâu nhất, cũ nhất lên trên', () => {
    expect(WORKSTREAM_PRIORITY_LADDER[3]).toEqual({
      key: 'openedAt',
      dir: 'asc',
      nulls: 'last',
    })
  })
})
