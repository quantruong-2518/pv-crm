# pv-crm — hợp đồng làm việc

Monorepo của **PV One** (Pebble Vina) — ERP/CRM dựng theo hệ thiết kế **Aurora
v2.0**. Có đủ hai đầu: `apps/web` đọc phần lớn dữ liệu thật từ Neon qua
`apps/api`; một số màn còn đọc fixture đóng băng. Còn bao nhiêu màn chưa cắt —
`pnpm ctx`, đừng đoán.

```
docs/design-system/laws.md    15 luật cứng (§1) · token dùng thật (§2) · ba thiết bị (§3)
packages/tokens          globals.css — FILE MÀU DUY NHẤT + bảng token dạng dữ liệu
packages/ui              @pv/ui — thư viện component            → packages/ui/CLAUDE.md
packages/engines         @pv/engines — E1 đồ thị · E2 quyền · E3 duyệt · E4 thông báo
                                                                → packages/engines/CLAUDE.md
packages/contracts       @pv/contracts — zod, nguồn kiểu DUY NHẤT cho cả hai đầu
packages/mail-templates  mẫu mail — không compiler nào render, xem bằng pnpm mail:preview
apps/web                 app thật (/) + theme kit sống (/kit)   → apps/web/CLAUDE.md
apps/api                 NestJS trên Fastify · Neon (prod) / PGlite (máy)
                                                                → apps/api/CLAUDE.md
tools/                   eslint-plugin-aurora + script gác token · CSS · context
```

Bốn file `CLAUDE.md` con nói zone nào chứa gì và mở file nào theo việc. Mọi
trích dẫn `luật N` trong code trỏ vào `docs/design-system/laws.md`.
**Thiếu token thì HỎI, đừng bịa hex mới.**

## Ba cửa vào

| Gọi      | Khi nào                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/build` | Bất kỳ việc nhiều bước nào. Nó chọn agent theo **vùng file**, chạy song song, gọi reviewer, rồi gọi `/check`. Không cần nhớ tên agent |
| `/check` | Sắp commit, sắp push, hoặc vừa đụng tầng dùng chung                                                                                   |
| `/ship`  | Đẩy `apps/api` lên Fly + Neon. Chốt cả thứ tự migrate ↔ deploy                                                                        |

Hai skill hẹp, gọi thẳng khi đúng việc: `/cut` (cắt một query khỏi fixture sang
endpoint thật) · `/split` (file phình quá ngưỡng thì tách theo đường nào).

## Lệnh

```bash
pnpm install
pnpm dev            # http://localhost:5173  ·  /kit là theme kit
pnpm ctx            # mọi con số về repo: %comment, nợ, tham chiếu gãy
pnpm check          # cổng duy nhất: format · kiểu · lint · token · test · build · css · ctx
pnpm check:fast     # tầng nhanh: format · kiểu · lint
pnpm lint:debt      # còn nợ bao nhiêu vi phạm cũ, ở file nào
pnpm mail:preview   # http://localhost:5175 — mọi mẫu mail, render lại mỗi lần F5
```

Node 22 (`.nvmrc`), pnpm 10. Repo và Claude Code **cùng nằm trong WSL** — gọi
`pnpm`/`git` thẳng. Nếu `uname -s` không trả về `Linux` thì phiên này đang chạy
từ Windows: dừng lại và hỏi, đừng gọi bừa.

## Không con số chết trong file này

Nợ lint, %comment, số màn còn fixture, số agent — tất cả **tính được**, nên
không chép vào đây. Chép một con số vào tài liệu là hẹn ngày nó sai.
`pnpm ctx` và `pnpm lint:debt` là nguồn.

## Luật khi sinh code

Ba luật này áp cho **mọi dòng viết ra**, không phải chỉ khi được nhắc.

**1 · Comment mang cái VÌ SAO, và có trần.** Code đã nói _cái gì_ — comment nói
vì sao chọn thế này thay vì thế kia, đặt ngay tại chỗ khai báo. **Trần cứng:
docblock đầu file ≤ 15 dòng · comment trong hàm ≤ 3 dòng** (`aurora/comment-budget`
gác). Dài hơn nghĩa là nội dung đó thuộc `docs/` — comment chỉ trỏ tới, không chép
lại. `docs/` giữ mức tổng quát và không chép lại thứ code đã nói.

**2 · Comment và ĐỊNH DANH viết bằng tiếng Anh.** Comment, JSDoc, tên biến, tên
type, **giá trị enum** và chuỗi log đi ra ngoài: vào stack trace, vào JSON, vào
URL, vào `CHECK` constraint của Postgres, vào tay dev không đọc tiếng Việt.
`aurora/comments-in-english` gác phần comment; phần định danh không rule nào gác.

Hai ngoại lệ cố ý: **nhãn hiển thị** (`'Đang chạy'`) và **dữ liệu fixture** (tên
người, tên công ty) giữ tiếng Việt — đó là _nội dung_, không phải khoá. Thứ máy
**không** thấy: định danh tiếng Việt không dấu (`dau-moi`) và giá trị lai
(`gui-quotation`). Ranh giới đầy đủ ở `docs/decisions/0012-rename-vietnamese-identifiers-in-six-batches.md` —
đọc trước khi đổi tên bất cứ thứ gì.

**3 · Ít code nhất giải được bài.** Không trừu tượng hoá cho thứ dùng một lần,
không cấu hình không ai xin, không bắt lỗi cho tình huống không xảy ra được. Sửa
đúng thứ được yêu cầu — đừng "cải thiện" code bên cạnh, đừng đổi format vùng
không liên quan; mỗi dòng đổi phải truy được về yêu cầu. Một file vượt ngưỡng thì
tách theo `/split`, không để nó phình tiếp (`max-lines` gác). Skill
`karpathy-guidelines` là bản đầy đủ — **cần cài marketplace `karpathy-skills`
trước**, `pnpm ctx` sẽ nhắc nếu chưa.

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
| trần comment             | `aurora/comment-budget`                                                   |
| độ dài file và hàm       | `max-lines` · `max-lines-per-function`                                    |
| tài liệu AI còn đúng     | `pnpm ctx --strict` — tham chiếu gãy là CI đỏ                             |

Người gác — CI **không** biết, phải tự nhìn:

- **Luật 12** — nền màn đúng MỘT lớp: aurora glow trên `--background`, đặt ở khung ngoài cùng
- **Luật 13** — tương phản ≥ 4.5:1 trên cả `.glass-a` và `.glass-b`; nút tablet ≥ 48px
- **Mẫu mail** — không compiler nào render và không test nào chạy, nên đổi gì
  trong `packages/mail-templates` thì mở `pnpm mail:preview` mà nhìn. Luật 13 áp
  ở đây như mọi nơi khác, và email không có token nên phải tự đo hex.

## Test — không tự sinh, trừ một ngoại lệ

Không tự viết test khi dựng/sửa màn trừ khi được yêu cầu rõ — mỗi test UI
vibe-code ra là một khoản token phải trả lại mỗi lần sửa màn đó. `vitest.config.ts`
bật `passWithNoTests`, nên cây 0 test không làm `pnpm check` đỏ.

**Ngoại lệ duy nhất, vẫn là luật cứng:** thêm số mới vào fixture bắt buộc kèm một
test khoá số đó ngay cạnh fixture. Đó là cơ chế duy nhất bắt số liệu demo — thứ
không compiler nào gác được — không lặng lẽ trôi.

## Biên giới package — không được phá

- `@pv/ui` **không biết** engine, không biết app. Dữ liệu vào bằng props.
- `@pv/engines` **không phụ thuộc React** — đó là thứ giữ cho engine dùng lại được ở backend.
- `@pv/contracts` là nguồn kiểu duy nhất; TS suy ra từ zod bằng `z.infer`, không gõ tay song song.
- Engine là của platform. Nhánh không fork engine, không giữ trạng thái engine đã giữ.
- App import qua cửa chính, không với vào `src/` của package khác.

Cả năm là rule `no-restricted-imports` trong `eslint.config.js`.

## Dữ liệu: đúng hai kịch bản, không trộn

| Kịch bản                      | Import từ                       | Đóng băng     |
| ----------------------------- | ------------------------------- | ------------- |
| Sao Đỏ — khách **đã mua**     | `@pv/engines/fixtures/sao-do`   | 10/08 · 07:58 |
| DAS Vina — khách **chưa mua** | `@pv/engines/fixtures/das-vina` | 17/08 · 09:10 |

Một màn dùng đúng một kịch bản. **Không gõ số thẳng vào JSX** — mọi con số đã
chốt nằm trong fixture. Màn đã cắt sang Neon đếm số thật; màn chưa cắt đếm số
đóng băng, và **hai bên lệch nhau là đúng thiết kế, không phải lỗi**.

Thêm component mới vào `@pv/ui`: bốn bước ở `packages/ui/CLAUDE.md`, không chép lại đây.
