# Bàn giao — `apps/api` đã dựng tới đâu

Lát cắt **24/08/2026**, nhánh `develop`. Tiếp nối `ban-giao-backend.md`: file
đó chốt NỀN TẢNG, file này ghi thứ đã dựng thật và thứ chưa.

---

## Chốt nốt hai thứ còn treo

| Treo ở doc trước              | Chốt                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Framework: NestJS hay Fastify | **NestJS trên `@nestjs/platform-fastify`**                                    |
| Nơi chạy                      | **Fly.io (API + worker) · Neon (Postgres)** — có điều kiện, xem mục ngay dưới |

NestJS là lựa chọn của chủ dự án, biết trước ba chỗ ma sát với repo này (idiom
DTO class vs zod · ESM vs decorator · DI container chồng lên factory đã có).
Cả ba đã trung hoà, cách làm ghi ở mục "Ma sát Nest" bên dưới. Chạy trên
adapter Fastify chứ không phải Express mặc định: chuỗi hook của Fastify là đúng
hình chuỗi interceptor `BEFORE`/`AFTER` mà `apps/web/src/app/api/client.ts` đã
dựng, và nó giữ đường lùi nếu sau này muốn gỡ lớp Nest.

### Nơi chạy — Fly.io + Neon, có điều kiện

Chốt **26/08**: **Fly.io** (API + worker, hai process cùng image, xem
`apps/api/fly.toml`) · **Neon** (Postgres managed). So với AWS: chi phí ước
~30–45 USD/tháng ở quy mô hiện tại, AWS RDS + ECS Fargate + ALB khó xuống
dưới 150 USD/tháng dù traffic thấp vì ALB và RDS có phí sàn cố định bất kể
tải. Team hiện chưa có người trực ops nên PaaS (Fly) rẻ vận hành hơn IaaS tự
quản (Vultr VM trần) hay AWS tự quản — đúng bậc "container host trước,
ECS/RDS khi có người trực ops" mà `ban-giao-backend.md` đã phác.

**Có điều kiện, không phải chốt cuối cùng:** quyết định này CỐ TÌNH bỏ qua
Nghị định 53/2022 (lưu trữ dữ liệu trong nước) — Fly.io và Neon đều không có
hạ tầng tại Việt Nam, gần nhất là Singapore. Câu hỏi pháp chế ở
`ban-giao-backend.md` vẫn treo nguyên, chưa được trả lời ở đây. Nếu pháp chế
xác nhận bắt buộc lưu trong nước, phần phải đổi là **Neon → Vultr Managed
Database hoặc cloud VN** (Viettel IDC/VNG/FPT/CMC — Vultr có datacenter Hồ
Chí Minh, cần tự xác nhận lại trước khi chọn); Fly.io/Vercel không giữ data
at rest nên không phải đổi theo.

**Build vẫn qua `apps/api/Dockerfile` có sẵn, không phải buildpack.** Fly.io
tự khuyến cáo không dùng buildpack cho monorepo — đúng gotcha symlink
`.pnpm` mà Dockerfile đã giải thủ công (xem comment trong chính file đó).
"Không dùng Docker" chỉ đúng cho workflow phát triển hằng ngày (vẫn
`pglite://`, không cần cài Docker tại máy) — Docker chỉ còn là build recipe
phía Fly, không ai gõ lệnh Docker tay:

```bash
fly deploy . --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

Chạy từ GỐC REPO — cùng lý do `Dockerfile` đã ghi ở dòng đầu: build context
phải thấy `packages/engines`, `packages/contracts`.

**Chưa làm hôm nay** (nằm ngoài phạm vi lần chuẩn bị này — chỉ mới soạn
config, chưa deploy thật): tạo account Fly.io + Neon, `fly launch`/`fly
deploy` với `DATABASE_URL` thật, set `VITE_API_URL` trên Vercel. Cả bốn cần
tay người, không script hoá được vì đụng account/secret thật.

**Không microservice.** Modular monolith, module chia theo NHÁNH, một Postgres
nhiều schema. Ba lý do nằm trong chính code: `E2.check()` chạy trong vòng lặp
lọc từng dòng nên không biến thành RPC được; `E1.story()` truy vết XUYÊN nhánh
nên chia database là traversal phân tán; và bất biến "một lead đổi đúng một
lần" là một transaction ở monolith, là saga có bù trừ ở microservice. Việc nặng
tách TIẾN TRÌNH (`worker.ts`), không tách service.

---

## Database tại máy: KHÔNG cần Docker

```bash
cp apps/api/.env.example apps/api/.env    # mặc định pglite://./.pglite
pnpm db:migrate && pnpm db:seed && pnpm dev:api
```

`pglite://` chạy **chính Postgres** biên dịch sang WASM, trong tiến trình Node
của máy chủ. Không container, không daemon, không sudo, không cổng. Cùng engine
nên recursive CTE, hai schema `pgSchema`, `text[]`, `uuid` đều chạy y hệt —
khác hẳn việc thay bằng SQLite, thứ sẽ bắt viết hai phương ngữ SQL.

Giới hạn: một kết nối tại một thời điểm, không đủ extension. Nó là công cụ phát
triển — `env.ts` **từ chối khởi động** nếu thấy `pglite://` khi
`NODE_ENV=production`.

Postgres thật vẫn còn nguyên đường: `pnpm db:up` (Docker) rồi đổi
`DATABASE_URL`. Không dòng code nào khác đổi theo — `platform/db/create-db.ts`
chọn driver theo lược đồ URL, và kiểu `Db` là `PgDatabase` (lớp cha chung), nên
`branches/` không biết mình đang chạy driver nào.

---

## Đã dựng

```
packages/contracts/            zod · FE và BE cùng đọc · nguồn kiểu DUY NHẤT
  primitives · problem · pagination · sales/{enums,lead}

apps/api/src/
  main.ts                      HTTP · FastifyAdapter
  worker.ts                    entrypoint thứ hai, CÙNG image (pg-boss lên cùng E4)
  platform/                    ── KHÔNG thuộc nhánh nào ──
    config/    env kiểm bằng zod, hỏng sớm
    db/        create-db (chọn driver) · platform.schema (actor·object·edge·audit)
    engines/   E1–E4 làm provider, KHÔNG bọc class
    access/    @Need · @Public · AccessGuard · RouteAudit
    http/      ProblemFilter · ZodPipe · PvError
    session/   ActorGuard · ActorRepository
    graph/     E1: recursive CTE hai chiều, chặn độ sâu 12
    audit/     bảng chỉ-thêm
    health/    GET /healthz
  branches/sales/lead/         controller · service · repository · schema · mapper
```

Lát cắt dọc chạy thật: **`GET /sales/leads`**.

### Năm luật chịu lực

1. **Engine không I/O. Repository không quyết định. Service là chỗ duy nhất
   biết cả hai.** Đây là điều kiện để E1/E2 chạy được ở CẢ HAI đầu — engine tự
   đi truy vấn thì `check()`/`story()` trả `Promise` và mọi màn gãy theo.
2. Một nhánh = một schema Postgres. Không `JOIN` chéo schema. (`platform` không
   phải một nhánh — nó là nền, mọi nhánh được đọc.)
3. Controller không biết Drizzle. Repository không biết HTTP.
4. `@Need()` là khai báo quyền DUY NHẤT của endpoint, soi gương `data/*.ts`.
5. `platform/` không import `branches/`. `branches/X` không import
   `branches/Y`. Nest module KHÔNG ép được hai luật này —
   `no-restricted-imports` trong `eslint.config.js` ép.

### Hỏng theo hướng ĐÓNG

Endpoint không khai `@Need` cũng không khai `@Public` thì **bị từ chối**, và
`RouteAudit` quét toàn bộ route lúc khởi động, không cho máy chủ lên:

```
Error: 1 đường dữ liệu chưa khai quyền — thêm @Need(...) hoặc @Public():
  · HealthController.check
```

Cùng hướng với E2 ("Vai lạ thì KHÔNG có quyền gì — hỏng theo hướng đóng").

---

## Đã kiểm bằng gì

Tất cả chạy thật trên PGlite với 100 dòng sổ nạp từ fixture đóng băng.

| Kiểm           | Kết quả                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| Trục PHẠM VI   | TP Kinh doanh `total 100 · hidden 0` · Sale `ownOnly` `total 10 · hidden 90`     |
| Trục LICENSE   | `403 branch-not-licensed` — "Không có nhánh Factory."                            |
| Trục VAI       | `403 permission-denied` — "Vai Sale · chip không có data.export."                |
| Chưa đăng nhập | `401 unauthenticated`, KHÔNG lẫn với 403                                         |
| ZodPipe        | `400 invalid` kèm lỗi theo TỪNG Ô (`page` và `size` cùng lúc)                    |
| Ghi vết        | `platform.audit` đúng **2 dòng cho 2 lần chặn thật**, không phải mỗi dòng bị lọc |
| Lỗi bất ngờ    | response chỉ "Máy chủ gặp sự cố."; log giữ nguyên nhân thật                      |
| `traceId`      | `X-PV-Request-Id` của FE về đúng trong body                                      |
| Bản build      | `dist` chạy y hệt bản ts-node — `tsconfig-paths` phân giải đúng                  |

**Một xác nhận đắt giá:** `running=true → 42`, `running=false → 52`, khớp chính
xác `BOOK_SPLIT = { signed: 6, running: 42, exited: 52 }` đã khoá trong fixture.
Bản dịch `isRunning()` sang SQL cho ra cùng con số màn đang vẽ.

---

## Ma sát Nest — hai chỗ đã vấp, đừng vấp lại

1. **`ERR_REQUIRE_ESM`.** `packages/engines` và `contracts` khai
   `"type": "module"`, ts-node từ chối `require()` file `.ts` của chúng. Bản
   BUILD không dính (dist nằm dưới scope CJS của `apps/api`); chỉ dev vướng.
   Sửa bằng `ts-node.moduleTypes` trong `apps/api/tsconfig.json`.
2. **`consistent-type-imports` ăn mất DI.** Lint đòi đổi
   `import { LeadRepository }` thành `import type` — làm thế thì
   `emitDecoratorMetadata` ghi `Object` vào `design:paramtypes` và Nest báo
   "Cannot resolve dependency" ở chỗ chẳng liên quan. **`eslint --fix` mù sẽ
   hỏng app.** Rule đã tắt cho `apps/api` kèm lý do trong `eslint.config.js`.

Bốn khoá `tsconfig.api.json` bắt buộc khác web (`commonjs` · `node10` ·
`verbatimModuleSyntax: false` · `useDefineForClassFields: false`) và
`"type": "commonjs"` trong `apps/api/package.json` — lý do đầy đủ nằm trong
chính hai file đó.

---

## Nợ đang có

- **Nợ #2 của doc trước chưa trả** — `E2.check()` còn so
  `ref.owner === actor.name`. SQL đã lọc bằng `id` (trục đúng), nên hàng rào
  thật không phụ thuộc chỗ đó; nhưng `lead.mapper.ts` phải mang thêm tham số
  `ownerName` chỉ vì nó, và endpoint sau sẽ chép lại chỗ vá đó.
- **Nợ #4 đã trả MỘT NỬA** — hợp đồng dùng khoá ASCII cho `exitReason`, fixture
  còn dùng nhãn tiếng Việt. `seed.ts` giữ bảng tra và **ném lỗi** nếu gặp nhãn
  lạ. FE sẽ cần một bảng nhãn khi cắt sang server.
- **Enum Sales khai hai nơi** — `packages/contracts/src/sales/enums.ts` là bản
  chính thức; fixture còn bản riêng. Bước B (tách domain khỏi fixture) sẽ để
  fixture nhập từ contracts.
- **`PV_TRUST_ACTOR_HEADER`** — cửa sau của POC, máy chủ tin header
  `X-PV-Actor-Id`. `env.ts` chặn ở production, nhưng auth thật vẫn phải dựng.
- **Dockerfile chưa build thử** — thiếu docker daemon. Là thứ DUY NHẤT trong
  scaffold còn dựa trên suy luận thay vì kết quả chạy.
- **E3, E4 chưa khởi tạo ở đâu** — dựng mới, cần lưu trữ bền.

---

## Việc tiếp theo, theo thứ tự chặn nhau

```
Nợ #2 (id vs tên)  ──┐
                     ├──> Cắt màn Sổ lead ──> 5 endpoint Sales còn lại
api.write ───────────┘         (đóng vòng)
                                    │
Mục B: luật về engine ──────────────┘
   period.ts là chốt: chặn performance · plan · source-cost · campaigns
```

1. **Trả nợ #2** — `ObjectRef.owner` sang `id`, `check()` so bằng `id`. Rẻ nhất
   lúc chưa có dữ liệu thật; sau đó là một migration.
2. **Cắt màn Sổ lead sang server.** Việc quan trọng nhất: nó lộ hết vấn đề tích
   hợp trong lúc chỉ có MỘT màn phải sửa. Cần: `api/client.ts` đổi
   `load(prepared)` thành `fetch` (điểm cắt đã ghi sẵn) · thêm `VITE_API_URL`
   (FE chưa có biến base URL nào) · bảng nhãn `exitReason` · `ownerId` → tên ·
   hiện `hidden` theo luật 7.
3. **`api.write` + `PATCH /sales/leads/:code`.** Hàng rào quyền hiện chỉ gác
   một nửa: 24 thao tác ghi còn nằm trong `zustand persist`, không đi qua E2.
4. **Mục B, bắt đầu từ `period.ts`** — nó chặn 4 trong 5 endpoint còn lại.

Sau đó: auth thật (cookie + bảng `platform.session`) · E3/E4 + pg-boss ·
Dockerfile + chốt hạ tầng.

---

## Test — giờ đã rẻ

PGlite làm test tích hợp gần như miễn phí: `pglite://memory` cho mỗi ca, không
service container, chạy được ở CI.

Đúng loại test đáng viết cho server là **ma trận quyền theo từng endpoint**
(`vai × kết quả mong đợi`) — thứ không compiler nào gác được, và hỏng thì là lỗ
hổng chứ không phải lỗi hiển thị. Bảng "Đã kiểm bằng gì" bên trên hiện là kết
quả gõ tay bằng `curl`; nó nên thành test.

Repository và controller không test riêng — phủ qua vài ca tích hợp trên lát
cắt dọc thật.

---

## Công cụ đã thêm cho phiên sau

`deploy-guardian` (`.claude/agents/deploy-guardian.md`) — gọi khi cần "deploy
BE". Build-kiểm trước, deploy qua `pnpm fly:deploy`, xác nhận `/healthz` thật
trước khi báo xong, và đã ghi sẵn ba lỗi thật vấp phải lúc dựng lần đầu (path
Dockerfile lặp đôi, `husky` vỡ bước cài `--prod`, `tsconfig-paths` khai nhầm
`devDependencies`) để không vấp lại.
