import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/** Entrypoint THỨ HAI, trên cùng một image với `main.ts`.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO CÓ FILE NÀY KHI CHƯA CÓ JOB NÀO
 *  ------------------------------------------------------------------
 *  Việc nặng — E4 gửi Zalo/email theo lịch và chống trùng, nạp lead từ tệp
 *  hàng nghìn dòng — không được chung tiến trình với web request: một lần
 *  import 5.000 dòng sẽ giữ event loop đủ lâu để mọi người khác thấy app treo.
 *
 *  Nhưng đó KHÔNG cần một service riêng. Cùng codebase, cùng deploy, cùng
 *  image, đổi lệnh chạy:
 *
 *      node dist/apps/api/src/main.js      # HTTP
 *      node dist/apps/api/src/worker.js    # job
 *
 *  Được đúng phần cô lập cần có, không mất gì. Đây là câu trả lời cụ thể cho
 *  "có cần microservice không" — không, cần tách TIẾN TRÌNH, và tách tiến
 *  trình thì rẻ.
 *
 *  `createApplicationContext` dựng cây DI mà KHÔNG mở cổng HTTP: worker dùng
 *  chung engine, repository, cấu hình với máy chủ web, nhưng không nhận
 *  request. Khi E4 lên, pg-boss được đăng ký ở đây và các consumer lấy
 *  service từ chính context này. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false })
  app.enableShutdownHooks()

  const log = new Logger('worker')
  log.log('Worker đã lên. Chưa có consumer nào đăng ký — pg-boss lên cùng E4.')

  /* Giữ tiến trình sống. Khi có pg-boss, dòng này thay bằng `boss.start()` và
     các `boss.work(...)`; tới lúc đó chính hàng đợi giữ tiến trình. */
  process.on('SIGTERM', () => void app.close())
  process.on('SIGINT', () => void app.close())
}

void bootstrap()
