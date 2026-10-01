-- 0075 - comm close-out (ADR 0074): every comm closes with a summary, a
-- plain-language evaluation and a next step whose type comes from config.
-- A comm belongs to ONE lead, opportunity or contract (`subject_code`), fixed when the
-- debrief opens; its next step always lands there, so the step copy carries no
-- code of its own. Files dropped on a comm are `platform.attachment` rows.
--
-- `comms.debrief` is the owner's close-out, `comms.debrief_answer` one answer
-- per criterion. Neither has a foreign key into `sales`: config ids are plain
-- text with name copies, so renaming or turning off an entry never rewrites a
-- closed debrief, and `sales` validates them through `COMM_DEBRIEF_HOOK`.
--
-- Every CHECK is copied out by hand: the day a channel, a list or a bound
-- changes, that has to be a migration a person reads.
-- Hand-written for the reason 0047-0074 give: drizzle-kit's baseline snapshot
-- is still stuck at 0026.

-- Minutes of a meeting are a thread (one per meeting, external_id = meeting id).
ALTER TABLE "comms"."thread" DROP CONSTRAINT "thread_channel_known";--> statement-breakpoint
ALTER TABLE "comms"."thread" ADD CONSTRAINT "thread_channel_known" CHECK ("channel" IN ('email', 'zalo-oa', 'telegram', 'phone', 'in-app', 'meeting'));--> statement-breakpoint

-- `btrim(NULL) <> ''` is NULL and a CHECK passes on NULL, so the closed-summary
-- fence names `IS NOT NULL` itself. 2000 = DEBRIEF_SUMMARY_MAX, 200 = the
-- next-step text bound (`next_step_text_bounded`). `subject_code` has a real
-- key: since 0042 a lead or opportunity cannot exist without its object row.
CREATE TABLE "comms"."debrief" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"subject_code" text NOT NULL,
	"summary" text,
	"next_kind_id" text,
	"next_kind_name" text,
	"next_text" text,
	"next_due" date,
	CONSTRAINT "debrief_closed_has_summary" CHECK ("closed_at" IS NULL
          OR ("summary" IS NOT NULL AND btrim("summary") <> '' AND char_length("summary") <= 2000)),
	CONSTRAINT "debrief_next_all_or_none" CHECK (("next_kind_id" IS NULL AND "next_kind_name" IS NULL
           AND "next_text" IS NULL AND "next_due" IS NULL)
          OR ("next_kind_id" IS NOT NULL
           AND "next_kind_name" IS NOT NULL AND "next_text" IS NOT NULL AND "next_due" IS NOT NULL
           AND btrim("next_kind_name") <> ''
           AND btrim("next_text") <> '' AND char_length("next_text") <= 200))
);--> statement-breakpoint
CREATE TABLE "comms"."debrief_answer" (
	"debrief_id" uuid NOT NULL,
	"criterion_id" text NOT NULL,
	"criterion_name" text NOT NULL,
	"answer_id" text NOT NULL,
	"answer_name" text NOT NULL,
	CONSTRAINT "debrief_answer_pk" PRIMARY KEY("debrief_id","criterion_id"),
	CONSTRAINT "debrief_answer_no_blank" CHECK (btrim("criterion_name") <> '' AND btrim("answer_name") <> '')
);--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "comms"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "comms"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_subject_code_object_code_fk" FOREIGN KEY ("subject_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms"."debrief_answer" ADD CONSTRAINT "debrief_answer_debrief_id_debrief_id_fk" FOREIGN KEY ("debrief_id") REFERENCES "comms"."debrief"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "debrief_open_unique" ON "comms"."debrief" USING btree ("thread_id","owner_id") WHERE "closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "debrief_pending_owner_idx" ON "comms"."debrief" USING btree ("owner_id") WHERE "closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "debrief_message_idx" ON "comms"."debrief" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "debrief_pending_subject_idx" ON "comms"."debrief" USING btree ("subject_code") WHERE "closed_at" IS NULL;--> statement-breakpoint

-- A comm's files: recording, transcript, minutes, chat screenshots. For 'comm',
-- `owner_code` is the debrief id. Still no key - one column, two tables (0063).
ALTER TABLE "platform"."attachment" DROP CONSTRAINT "attachment_owner_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."attachment" ADD CONSTRAINT "attachment_owner_kind_known" CHECK ("owner_kind" IN ('lead', 'comm'));--> statement-breakpoint

-- The mime list is per owner kind: a lead keeps 0063's three exactly, a comm
-- also takes recordings, transcripts and screenshots. Comm sizes are capped
-- here (audio 50 MB, rest 15 MB); a lead's bound stays in the contract, as today.
ALTER TABLE "platform"."attachment" DROP CONSTRAINT "attachment_mime_known";--> statement-breakpoint
ALTER TABLE "platform"."attachment" ADD CONSTRAINT "attachment_mime_known" CHECK (("owner_kind" = 'lead' AND "mime" IN ('image/webp', 'image/jpeg', 'application/pdf'))
          OR ("owner_kind" = 'comm' AND "mime" IN ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg',
           'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')));--> statement-breakpoint
ALTER TABLE "platform"."attachment" ADD CONSTRAINT "attachment_comm_bytes_capped" CHECK ("owner_kind" <> 'comm'
          OR "bytes" <= CASE WHEN "mime" LIKE 'audio/%' THEN 52428800 ELSE 15728640 END);--> statement-breakpoint

-- A next step's type. NULL on every existing step - no backfill, the step card
-- does not ask for one. `kind_list` folds the list into the key (0024's trick)
-- so only a STEP_KIND row fits.
ALTER TABLE "sales"."next_step" ADD COLUMN "kind_id" text;--> statement-breakpoint
ALTER TABLE "sales"."next_step" ADD COLUMN "kind_list" text GENERATED ALWAYS AS (CASE WHEN "kind_id" IS NULL THEN NULL ELSE 'STEP_KIND' END) STORED;--> statement-breakpoint
ALTER TABLE "sales"."next_step" ADD CONSTRAINT "next_step_kind_fk" FOREIGN KEY ("kind_id","kind_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- An answer belongs to one question, itself a config row. An equality CHECK
-- holds from day one: no existing row is a COMM_ANSWER.
ALTER TABLE "sales"."config_entry" ADD COLUMN "criterion_id" text;--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD COLUMN "criterion_list" text GENERATED ALWAYS AS (CASE WHEN "criterion_id" IS NULL THEN NULL ELSE 'COMM_CRITERION' END) STORED;--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_criterion_fk" FOREIGN KEY ("criterion_id","criterion_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_criterion_only_answer" CHECK (("list" = 'COMM_ANSWER') = ("criterion_id" IS NOT NULL));--> statement-breakpoint

-- A live name is unique per (list, question): "Chưa" may answer two questions.
-- Every other list has NULL `criterion_id`, folded to '' so its rule is unchanged.
DROP INDEX "sales"."config_name_live";--> statement-breakpoint
CREATE UNIQUE INDEX "config_name_live" ON "sales"."config_entry" USING btree ("list",coalesce("criterion_id", ''),lower("name")) WHERE "active";--> statement-breakpoint

-- Seed vocabulary, mirrored in `src/seed-config.ts`. Each list only if empty,
-- 0069's guard: a database that already holds rows is left alone rather than
-- getting a second, differently-worded set. `ord` runs across the whole list
-- (`config_ord_uniq`), so answers keep their order within one question.
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT v."id", 'COMM_CRITERION', v."name", v."ord"
  FROM (VALUES
    ('CQ-01', 'Khách quan tâm thế nào?', 1),
    ('CQ-02', 'Đã chạm được người quyết định chưa?', 2),
    ('CQ-03', 'Cuộc trao đổi đạt mục tiêu không?', 3)
  ) AS v("id", "name", "ord")
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" WHERE "list" = 'COMM_CRITERION');--> statement-breakpoint
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord", "criterion_id")
SELECT v."id", 'COMM_ANSWER', v."name", v."ord", v."criterion_id"
  FROM (VALUES
    ('CA-01', 'Rất quan tâm', 1, 'CQ-01'),
    ('CA-02', 'Có quan tâm', 2, 'CQ-01'),
    ('CA-03', 'Chưa quan tâm', 3, 'CQ-01'),
    ('CA-04', 'Đã gặp người quyết định', 4, 'CQ-02'),
    ('CA-05', 'Mới gặp người ảnh hưởng', 5, 'CQ-02'),
    ('CA-06', 'Chưa', 6, 'CQ-02'),
    ('CA-07', 'Đạt', 7, 'CQ-03'),
    ('CA-08', 'Đạt một phần', 8, 'CQ-03'),
    ('CA-09', 'Chưa đạt', 9, 'CQ-03')
  ) AS v("id", "name", "ord", "criterion_id")
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" WHERE "list" = 'COMM_ANSWER');--> statement-breakpoint
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT v."id", 'STEP_KIND', v."name", v."ord"
  FROM (VALUES
    ('SK-01', 'Gọi lại', 1),
    ('SK-02', 'Hẹn gặp', 2),
    ('SK-03', 'Gửi tài liệu', 3),
    ('SK-04', 'Gửi mẫu', 4),
    ('SK-05', 'Gửi báo giá', 5),
    ('SK-06', 'Theo dõi phản hồi', 6)
  ) AS v("id", "name", "ord")
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" WHERE "list" = 'STEP_KIND');
