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
    /* Do not trust arbitrary X-Forwarded-For values. The public intake door
       reads Fly-Client-IP in production and req.ip only in local development. */
    new FastifyAdapter({ trustProxy: false }),
  )

  /* Không bật thì `onApplicationShutdown` của `DbModule` không chạy và pool
     Postgres treo lại sau mỗi lần deploy. */
  app.enableShutdownHooks()

  const env = app.get<Env>(ENV)

  const configuredOrigins = new Set(env.PV_CORS_ORIGINS)
  app.enableCors({
    origin(origin, done) {
      const local = env.NODE_ENV === 'development' && /^http:\/\/localhost:\d+$/.test(origin ?? '')
      done(null, origin === undefined || local || configuredOrigins.has(origin))
    },
    credentials: true,
  })

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  new Logger('bootstrap').log(`PV One API · cổng ${env.PORT} · ${env.NODE_ENV}`)
}

void bootstrap()
