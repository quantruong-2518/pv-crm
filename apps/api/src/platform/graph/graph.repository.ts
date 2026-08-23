import { inArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Edge, ObjectRef } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { edge, objectRef } from '../db/platform.schema'

/** Độ sâu tối đa khi lan ra từ một object.
 *
 *  Có giới hạn chứ không đi tới hết: đồ thị của một ERP đang chạy có thể nối
 *  gần như mọi thứ với mọi thứ qua vài chặng, và một `story()` kéo về nửa cơ
 *  sở dữ liệu là một câu truy vấn giết máy chủ. Mười hai chặng dài hơn chuỗi
 *  dài nhất mà nghiệp vụ có (lead → cơ hội → báo giá → hợp đồng → SO → WO →
 *  PO → lô hàng), nên nó cắt đúng phần bệnh lý. */
const MAX_DEPTH = 12

/** E1 cần I/O — và I/O nằm ở ĐÂY, không nằm trong engine.
 *
 *  Đây là chỗ luật chịu lực của cả `apps/api` được thể hiện rõ nhất:
 *  `createObjectGraph(objects, edges)` là hàm THUẦN, ĐỒNG BỘ, nhận dữ liệu đã
 *  nạp. Trên trình duyệt dữ liệu đó là fixture; ở đây là kết quả một recursive
 *  CTE. Engine không biết khác biệt đó, và không được biết — ngày nó tự đi
 *  truy vấn là ngày `story()` trả `Promise` và mọi màn bên `apps/web` gãy. */
@Injectable()
export class GraphRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Vùng lân cận liên thông quanh một mã, đi theo CẢ HAI chiều cạnh. */
  async neighbourhood(code: string): Promise<{ objects: ObjectRef[]; edges: Edge[] }> {
    /* Cạnh được nhân đôi thành vô hướng TRƯỚC khi đệ quy. Không làm thế thì
       phải có hai nhánh UNION cùng trỏ vào `reach`, mà Postgres chỉ cho phép
       MỘT tham chiếu tới thuật ngữ đệ quy trong một CTE. */
    /* `Db` là kiểu KHÔNG khoá driver (xem `create-db.ts`), nên `execute()` ở
       lớp cha `PgDatabase` không biết trước hình kết quả: node-postgres trả
       `QueryResult`, PGlite trả `Results`. Cả hai đều có `.rows` — đây là chỗ
       DUY NHẤT trong cả app phải nói ra điều đó bằng tay, và cái giá đó rẻ
       hơn việc hàn tầng dữ liệu vào một driver. */
    const reached = (await this.db.execute(sql`
      WITH RECURSIVE undirected(a, b) AS (
        SELECT from_code, to_code FROM ${edge}
        UNION ALL
        SELECT to_code, from_code FROM ${edge}
      ),
      reach(code, depth) AS (
        SELECT ${code}::text, 0
        UNION
        SELECT u.b, r.depth + 1
          FROM undirected u
          JOIN reach r ON u.a = r.code
         WHERE r.depth < ${MAX_DEPTH}
      )
      SELECT DISTINCT code FROM reach
    `)) as { rows: { code: string }[] }

    const codes = reached.rows.map((r) => r.code)
    if (codes.length === 0) return { objects: [], edges: [] }

    /* Hai câu chạy song song — chúng không phụ thuộc nhau. */
    const [objects, edges] = await Promise.all([
      this.db.select().from(objectRef).where(inArray(objectRef.code, codes)),
      this.db
        .select()
        .from(edge)
        .where(sql`${edge.fromCode} = ANY(${codes}) AND ${edge.toCode} = ANY(${codes})`),
    ])

    return {
      objects: objects.map((o) => ({
        code: o.code,
        kind: o.kind,
        branch: o.branch,
        label: o.label,
        ...(o.owner ? { owner: o.owner } : {}),
        ...(o.state ? { state: o.state } : {}),
        ...(o.amount !== null ? { amount: o.amount } : {}),
      })),
      edges: edges.map((e) => ({ from: e.fromCode, to: e.toCode, kind: e.kind })),
    }
  }
}
