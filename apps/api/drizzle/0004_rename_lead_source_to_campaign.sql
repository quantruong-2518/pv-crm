-- Nguồn của một lead tách thành HAI nửa, và hai cột nói ra nửa nào là nửa nào.
--
--   source         → campaign_id   nửa MỞ  · id một dòng `config_entry` list 'SOURCE'
--   intake_channel → source_kind   nửa ĐÓNG · enum `LeadSourceKind`
--
-- RENAME chứ không DROP + ADD: cả 119 dòng đang có `source` trỏ đúng vào sổ
-- nguồn sau lần vá seed 27/08, và một cặp drop/add ném hết số đó đi để dựng
-- lại một cột rỗng cùng tên. Postgres tự viết lại biểu thức CHECK
-- `lead_no_blank` theo tên cột mới, nên không phải đụng vào nó ở đây.
ALTER TABLE "sales"."lead" RENAME COLUMN "source" TO "campaign_id";--> statement-breakpoint
ALTER TABLE "sales"."lead" RENAME COLUMN "intake_channel" TO "source_kind";--> statement-breakpoint
ALTER INDEX "sales"."lead_source_idx" RENAME TO "lead_campaign_idx";--> statement-breakpoint
-- `LANDING` → `LANDING_PAGE`. Cột này rỗng ở 100 dòng fixture nhưng KHÔNG rỗng
-- ở các dòng landing page đã nhận thật, nên câu này phải chạy chứ không phải
-- một câu cho đủ bộ: bỏ nó thì `CHANNEL_TRUST[row.source_kind]` trả `undefined`
-- cho đúng những dòng khách tự bấm gửi — nhóm ĐÁNG tin nhất trong bảng.
UPDATE "sales"."lead" SET "source_kind" = 'LANDING_PAGE' WHERE "source_kind" = 'LANDING';
