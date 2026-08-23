# Bàn giao — chuẩn bị dựng backend

Lát cắt **23/08/2026**, nhánh `develop`. Ghi lại để phiên sau mở ra là làm được
ngay, không phải khảo sát lại.

Bản đồ dữ liệu đầy đủ (ERD · dòng chảy · ba trục quyền · hợp đồng zod):
<https://claude.ai/code/artifact/28053515-1fd9-4860-a24f-ec7672340214>

---

## Đã chốt

| #   | Quyết định                         | Lý do quyết định, không phải lý do phụ                                                                                       |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Cùng repo này**, thêm `apps/api` | Tách repo thì `@pv/engines` phải publish có version — "một ma trận quyền, kiểm hai lần" thành hai version lệch nhau          |
| 2   | **Node + TypeScript**              | `eslint.config.js:141` đã cấm engine import React, ghi rõ "để engine dùng lại được ở backend". Ngôn ngữ khác là chép ma trận |
| 3   | **Postgres**                       | Đồ thị E1 là recursive CTE · nhật ký là bảng chỉ-thêm · `LeadProfile` 32 trường là JSONB                                     |
| 4   | **zod là nguồn kiểu duy nhất**     | Kiểu TS suy ra bằng `z.infer`. Chỗ đã có hợp đồng platform thì `satisfies z.ZodType<T>` để `tsc` gác lúc lệch                |
| 5   | **FE giữ nguyên stack**            | React 19 + Vite + TanStack Query + zustand. ERP sau đăng nhập, không SEO, không cần SSR                                      |

## Còn treo

> **Cập nhật 24/08** — `Framework BE` đã chốt: **NestJS trên adapter Fastify**,
> và `apps/api` đã dựng tới lát cắt dọc đầu tiên chạy thật. Trạng thái, thứ đã
> kiểm, nợ và việc tiếp theo: [`ban-giao-api.md`](./ban-giao-api.md).
> Hai mục còn lại dưới đây vẫn treo.

- **Framework BE**: NestJS hay Fastify. Nest đáng giá nếu ≥3 người viết BE và
  có `@pv/contracts` bằng zod để khỏi viết DTO hai lần; dưới ngưỡng đó thì
  Fastify + Drizzle gọn hơn.
- **Nơi chạy BE**: container host + managed Postgres trước, ECS/RDS khi có
  người trực ops. Đóng gói Docker từ đầu để chuyển sau chỉ là đổi nơi chạy.
- **Nghị định 53/2022 về lưu trữ dữ liệu trong nước** — AWS không có region
  Việt Nam. Hỏi pháp chế trước khi chốt hạ tầng; nó đổi lựa chọn hạ tầng chứ
  không đổi lựa chọn stack.

---

## Việc, theo đúng thứ tự chặn nhau

### A · Gỡ cấu hình (làm được ngay, chưa cần biết BE viết bằng gì)

1. **Tách `tsconfig.json`** thành `base` + `web` + `api`. Hôm nay một config cho
   cả cây với `"lib": ["ES2022","DOM","DOM.Iterable"]` — code server gọi nhầm
   `localStorage` sẽ **biên dịch xanh rồi nổ lúc chạy**. Đây là chỗ nguy hiểm
   nhất vì nó không báo lỗi.
2. `"types": ["vite/client","vitest/globals"]`, `"jsx"`, `"moduleResolution":
"bundler"`, `"noEmit"` — cả bốn chỉ đúng cho web.
3. `pnpm typecheck` (một `tsc` ở gốc) và `pnpm build` (`--filter @pv/web`) phải
   bao cả hai app. `ci.yml:73` đang `ls apps/web/dist/assets/*`, cần đổi theo.
4. `vitest.config.ts` ép `environment: 'jsdom'` cho toàn cây → `environmentMatchGlobs`.
5. `alias.config.ts` là alias bundler, Node runtime không hiểu. Thêm
   `@pv/contracts` vào cả nó lẫn `tsconfig.paths`.
6. Thêm rule đối xứng: `apps/api` không được import `@pv/ui`, `@pv/tokens`,
   `react` — cùng cơ chế `no-restricted-imports`, cùng lý do như rule engine.

### B · Chuyển luật về đúng tầng (trước khi có endpoint thật)

`apps/web/src/data/` có 5.156 dòng, chia ba nhóm ≈ **42% phải ở server · 16%
dùng chung · 42% chỉ để vẽ**. Thứ tự chuyển, cái trước chặn cái sau:

1. `parseDelimited` + `sniffDelimiter` + `toSheet` + `cellText` →
   `@pv/engines/sheet.ts`. Không import gì, không ai phụ thuộc ngược.
2. Phần toán của `period.ts` → `@pv/engines/period.ts`, **nhận cửa sổ dữ liệu
   bằng tham số** thay vì đọc `DAS_VINA_FROZEN_AT`, và tách `label`/`short`
   tiếng Việt ra khỏi `Period`. **Chặn `performance.ts`, `plan.ts`,
   `source-cost.ts`, `campaigns.ts`.**
3. `normalise` → `dedupeKeys` → `guessMapping` → `unmappedRequired`, đúng thứ tự
   này vì ba cái sau đều gọi `normalise`.
4. `buildRows` tách đôi — lõi kiểm dòng sang engine, nhịp `onProgress` ở lại app.
   Cắt dây `rowsToLeads` đang đọc `MOTION_FACE[...].label`: trả về key, để màn tra nhãn.
5. `myWork` + `assigneeOptions` — "ai thấy dòng nào", đi cùng E2.
6. `performance.ts` và `plan.ts` **cuối cùng** — ngồi trên tất cả những cái trên.

`auth.ts` nằm ngoài chuỗi và nên đi **sớm nhất**: `signInWithEmail` đã `async`
sẵn. `makeResetTicket`/`readResetTicket` thì **xoá khỏi client**, không phải
chuyển — vé đang được đúc bằng base64url của email ngay trong trình duyệt.

### C · Dựng `packages/contracts`

Bắt đầu bằng `primitives.ts` (`Dong` · `Moc` · `Ngay` · `MaObject`, enum lấy
thẳng từ engine) + một endpoint `leadBook` + `Problem`. Đủ để cắt một đường dữ
liệu sang backend mà không màn nào phải sửa.

Hai điểm thiết kế không được bỏ:

- `response.hidden` — số dòng E2 cắt đi. Màn 03 bắt buộc hiện "Bị ẩn theo quyền
  của bạn"; con số đó là trường của response, không phải thứ màn tự đếm.
- `need.scoped: true` — cờ bật trục phạm vi. Xem nợ số 3 bên dưới.

### D · FE, khi BE đã có endpoint đầu tiên

- Thêm `api.write` cạnh `api.read` — cùng chuỗi `BEFORE`/`AFTER`, không thì
  `requireAccess` chỉ gác một nửa.
- 24 thao tác ghi chuyển từ `zustand persist` (`pv-lead-desk`,
  `pv-intake-desk`) sang `useMutation` + `invalidateQueries`. zustand ở lại
  nhưng chỉ giữ state client thật: phiên, bộ lọc, ưu tiên hiển thị.
- `react-hook-form` + `@hookform/resolvers/zod` cho form hồ sơ 32 trường.
- `query-client.ts`: bật lại `refetchOnWindowFocus`/`OnReconnect`, đặt
  `staleTime` theo từng query, nhưng **giữ `retry: false`** — tầng api đã retry
  với `MAX_ATTEMPTS = 2`, bật thêm là retry hai lớp lồng nhau.

---

## Bảy chỗ nợ — rẻ khi sửa hôm nay, đắt khi có dữ liệu thật

1. **Định danh có dấu**: `ObjectKind 'HĐ'`, `EdgeKind 'chờ'`, `'thuộc-về'` sót
   lại sau đợt sửa ASCII 23/08. `HĐ-2607` qua URL thành `H%C4%90-2607`.
2. **Danh tính người trộn hai khoá**: `AuditEntry.actorId` dùng id;
   `ObjectRef.owner`, `Lead.owner`, `Source.owner`, `ChainLink.person` dùng tên
   hiển thị — và trục phạm vi so bằng `ref.owner === actor.name`. Hai người
   trùng tên là hai người thấy sổ của nhau.
3. **Trục phạm vi chưa chạy ở đâu**: cả 7 endpoint truyền `need` không có `ref`,
   mà E2 chỉ kiểm `ownOnly` khi có `ref`. Ba actor `ownOnly: true` gọi
   `/sales/leads` nhận cả 100 dòng. `access.visible()` có sẵn nhưng không được
   gọi ở đâu trong `apps/web`.
4. **Nhãn tiếng Việt làm giá trị khoá**: `Lead.exitReason` lưu một trong sáu
   _nhãn_ của `EXIT_REASONS`. Sửa một chữ trên màn là đổi dữ liệu 52 dòng sổ.
5. **"Trống" có ba quy ước** trên cùng một chuỗi dữ liệu: `Lead` dùng
   `undefined`, `LeadProfile` dùng `''`/`null`, `Opportunity` trộn cả hai.
6. **E3 không gọi E2**: `approval.approve` có trong ma trận nhưng `decide()` chỉ
   so `link.person === by.name`. Thêm nữa `decide()` đột biến `chain` tại chỗ
   qua shallow copy nên bản ghi cũ bị sửa theo.
7. **Tiền không mang tiền tệ** ở `ObjectRef.amount`, `OpenDeal.amount`,
   `Source.cost`, `CostLine.amount` — `number` trần, ngầm định đồng.

Ngoài bảy chỗ trên: **E3 và E4 chưa được khởi tạo ở đâu trong `apps/`** — chỉ E1
và E2 đang chạy thật. Nhật ký mới ghi `view` và `ai-read`. Phần duyệt và thông
báo là **dựng mới** ở backend, không phải port.

---

## Công cụ đã thêm cho phiên sau

Bốn agent trong `.claude/agents/`, gọi thẳng bằng tên:

| Agent                 | Dùng khi                                                       |
| --------------------- | -------------------------------------------------------------- |
| `schema-cartographer` | Cần kiểm kê lại thực thể sau khi fixture đổi                   |
| `dataflow-tracer`     | Thiết kế endpoint mới, hoặc soát lỗ hổng quyền                 |
| `rule-locator`        | Một file trong `data/` phình nhanh, hoặc trước khi chuyển luật |
| `contract-drafter`    | Thêm endpoint, hoặc đổi hình dạng dữ liệu — nó viết zod        |

Cả bốn đọc bằng cách grep khung khai báo trước rồi mới cắt vào vùng code, để
không cày qua khối comment dài của repo.
