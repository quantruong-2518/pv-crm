-- 0077 - a short title on a comm record, set at confirm. NULL for records
-- closed before it; the CHECK only bounds a title that is there. Hand-written
-- for the reason 0047-0076 give: drizzle-kit's baseline snapshot is stuck at 0026.
ALTER TABLE "comms"."debrief" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_title_bounded" CHECK ("title" IS NULL OR (btrim("title") <> '' AND char_length("title") <= 120));
