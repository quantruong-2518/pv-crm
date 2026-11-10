---
name: build
description: Cửa vào duy nhất cho mọi việc nhiều bước ở pv-crm — nhận yêu cầu, chọn agent theo VÙNG FILE sẽ bị ghi, chạy song song, gọi reviewer, rồi gọi /check. Dùng khi bắt đầu một việc dựng màn, thêm endpoint, đổi bảng, thêm kênh thu dữ liệu, hoặc bất cứ việc nào đụng hơn một file. Cũng dùng khi phân vân "việc này ai làm, tự làm hay đẩy sang subagent".
---

# Điều phối một lượt việc

Skill global `dispatch` lo phần chung: chia đơn vị, chọn model/effort, mẫu brief,
vòng review. File này chỉ giữ thứ riêng của pv-crm: **ai sở hữu vùng nào**, brief
phải nhắc lại gì, và reviewer nào soát.

## Bước 1 · Hỏi "việc này GHI vào đâu", không hỏi "việc này thuộc nghề gì"

Mỗi agent sở hữu một vùng file. Không ai được ghi ngoài vùng của mình, nên hai
agent chạy song song **không thể** giẫm lên nhau.

| Vùng sẽ bị ghi                                                                                 | Agent              |
| ---------------------------------------------------------------------------------------------- | ------------------ |
| `apps/web/src/pages/**` · `apps/web/src/components/**` · `apps/web/src/data/**`                | `screen-builder`   |
| `apps/api/src/branches/**` · `apps/api/src/platform/**` (trừ `*.schema.ts`, `mail/`, `queue/`) | `api-builder`      |
| `**/*.schema.ts` · `apps/api/drizzle/**`                                                       | `migration-writer` |
| `apps/api/src/platform/mail/**` · `apps/api/src/platform/queue/**`                             | `capture-builder`  |
| `packages/contracts/**`                                                                        | `contract-drafter` |
| `packages/engines/src/fixtures/**`                                                             | `fixture-keeper`   |
| `packages/engines/src/**` (ngoài fixtures) · `packages/mail-templates/**` · `tools/**`         | `worker`           |
| `docs/**` · dọn `.claude/HANDOFF-*.md` cũ                                                      | `doc-keeper`       |
| `.claude/agents/**` · `.claude/skills/**` · mọi `CLAUDE.md`                                    | `worker`           |
| Fly · Neon                                                                                     | `deploy-guardian`  |

`worker` (sonnet) không mang luật repo: brief giao cho nó phải nêu biên giới package
(mục dưới) và luật kiểm của vùng đó. Brief cho file harness thêm một dòng: nạp skill
`writing-for-agents` trước khi viết. Handoff đang sống do phiên chính giữ.

Một đơn vị build chạy opus chỉ khi brief của nó mang dòng `Why opus:` (không có gold
example, và đụng quyền/tiền/bất biến) — không có dòng đó thì hook từ chối. Bảng
model/effort nằm ở `dispatch` global, không chép lại đây.

**Vùng KHÔNG ai sở hữu** — `packages/ui/**`, mọi `index.ts` barrel,
`apps/web/src/routes.tsx`, `apps/web/src/kit/**`, `packages/tokens/**`,
`eslint.config.js`. Agent chạm vào đây là hỏng song song. Chúng chỉ được **xin**
qua `sharedRequests`, và context chính áp tay sau khi mọi agent đã về.

Đọc-không-ghi, gọi song song thoải mái: `dataflow-tracer` (đường đi của dữ liệu,
quyền trên từng chặng) · `rule-locator` (luật nghiệp vụ nằm sai tầng) · `Explore`.

## Bước 2 · Đọc hẹp

Đọc chỗ đã biết thì `grep` lấy khung khai báo (`^export`, `queryOptions(`,
`@Controller`) rồi đọc đúng khoảng dòng. `pnpm ctx` in %comment mỗi zone — ở
`packages/contracts` phần lớn byte là văn xuôi, mở cả file là trả tiền đọc văn.

## Bước 3 · Bốn thứ brief phải nhắc lại

Subagent không tự biết được:

1. **Vùng nó sở hữu**, và câu "ngoài vùng thì ghi vào `sharedRequests`, không tự sửa".
2. **Kịch bản dữ liệu** — `sao-do` (đã mua) hoặc `das-vina` (chưa mua). Một màn
   đúng một kịch bản, không trộn.
3. **Biên giới package** — `@pv/ui` không biết engine · `@pv/engines` không phụ
   thuộc React · kiểu suy ra từ zod, không gõ tay song song.
4. **Trần comment và trần độ dài** (luật 1 và 3) — lint sẽ đỏ, và sửa sau đắt hơn
   viết đúng ngay.

File mẫu cho dòng "Gold example" lấy từ mục **Gold examples** của agent được giao.

## Bước 4 · Reviewer, gọi song song

- `rules-reviewer` — mọi lượt. Thứ CI mù: một sự thật một sổ, lỗ quyền, trộn kịch
  bản, định danh tiếng Việt, ngưỡng bịa ra.
- `aurora-reviewer` — khi lượt này đụng màn. Luật 12 · 13 và mặt kính, đọc từ code.
- `screen-inspector` — cùng lúc với `aurora-reviewer`, khi có app đang chạy: mở màn
  thật, đo tương phản, cỡ nút tablet, số lớp nền ở cả ba theme.

## Bước 5 · Đóng lượt

`/check`, và nói rõ đã dừng ở tầng nào. Agent không bao giờ stage hay commit; sau
`/check` phiên chính gọi skill `commit` (chạy trong worker haiku fork) kèm đúng danh
sách đường dẫn của lượt này.
