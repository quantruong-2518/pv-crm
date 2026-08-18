# pv-crm — hợp đồng làm việc

Đọc file này trước khi viết dòng code đầu tiên. Nó ngắn có chủ đích; phần dài
nằm ở hai file trong `docs/`.

## Repo này là gì

Monorepo của **PV One** (Pebble Vina) — hệ ERP/CRM dựng theo hệ thiết kế
**Aurora v2.0**. Hiện là POC front-end với dữ liệu đóng băng; engine đã có
interface để sau này cắm backend thật mà không phải sửa màn.

```
docs/              luật thiết kế + kiến trúc sản phẩm — HIẾN PHÁP, đọc trước
packages/tokens    globals.css — FILE MÀU DUY NHẤT + bảng token dạng dữ liệu
packages/ui        @pv/ui — thư viện component, 15 luật cưỡng chế ở tầng kiểu
packages/engines   @pv/engines — E1 đồ thị object · E2 quyền · E3 duyệt · E4 thông báo
apps/web           app thật (/) + theme kit sống (/kit)
tools/             eslint-plugin-aurora + script gác token/CSS
```

> **Nguồn thiết kế đã xoá ngày 18/08.** Thư mục `project/` từng chứa bản vẽ
> `.dc.html`, ảnh tham chiếu 1:1 và gói handoff EN. Bộ màn sẽ dựng lại; phần
> luật và kiến trúc đã cứu sang `docs/`, phần số liệu đã cứu sang
> `@pv/engines/fixtures`. Cần bản vẽ cũ thì `git show 107f5e2:project/...`.

## Hai nguồn sự thật

| #   | File                         | Dùng để                                                                                                                         |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/luat-thiet-ke.md`      | **15 luật cứng** (§1), token dùng thật (§2), ba thiết bị (§3), thứ tự component (§4), đặc tả 5 màn One (§7), checklist PR (§8). |
| 2   | `docs/kien-truc-san-pham.md` | 5 nhánh, hai tầng license, luật engine E1–E4, chủ ba đường nối, vai người Sales, bộ 10 câu + 2 agent, hai kịch bản dữ liệu.     |

Mọi trích dẫn `luật N` trong code trỏ vào `docs/luat-thiet-ke.md §1`.

**Thiếu token thì HỎI, đừng bịa hex mới.**

## Lệnh

```bash
pnpm install
pnpm dev            # http://localhost:5173  ·  /kit là theme kit
pnpm check          # cổng duy nhất: format · kiểu · lint · token · test · build · css
pnpm lint:debt      # còn nợ bao nhiêu vi phạm cũ, ở file nào
```

Node 22 (`.nvmrc`), pnpm 10. `pnpm check` là thứ CI chạy — chạy được ở máy thì
qua được CI.

## Cái gì máy gác, cái gì người gác

Đây là phần quan trọng nhất của file này. **Đừng tự kiểm bằng mắt thứ máy đã gác,
và đừng tưởng máy đã gác thứ nó không gác.**

Máy gác (sai là không merge được):

| Luật                     | Gác ở đâu                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------- |
| 1 · màu chỉ từ token     | `aurora/no-raw-hex` + `pnpm tokens:check`                                          |
| 4 · borderless           | `aurora/no-box-border`                                                             |
| 7 · spacing 8 bậc        | `aurora/spacing-scale`                                                             |
| 8 · bảng trên `.glass-b` | tầng kiểu — `DataTable` không tự vẽ mặt kính                                       |
| 9 · AI luôn chờ nút      | tầng kiểu (`AiActionProps.basis` bắt buộc) **và** tầng engine (`E3.proposeFromAi`) |
| 10 · ContextRail         | tầng kiểu (`RailObject.onOpen`) + `E1.story()` dựng chuỗi                          |
| 11 · icon qua `<Icon>`   | `aurora/icon-through-gate`                                                         |
| 15 · không AI slop       | `aurora/no-ai-slop`                                                                |
| kịch bản không trộn      | `aurora/no-scenario-mix` + test khoá mọi con số đã chốt                            |

Người gác (CI **không** biết, phải tự nhìn — có trong PR template):

- **Luật 12** — nền đúng 4 lớp, không lớp thứ 5
- **Luật 13** — tương phản ≥ 4.5:1 trên cả `.glass-a` và `.glass-b`; nút tablet ≥ 48px

> Tiêu chí "lệch < 4px so với ảnh tham chiếu" đã bỏ cùng `project/handoff/screens-png/`.
> Dựng lại bộ ảnh thì khôi phục nó vào `docs/luat-thiet-ke.md §8.8` và PR template.

## Biên giới package — không được phá

- `@pv/ui` **không biết** engine, không biết app. Dữ liệu vào bằng props.
- `@pv/engines` **không phụ thuộc React**. Đó là thứ giữ cho engine dùng lại được ở backend.
- Engine là của platform. Nhánh không fork engine, không giữ trạng thái engine đã giữ.
- App import qua cửa chính (`@pv/ui`, `@pv/engines`, `@pv/tokens`), không với vào `src/` của package khác.

Cả bốn điều trên là rule `no-restricted-imports` trong `eslint.config.js`.

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
3. Thêm vào trang kit ở `apps/web/src/kit/` — **component không có mặt trên trang kit coi như chưa tồn tại**.
4. Luật nào cưỡng chế được ở tầng kiểu thì cưỡng chế ở đó, đừng để lint làm hộ.

## Nợ lint đang có

`eslint-suppressions.json` khoá **115 vi phạm `aurora/spacing-scale`** trong 27
file — các giá trị lấy đúng từ bản vẽ gốc (`py-[18px]`, `gap-2.5`, `pt-10`…)
nhưng không thuộc thang 8 bậc của luật 7. Rule vẫn là `error`: **thêm mới là
CI đỏ**. Dọn xong file nào thì `pnpm lint:prune`.

Đây là mâu thuẫn thật giữa hai chỉ dẫn — bản vẽ là spec pixel nên "lấy đúng số",
còn luật 7 nói "chỉ 8 bậc". Chưa ai quyết bên nào thắng. **Đừng tự quyết**: gặp
thì hỏi. Giờ bản vẽ đã xoá, dựng lại màn là dịp tự nhiên để trả nợ này.
