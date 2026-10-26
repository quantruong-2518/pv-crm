-- 0148 - workstream documents take every everyday office file: GIF, legacy
-- Word, both Excel formats, Markdown and call recordings join the list. The
-- recording cap (50 MB, the comm one) lives in the contract alone, as 0090
-- left the 5 MB one. Widening one CHECK only - every row still passes.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "platform"."attachment" DROP CONSTRAINT "attachment_mime_known";--> statement-breakpoint
ALTER TABLE "platform"."attachment" ADD CONSTRAINT "attachment_mime_known" CHECK (("owner_kind" = 'lead' AND "mime" IN ('image/webp', 'image/jpeg', 'application/pdf'))
          OR ("owner_kind" = 'workstream' AND "mime" IN ('image/webp', 'image/jpeg', 'image/png', 'image/gif',
           'application/pdf', 'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/markdown',
           'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg'))
          OR ("owner_kind" = 'comm' AND "mime" IN ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg',
           'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')));
