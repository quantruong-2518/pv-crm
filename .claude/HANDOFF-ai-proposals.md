# Đề xuất tích hợp AI vào PV One — ghi lại 06/10/2026

Đây là **danh sách đề xuất, chưa có gì được duyệt hay dựng**. Chưa có ADR, chưa
có canvas, chưa có dòng code nào cho các mục dưới. Phiên sau muốn làm mục nào thì
hỏi chủ dự án đã chốt mục đó chưa, vẽ canvas trước, rồi mới `/build`.

Ràng buộc chung: mọi AI chỉ **đề xuất kèm căn cứ và chờ người bấm** (luật 9 —
`AiActionProps.basis` ở tầng kiểu, `E3.proposeFromAi` ở tầng engine). Không AI
nào tự ghi dữ liệu, tự gửi thư, tự chuyển bậc.

## 1 · Ba hướng chủ dự án đã nêu (06/10)

1. **AI tìm và phân tích lead** — tìm lead tiềm năng, phân tích, chấm mức phù hợp.
2. **AI phân tích hội thoại khách hàng** — đọc nội dung liên hệ, đánh nhãn, đề
   xuất hành động cho nhân viên.
3. **AI chatbot xuyên suốt CRM** — trợ lý hỗ trợ mọi nhân viên trên mọi màn.

## 2 · Đề xuất theo từng luồng (ý của Claude, chưa được chủ dự án duyệt)

| Luồng                      | AI đề xuất                                                                                | Gỡ việc gì                          |
| -------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| Nạp lead                   | Đọc ảnh danh thiếp / danh sách, tự điền và làm giàu hồ sơ công ty (ngành, quy mô, web)    | Gõ tay, lead thiếu thông tin        |
| Trùng lead                 | Gợi ý gộp khi tên công ty viết khác nhau nhưng là một                                     | Kiểm trùng chỉ bắt khớp chính xác   |
| Chăm lead                  | Chấm mức ưu tiên, gợi ý "hôm nay liên hệ ai, nói gì"                                      | BD tự nhớ, lead nguội không ai biết |
| Chiến dịch, mail hàng loạt | Soạn nháp thư theo ngành và lịch sử của từng nhóm                                         | Một thư chung cho mọi người         |
| Trả lời email              | Đọc thư khách trả lời, phân loại ý định (quan tâm / từ chối / hỏi giá), đề xuất bước tiếp | Đọc và phân loại bằng tay           |
| Liên hệ, cuộc gặp          | Từ ghi âm / biên bản điền sẵn tóm tắt, đánh giá, bước tiếp theo                           | Phần chốt liên hệ còn quá thủ công  |
| Cơ hội, báo giá            | Cảnh báo cơ hội có nguy cơ mất (lâu không liên hệ, kẹt bậc), gợi ý xác suất               | Dự báo theo cảm tính                |
| Hợp đồng, duyệt            | Tóm tắt cho người duyệt: điểm khác so với báo giá, điều khoản lệch chuẩn                  | Người duyệt phải đọc cả hồ sơ       |
| Hành trình khách           | Tóm tắt "chuyện tới giờ" khi bàn giao hoặc đổi người phụ trách                            | Người mới phải đọc lại cả lịch sử   |
| Hiệu suất                  | Giải thích bằng chữ vì sao số đổi, gom lý do dừng thành nhóm                              | Quản lý tự đọc biểu đồ              |
| Sau bán                    | Phát hiện dấu hiệu rời bỏ và cơ hội bán thêm                                              | Chưa có ai theo dõi                 |
| Xuyên suốt                 | Chatbot hỏi dữ liệu CRM bằng tiếng Việt, trả lời theo đúng quyền của người hỏi            | Tìm qua nhiều màn                   |

## 3 · Thứ tự Claude khuyên

**Làm trước** — dùng dữ liệu đã có, nhân viên thấy lợi mỗi ngày, và tạo dữ liệu
sạch cho các AI phía sau:

1. Điền sẵn chốt liên hệ (tóm tắt · đánh giá · bước tiếp theo).
2. Gợi ý việc hôm nay cho lead.
3. Tóm tắt hành trình khi bàn giao.

**Để sau** — dự báo cơ hội và phát hiện rời bỏ: cần vài tháng dữ liệu thật mới
đáng tin.

## 4 · Thứ đã có sẵn làm nền

- Nạp lead từ ảnh đã có bộ đọc AI; chủ dự án từng chốt dùng lại bộ đọc đó cho
  phần điền sẵn chốt liên hệ (bộ nhớ `chot-comm`, `nap-lead-tu-anh`).
- Module Liên hệ đã có xương sống chốt (ADR 0074, 0075); phần AI điền sẵn được
  để dành cho lượt sau, chưa có cột đề xuất trong bảng.
- Phân loại thư trả lời phụ thuộc việc thu thư trả lời, đang chờ MX (bộ nhớ
  `g9-theo-doi-tra-loi-con-no`).
- Chatbot phải đi qua E2 (quyền) như mọi cửa đọc khác — không đọc thẳng bảng.
