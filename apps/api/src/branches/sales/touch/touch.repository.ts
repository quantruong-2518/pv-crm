import { desc, eq } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { touch, type TouchRowDb, type TouchValues } from './touch.schema'

/** Chỗ DUY NHẤT của module lần chạm có SQL.
 *
 *  Không có trục phạm vi ở đây, và đó là chủ ý: một lần chạm không có chủ. Nó
 *  thuộc về dòng nó nói tới, nên câu "được đọc không" đã được trả lời ở chỗ
 *  người ta đọc chính dòng đó — `LeadService.touches` và
 *  `OpportunityService.touches` đều đi qua `byCode` trước, ăn đủ 404 và 403,
 *  rồi mới hỏi tới đây. Dựng thêm một trục phạm vi thứ hai trên bảng này nghĩa
 *  là cùng một câu hỏi có hai câu trả lời, và ngày chúng lệch thì không ai biết
 *  bên nào đúng. */
@Injectable()
export class TouchRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Ghi. Nhận `tx` chứ không tự mở transaction — cùng hình với
   *  `ObjectMirror.put` và `MailEnqueue.enqueue`, và vì cùng lý do: một lần
   *  chạm nói về một lượt ghi, nên nó phải cùng vào hoặc cùng không với lượt
   *  ghi đó. Một dòng thời gian ghi "đơn vừa chuyển sang Đàm phán" cho một
   *  lượt UPDATE đã rollback là một dòng không ai gỡ được bằng tay. */
  async insert(tx: Db, rows: readonly TouchValues[]): Promise<void> {
    if (rows.length === 0) return

    /* Cắt khúc vì trần 65.535 tham số ràng buộc của Postgres, không vì bền
       vững — mọi khúc chạy trong đúng `tx` người gọi đưa vào. Một lô nạp 2.000
       đơn đẻ 4.000 lần chạm, và bảy cột mỗi dòng thì vẫn dưới trần; con số
       dưới đây là để nó ở dưới trần cả khi bảng dài thêm cột. */
    const CHUNK = 1_000
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      if (slice.length > 0) await tx.insert(touch).values(slice)
    }
  }

  /** Cả dòng thời gian của một mã, mới nhất trước.
   *
   *  Không phân trang và không `LIMIT`. Số dòng ở đây bị chặn bởi thứ có thật —
   *  bao nhiêu việc đã làm trên MỘT lead hoặc MỘT đơn — chứ không bởi kích cỡ
   *  sổ: một lô nạp 2.000 dòng đẻ ra 2.000 lần chạm trên 2.000 mã khác nhau,
   *  mỗi mã một dòng. Cắt bằng `LIMIT` ở đây là phân trang giấu mặt, và một
   *  dòng thời gian giấu đuôi thì nói dối về đúng câu nó sinh ra để trả lời.
   *
   *  `id` phá hoà: hai lần chạm ghi trong cùng một transaction có cùng
   *  `now()` — Postgres đóng băng `now()` theo transaction — nên không có nó
   *  thì hai lượt đọc cùng một hồ sơ trả về hai thứ tự khác nhau. */
  async bySubject(code: string): Promise<TouchRowDb[]> {
    return this.db
      .select()
      .from(touch)
      .where(eq(touch.subjectCode, code))
      .orderBy(desc(touch.at), desc(touch.id))
  }
}
