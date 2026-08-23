import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common'
import { ENV, type Env } from '../config/env'
import { createDb, type Db, type DbHandle } from './create-db'

export const DB_HANDLE = Symbol('pv.db.handle')
export const DB = Symbol('pv.db')

export type { Db }

/** Kết nối database — MỘT cho cả tiến trình, driver chọn theo `DATABASE_URL`.
 *
 *  Không truyền `schema` toàn cục cho `drizzle()`: làm thế thì tầng platform
 *  phải nhập bảng của mọi nhánh vào một chỗ, tức phá đúng luật "platform không
 *  biết nhánh". Mỗi repository nhập bảng của chính nó và gọi
 *  `db.select().from(bảng)` — mất API truy vấn quan hệ của Drizzle, đổi lại
 *  giữ được ranh giới. Đó là món đổi có lãi.
 *
 *  Một trong ĐÚNG HAI module được `@Global()` — xem `app.module.ts`. */
@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      useFactory: async (env: Env): Promise<DbHandle> => {
        const handle = await createDb(env.DATABASE_URL)
        new Logger('db').log(`Driver: ${handle.kind}`)
        return handle
      },
      inject: [ENV],
    },
    { provide: DB, useFactory: (h: DbHandle): Db => h.db, inject: [DB_HANDLE] },
  ],
  exports: [DB, DB_HANDLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  /** Đóng kết nối khi tiến trình dừng. Không đóng thì ở production mỗi lần
   *  deploy để lại vài kết nối chết, còn với PGlite thì thư mục dữ liệu không
   *  được ghi nốt phần đang nằm trong bộ đệm.
   *  Hook chỉ chạy khi `app.enableShutdownHooks()` đã bật — xem `main.ts`. */
  async onApplicationShutdown(): Promise<void> {
    await this.handle.close()
  }
}
