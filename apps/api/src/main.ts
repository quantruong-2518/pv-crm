import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { ENV, type Env } from './platform/config/env'

/** Điểm vào HTTP.
 *
 *  Chạy trên `FastifyAdapter` chứ không phải Express mặc định: chuỗi hook của
 *  Fastify (`onRequest` → `preHandler` → `onError`) là đúng hình chuỗi
 *  interceptor `BEFORE`/`AFTER` mà `apps/web/src/app/api/client.ts` đã dựng,
 *  nên hai đầu dây đọc giống nhau.
 *
 *  Worker của pg-boss (E4 gửi thông báo, nạp lead từ tệp) là entrypoint THỨ HAI
 *  trên cùng image này — `worker.ts`. Cùng codebase, cùng deploy, hai tiến
 *  trình. Đó là phần cô lập cần có, không cần tới microservice. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  )

  /* Không bật thì `onApplicationShutdown` của `DbModule` không chạy và pool
     Postgres treo lại sau mỗi lần deploy. */
  app.enableShutdownHooks()

  const env = app.get<Env>(ENV)

  if (env.NODE_ENV === 'development') {
    /* Vite chạy ở cổng khác nên trình duyệt coi đây là cross-origin.
       `credentials` bật sẵn cho ngày cookie phiên thay chỗ header actor. */
    app.enableCors({ origin: /^http:\/\/localhost:\d+$/, credentials: true })
  }

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  new Logger('bootstrap').log(`PV One API · cổng ${env.PORT} · ${env.NODE_ENV}`)
}

void bootstrap()
