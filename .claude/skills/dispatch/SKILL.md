---
name: dispatch
description: Chốt kế hoạch và phân việc TRƯỚC mỗi lần spawn subagent — tách việc thành đơn vị, gán mỗi đơn vị một agent + model + effort theo độ khó và rủi ro, in bảng kế hoạch, rồi mới gọi Agent. Dùng mỗi khi sắp gọi Agent cho việc nhiều bước, khi được bảo "phân việc", "chia agent", "chốt kế hoạch", "model nào effort nào", hoặc khi một agent vừa trả kết quả hỏng và phải quyết leo thang. Repo có skill điều phối riêng (vd /build) thì skill đó chọn AI LÀM, skill này chọn CHẠY BẰNG GÌ.
---

# Chốt kế hoạch, phân việc, rồi mới spawn

## Cơ chế — chỉnh được gì, ở đâu

- **Model** — tham số `model` của Agent tool, đè theo từng lần gọi (`haiku` ·
  `sonnet` · `opus` · `fable`). Không truyền thì lấy `model:` trong frontmatter
  agent, rồi tới model phiên. `fork` luôn chạy model phiên, bỏ qua `model`.
- **Effort** — Agent tool **không có** tham số effort. Effort chỉ đến từ `effort:`
  trong frontmatter agent; thiếu thì kế thừa effort phiên. Nên **chọn effort =
  chọn loại agent**.
- Năm agent bậc effort ở `.claude/agents/`: `worker-low` · `worker-medium` ·
  `worker-high` · `worker-xhigh` · `worker-max` — không định model, đủ tool.
  `subagent_type` (effort) × `model` (model) = đủ lưới.
- Workflow `agent()` không có tuỳ chọn model/effort được tài liệu hoá — agent
  trong workflow chạy theo phiên. Đơn vị cần model/effort riêng thì gọi Agent.

## Bước 1 · Tách việc thành đơn vị

Mỗi đơn vị: làm gì · **ghi vào đâu** · chờ đơn vị nào · xong nghĩa là gì.

- Hai đơn vị ghi chung một file → gộp, hoặc xếp nối tiếp. Không chạy song song.
- Đơn vị gọn trong một file đã biết đường, hoặc kết quả còn phải bàn tiếp → tự
  làm, không spawn. Uỷ quyền tốn một vòng nạp context.

## Bước 2 · Chọn agent

1. Repo có agent chuyên trách vùng đó (`.claude/agents/*.md`, bảng vùng của
   `/build`...) → **dùng nó**: prompt của nó mang luật repo mà worker không biết.
   Effort của nó cố định theo frontmatter; lệch với bảng dưới thì ghi chú trong
   kế hoạch, không tự sửa frontmatter. Lệch lặp lại → đề xuất người dùng sửa.
2. Chỉ tìm / định vị → `Explore`.
3. Không ai chuyên trách → `worker-<effort>` + `model`. Vùng `/build` gọi là
   "KHÔNG ai sở hữu" (`packages/ui/**`, barrel, `routes.tsx`...) thì worker cũng
   không được ghi — chỉ xin qua `sharedRequests`.

## Bước 3 · Chọn model và effort

| Loại việc                                                                          | Model  | Effort     |
| ---------------------------------------------------------------------------------- | ------ | ---------- |
| Tìm file, đếm chỗ dùng, liệt kê                                                    | haiku  | low        |
| Cơ học có đặc tả rõ: nhập dữ liệu, đổi tên hàng loạt, test theo đặc tả, dọn format | sonnet | low–medium |
| Dựng theo mẫu có sẵn, 1–3 file, contract đã chốt                                   | sonnet | high       |
| Đụng bất biến, logic nghiệp vụ, dựng màn, schema/migration, nhiều file             | opus   | high       |
| Agentic dài nhiều bước, debug chưa rõ nguyên nhân                                  | opus   | xhigh      |
| Review, soát, truy luồng dữ liệu, lập kế hoạch                                     | opus   | high       |
| Kiến trúc cắt ngang, hoặc bài opus xhigh đã hỏng hai lần                           | fable  | high       |

Haiku không có effort — `worker-low` chỉ để có một agent đủ tool.

**Chỉnh theo rủi ro.** Sai thì mất dữ liệu, lên production, hoặc CI xanh mà vẫn
sai → nâng một bậc. Có reviewer soát sau và sai thì rẻ → giữ hoặc hạ.

**Trần.**

- `max` không bao giờ là mặc định — chỉ khi `xhigh` đã trượt và đúng quan trọng
  hơn chi phí.
- `fable` đắt ~2,5× opus.
- Cả hai: hỏi người dùng trước, trừ khi lượt này họ đã cho phép.
- Reviewer không yếu hơn builder nó soát — model và effort đều ≥.

## Bước 4 · In kế hoạch, rồi spawn

Một bảng gọn trước khi gọi:

| # | Việc | Agent | Model | Effort | Ghi vào | Chờ | Vì sao |

Rồi spawn ngay mọi đơn vị không phụ thuộc, **cùng một message** để chạy song
song. Chỉ dừng hỏi trước khi spawn khi: có `fable` hoặc `max` · quá 6 agent · có
quyết định chỉ người dùng chốt được.

Brief phải tự đủ — agent không thấy cuộc trò chuyện:

1. Việc là gì, mở file nào trước.
2. Vùng được ghi; ngoài vùng thì báo lại, không tự sửa.
3. Trả về hình dạng gì (bảng · danh sách · đường dẫn), thế nào là xong.
4. Gặp chỗ treo: làm hết phần không phụ thuộc, gom câu hỏi trả về, không tự quyết.

## Bước 5 · Kết quả về

- Tự kiểm bằng lệnh / cổng của repo. Lời agent không phải bằng chứng.
- Hỏng vì brief thiếu → sửa brief, không leo thang.
- Hỏng vì bài khó → nâng effort một bậc trước; vẫn hỏng mới lên model
  (sonnet → opus → hỏi rồi mới fable).
- Xong quá dễ so với bậc đã chọn → lần sau hạ; lặp lại thì đề xuất sửa bảng.
