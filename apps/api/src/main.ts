import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { fastifyCookie } from '@fastify/cookie'
import type { FastifyInstance } from 'fastify'
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
  /* Held in a named local rather than built inline, because the cookie plugin
     below has to be registered on the underlying Fastify instance and only
     `FastifyAdapter.getInstance<T>()` is generic enough to hand it over with
     the right type. See the long note at that call. */
  const adapter = new FastifyAdapter({
    /* Do not trust arbitrary X-Forwarded-For values. The public intake door
       reads Fly-Client-IP in production and req.ip only in local development. */
    trustProxy: false,
  })

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
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

  /* ------------------------------------------------------------------
     COOKIE PARSING — the plugin `package.json` has carried since day one and
     nobody had registered
     ------------------------------------------------------------------
     `@fastify/cookie` was a dependency before this feature existed, but no
     `register` call ever ran, so `req.cookies` was `undefined` on every
     request. Nothing complained: reading a property off `undefined` inside an
     optional chain is quiet, so the symptom of forgetting this line is not an
     error but a server where every single person is signed out, forever, with
     a perfectly valid cookie in their browser.

     NO `secret`. Signing is deliberately not used — the value is 256 bits of
     noise looked up in `platform.session`, so a signature would add a second
     secret to rotate and buy nothing. The reasoning is written out in full in
     `platform/auth/cookie.ts`; passing a secret here is what would silently
     turn it on.

     Registered BEFORE `enableCors` and `listen` because plugin order is
     request-hook order in Fastify, and the guard that reads the cookie runs on
     every request including the first.

     ------------------------------------------------------------------
     THROUGH THE ADAPTER, NOT `app.register` — AND NOT BY PREFERENCE
     ------------------------------------------------------------------
     `app.register(fastifyCookie)` does not compile here, and the reason looks
     like a plugin bug while being nothing of the sort. The tree holds TWO
     copies of `fastify`: `@nestjs/platform-fastify` depends on 5.11.3 and
     `apps/api` on 5.12.1, and pnpm gives each its own directory rather than
     merging them. `@fastify/cookie` carries a `declare module 'fastify'`
     augmentation, and an augmentation attaches to exactly ONE module identity
     — here, 5.12.1, the copy this app resolves. `NestFastifyApplication` is
     typed against 5.11.3, so `tsc` compares the augmented interface against
     the un-augmented one and reports the plugin as demanding an instance
     "missing serializeCookie, parseCookie, …". Nothing is missing; the two
     type graphs simply do not know about each other.

     `FastifyAdapter.getInstance<T>()` is generic, so naming the type argument
     pins BOTH sides of the call to the copy this app resolves — the same one
     the controller's `FastifyReply.setCookie` and the guard's `req.cookies`
     are typed from, so the whole cookie path agrees end to end. At runtime it
     is one object either way. `app.getHttpAdapter()` widens to the framework's
     non-generic `HttpServer` and loses that, which is why the adapter is kept
     in a local above.

     A cast would also compile, and is the wrong tool: it would silence the
     message without making the two halves agree, and would keep silencing it
     the day a real mismatch appeared. The actual fix is one `fastify` in the
     tree — align the version `apps/api` depends on with the one
     `@nestjs/platform-fastify` pulls, or pin it with a pnpm override — which
     is a lockfile change and does not belong in this commit. */
  await adapter.getInstance<FastifyInstance>().register(fastifyCookie)

  const configuredOrigins = new Set(env.PV_CORS_ORIGINS)

  /* ------------------------------------------------------------------
     `localhost` AND `127.0.0.1` ARE NOT THE SAME SITE — WRITE IT DOWN ONCE
     ------------------------------------------------------------------
     They resolve to the same machine and they are DIFFERENT SITES to a
     browser's cookie logic. So a web dev server on `http://localhost:5173`
     calling an API addressed as `http://127.0.0.1:4123` is a cross-site
     request: a `SameSite=Lax` cookie is not sent, sign-in appears to succeed,
     and every following request arrives with no session. The network tab shows
     a correct `Set-Cookie` on the sign-in response and no `Cookie` header on
     anything after it, which reads like a server bug and is not one. This is
     the afternoon-sized trap; `apps/web` is being pointed at `localhost` for
     exactly this reason.

     The PORT, by contrast, is ignored by SameSite entirely. `localhost:5173`
     and `localhost:4123` are the same site, which is why `Lax` is correct in
     development and `None` is only needed in production, where the web origin
     and `pvone-crm-api.fly.dev` really are two different registrable domains.
     The attribute table lives in `platform/auth/cookie.ts`. */
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
     *  hội (`PATCH /sales/opportunities/:code`, 28/08).
     *
     *  Danh sách này là ĐỦ ĐỘNG TỪ ĐANG DÙNG, không phải mọi động từ có thể có.
     *
     *  `DELETE` vào ngày 29/08 và chỉ vì có cửa thật cần nó:
     *  `DELETE /sales/leads/:code/meetings/:id` — xoá một buổi họp ghi nhầm.
     *  Trước đó nó CỐ TÌNH vắng mặt, và ghi chú cũ ở đây nói đúng lý do: mở một
     *  động từ trước khi có cửa dùng nó là mở một cánh cửa không ai canh.
     *
     *  Luồng đăng nhập vẫn KHÔNG dùng động từ này — đã soát: bảy cửa của
     *  `/auth` chỉ `GET` và `POST`, kể cả đăng xuất. `POST /auth/sign-out` chứ
     *  không `DELETE /auth/session`, vì cửa đó ai cũng gọi được (`@Public`) và
     *  hồi ấy đổi một động từ mới cho toàn bộ API lấy một chút REST đẹp mắt là
     *  món lỗ. Nay động từ đã mở cho một cửa CÓ quyền canh (`lead.sửa`, trục
     *  phạm vi bật), lập luận đó không đổi: cửa đăng xuất vẫn không cần nó. */
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    /* PHẢI đủ MỌI header app web gắn, không chỉ những header handler đọc.
     *
     *  Ba cái, và cả ba đều khai ở `apps/web/src/app/api/client.ts`:
     *  `Content-Type` cho thân JSON, `X-PV-Actor-Id` là cửa sau POC
     *  (`ACTOR_HEADER`), `X-PV-Request-Id` là số vết của interceptor
     *  (`TRACE_HEADER`) — máy chủ không đọc nó, nhưng trình duyệt vẫn hỏi xin
     *  phép gửi. Thiếu một cái là preflight từ chối CẢ request, kể cả `GET`:
     *  một request mang header lạ luôn phải preflight, nên bỏ sót ở đây làm
     *  chết cả đường đọc chứ không riêng đường ghi. Đã ngã đúng bẫy đó một lần
     *  ngay trong lượt vá này.
     *
     *  PHIÊN THẬT KHÔNG THÊM DÒNG NÀO VÀO ĐÂY — đã soát, và đây là lý do:
     *  `Cookie` là "forbidden header name". Trình duyệt tự gắn nó và KHÔNG cho
     *  script gắn, nên nó không bao giờ đi qua `Access-Control-Request-Headers`
     *  và liệt kê ở đây chẳng có tác dụng gì. Thứ thật sự quyết định cookie có
     *  được gửi kèm hay không là `credentials: true` ngay dưới — đã có sẵn từ
     *  trước — cộng với `credentials: 'include'` ở phía `fetch`. Thêm `Cookie`
     *  vào danh sách này là cách nhanh nhất để tin rằng mình đã sửa một thứ
     *  chưa hỏng.
     *
     *  `X-PV-Actor-Id` giữ lại: nó là cửa sau `PV_TRUST_ACTOR_HEADER`, giờ chỉ
     *  còn là đường LÙI của `ActorGuard` (cookie đi trước). Bỏ nó khỏi đây là
     *  chặn luôn đường Postman/curl mà cờ kia sinh ra để phục vụ. */
    allowedHeaders: ['Content-Type', 'X-PV-Actor-Id', 'X-PV-Request-Id'],
    credentials: true,
  })

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  new Logger('bootstrap').log(`PV One API · cổng ${env.PORT} · ${env.NODE_ENV}`)
}

void bootstrap()
