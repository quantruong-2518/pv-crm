-- Nạp CHUỖI BA LẦN TIẾP CẬN vào `sales.mail_template`. Viết tay, không sinh
-- bằng drizzle-kit: đây là dữ liệu, không phải lược đồ. Cùng khuôn và cùng lý
-- do với `0013_mas_template_seed.sql` — đọc khối chú thích ở đầu file đó về
-- việc vì sao mẫu mail là migration chứ không phải `seed.ts`.
--
-- ---------------------------------------------------------------------------
-- BA LẦN CHẠM LÀ BA HÀNG DỮ LIỆU, KHÔNG PHẢI BA FILE .TSX
-- ---------------------------------------------------------------------------
-- Mô hình đã có sẵn chỗ cho việc này: `sales.campaign` gom người nhận,
-- `sales.campaign_run` nối chiến dịch với từng `platform.mail_run`, và
-- `mail_run.label` là thứ làm cho "đợt thứ ba" thành một thứ có số liệu riêng.
-- Cái duy nhất còn thiếu là NỘI DUNG của ba đợt — tức ba hàng ở bảng này.
--
-- Khung dựng thư nằm ở `packages/mail-templates/src/mas-shell.tsx` và chỉ có
-- MỘT. Thêm một lần chạm thứ tư sau này là thêm một hàng ở đây, không phải
-- thêm một file.
--
-- ---------------------------------------------------------------------------
-- BA LẦN CHẠM CÓ BA HÌNH KHÁC NHAU — ĐÓ LÀ TOÀN BỘ LÝ DO KHÔNG DÙNG MỘT MẪU
-- ---------------------------------------------------------------------------
--   · lần 1 — MỞ CỬA. Ngắn nhất. Nói ta là ai, vì sao viết cho đúng công ty
--     này, và xin một việc rất nhỏ. Không có dẫn chứng, không có tài liệu:
--     người chưa biết ta là ai thì chưa tải gì cả.
--   · lần 2 — DẪN CHỨNG. Nhắc lại lần 1 trong một câu rồi đưa MỘT bằng chứng
--     cụ thể. Đây là lá duy nhất trong chuỗi được phép dài.
--   · lần 3 — DỪNG ĐÚNG LÚC. Thẳng thắn nói đây là lần cuối, và cho người ta
--     một đường thoát dễ hơn cả việc phớt lờ. Lá này giữ danh tiếng miền gửi:
--     một chuỗi không biết dừng là một chuỗi bị bấm nút spam.
--
-- ---------------------------------------------------------------------------
-- CHỖ TRỐNG VẪN LÀ `[…]`, VÀ VẪN CỐ Ý NHÌN THẤY ĐƯỢC
-- ---------------------------------------------------------------------------
-- Bốn thứ quyết định nội dung — tên dòng sản phẩm · câu định vị · CTA dẫn đi
-- đâu · số liệu nào được phép in — vẫn chưa được chủ dự án cung cấp. File này
-- viết phần NỐI: lời chào, mạch chuyển, lời xin, câu dừng. Phần SỰ KIỆN thì để
-- nguyên trong ngoặc vuông.
--
-- Panel soạn mail KHOÁ nút Gửi khi tiêu đề hoặc thân còn `[…]`
-- (`unfilledSlots` ở `mas-mail-drawer.tsx`), nên ba hàng này dùng được ngay
-- theo đúng cách đã thiết kế: chọn mẫu → điền chỗ trống trong panel → gửi.
--
-- KHÔNG dùng `{{…}}` cho chỗ trống: đó là cú pháp trộn biến thật của
-- `mas.composer.ts`, và một khoá nó không biết sẽ bị thay bằng CHUỖI RỖNG —
-- chỗ trống biến mất không dấu vết. Hai khoá có thật và chỉ hai:
-- `{{contactName}}` và `{{company}}`, cả hai do `MasService.intentOf` ghi vào
-- `email_delivery.merge` cho từng người nhận.
--
-- `ON CONFLICT DO NOTHING`: chạy lại migration không ghi đè nội dung mà ai đó
-- đã sửa cho đúng trong lúc chờ.

INSERT INTO "sales"."mail_template"
  ("code", "name", "subject", "body", "cta_label", "cta_url", "active")
VALUES
(
  'mas-tiep-can-1',
  'Tiếp cận lần 1 — mở cửa',
  '{{company}} và [tên dòng sản phẩm]?',
  E'Chào anh/chị {{contactName}},\n\n'
  || E'Tôi viết từ Pebble Vina. Chúng tôi [một câu về việc công ty làm gì], '
  || E'và {{company}} nằm trong nhóm doanh nghiệp tôi nghĩ là đáng trao đổi '
  || E'nhất về việc này.\n\n'
  || E'[Một đoạn về vấn đề mà nhóm khách này thường gặp, và vì sao nó đáng '
  || E'giải quyết. Chưa có số liệu nào được duyệt để in ở đây — đừng thêm số.]\n\n'
  || E'Tôi chưa xin anh/chị mua gì cả. Chỉ muốn biết chuyện này có đúng là một '
  || E'vấn đề ở bên anh/chị hay không — một dòng trả lời là đủ.',
  'Tìm hiểu Pebble Vina',
  'https://pebblevina.com',
  true
),
(
  'mas-tiep-can-2',
  'Tiếp cận lần 2 — một dẫn chứng',
  'Gửi lại anh/chị {{contactName}} — [tên dẫn chứng]',
  E'Chào anh/chị {{contactName}},\n\n'
  || E'Tuần trước tôi có gửi anh/chị một thư về [nhắc lại chủ đề lần 1 trong '
  || E'nửa câu]. Lần này tôi gửi kèm một thứ cụ thể hơn.\n\n'
  || E'[Một dẫn chứng: doanh nghiệp nào, họ đang kẹt ở đâu, làm gì, và kết quả '
  || E'ra sao. Chỉ in những con số đã được duyệt — nếu chưa có số nào được '
  || E'duyệt thì kể bằng lời, đừng ước lượng.]\n\n'
  || E'Nếu ở {{company}} có một khâu giống vậy, tôi nghĩ bản ghi chép đầy đủ sẽ '
  || E'đáng mười phút của anh/chị.',
  'Đọc bản ghi chép đầy đủ',
  'https://pebblevina.com',
  true
),
(
  'mas-tiep-can-3',
  'Tiếp cận lần 3 — dừng đúng lúc',
  'Tôi dừng ở đây nhé, anh/chị {{contactName}}',
  E'Chào anh/chị {{contactName}},\n\n'
  || E'Đây là thư cuối tôi gửi về chuyện này. Không có tin gì mới — tôi chỉ '
  || E'không muốn để một cuộc trao đổi dở dang nằm im trong hộp thư của '
  || E'anh/chị.\n\n'
  || E'Nếu bây giờ chưa phải lúc, anh/chị cứ bỏ qua thư này; tôi sẽ không gửi '
  || E'thêm. Còn nếu chỉ là sai người nhận, anh/chị chỉ tôi đúng người ở '
  || E'{{company}} thì tôi biết ơn.\n\n'
  || E'Còn nếu đúng lúc, đây là chỗ đặt mười lăm phút — anh/chị chọn giờ nào '
  || E'cũng được.',
  'Đặt mười lăm phút',
  'https://pebblevina.com',
  true
)
ON CONFLICT ("code") DO NOTHING;
