-- Viết trọn nội dung mẫu thư MAS. Viết tay như `0013` và `0019`, cùng lý do
-- ghi ở đó — mẫu thư là dữ liệu CẤU HÌNH, phải có mặt trên production, và
-- `pnpm db:seed` TRUNCATE sạch nên không ai dám chạy nó trên Neon.
--
-- ---------------------------------------------------------------------------
-- CÁI GÌ ĐỔI, VÀ VÌ SAO LÀ VIẾT ĐÈ CHỨ KHÔNG PHẢI THÊM MẪU MỚI
-- ---------------------------------------------------------------------------
-- Trước file này, `sales.mail_template` có bốn hàng và CẢ BỐN đều là khung:
-- `mas-edge-ai-intro` (`0013`) và `mas-tiep-can-1..3` (`0019`), với mọi chỗ
-- chưa biết để trong ngoặc vuông `[…]`. Ba lớp chặn dựa vào chính ký hiệu đó,
-- lớp ngoài cùng là panel soạn mail KHOÁ nút gửi khi còn một `[…]`.
--
-- Khoá đó đã gỡ 30/08 — nó bắt cả người tự soạn thư của mình phải điền một chỗ
-- trống của mẫu mà họ chưa từng thấy; `apps/web/src/data/mail-hints.ts` nói đủ
-- lý lẽ. Gỡ khoá mà để nguyên bốn cái khung là đổi một cái chặn phiền phức lấy
-- một cái bẫy: ô chọn mẫu vẫn đưa ra `[một câu về việc công ty làm gì]`, chỉ
-- khác là giờ nó gửi đi được.
--
-- Nên bốn hàng đó được VIẾT ĐÈ chứ không phải bị bỏ lại cạnh mấy hàng mới.
-- Giữ nguyên `code`: `mail_run` chụp lại nội dung lúc tạo lô nên thư đã gửi
-- không đổi, còn `MasSendRequest.templateCode` đã ghi vào những lô cũ vẫn trỏ
-- đúng chỗ. Một `code` mới sẽ làm câu hỏi "mẫu nào chạy tốt" mất một nửa dữ
-- liệu.
--
-- `mas-tiep-can-3` KHÔNG có trong file này, cố ý: nó là hàng duy nhất của
-- `0019` vốn đã viết trọn — thư dừng đúng lúc không cần một thông số nào — và
-- viết đè lên một thứ đã đúng chỉ để cho đủ bộ là sửa thứ không hỏng.
--
-- ---------------------------------------------------------------------------
-- KHÔNG MỘT CON SỐ NÀO, VÀ ĐÓ LÀ RÀNG BUỘC CHỨ KHÔNG PHẢI SỰ NGHÈO NÀN
-- ---------------------------------------------------------------------------
-- Bốn thứ `docs/con-thieu-mas-mail.md` §A2 đòi — tên dòng sản phẩm · câu định
-- vị · CTA dẫn đi đâu · số liệu nào được in — vẫn CHƯA được cấp. Nên bốn lá
-- dưới đây viết quanh thứ đã biết chắc và chỉ thứ đó:
--
--   · Pebble Vina làm chip AI biên. Có sẵn trong repo, không phải suy đoán.
--   · "Chạy mô hình ngay trên thiết bị thay vì gửi lên đám mây" là ĐỊNH NGHĨA
--     của edge AI, không phải một tuyên bố về sản phẩm.
--   · `https://pebblevina.com` là URL thật — `BRAND.siteUrl` giữ chính nó.
--
-- Không hiệu năng, không mức tiêu thụ điện, không tên dòng chip, không phần
-- trăm, không dẫn chứng khách hàng. Một con số bịa trong thư gửi khách là con
-- số người nhận sẽ hỏi lại. Khi chủ dự án cấp bốn thứ kia thì đây là chỗ viết
-- đè lên, một chỗ.
--
-- Đó cũng là lý do `mas-tiep-can-2` đổi VAI: bản `0019` bắt nó kể một dẫn
-- chứng khách hàng, mà không có dẫn chứng nào được duyệt để kể. Đợt hai của
-- một chuỗi tiếp cận không nhất thiết phải mang bằng chứng mới — nhắc lại,
-- ngắn hơn, và hỏi đúng một câu là một đợt hai hoàn chỉnh, và nó không nợ ai
-- thông tin nào.
--
-- ---------------------------------------------------------------------------
-- HÌNH THỨC: CÙNG MỘT KHUNG, KHÁC NHAU Ở CHỖ ĐÒI HỎI
-- ---------------------------------------------------------------------------
-- Cả bốn đều dưới 160 từ, mở bằng chuyện của người nhận, hỏi đúng MỘT câu, và
-- cho một đường thoát rõ ràng. Đường thoát không phải phép lịch sự: nó là thứ
-- đổi một lượt báo cáo spam thành một lượt trả lời, và tỉ lệ phàn nàn mới là
-- thứ quyết định tên miền còn gửi được hay không.
--
-- Ba lá KHÔNG có nút, cố ý. `mail_template_cta_pair` cho phép một hàng không
-- CTA, và một lá chỉ xin một dòng trả lời thì cái nút là chỗ để bấm THAY VÌ
-- trả lời. Chỉ `mas-edge-ai-intro` — lá đứng một mình, gửi lẻ từ Sổ lead — có
-- nút, vì nó là lá duy nhất không nằm trong một chuỗi có lá sau.
--
-- Chỗ trống duy nhất còn lại trong cả bốn là `[tên và chức danh người gửi]` ở
-- dòng ký tên: không có khoá trộn nào cho người gửi (`MAIL_MERGE_KEYS` chỉ có
-- company/contactName và hai alias), nên đó là thứ duy nhất máy không điền hộ
-- được. Danh sách nhắc sẽ chỉ đúng vào nó.
--
-- `{{contactName}}` và `{{company}}` là hai khoá THẬT — `MAIL_MERGE_KEYS` ở
-- `@pv/contracts` giữ danh sách, `MasService.mergeOf` ghi giá trị vào
-- `email_delivery.merge` cho từng người nhận. Đừng thêm khoá thứ ba ở đây mà
-- không thêm vào cả hai chỗ đó: một khoá lạ bị thay bằng CHUỖI RỖNG.
--
-- Xuống dòng đơn ở dòng ký tên đi ra thành `<br />` — `withLineBreaks` trong
-- `mas-shell.tsx`. Trước 30/08 nó bị HTML nuốt thành một dấu cách, nên mọi lá
-- thư đã dựng đều dính "Trân trọng," vào tên người gửi trên cùng một dòng.

UPDATE "sales"."mail_template" SET
  "name" = 'Chào lần đầu — chip AI biên',
  "subject" = 'Pebble Vina — chip AI biên, một câu hỏi cho {{company}}',
  "body" =
    E'Chào anh/chị {{contactName}},\n\n'
    || E'Tôi viết từ Pebble Vina. Chúng tôi làm chip AI biên — phần cứng để mô '
    || E'hình chạy ngay trên thiết bị, thay vì gửi dữ liệu lên đám mây rồi chờ '
    || E'kết quả trả về.\n\n'
    || E'Tôi tìm tới {{company}} vì đây thường là chỗ hai thứ cùng lúc thành '
    || E'vấn đề: thời gian chờ một vòng đi về máy chủ, và dữ liệu không được '
    || E'phép rời khỏi nơi nó sinh ra.\n\n'
    || E'Bên anh/chị có đang vướng bài toán nào thuộc nhóm đó không? Nếu có, '
    || E'cho tôi xin mười lăm phút gọi điện — tôi sẽ nói thẳng chỗ nào chúng '
    || E'tôi hợp và chỗ nào không, biết sớm vẫn hơn.\n\n'
    || E'Còn nếu không đúng lúc, anh/chị trả lời một dòng là tôi dừng.\n\n'
    || E'Trân trọng,\n[tên và chức danh người gửi]',
  "cta_label" = 'Xem Pebble Vina',
  "cta_url" = 'https://pebblevina.com',
  "active" = true
WHERE "code" = 'mas-edge-ai-intro';--> statement-breakpoint

UPDATE "sales"."mail_template" SET
  "name" = 'Tiếp cận lần 1 — mở cửa',
  "subject" = 'Chạy mô hình tại chỗ — chuyện này có ở {{company}} không?',
  "body" =
    E'Chào anh/chị {{contactName}},\n\n'
    || E'Tôi viết từ Pebble Vina. Chúng tôi làm chip AI biên — phần cứng để mô '
    || E'hình chạy ngay trên thiết bị, thay vì gửi dữ liệu lên đám mây rồi chờ '
    || E'kết quả trả về.\n\n'
    || E'{{company}} nằm trong nhóm doanh nghiệp tôi nghĩ là đáng trao đổi nhất '
    || E'về chuyện này, vì đây thường là chỗ hai thứ cùng lúc thành vấn đề: '
    || E'thời gian chờ một vòng đi về máy chủ, và dữ liệu không được phép rời '
    || E'khỏi nơi nó sinh ra.\n\n'
    || E'Tôi chưa xin anh/chị mua gì cả. Đó có đúng là một vấn đề ở bên '
    || E'anh/chị không? Một dòng trả lời là đủ, kể cả khi câu trả lời là '
    || E'không.\n\n'
    || E'Trân trọng,\n[tên và chức danh người gửi]',
  "cta_label" = NULL,
  "cta_url" = NULL,
  "active" = true
WHERE "code" = 'mas-tiep-can-1';--> statement-breakpoint

UPDATE "sales"."mail_template" SET
  "name" = 'Tiếp cận lần 2 — nhắc lại, chưa hồi âm',
  "subject" = 'Nhắc lại thư trước · {{company}}',
  "body" =
    E'Chào anh/chị {{contactName}},\n\n'
    || E'Tuần trước tôi có gửi anh/chị một thư về chip AI biên của Pebble Vina. '
    || E'Thư nào cũng có thể rơi đúng lúc bận, nên tôi gửi lại một lần, ngắn '
    || E'hơn.\n\n'
    || E'Câu hỏi của tôi chỉ có một: ở {{company}} hiện có việc nào cần mô hình '
    || E'chạy ngay tại thiết bị — vì thời gian chờ, vì đường truyền, hay vì dữ '
    || E'liệu không được ra ngoài?\n\n'
    || E'Nếu có, mười lăm phút gọi điện là đủ để biết hai bên có gì nói tiếp '
    || E'hay không. Nếu không, anh/chị trả lời một chữ "không" là tôi khép lại '
    || E'và sẽ không gửi thêm.\n\n'
    || E'Trân trọng,\n[tên và chức danh người gửi]',
  "cta_label" = NULL,
  "cta_url" = NULL,
  "active" = true
WHERE "code" = 'mas-tiep-can-2';--> statement-breakpoint

-- Mẫu MỚI, và là mẫu duy nhất trong file: không hàng nào đang có nói về việc
-- chốt lịch sau khi khách đã hồi âm. `mas-tiep-can-3` là thư DỪNG, ngược hẳn.
INSERT INTO "sales"."mail_template"
  ("code", "name", "subject", "body", "cta_label", "cta_url", "active")
VALUES (
  'mas-meeting-invite',
  'Mời họp — đã có trao đổi, chốt lịch',
  'Đề xuất một buổi trao đổi ngắn với {{company}}',
  E'Chào anh/chị {{contactName}},\n\n'
  || E'Cảm ơn anh/chị đã hồi âm. Tôi xin đề xuất một buổi trao đổi trực tuyến, '
  || E'ba mươi phút, và đây là ba thứ tôi định mang tới.\n\n'
  || E'Một — hiện {{company}} đang xử lý phần dữ liệu đó ở đâu, và chỗ nào '
  || E'đang phải chờ.\n\n'
  || E'Hai — chip AI biên của Pebble Vina làm được gì trong đúng bài toán ấy, '
  || E'và làm KHÔNG được gì. Phần thứ hai thường là phần đáng nghe hơn.\n\n'
  || E'Ba — nếu hợp thì bước kế tiếp là gì và mất bao lâu.\n\n'
  || E'Anh/chị chọn giúp tôi một khung giờ trong tuần này hoặc tuần sau nhé? '
  || E'Tôi gửi lời mời lịch ngay sau khi anh/chị xác nhận.\n\n'
  || E'Trân trọng,\n[tên và chức danh người gửi]',
  NULL,
  NULL,
  true
)
ON CONFLICT ("code") DO NOTHING;
