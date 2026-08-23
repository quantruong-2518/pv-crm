import { Controller, Get, Inject } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { Public } from '../access/need.decorator'
import { DB, type Db } from '../db/db.module'

/** `GET /healthz` — cho Docker, cho load balancer, cho người trực.
 *
 *  `@Public()` là bắt buộc và là chỗ dùng đúng của nó: một health check phải
 *  trả lời được KHI phiên hỏng, đó chính là lúc người ta cần nó nhất.
 *
 *  Chạm database thật bằng `SELECT 1` chứ không trả `{ ok: true }` cứng. Một
 *  health check luôn xanh là một health check không kiểm gì — tiến trình còn
 *  sống mà pool Postgres đã chết là đúng tình huống nó phải bắt được. */
@Controller('healthz')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Public()
  async check(): Promise<{ status: 'ok' | 'degraded'; db: boolean }> {
    try {
      await this.db.execute(sql`SELECT 1`)
      return { status: 'ok', db: true }
    } catch {
      return { status: 'degraded', db: false }
    }
  }
}
