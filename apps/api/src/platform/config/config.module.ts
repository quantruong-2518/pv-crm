import { Global, Module } from '@nestjs/common'
import { ENV, loadEnv, type Env } from './env'

/** Cấu hình môi trường — module RIÊNG, không nằm nhờ trong `DbModule`.
 *
 *  Trước đó `ENV` được cấp bên trong `DbModule`, và điều đó sai ở chỗ nó gắn
 *  một thứ toàn cục (biến môi trường) vào vòng đời của một thứ hạ tầng cụ thể
 *  (pool Postgres). Ngày nào worker cần env mà không cần database, hoặc ngày
 *  `DbModule` bị tách ra, `ENV` biến mất cùng nó mà không có lý do nào.
 *
 *  Đây là một trong HAI module được phép `@Global()` — xem `app.module.ts`. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
