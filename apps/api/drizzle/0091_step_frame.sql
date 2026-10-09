-- 0091 - ADR 0080: the journey frame. Next-step templates and a free-entry
-- flag per (object kind, state); the state SETS stay closed, so both tables
-- copy them into a CHECK by hand (`StepLeadState` = the open lead states,
-- `StageKey` = the four deal columns).
--
-- `step_template.kind_list` is 0075's `next_step.kind_list` trick as a plain
-- constant: `kind_id` is NOT NULL here, so no CASE is needed for MATCH SIMPLE.
-- `state_rule` gets NO rows: a missing row means `FREE_ENTRY_DEFAULT`.
-- `next_step.template_id` and `touch.template_id` are plain foreign keys -
-- a template is switched off, never deleted. Both start NULL on every row, so
-- nothing existing changes and the old api keeps writing between migrate and
-- deploy (`touch_template_only_step_done` is one-way for that reason).
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE "sales"."step_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_kind" text NOT NULL,
	"state_key" text NOT NULL,
	"name" text NOT NULL,
	"kind_id" text NOT NULL,
	"kind_list" text GENERATED ALWAYS AS ('STEP_KIND') STORED NOT NULL,
	"due_days" integer,
	"ord" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_template_object_kind_known" CHECK ("object_kind" IN ('lead', 'opportunity')),
	CONSTRAINT "step_template_state_known" CHECK (("object_kind" <> 'lead' OR "state_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing'))
      AND ("object_kind" <> 'opportunity' OR "state_key" IN ('new', 'assigned', 'engaged', 'quotation'))),
	CONSTRAINT "step_template_name_bounded" CHECK (btrim("name") <> '' AND char_length("name") <= 200),
	CONSTRAINT "step_template_due_days_bounded" CHECK ("due_days" IS NULL OR ("due_days" >= 1 AND "due_days" <= 365)),
	CONSTRAINT "step_template_ord_positive" CHECK ("ord" > 0)
);--> statement-breakpoint
ALTER TABLE "sales"."step_template" ADD CONSTRAINT "step_template_kind_fk" FOREIGN KEY ("kind_id","kind_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- `config_name_live`'s rule, per state: unique among ACTIVE rows, any case.
CREATE UNIQUE INDEX "step_template_name_live" ON "sales"."step_template" USING btree ("object_kind","state_key",lower("name")) WHERE "active";--> statement-breakpoint
-- Answers the picker: "active templates of one (kind, state), in ord".
CREATE INDEX "step_template_picker_idx" ON "sales"."step_template" USING btree ("object_kind","state_key","ord") WHERE "active";--> statement-breakpoint

CREATE TABLE "sales"."state_rule" (
	"object_kind" text NOT NULL,
	"state_key" text NOT NULL,
	"free_entry" boolean NOT NULL,
	CONSTRAINT "state_rule_pk" PRIMARY KEY("object_kind","state_key"),
	CONSTRAINT "state_rule_object_kind_known" CHECK ("object_kind" IN ('lead', 'opportunity')),
	CONSTRAINT "state_rule_state_known" CHECK (("object_kind" <> 'lead' OR "state_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing'))
      AND ("object_kind" <> 'opportunity' OR "state_key" IN ('new', 'assigned', 'engaged', 'quotation')))
);--> statement-breakpoint

ALTER TABLE "sales"."next_step" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "sales"."next_step" ADD CONSTRAINT "next_step_template_id_step_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "sales"."step_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ADR 0080 §5: the step row is deleted on "done", so the touch remembers.
ALTER TABLE "sales"."touch" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_template_id_step_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "sales"."step_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_template_only_step_done" CHECK ("template_id" IS NULL OR "kind" = 'next-step-done');--> statement-breakpoint

-- The web's `DEAL_STEP_SUGGESTIONS` become the first templates, so the picker
-- is not empty the day the web stops reading that list. Only into an empty
-- table (0075's guard), and only where the SK- row 0075 planted is still
-- there: the JOIN drops a template rather than failing the migration on a
-- database whose STEP_KIND list was reset. `due_days` stays NULL - nobody has
-- decided one. No lead rows: `LEAD_SUGGESTIONS` is not keyed by state. No rows
-- for stage `new`: the web list has none there.
INSERT INTO "sales"."step_template" ("id", "object_kind", "state_key", "name", "kind_id", "ord")
SELECT v."id"::uuid, 'opportunity', v."state_key", v."name", ce."id", v."ord"
  FROM (VALUES
    ('15feea98-1dab-4596-af1b-4af4d03ac1ea', 'assigned', 'Gọi khách chốt nhu cầu', 'SK-01', 1),
    ('c47170cc-5e67-4d60-bda3-164e10aace2a', 'assigned', 'Hẹn gửi sample', 'SK-04', 2),
    ('603f7276-8fda-449f-9ff1-4a48c029eefd', 'assigned', 'Hẹn demo', 'SK-02', 3),
    ('e36b7214-57b1-4586-bb09-80b787c80cd1', 'assigned', 'Hẹn khảo sát nhà máy', 'SK-02', 4),
    ('ca88899b-7c6c-42b6-a5c3-7b6abc5be597', 'engaged', 'Theo dõi phản hồi sample', 'SK-06', 1),
    ('f656faf1-3740-4aa8-9ee6-f209013ec7c5', 'engaged', 'Hẹn POC', 'SK-02', 2),
    ('5012cf25-6fdb-4132-b6cd-2fa75835b3af', 'engaged', 'Hẹn demo', 'SK-02', 3),
    ('525d3428-dab7-471d-8655-ca81baa96d75', 'engaged', 'Gửi báo giá', 'SK-05', 4),
    ('7e5442b5-417b-4530-92b8-1029ea2a4f10', 'quotation', 'Theo dõi báo giá', 'SK-06', 1),
    ('30b979c5-4003-4e36-9a2b-24f80f837fe3', 'quotation', 'Đàm phán điều khoản', 'SK-02', 2),
    ('51a7292f-2288-43c1-9b96-4c1f28b4f89b', 'quotation', 'Đề nghị ký', 'SK-02', 3)
  ) AS v("id", "state_key", "name", "kind_id", "ord")
  JOIN "sales"."config_entry" ce ON ce."id" = v."kind_id" AND ce."list" = 'STEP_KIND'
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."step_template");
