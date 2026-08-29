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
trong nhóm.

Mọi trích dẫn `luật N` trong code trỏ vào `docs/luat-thiet-ke.md §1`.
**Thiếu token thì HỎI, đừng bịa hex mới.**

## Lệnh

```bash
pnpm install
pnpm dev            # http://localhost:5173  ·  /kit là theme kit
pnpm mail:preview   # http://localhost:5175 — mọi mẫu mail, render lại mỗi lần F5
pnpm check          # cổng duy nhất: format · kiểu · lint · token · test · build · css
pnpm check:fast     # tầng nhanh: format · kiểu · lint (bỏ test + build)
pnpm lint:debt      # còn nợ bao nhiêu vi phạm cũ, ở file nào
```

Node 22 (`.nvmrc`), pnpm 10. `pnpm check` là thứ CI chạy — xanh ở máy thì qua CI.

## Skill và agent — mở cái nào theo việc

| Gọi                                                                         | Khi nào                                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/wsl`                                                                      | Trước MỌI lệnh `pnpm`/`git`/dev server. Repo ở WSL, Claude Code ở Windows — gọi thẳng hỏng im lặng.   |
| `/preflight`                                                                | Sắp commit, sắp push, hoặc vừa đụng tầng dùng chung. Ba tầng kiểm, dừng ở tầng đủ dùng.               |
| `/dispatch`                                                                 | Đầu một việc nhiều bước: ai làm, model nào, cái gì phải đẩy sang subagent.                            |
| `/cat-mock`                                                                 | Cắt một query khỏi fixture sang endpoint thật — hàng chờ ở `docs/fix-later.md` §3.                    |
| `dataflow-tracer` · `contract-drafter` · `rule-locator` · `deploy-guardian` | Bốn agent trong `.claude/agents/`, gọi thẳng bằng tên. Model và effort đã khai sẵn trong frontmatter. |

## Luật khi sinh code

Ba luật này áp cho **mọi dòng viết ra**, không phải chỉ khi được nhắc.

**1 · Comment mang cái VÌ SAO, `docs/` chỉ trỏ đường.** Code đã nói _cái gì_ rồi —
comment nói vì sao chọn thế này thay vì thế kia, đặt ngay tại chỗ khai báo, ngắn.
Docblock ba mươi dòng cho vài dòng code là **nợ đang có, không phải mẫu để theo**:
`apps/web/src/data/` hiện 28% là comment và chính mật độ đó khiến mọi lượt khảo
sát phải grep khung trước mới đọc nổi. `docs/` giữ mức tổng quát — zone nào chứa
gì, mở file nào theo việc — và không chép lại thứ code đã nói.

**2 · Comment viết bằng tiếng Anh.** Comment, JSDoc, định danh và chuỗi log đi ra
ngoài: vào stack trace, vào JSON, vào tay dev không đọc tiếng Việt. `aurora/comments-in-english`
gác phần này ở mức `error`.

Hai ngoại lệ, cố ý: **nhãn hiển thị** (`'Đang chạy'`) và **dữ liệu fixture** (tên
người, tên công ty) giữ tiếng Việt — đó là _nội dung_, không phải khoá. Rule chỉ
đọc comment, không đọc chuỗi, vì một chuỗi không tự nói nó là nhãn hay là câu văn.

Thứ máy **không** thấy: định danh tiếng Việt viết không dấu (`textNhapTuyChon`).
Không regex nào tách nó khỏi tiếng Anh — đó là việc của mắt người.

**3 · Ít code nhất giải được bài.** Không trừu tượng hoá cho thứ dùng một lần,
không cấu hình không ai xin, không bắt lỗi cho tình huống không xảy ra được. Tên
biến và tên hàm nói đúng việc chúng làm. Sửa đúng thứ được yêu cầu — đừng "cải
thiện" code bên cạnh, đừng đổi format vùng không liên quan; mỗi dòng đổi phải
truy được về yêu cầu. Bản đầy đủ nằm ở skill `karpathy-guidelines` (plugin đang
bật), gọi khi cần soát kỹ.

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
| comment tiếng Anh        | `aurora/comments-in-english`                                              |

Người gác — CI **không** biết, phải tự nhìn:

- **Luật 12** — nền đúng 4 lớp, không lớp thứ 5
- **Luật 13** — tương phản ≥ 4.5:1 trên cả `.glass-a` và `.glass-b`; nút tablet ≥ 48px
- **Mẫu mail** — không compiler nào render chúng và không test nào chạy chúng, nên
  đổi gì trong `packages/mail-templates` thì mở `pnpm mail:preview` mà nhìn. Luật 13
  áp ở đây như mọi nơi khác, và email không có token nên phải tự đo hex.

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

`eslint-suppressions.json` khoá **3.183 vi phạm trong 298 file** — 3.078
`aurora/comments-in-english` (một dòng mỗi khối comment, không phải mỗi dòng) và
105 `aurora/spacing-scale`. Cả hai vẫn là `error`: **thêm mới ở bất kỳ đâu là CI
đỏ**. Xem chi tiết bằng `pnpm lint:debt`; dọn xong file nào thì `pnpm lint:prune`.
