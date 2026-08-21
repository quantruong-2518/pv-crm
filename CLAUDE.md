# pv-crm — hợp đồng làm việc

Monorepo của **PV One** (Pebble Vina) — ERP/CRM dựng theo hệ thiết kế **Aurora
v2.0**. POC front-end, dữ liệu đóng băng; engine đã có interface để sau cắm
backend thật mà không phải sửa màn.

```
docs/luat-thiet-ke.md   15 luật cứng (§1) · token dùng thật (§2) · ba thiết bị (§3)
packages/tokens         globals.css — FILE MÀU DUY NHẤT + bảng token dạng dữ liệu
packages/ui             @pv/ui — thư viện component
packages/engines        @pv/engines — E1 đồ thị object · E2 quyền · E3 duyệt · E4 thông báo
apps/web                app thật (/) + theme kit sống (/kit)
tools/                  eslint-plugin-aurora + script gác token/CSS
```

Mọi trích dẫn `luật N` trong code trỏ vào `docs/luat-thiet-ke.md §1`.
**Thiếu token thì HỎI, đừng bịa hex mới.**

## Lệnh

```bash
pnpm install
pnpm dev            # http://localhost:5173  ·  /kit là theme kit
pnpm check          # cổng duy nhất: format · kiểu · lint · token · test · build · css
pnpm lint:debt      # còn nợ bao nhiêu vi phạm cũ, ở file nào
```

Node 22 (`.nvmrc`), pnpm 10. `pnpm check` là thứ CI chạy — xanh ở máy thì qua CI.

## Cái gì máy gác, cái gì người gác

**Đừng tự kiểm bằng mắt thứ máy đã gác, và đừng tưởng máy đã gác thứ nó không gác.**

Máy gác — sai là không merge được:

| Luật                     | Gác ở đâu                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| 1 · màu chỉ từ token     | `aurora/no-raw-hex` + `pnpm tokens:check`                                 |
| 4 · borderless           | `aurora/no-box-border`                                                    |
| 7 · spacing 8 bậc        | `aurora/spacing-scale`                                                    |
| 8 · bảng trên `.glass-b` | tầng kiểu — `DataTable` không tự vẽ mặt kính                              |
| 9 · AI luôn chờ nút      | tầng kiểu (`AiActionProps.basis`) **và** tầng engine (`E3.proposeFromAi`) |
| 10 · ContextRail         | tầng kiểu (`RailObject.onOpen`) + `E1.story()` dựng chuỗi                 |
| 11 · icon qua `<Icon>`   | `aurora/icon-through-gate`                                                |
| 15 · không AI slop       | `aurora/no-ai-slop`                                                       |
| kịch bản không trộn      | `aurora/no-scenario-mix` + test khoá mọi con số đã chốt                   |

Người gác — CI **không** biết, phải tự nhìn:

- **Luật 12** — nền đúng 4 lớp, không lớp thứ 5
- **Luật 13** — tương phản ≥ 4.5:1 trên cả `.glass-a` và `.glass-b`; nút tablet ≥ 48px

## Biên giới package — không được phá

- `@pv/ui` **không biết** engine, không biết app. Dữ liệu vào bằng props.
- `@pv/engines` **không phụ thuộc React** — đó là thứ giữ cho engine dùng lại được ở backend.
- Engine là của platform. Nhánh không fork engine, không giữ trạng thái engine đã giữ.
- App import qua cửa chính (`@pv/ui`, `@pv/engines`, `@pv/tokens`), không với vào `src/` của package khác.

Cả bốn là rule `no-restricted-imports` trong `eslint.config.js`.

## Dữ liệu: đúng hai kịch bản, không trộn

| Kịch bản                      | Import từ                       | Đóng băng     |
| ----------------------------- | ------------------------------- | ------------- |
| Sao Đỏ — khách **đã mua**     | `@pv/engines/fixtures/sao-do`   | 10/08 · 07:58 |
| DAS Vina — khách **chưa mua** | `@pv/engines/fixtures/das-vina` | 17/08 · 09:10 |

Một màn dùng đúng một kịch bản. **Không gõ số thẳng vào JSX** — mọi con số đã
chốt nằm trong fixture và bị `scenario.test.ts` khoá. Cần số mới thì thêm vào
fixture kèm test, đừng rải vào màn.

## Thêm component mới

1. Đặt vào đúng zone trong `packages/ui/src/` (`ui/` atom · `patterns/` molecule · `organisms/` · `layout/`).
2. Export ở `packages/ui/src/index.ts`, đúng mục zone của nó.
3. Thêm vào trang kit `apps/web/src/kit/` — **không có mặt trên trang kit coi như chưa tồn tại**.
4. Luật nào cưỡng chế được ở tầng kiểu thì cưỡng chế ở đó, đừng để lint làm hộ.

## Nợ lint đang có

`eslint-suppressions.json` khoá **115 vi phạm `aurora/spacing-scale`** trong 27
file. Rule vẫn là `error`: **thêm mới là CI đỏ**. Dọn xong file nào thì
`pnpm lint:prune`.
