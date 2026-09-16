-- 0046 - every Vietnamese value Postgres stores becomes its English key
-- (ADR 0012). Code and data must change in one deploy: after this, a row still
-- holding an old spelling is a value no enum, label map or CHECK knows.
--
-- Order per table is DROP CHECK -> UPDATE -> ADD CHECK, the 0008/0011 shape:
-- the old CHECKs name the old values, so updating under them would abort.
-- `touch_handed_over_names_an_end` goes back NOT VALID, as 0033 added it,
-- because rows written before 0033 still carry no ends.
--
-- Every UPDATE filters on the old value; the DROP/RENAME statements do not,
-- so the journal, not the SQL, is what stops a second run.
-- `object.state` is scoped by kind: other kinds keep free-text states.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_to_tier_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_len_bac_co_bac";--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_hand_over_sides";--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_giao_names_an_end";--> statement-breakpoint
UPDATE "sales"."touch" SET "kind" = CASE "kind"
	WHEN 'vao-so' THEN 'created'
	WHEN 'cham' THEN 'contacted'
	WHEN 'dien-o' THEN 'field-filled'
	WHEN 'giao' THEN 'handed-over'
	WHEN 'len-bac' THEN 'tier-raised'
	WHEN 'gap-lan-dau' THEN 'first-meeting'
	WHEN 'vao-pipeline' THEN 'entered-pipeline'
	WHEN 'doi-cot' THEN 'stage-changed'
	WHEN 'ky' THEN 'signed'
	WHEN 'ra-khoi-luong' THEN 'exited'
END
WHERE "kind" IN ('vao-so', 'cham', 'dien-o', 'giao', 'len-bac', 'gap-lan-dau', 'vao-pipeline', 'doi-cot', 'ky', 'ra-khoi-luong');--> statement-breakpoint
UPDATE "sales"."touch" SET "to_tier" = 'prospect' WHERE "to_tier" = 'dau-moi';--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited'));--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_to_tier_known" CHECK ("to_tier" IS NULL OR "to_tier" IN ('prospect', 'mql', 'sql'));--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_tier_raised_has_tier" CHECK ("kind" <> 'tier-raised' OR "to_tier" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_hand_over_sides" CHECK (("from_actor_id" IS NULL) = ("from_name" IS NULL)
          AND ("to_actor_id" IS NULL) = ("to_name" IS NULL)
          AND ("from_actor_id" IS NULL OR "kind" = 'handed-over')
          AND ("to_actor_id" IS NULL OR "kind" IN ('handed-over', 'created')));--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_handed_over_names_an_end" CHECK ("kind" <> 'handed-over' OR "from_actor_id" IS NOT NULL OR "to_actor_id" IS NOT NULL) NOT VALID;--> statement-breakpoint
UPDATE "sales"."lead" SET "tier" = 'prospect' WHERE "tier" = 'dau-moi';--> statement-breakpoint
UPDATE "sales"."lead" SET "stage" = CASE "stage"
	WHEN 'moi' THEN 'new'
	WHEN 'tim-hieu' THEN 'discovery'
	WHEN 'da-demo' THEN 'demo-done'
	WHEN 'da-bao-gia' THEN 'quoted'
	WHEN 'cho-ky' THEN 'awaiting-signature'
END
WHERE "stage" IN ('moi', 'tim-hieu', 'da-demo', 'da-bao-gia', 'cho-ky');--> statement-breakpoint
UPDATE "sales"."lead" SET "category" = CASE "category"
	WHEN 'co-khi' THEN 'mechanical'
	WHEN 'o-to' THEN 'automotive'
	WHEN 'duoc' THEN 'pharma'
END
WHERE "category" IN ('co-khi', 'o-to', 'duoc');--> statement-breakpoint
UPDATE "sales"."lead" SET "exit_reason" = CASE "exit_reason"
	WHEN 'khong-goi-duoc' THEN 'unreachable'
	WHEN 'khong-phai-khach-cua-minh' THEN 'not-a-fit'
	WHEN 'khong-co-ngan-sach' THEN 'no-budget'
	WHEN 'nguoi-lien-he-nghi' THEN 'contact-left'
	WHEN 'chon-ben-khac' THEN 'chose-competitor'
	WHEN 'im-sau-bao-gia' THEN 'silent-after-quote'
END
WHERE "exit_reason" IN ('khong-goi-duoc', 'khong-phai-khach-cua-minh', 'khong-co-ngan-sach', 'nguoi-lien-he-nghi', 'chon-ben-khac', 'im-sau-bao-gia');--> statement-breakpoint
UPDATE "sales"."account" SET "category" = CASE "category"
	WHEN 'co-khi' THEN 'mechanical'
	WHEN 'o-to' THEN 'automotive'
	WHEN 'duoc' THEN 'pharma'
END
WHERE "category" IN ('co-khi', 'o-to', 'duoc');--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_state_known";--> statement-breakpoint
UPDATE "sales"."opportunity" SET "state" = 'quote-sent' WHERE "state" = 'gui-quotation';--> statement-breakpoint
UPDATE "sales"."opportunity" SET "stage" = CASE "stage"
	WHEN 'moi' THEN 'new'
	WHEN 'tim-hieu' THEN 'discovery'
	WHEN 'da-demo' THEN 'demo-done'
	WHEN 'da-bao-gia' THEN 'quoted'
	WHEN 'cho-ky' THEN 'awaiting-signature'
END
WHERE "stage" IN ('moi', 'tim-hieu', 'da-demo', 'da-bao-gia', 'cho-ky');--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_state_known" CHECK ("state" IN ('quote-sent', 'nego', 'close-lost', 'pending'));--> statement-breakpoint
UPDATE "sales"."opportunity_stage_event" SET "from_stage" = CASE "from_stage"
	WHEN 'moi' THEN 'new'
	WHEN 'tim-hieu' THEN 'discovery'
	WHEN 'da-demo' THEN 'demo-done'
	WHEN 'da-bao-gia' THEN 'quoted'
	WHEN 'cho-ky' THEN 'awaiting-signature'
	ELSE "from_stage"
END, "to_stage" = CASE "to_stage"
	WHEN 'moi' THEN 'new'
	WHEN 'tim-hieu' THEN 'discovery'
	WHEN 'da-demo' THEN 'demo-done'
	WHEN 'da-bao-gia' THEN 'quoted'
	WHEN 'cho-ky' THEN 'awaiting-signature'
	ELSE "to_stage"
END
WHERE "from_stage" IN ('moi', 'tim-hieu', 'da-demo', 'da-bao-gia', 'cho-ky')
   OR "to_stage" IN ('moi', 'tim-hieu', 'da-demo', 'da-bao-gia', 'cho-ky');--> statement-breakpoint
ALTER TABLE "sales"."contract_condition" DROP CONSTRAINT "contract_condition_side_known";--> statement-breakpoint
UPDATE "sales"."contract_condition" SET "side" = CASE "side" WHEN 'ta' THEN 'ours' WHEN 'khách' THEN 'customer' END
WHERE "side" IN ('ta', 'khách');--> statement-breakpoint
ALTER TABLE "sales"."contract_condition" ADD CONSTRAINT "contract_condition_side_known" CHECK ("side" IN ('ours', 'customer'));--> statement-breakpoint
ALTER TABLE "sales"."contract_document" DROP CONSTRAINT "contract_document_state_known";--> statement-breakpoint
UPDATE "sales"."contract_document" SET "state" = CASE "state"
	WHEN 'đủ' THEN 'complete'
	WHEN 'chờ-ký' THEN 'awaiting-signature'
	WHEN 'chưa-có' THEN 'missing'
END
WHERE "state" IN ('đủ', 'chờ-ký', 'chưa-có');--> statement-breakpoint
ALTER TABLE "sales"."contract_document" ADD CONSTRAINT "contract_document_state_known" CHECK ("state" IN ('complete', 'awaiting-signature', 'missing'));--> statement-breakpoint
ALTER TABLE "sales"."contract_record" DROP CONSTRAINT "contract_record_channel_known";--> statement-breakpoint
ALTER TABLE "sales"."contract_record" DROP CONSTRAINT "contract_record_state_known";--> statement-breakpoint
UPDATE "sales"."contract_record" SET "channel" = CASE "channel" WHEN 'trong-app' THEN 'in-app' WHEN 'gọi' THEN 'call' END
WHERE "channel" IN ('trong-app', 'gọi');--> statement-breakpoint
UPDATE "sales"."contract_record" SET "state" = CASE "state"
	WHEN 'xong' THEN 'done'
	WHEN 'chờ-trả-lời' THEN 'awaiting-reply'
	WHEN 'đã-xếp' THEN 'scheduled'
	WHEN 'chưa-tới' THEN 'upcoming'
END
WHERE "state" IN ('xong', 'chờ-trả-lời', 'đã-xếp', 'chưa-tới');--> statement-breakpoint
ALTER TABLE "sales"."contract_record" ADD CONSTRAINT "contract_record_channel_known" CHECK ("channel" IN ('email', 'zalo-oa', 'in-app', 'call'));--> statement-breakpoint
ALTER TABLE "sales"."contract_record" ADD CONSTRAINT "contract_record_state_known" CHECK ("state" IN ('done', 'awaiting-reply', 'scheduled', 'upcoming'));--> statement-breakpoint
UPDATE "sales"."config_entry" SET "kind" = CASE "kind"
	WHEN 'chien-dich' THEN 'campaign'
	WHEN 'su-kien' THEN 'event'
	WHEN 'tu-nhien' THEN 'organic'
END
WHERE "list" = 'SOURCE' AND "kind" IN ('chien-dich', 'su-kien', 'tu-nhien');--> statement-breakpoint
UPDATE "platform"."edge" SET "kind" = CASE "kind"
	WHEN 'sinh-ra' THEN 'spawned'
	WHEN 'chờ' THEN 'waits-on'
	WHEN 'thuộc-về' THEN 'belongs-to'
END
WHERE "kind" IN ('sinh-ra', 'chờ', 'thuộc-về');--> statement-breakpoint
UPDATE "platform"."object" SET "state" = CASE "state"
	WHEN 'moi' THEN 'new'
	WHEN 'tim-hieu' THEN 'discovery'
	WHEN 'Đang tìm hiểu' THEN 'discovery'
	WHEN 'da-demo' THEN 'demo-done'
	WHEN 'da-bao-gia' THEN 'quoted'
	WHEN 'cho-ky' THEN 'awaiting-signature'
END
WHERE "kind" IN ('LD', 'OP') AND "state" IN ('moi', 'tim-hieu', 'Đang tìm hiểu', 'da-demo', 'da-bao-gia', 'cho-ky');--> statement-breakpoint
UPDATE "platform"."object" SET "state" = CASE "state" WHEN 'khách' THEN 'customer' WHEN 'tiềm năng' THEN 'prospect' END
WHERE "kind" = 'AC' AND "state" IN ('khách', 'tiềm năng');--> statement-breakpoint
UPDATE "platform"."object" SET "state" = CASE "state" WHEN 'liên hệ chính' THEN 'primary-contact' WHEN 'liên hệ' THEN 'contact' END
WHERE "kind" = 'CT' AND "state" IN ('liên hệ chính', 'liên hệ');--> statement-breakpoint
UPDATE "platform"."approval" SET "payload" = jsonb_set("payload", '{kind}', to_jsonb(CASE "payload"->>'kind'
	WHEN 'tao' THEN 'create'
	WHEN 'sua' THEN 'update'
	WHEN 'thu-tu' THEN 'reorder'
END))
WHERE "kind" = 'config-change' AND "payload"->>'kind' IN ('tao', 'sua', 'thu-tu');--> statement-breakpoint
UPDATE "platform"."approval" SET "payload" = jsonb_set("payload", '{draft,kind}', to_jsonb(CASE "payload"#>>'{draft,kind}'
	WHEN 'chien-dich' THEN 'campaign'
	WHEN 'su-kien' THEN 'event'
	WHEN 'tu-nhien' THEN 'organic'
END))
WHERE "kind" = 'config-change' AND "payload"->>'list' = 'SOURCE' AND "payload"#>>'{draft,kind}' IN ('chien-dich', 'su-kien', 'tu-nhien');--> statement-breakpoint
UPDATE "platform"."approval" SET "payload" = jsonb_set("payload", '{patch,kind}', to_jsonb(CASE "payload"#>>'{patch,kind}'
	WHEN 'chien-dich' THEN 'campaign'
	WHEN 'su-kien' THEN 'event'
	WHEN 'tu-nhien' THEN 'organic'
END))
WHERE "kind" = 'config-change' AND "payload"->>'list' = 'SOURCE' AND "payload"#>>'{patch,kind}' IN ('chien-dich', 'su-kien', 'tu-nhien');--> statement-breakpoint
ALTER TABLE "sales"."meeting" RENAME CONSTRAINT "meeting_link_la_web" TO "meeting_link_is_web";--> statement-breakpoint
ALTER TABLE "sales"."meeting_attendee" RENAME CONSTRAINT "meeting_attendee_host_co_actor" TO "meeting_attendee_host_is_actor";
