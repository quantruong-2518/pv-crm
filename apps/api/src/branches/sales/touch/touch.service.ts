import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  TouchTimelineResponse,
  type LeadTier,
  type TouchKind,
  type TouchSubject,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { toContract } from './touch.mapper'
import { TouchRepository } from './touch.repository'

/** Người ghi lần chạm, dùng chung cho cả nhánh Sales.
 *
 *  ------------------------------------------------------------------
 *  TẠI SAO LÀ MỘT SERVICE ĐƯỢC XUẤT RA, KHÔNG PHẢI MỘT REPOSITORY
 *  ------------------------------------------------------------------
 *  Luật của repo: `exports` của một module có service, không có repository —
 *  module khác được HỎI, không được với thẳng vào bảng. Bảng này bị ghi từ hai
 *  module khác (`LeadModule` và `OpportunityModule`) nên nó phải xuất ra một
 *  thứ gì đó, và thứ đó là đây.
 *
 *  Cùng hình với `ObjectMirror` và `MAIL_ENQUEUE`: nhận `tx` chứ không tự mở
 *  transaction, nên người gọi không thể vô tình ghi ra ngoài đơn vị công việc
 *  của mình. Ba facility, một quy ước.
 *
 *  ------------------------------------------------------------------
 *  SERVICE NÀY KHÔNG QUYẾT ĐỊNH QUYỀN, VÀ ĐÓ LÀ ĐIỀU CỐ Ý
 *  ------------------------------------------------------------------
 *  `timeline()` không nhận `Actor`. Một lần chạm không có chủ — nó thuộc về
 *  dòng nó nói tới — nên câu "người này đọc được không" là câu về LEAD hoặc về
 *  CƠ HỘI, và hai service kia đã trả lời nó bằng `byCode` trước khi hỏi tới
 *  đây. Nhét một `Actor` vào đây để "cho có kiểm" là dựng một hàng rào thứ hai
 *  đọc cùng một trục, thứ chỉ có việc khi hàng rào thật bị viết sai — và một
 *  hàng rào không chặn gì mà đọc như có chặn thì tệ hơn không có. */
@Injectable()
export class TouchService {
  constructor(private readonly repo: TouchRepository) {}

  /** Ghi một hoặc nhiều lần chạm TRONG transaction của người gọi. */
  async record(tx: Db, entries: readonly TouchEntry[]): Promise<void> {
    await this.repo.insert(
      tx,
      entries.map((e) => ({
        subjectCode: e.subjectCode,
        subjectKind: e.subjectKind,
        kind: e.kind,
        by: e.by,
        note: e.note,
        ...(e.toTier === undefined ? {} : { toTier: e.toTier }),
        ...(e.actorId === undefined ? {} : { actorId: e.actorId }),
        ...(e.at === undefined ? {} : { at: e.at }),
      })),
    )
  }

  async timeline(subjectCode: string): Promise<TouchTimelineResponse> {
    const rows = await this.repo.bySubject(subjectCode)
    return TouchTimelineResponse.parse({ rows: rows.map(toContract) })
  }
}

/** Một lần chạm sắp được ghi.
 *
 *  `by` là NGƯỜI, không phải id — bảng chép tên lúc ghi (xem docblock của
 *  `touch.schema.ts`). `byOf` dưới đây là đường duy nhất nên đi để dựng cặp
 *  `by`/`actorId`, vì nó là chỗ duy nhất biết "không có actor" phải đọc ra là
 *  gì. */
export type TouchEntry = {
  subjectCode: string
  subjectKind: TouchSubject
  kind: TouchKind
  by: string
  note: string
  /** BẮT BUỘC khi `kind` là `'len-bac'` — `touch_len_bac_co_bac` từ chối dòng
   *  thiếu nó. Đặt được cả với `'vao-so'` cho lead vào sổ đã có sẵn bậc. Kiểu
   *  không ép được điều kiện theo `kind` nên hàng rào thật nằm ở database; đây
   *  chỉ là chỗ mang giá trị đi. */
  toTier?: LeadTier
  actorId?: string
  /** Bỏ trống = `now()` của database. Chỉ đặt khi mốc thật khác lúc ghi. */
  at?: Date
}

/** Tên máy tự xưng khi không có ai bấm nút.
 *
 *  Cửa `POST /sales/leads/intake` là cửa ẩn danh — không có phiên, không có
 *  actor — nên dòng "vào sổ" của một lead từ landing page không gán được cho
 *  ai. `'Hệ thống'` là câu trả lời thật cho câu hỏi "ai làm việc này", và nó
 *  đọc được trên màn; để trống `by` thì `touch_no_blank` từ chối, mà nhét một
 *  actor giả vào là ghi một cái tên không làm gì cả. */
export const SYSTEM_ACTOR = 'Hệ thống'

/** Cặp `by`/`actorId` từ một actor có thể vắng mặt. */
export function byOf(who: Actor | null | undefined): Pick<TouchEntry, 'by' | 'actorId'> {
  return who ? { by: who.name, actorId: who.id } : { by: SYSTEM_ACTOR }
}
