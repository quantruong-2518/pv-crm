-- Nạp MỘT mẫu mail vào `sales.mail_template`. Viết tay, không sinh bằng
-- drizzle-kit: đây là dữ liệu, không phải lược đồ.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO LÀ MIGRATION CHỨ KHÔNG PHẢI `seed.ts`
-- ---------------------------------------------------------------------------
-- Mẫu mail là dữ liệu CẤU HÌNH — nó phải có mặt trên production, cạnh danh
-- mục nguồn và bậc lead, chứ không phải dữ liệu demo. Và `pnpm db:seed` đang
-- TRUNCATE sạch trước khi nạp, nên không ai dám chạy nó trên Neon; một hàng
-- cấu hình nằm trong file đó là một hàng không bao giờ tới được nơi cần tới.
--
-- ---------------------------------------------------------------------------
-- ĐÂY LÀ MỘT CÁI KHUNG. NỘI DUNG THẬT CHƯA ĐƯỢC DUYỆT.
-- ---------------------------------------------------------------------------
-- Thư này đi ra ngoài công ty, tới khách hàng thật, và không rút lại được. Bốn
-- thứ quyết định nội dung — tên dòng sản phẩm · câu định vị · CTA dẫn đi đâu ·
-- số liệu nào được phép in — chưa được chủ dự án cung cấp, và bịa thông số một
-- con chip bán dẫn AI biên vào thư gửi khách là loại sai đắt nhất có thể mắc ở
-- chỗ này: người nhận sẽ hỏi lại đúng con số đó.
--
-- Nên mọi chỗ chưa biết được để nguyên trong ngoặc vuông `[…]`, CỐ Ý nhìn thấy
-- được. Ba lớp chặn dựa vào đúng ký hiệu đó:
--   · bước "Xem lại" của panel soạn mail in nguyên văn thân thư;
--   · panel KHOÁ nút Gửi khi tiêu đề hoặc thân còn `[…]` — xem `mas-mail-drawer.tsx`;
--   · và nếu cả hai lớp trên hỏng, lá thư đi ra vẫn đọc rõ là chưa soạn xong,
--     chứ không phải một lá thư rỗng tuếch trông như thật.
--
-- KHÔNG dùng `{{…}}` cho những chỗ trống này: đó là cú pháp trộn biến thật của
-- `mas.composer.ts`, và một khoá nó không biết sẽ bị thay bằng CHUỖI RỖNG —
-- chỗ trống biến mất không dấu vết, đúng thứ khối chú thích này đang chống.
-- `{{contactName}}` và `{{company}}` bên dưới thì ngược lại: hai khoá đó có
-- thật, `MasService.intentOf` ghi cả hai vào `email_delivery.merge` cho từng
-- người nhận.
--
-- `ON CONFLICT DO NOTHING`: chạy lại migration không ghi đè nội dung mà ai đó
-- đã sửa cho đúng trong lúc chờ.

INSERT INTO "sales"."mail_template"
  ("code", "name", "subject", "body", "cta_label", "cta_url", "active")
VALUES (
  'mas-edge-ai-intro',
  'Giới thiệu chip AI biên — KHUNG, chưa duyệt nội dung',
  'Pebble Vina — [tên dòng sản phẩm]',
  E'Chào anh/chị {{contactName}},\n\n'
  || E'Tôi viết từ Pebble Vina. Chúng tôi làm [một câu về việc công ty làm gì], '
  || E'và đang tìm những doanh nghiệp như {{company}} để trao đổi xem có chỗ nào '
  || E'dùng được không.\n\n'
  || E'[Một đoạn về vấn đề mà khách đang gặp, và vì sao nó đáng giải quyết. '
  || E'Chưa có số liệu nào được duyệt để in ở đây — đừng thêm số.]\n\n'
  || E'Nếu anh/chị thấy có chỗ chạm, cho tôi xin mười lăm phút gọi điện. Không '
  || E'hợp thì anh/chị trả lời một dòng, tôi sẽ không làm phiền nữa.\n\n'
  || E'Trân trọng,\n[Tên người gửi · chức danh]',
  'Tìm hiểu Pebble Vina',
  'https://pebblevina.com',
  true
)
ON CONFLICT ("code") DO NOTHING;
