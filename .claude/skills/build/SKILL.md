---
name: build
description: Cửa vào duy nhất cho mọi việc nhiều bước ở pv-crm — nhận yêu cầu, chọn agent theo VÙNG FILE sẽ bị ghi, chạy song song, gọi reviewer, rồi gọi /check. Dùng khi bắt đầu một việc dựng màn, thêm endpoint, đổi bảng, thêm kênh thu dữ liệu, hoặc bất cứ việc nào đụng hơn một file. Cũng dùng khi phân vân "việc này ai làm, tự làm hay đẩy sang subagent".
---

# Điều phối một lượt việc

Routing ở đây là **hành vi được chạy**, không phải bảng để đọc rồi tự nhớ. Bảng
đọc thì mục — đó là lý do phiên bản trước của file này nói "bốn agent" trong khi
có mười hai.

## Bước 1 · Hỏi "việc này GHI vào đâu", không hỏi "việc này thuộc nghề gì"

Mỗi agent sở hữu một vùng file. Không ai được ghi ngoài vùng của mình, nên hai
agent chạy song song **không thể** giẫm lên nhau.

| Vùng sẽ bị ghi                                                     | Agent              |
| ------------------------------------------------------------------ | ------------------ |
| `apps/web/src/pages/**` · `apps/web/src/components/**`             | `screen-builder`   |
| `apps/web/src/data/**`                                             | `screen-builder`   |
| `apps/api/src/branches/**` (trừ `*.schema.ts`)                     | `api-builder`      |
| `**/*.schema.ts` · `apps/api/drizzle/**`                           | `migration-writer` |
| `apps/api/src/platform/mail/**` · `apps/api/src/platform/queue/**` | `capture-builder`  |
| `packages/contracts/**`                                            | `contract-drafter` |
| `packages/engines/src/fixtures/**`                                 | `fixture-keeper`   |
| `docs/**` · mọi `*.md`                                             | `doc-keeper`       |
| Fly · Neon                                                         | `deploy-guardian`  |

**Vùng KHÔNG ai sở hữu** — `packages/ui/**`, mọi `index.ts` barrel,
`apps/web/src/routes.tsx`, `apps/web/src/kit/**`, `packages/tokens/**`,
`eslint.config.js`. Agent chạm vào đây là hỏng song song. Chúng chỉ được **xin**
qua `sharedRequests`, và context chính áp tay sau khi mọi agent đã về.

Đọc-không-ghi, gọi song song thoải mái: `dataflow-tracer` (đường đi của dữ liệu,
quyền trên từng chặng) · `rules-reviewer` · `aurora-reviewer` · `Explore` (tìm
file, đếm chỗ dùng — Haiku là đủ).

## Bước 2 · Đừng đẩy đi thứ nên tự làm

Uỷ quyền tốn một vòng nạp context. Không đáng khi: việc gọn trong **một file đã
biết đường** · việc đúng bằng câu người dùng vừa nói · kết quả còn phải bàn tiếp
(agent trả lời một lần, hỏi lại là nạp lại từ đầu).

Và luật ngược lại, quan trọng hơn: **đọc rộng không bao giờ làm ở context chính.**
Cần định vị thì `Explore`; cần đọc chỗ đã biết thì `grep` lấy khung khai báo
(`^export`, `queryOptions(`, `@Controller`) rồi đọc đúng khoảng dòng. Không mở cả
file "cho chắc" — `pnpm ctx` in ra %comment mỗi zone, và ở `packages/contracts`
đọc bốn byte thì ba byte là văn xuôi.

## Bước 3 · Gói brief đứng một mình

Subagent **không thấy** cuộc trò chuyện này. Brief phải tự đủ: việc là gì · mở
file nào trước · trả về **hình dạng** gì (bảng · danh sách · đường dẫn) · thế nào
là xong. Bốn thứ luôn phải nhắc lại vì nó không thể tự biết:

1. **Vùng nó sở hữu**, và câu "ngoài vùng thì ghi vào `sharedRequests`, không tự sửa".
2. **Kịch bản dữ liệu** — `sao-do` (đã mua) hoặc `das-vina` (chưa mua). Một màn
   đúng một kịch bản, không trộn.
3. **Biên giới package** — `@pv/ui` không biết engine · `@pv/engines` không phụ
   thuộc React · kiểu suy ra từ zod, không gõ tay song song.
4. **Trần comment và trần độ dài** (luật 1 và 3) — lint sẽ đỏ, và sửa sau đắt hơn
   viết đúng ngay.

Gửi mọi agent độc lập **trong cùng một lượt** để chúng chạy song song.

## Bước 4 · Soát trước khi tin

Build agent báo xong **không phải** là xong. Gọi reviewer, và gọi song song:

- `rules-reviewer` — tám lượt soát thứ CI mù: một sự thật một sổ, lỗ quyền, trộn
  kịch bản, định danh tiếng Việt, ngưỡng bịa ra.
- `aurora-reviewer` — chỉ khi lượt này đụng màn. Luật 12 · 13 và mặt kính.

Không gộp reviewer vào build agent. Người viết không soát được chính mình, và
gộp vào là mất cả hai.

## Bước 5 · Đóng lượt

`/check`. Dừng ở tầng đủ dùng, nhưng **nói rõ đã dừng ở tầng nào** — "đã kiểm"
mà chỉ chạy `check:fast` là báo cáo sai.

Còn `openDecisions` chưa ai trả lời thì đưa lên, đừng tự quyết thay chủ dự án.
