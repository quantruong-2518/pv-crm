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
    /* `rawBody: true` keeps the ORIGINAL bytes of every request on
       `req.rawBody`, beside the parsed body. `mail-webhook.controller.ts`
       needs them: Resend signs an HMAC over the exact bytes it sent, and
       `JSON.stringify(req.body)` is not byte-identical to them — key order,
       whitespace and number formatting all differ — so a re-serialised body
       fails every signature.

       Nest does this by registering its own `application/json` and
       `x-www-form-urlencoded` content-type parsers with `parseAs: 'buffer'`
       and stashing the buffer before parsing as usual (see
       `@nestjs/platform-fastify` · `registerJsonContentParser`). It is the
       supported route, and the reason not to hand-register a parser here: a
       custom `addContentTypeParser('application/json', ...)` is GLOBAL in
       Fastify, so scoping one to a single path would mean either parsing every
       other route by hand or breaking them.

       The cost is one extra reference to an already-received buffer per
       request, for the life of that request. Bodies are bounded — Fastify's
       1MB default, and 16KB on the public intake door. */
    { rawBody: true },
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
    /* KHAI TƯỜNG MINH, và đây là lý do — không phải thói quen.
     *
     *  Bỏ trống thì mặc định của adapter mở `GET · HEAD · POST`, tức mọi
     *  request `PATCH` chết ở PREFLIGHT: trình duyệt hỏi `OPTIONS`, không thấy
     *  động từ mình định dùng, và không bao giờ gửi request thật. Máy chủ không
     *  ghi được dòng log nào vì nó chưa từng nhận request nào; `curl` thì chạy
     *  ngon vì `curl` không làm preflight. Đó là hình dạng của một lỗi chỉ lộ
     *  ra khi có người BẤM, và nó đã lộ ra đúng như thế ở nút Lưu của hồ sơ cơ
     *  hội (`PATCH /sales/ops/:code`, 28/08).
     *
     *  Danh sách này là ĐỦ ĐỘNG TỪ ĐANG DÙNG, không phải mọi động từ có thể có:
     *  thêm `DELETE` vào đây trước khi có một cửa xoá nào là mở một cánh cửa
     *  không ai canh. */
    methods: ['GET', 'HEAD', 'POST', 'PATCH'],
    /* PHẢI đủ MỌI header app web gắn, không chỉ những header handler đọc.
     *
     *  Ba cái, và cả ba đều khai ở `apps/web/src/app/api/client.ts`:
     *  `Content-Type` cho thân JSON, `X-PV-Actor-Id` là cửa sau POC
     *  (`ACTOR_HEADER`), `X-PV-Request-Id` là số vết của interceptor
     *  (`TRACE_HEADER`) — máy chủ không đọc nó, nhưng trình duyệt vẫn hỏi xin
     *  phép gửi. Thiếu một cái là preflight từ chối CẢ request, kể cả `GET`:
     *  một request mang header lạ luôn phải preflight, nên bỏ sót ở đây làm
     *  chết cả đường đọc chứ không riêng đường ghi. Đã ngã đúng bẫy đó một lần
     *  ngay trong lượt vá này. */
    allowedHeaders: ['Content-Type', 'X-PV-Actor-Id', 'X-PV-Request-Id'],
    credentials: true,
  })

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  new Logger('bootstrap').log(`PV One API · cổng ${env.PORT} · ${env.NODE_ENV}`)
}

void bootstrap()
