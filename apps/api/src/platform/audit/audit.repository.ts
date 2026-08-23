import { Inject, Injectable } from '@nestjs/common'
import type { Action } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { audit } from '../db/platform.schema'

export type AuditEntry = {
  actorId: string
  action: Action | 'ai-read'
  code?: string
  note?: string
}

/** Ghi vết — bền, không phải mảng trong RAM.
 *
 *  Ghi ở chỗ CHẶN THẬT, không ghi trong `access.check()`. `check()` chạy trong
 *  mọi vòng lặp lọc danh sách; log ở đó thì mỗi lần mở sổ đẻ vài trăm dòng và
 *  nhật ký thôi trả lời được câu nó sinh ra để trả lời ("vì sao hôm đó tôi
 *  không lấy được dữ liệu"). Lý do này được viết sẵn trong `e2-access.ts`. */
@Injectable()
export class AuditRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async write(entry: AuditEntry): Promise<void> {
    await this.db.insert(audit).values(entry)
  }
}
