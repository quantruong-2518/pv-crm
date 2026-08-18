import type { Edge, ObjectRef } from './types'

/** E1 · Đồ thị object.
 *
 *  Giữ: mã, kiểu, chủ sở hữu, quan hệ, vòng đời của mọi object
 *  (`HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`).
 *
 *  Nhánh tạo và cập nhật object của mình, đọc object nhánh khác qua đồ thị.
 *  **ContextRail dựng thẳng từ đây** (luật 10 · docs/luat-thiet-ke.md) — màn KHÔNG tự viết
 *  tay danh sách chip, vì hai màn viết tay hai lần sẽ lệch nhau. */
export interface ObjectGraph {
  get(code: string): ObjectRef | undefined
  /** Object do `code` sinh ra hoặc bị `code` chặn. */
  children(code: string): ObjectRef[]
  parents(code: string): ObjectRef[]
  /** Chuỗi object của cùng một câu chuyện, theo thứ tự sinh ra.
   *  Đây là đầu vào duy nhất hợp lệ của ContextRail. */
  story(code: string): ObjectRef[]
  all(): ObjectRef[]
}

export function createObjectGraph(objects: ObjectRef[], edges: Edge[]): ObjectGraph {
  const byCode = new Map(objects.map((o) => [o.code, o]))

  const dup = objects.length - byCode.size
  if (dup > 0) throw new Error(`E1: ${dup} mã object trùng nhau trong cùng một kịch bản`)

  for (const e of edges) {
    if (!byCode.has(e.from)) throw new Error(`E1: cạnh trỏ tới object không tồn tại: ${e.from}`)
    if (!byCode.has(e.to)) throw new Error(`E1: cạnh trỏ tới object không tồn tại: ${e.to}`)
  }

  const refs = (codes: string[]) =>
    codes.flatMap((c) => {
      const o = byCode.get(c)
      return o ? [o] : []
    })

  const childCodes = (code: string) => edges.filter((e) => e.from === code).map((e) => e.to)
  const parentCodes = (code: string) => edges.filter((e) => e.to === code).map((e) => e.from)

  const graph: ObjectGraph = {
    get: (code) => byCode.get(code),
    children: (code) => refs(childCodes(code)),
    parents: (code) => refs(parentCodes(code)),
    all: () => [...objects],

    story(code) {
      const node = byCode.get(code)
      if (!node) return []

      // 1 · leo ngược lên gốc câu chuyện
      let root = node
      const climbed = new Set([root.code])
      for (;;) {
        const up = parentCodes(root.code).find((c) => !climbed.has(c))
        if (!up) break
        climbed.add(up)
        const next = byCode.get(up)
        if (!next) break
        root = next
      }

      // 2 · trải mọi đường đi từ gốc xuống lá
      const paths: string[][] = []
      const walk = (cur: string, acc: string[]) => {
        const next = childCodes(cur).filter((c) => !acc.includes(c))
        if (next.length === 0) {
          paths.push(acc)
          return
        }
        for (const c of next) walk(c, [...acc, c])
      }
      walk(root.code, [root.code])

      // 3 · chọn đường dài nhất có chứa `code`; hoà thì lấy theo thứ tự mã để
      //     kết quả tất định — ContextRail không được đổi thứ tự giữa hai lần render.
      const candidates = paths.filter((p) => p.includes(code))
      const pool = candidates.length > 0 ? candidates : paths
      const best = [...pool].sort(
        (a, b) => b.length - a.length || a.join('>').localeCompare(b.join('>')),
      )[0]

      return best ? refs(best) : [node]
    },
  }

  return graph
}
