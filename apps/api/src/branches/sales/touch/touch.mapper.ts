import type { TouchRow } from '@pv/contracts'
import type { TouchRowDb } from './touch.schema'

/** Bảng ↔ dây. Không quyết định gì, không đọc gì.
 *
 *  Ngắn tới mức gần như thừa, và vẫn tồn tại vì đúng hai lý do mà mọi mapper
 *  khác của nhánh này cũng có: `at` phải ra khỏi `Date` thành chuỗi ISO ở ĐÚNG
 *  một chỗ, và `actor_id` NULL phải thành trường VẮNG MẶT chứ không thành
 *  `null` — hợp đồng dùng `.optional()`, và `null` ở đó là một 500 lúc
 *  `TouchTimelineResponse.parse` chứ không phải một trường rỗng. */
export function toContract(row: TouchRowDb): TouchRow {
  return {
    id: row.id,
    at: row.at.toISOString(),
    subjectCode: row.subjectCode,
    subjectKind: row.subjectKind,
    kind: row.kind,
    ...(row.toTier ? { toTier: row.toTier } : {}),
    by: row.by,
    ...(row.actorId ? { actorId: row.actorId } : {}),
    /* Both halves of an end or neither, tested on the NAME: the table keeps the
       pair whole (`touch_hand_over_sides`), and reading it back one column at a
       time is how a half end would reach a screen that cannot draw it. */
    ...(row.fromName && row.fromActorId
      ? { from: { actorId: row.fromActorId, name: row.fromName } }
      : {}),
    ...(row.toName && row.toActorId ? { to: { actorId: row.toActorId, name: row.toName } } : {}),
    note: row.note,
  }
}
