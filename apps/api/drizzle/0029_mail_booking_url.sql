-- Nút thứ hai của lá thư MAS: link đặt lịch.
--
-- ---------------------------------------------------------------------------
-- MỘT CỘT, KHÔNG PHẢI MỘT CẶP — VÀ ĐÓ LÀ KHÁC BIỆT VỚI `cta_*`
-- ---------------------------------------------------------------------------
-- Hai cột `cta_label`/`cta_url` phải đi cùng nhau, có `mail_run_cta_pair` và
-- `mail_template_cta_pair` canh, vì một nhãn không đích đến vẽ ra cái nút bấm
-- vào không đi đâu, còn một đích đến không nhãn thì không vẽ ra gì.
--
-- `booking_url` không có nửa thứ hai để lệch: nhãn nút là hằng số
-- `BOOKING_LABEL` trong `@pv/mail-templates`, cố ý giống nhau ở mọi lá thư để
-- người nhận lá thứ ba nhận ra ngay nút nào là đặt lịch. Nên không có CHECK
-- cặp nào phải viết ở đây — một cột nullable không tự mâu thuẫn với chính nó.
--
-- ---------------------------------------------------------------------------
-- CHUỖI RỖNG VẪN PHẢI CHẶN, NÊN `mail_template_no_blank` DỰNG LẠI
-- ---------------------------------------------------------------------------
-- CHECK đó liệt kê từng cột một, nên thêm cột mà không đụng vào nó là để
-- `booking_url = ''` lọt lưới — và chuỗi rỗng ở đây không phải "không có nút",
-- nó là một nút trỏ vào chính trang đang mở. Postgres không sửa được CHECK tại
-- chỗ nên phải bỏ rồi tạo lại, đúng cách `0002` đã làm với `lead_no_blank`.
--
-- Viết y hệt dạng `noBlank()` sinh ra — tên cột trần, không schema, không
-- `btrim`, không guard NULL (`NULL <> ''` cho ra NULL, mà CHECK coi NULL là
-- qua). Lệch một ký tự là lần `drizzle-kit generate` sau báo trôi schema và
-- sinh ra một migration sửa thứ không hỏng.
--
-- `mail_run` không có CHECK tương ứng để sửa: bảng đó chỉ nhận dữ liệu đã qua
-- zod ở `MailRunCreate`, không nhận tay từ SQL như `mail_template` từng nhận.

ALTER TABLE "sales"."mail_template" ADD COLUMN "booking_url" text;--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD COLUMN "booking_url" text;--> statement-breakpoint
ALTER TABLE "sales"."mail_template" DROP CONSTRAINT "mail_template_no_blank";--> statement-breakpoint
ALTER TABLE "sales"."mail_template" ADD CONSTRAINT "mail_template_no_blank" CHECK ("name" <> '' AND "subject" <> '' AND "body" <> '' AND "cta_label" <> '' AND "cta_url" <> '' AND "booking_url" <> '');
