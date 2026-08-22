# pv-crm — hợp đồng làm việc

Monorepo của **PV One** (Pebble Vina) — ERP/CRM dựng theo hệ thiết kế **Aurora
v2.0**. POC front-end, dữ liệu đóng băng; engine đã có interface để sau cắm
backend thật mà không phải sửa màn.

```
docs/luat-thiet-ke.md   15 luật cứng (§1) · token dùng thật (§2) · ba thiết bị (§3)
packages/tokens         globals.css — FILE MÀU DUY NHẤT + bảng token dạng dữ liệu
packages/ui             @pv/ui — thư viện component               → packages/ui/CLAUDE.md
packages/engines        @pv/engines — E1 đồ thị object · E2 quyền · E3 duyệt · E4 thông báo
                                                                    → packages/engines/CLAUDE.md
apps/web                app thật (/) + theme kit sống (/kit)       → apps/web/CLAUDE.md
tools/                  eslint-plugin-aurora + script gác token/CSS
```

Ba file `CLAUDE.md` con nói zone nào chứa gì và mở file nào theo việc — không
liệt kê danh sách file cụ thể để khỏi lệch khi cấu trúc đổi. Viết bằng tiếng
Anh vì đây là bản đồ cho agent đọc, không phải tài liệu sản phẩm cho người
trong nhóm (cùng lý do skill `sketch-first` viết tiếng Anh).

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

## Đổi bố cục thì PHÁC TRƯỚC

Mọi yêu cầu dựng màn mới, đổi bố cục, thêm/bớt/gộp khối đều đi qua skill
`.claude/skills/sketch-first` — sơ đồ ASCII + bảng khối + danh sách quyết định
cần gật, **trước khi** chạm file. Bác một sơ đồ 20 dòng rẻ hơn bác một màn đã
dựng khoảng ba mươi lần; số đo cụ thể nằm trong chính skill đó.

Skill tự kích hoạt khi yêu cầu khớp, hoặc gọi thẳng bằng `/sketch-first`.

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
| kịch bản không trộn      | `aurora/no-scenario-mix`                                                  |

Người gác — CI **không** biết, phải tự nhìn:

- **Luật 12** — nền đúng 4 lớp, không lớp thứ 5
- **Luật 13** — tương phản ≥ 4.5:1 trên cả `.glass-a` và `.glass-b`; nút tablet ≥ 48px

## Test — không tự sinh, trừ một ngoại lệ

Không tự viết test khi dựng/sửa màn trừ khi được yêu cầu rõ — mỗi test UI
vibe-code ra là một khoản token phải trả lại mỗi lần sửa màn đó. 23/08 đã xoá
sạch 366 test cũ (mọi file `*.test.ts`/`*.test.tsx`, kể cả
`tools/eslint-plugin-aurora/plugin.test.js`) vì đúng lý do này;
`vitest.config.ts` đã bật `passWithNoTests` nên cây 0 test không làm
`pnpm check` đỏ.

**Ngoại lệ duy nhất, vẫn là luật cứng:** thêm số mới vào fixture bắt buộc kèm
một test khoá số đó ngay cạnh fixture (xem "Dữ liệu" bên dưới). Đây không phải
thói quen vibe-code — đó là cơ chế duy nhất bắt số liệu demo, thứ không
compiler nào gác được, không lặng lẽ trôi.

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
chốt nằm trong fixture. Cần số mới thì thêm vào fixture kèm một test khoá số
đó ngay cạnh, đừng rải vào màn — xem ngoại lệ ở mục "Test" bên trên.

## Thêm component mới

1. Đặt vào đúng zone trong `packages/ui/src/` (`ui/` atom · `patterns/` molecule · `organisms/` · `layout/`).
2. Export ở `packages/ui/src/index.ts`, đúng mục zone của nó.
3. Thêm vào trang kit `apps/web/src/kit/` — **không có mặt trên trang kit coi như chưa tồn tại**.
4. Luật nào cưỡng chế được ở tầng kiểu thì cưỡng chế ở đó, đừng để lint làm hộ.

## Nợ lint đang có

`eslint-suppressions.json` khoá **115 vi phạm `aurora/spacing-scale`** trong 27
file. Rule vẫn là `error`: **thêm mới là CI đỏ**. Dọn xong file nào thì
`pnpm lint:prune`.
