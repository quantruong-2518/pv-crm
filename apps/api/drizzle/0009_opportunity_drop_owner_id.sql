-- Người đứng đơn đã sang `opportunity_owner` ở 0008. Bỏ cột cũ.
--
-- Tách khỏi 0008 chứ không gộp, vì hai lý do khác nhau và cả hai đều thật:
--
--  · MỘT LƯỢT CHẠM PRODUCTION CHỈ NÊN NÓI MỘT CÂU. 0008 bồi cột và chuyển dữ
--    liệu — nó đọc được, xem lại được, và nếu có gì sai thì sai ở chỗ thêm vào.
--    Câu dưới đây là câu duy nhất trong đợt này KHÔNG lùi được: cột đi rồi thì
--    dữ liệu trong nó đi theo. Đứng riêng thì nó được đọc riêng.
--  · drizzle-kit hỏi "cột này tạo mới hay đổi tên từ cột kia?" khi một bảng vừa
--    có cột thêm vừa có cột bớt trong cùng một lượt sinh. Tách hai lượt thì
--    không có câu hỏi nào để trả lời sai.
--
-- Chạy 0009 mà chưa chạy 0008 là mất người đứng đơn của mọi đơn đang có. Thứ tự
-- này do `meta/_journal.json` giữ; đừng chạy tay từng file.

ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_owner_id_actor_id_fk";
--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP COLUMN "owner_id";
