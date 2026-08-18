import { systemClock, type Actor, type Clock, type ObjectRef } from './types'

/** E2 · Quyền & ghi vết.
 *
 *  Giữ: vai trò, phạm vi dữ liệu, nhật ký mọi hành động và **mọi lần AI đọc**.
 *
 *  Nhánh không tự kiểm quyền. Kết quả "Bị ẩn theo quyền của bạn" do E2 trả về —
 *  con số đó là `hidden` ở dưới, không phải thứ màn tự đếm. Màn 03 (Tìm toàn
 *  cục) bắt buộc hiện hàng này (AGENTS.md §7). */

export type Action = 'xem' | 'sửa' | 'duyệt' | 'xuất'

export type AuditEntry = {
  at: string
  actorId: string
  action: Action | 'ai-đọc'
  code?: string
  note?: string
}

export interface AccessControl {
  can(actor: Actor, action: Action, ref: ObjectRef): boolean
  /** Lọc danh sách VÀ đếm phần bị ẩn trong một lượt. Trả cả hai để màn không
   *  bao giờ có cơ hội hiện danh sách đã lọc mà quên hàng "bị ẩn". */
  visible<T extends { ref: ObjectRef }>(actor: Actor, items: T[]): { visible: T[]; hidden: number }
  /** Trợ lý AI đọc gì cũng phải đi qua đây — AI là khách hàng của E2, không
   *  phải ngoại lệ của E2. */
  aiRead(actor: Actor, refs: ObjectRef[]): ObjectRef[]
  log(entry: Omit<AuditEntry, 'at'> & { at?: string }): void
  trail(code?: string): AuditEntry[]
}

export function createAccessControl(opts: { clock?: Clock } = {}): AccessControl {
  const clock = opts.clock ?? systemClock
  const entries: AuditEntry[] = []

  const can: AccessControl['can'] = (actor, action, ref) => {
    if (!actor.branches.includes(ref.branch)) return false
    if (actor.ownOnly && ref.owner && ref.owner !== actor.name) return false
    if (action === 'duyệt' || action === 'sửa') return !actor.ownOnly || ref.owner === actor.name
    return true
  }

  const engine: AccessControl = {
    can,

    visible(actor, items) {
      const allowed = items.filter((i) => can(actor, 'xem', i.ref))
      return { visible: allowed, hidden: items.length - allowed.length }
    },

    aiRead(actor, refs) {
      const allowed = refs.filter((r) => can(actor, 'xem', r))
      for (const r of allowed) {
        entries.push({ at: clock(), actorId: actor.id, action: 'ai-đọc', code: r.code })
      }
      return allowed
    },

    log(entry) {
      entries.push({ ...entry, at: entry.at ?? clock() })
    },

    trail(code) {
      return code ? entries.filter((e) => e.code === code) : [...entries]
    },
  }

  return engine
}
