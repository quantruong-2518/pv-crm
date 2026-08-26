import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  notExists,
  sql,
  type SQL,
} from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { LeadBookQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { contract } from '../contract/contract.schema'
import { lead } from './lead.schema'
import type { LeadRead } from './lead.mapper'

export type LeadBookPage = {
  rows: (LeadRead & { ownerName: string | null })[]
  /** Số dòng người này ĐƯỢC thấy, sau khi áp cả bộ lọc lẫn trục phạm vi. */
  total: number
  /** Số dòng bộ lọc khớp nhưng phạm vi cắt đi. Đây là con số màn hiện thành
   *  "Bị ẩn theo quyền của bạn" (luật 7) — nó phải do máy chủ đếm, vì màn
   *  không đếm được thứ nó không nhận. */
  hidden: number
}

/** Số ngày lead nằm ở chỗ hiện tại.
 *
 *  Tính trong câu truy vấn chứ không đọc từ một cột: đây là con số đổi theo
 *  thời gian ngay cả khi không ai chạm vào dòng dữ liệu, nên một cột `days_here`
 *  chỉ đúng vào đêm job vừa chạy. Lead đã rơi thì đồng hồ dừng ở `exited_at`.
 *
 *  Qua `epoch` chứ không `EXTRACT(day FROM …)`: epoch luôn là tổng số giây của
 *  cả khoảng, không phụ thuộc cách Postgres cắt interval thành tháng/ngày. */
const DAYS_HERE = sql<number>`GREATEST(0, FLOOR(
  EXTRACT(epoch FROM COALESCE(${lead.exitedAt}, now()) - ${lead.stageSince}) / 86400
))::int`

/** Chỗ DUY NHẤT trong module lead có SQL.
 *
 *  Không quyết định gì về quyền: nó chỉ THI HÀNH trục phạm vi mà endpoint đã
 *  khai bằng `@Need({ scoped: true })`. Lọc ở SQL chứ không nạp cả sổ rồi cắt
 *  trong Node — một actor `ownOnly` gọi sổ 100 dòng mà nhận đủ 100 rồi mới lọc
 *  thì 100 dòng đó đã rời khỏi database, và đó là rò rỉ chứ không phải lãng
 *  phí. */
@Injectable()
export class LeadRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async book(who: Actor, q: LeadBookQuery, scoped: boolean): Promise<LeadBookPage> {
    const filters = this.filtersOf(q)

    /* Trục 3 so bằng `id`, KHÔNG bằng tên hiển thị. Đây là chỗ nợ số 2 được
       trả trước ở phía máy chủ: hai người trùng tên không thấy sổ của nhau. */
    const scope = scoped && who.ownOnly ? eq(lead.ownerId, who.id) : undefined

    /* Chỉ đếm LẦN HAI khi trục phạm vi thật sự đang cắt. Với một actor nhìn
       được cả sổ, `hidden` luôn bằng 0 — chạy thêm một COUNT toàn bảng mỗi
       lần mở sổ chỉ để in ra số 0 là trả phí cho một câu không ai hỏi. */
    const [scoped_, all] = await Promise.all([
      this.count(and(...filters, scope)),
      scope ? this.count(and(...filters)) : Promise.resolve(null),
    ])

    const rows = await this.db
      .select({ row: lead, ownerName: actor.name, daysHere: DAYS_HERE })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .where(and(...filters, scope))
      .orderBy(desc(lead.createdAt))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    return { rows, total: scoped_, hidden: all === null ? 0 : all - scoped_ }
  }

  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(lead).where(where)
    return r?.n ?? 0
  }

  /** Lead này đã ký chưa.
   *
   *  Hỏi thẳng bảng `contract` qua `lead_code`, một chặng trên một chỉ mục.
   *  Bản trước đọc cột `lead.contract_code`, nhưng cột đó đã bỏ khi quan hệ
   *  lead → cơ hội thành 1-n: một lead ký hai hợp đồng thì một cột chở không
   *  nổi, và cột thứ hai là chỗ để hai bên lệch nhau. */
  private signed(): SQL {
    return notExists(
      this.db
        .select({ one: sql`1` })
        .from(contract)
        .where(eq(contract.leadCode, lead.code)),
    )
  }

  private filtersOf(q: LeadBookQuery): (SQL | undefined)[] {
    return [
      q.stage ? eq(lead.stage, q.stage) : undefined,
      q.tier ? eq(lead.tier, q.tier) : undefined,
      q.category ? eq(lead.category, q.category) : undefined,
      /* "Còn chạy" = chưa rơi khỏi luồng và chưa ký. Định nghĩa này nằm ở
         `isRunning()` bên engine; ở đây là bản dịch sang SQL của cùng một câu,
         và bước B của doc bàn giao sẽ gộp chúng lại làm một. */
      q.running ? and(isNull(lead.exitReason), this.signed()) : undefined,
      q.running === false ? isNotNull(lead.exitReason) : undefined,
      q.q ? ilike(lead.company, `%${q.q}%`) : undefined,
    ]
  }
}
