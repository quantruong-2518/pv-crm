-- 0090 - workstream documents: a run's attachment may be a document upload.
--
-- `owner_kind` gains 'workstream' (`owner_code` = the WS- code, no foreign key,
-- for the polymorphic reason `attachment_owner_idx` already argues). Its mime
-- list is the lead's plus png, docx and text/plain; the scan flow still only
-- writes webp/jpeg/pdf for a lead. The 5 MB cap is the contract's alone, as
-- the scan 25 MB bound is. Widening two CHECKs only - every row still passes.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "platform"."attachment" DROP CONSTRAINT "attachment_mime_known";--> statement-breakpoint
ALTER TABLE "platform"."attachment" ADD CONSTRAINT "attachment_mime_known" CHECK (("owner_kind" = 'lead' AND "mime" IN ('image/webp', 'image/jpeg', 'application/pdf'))
          OR ("owner_kind" = 'workstream' AND "mime" IN ('image/webp', 'image/jpeg', 'image/png', 'application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'))
          OR ("owner_kind" = 'comm' AND "mime" IN ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg',
           'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')));--> statement-breakpoint
ALTER TABLE "platform"."attachment" DROP CONSTRAINT "attachment_owner_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."attachment" ADD CONSTRAINT "attachment_owner_kind_known" CHECK ("owner_kind" IN ('lead', 'comm', 'workstream'));
