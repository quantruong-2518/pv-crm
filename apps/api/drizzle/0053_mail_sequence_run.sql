-- 0053 - the wave chain stops belonging to campaigns. `sales.campaign_run`
-- becomes `sales.mail_sequence_run`, keyed by (subject_type, subject_code,
-- wave_no), so a lead or an opportunity can own a sequence with no campaign
-- row standing behind it. Every existing row moves across as
-- subject_type = 'campaign', keeping its mail_run_id, wave_no and expected.
--
-- `expected` is KEPT, not dropped: `SourceRepository.waves()` still selects it
-- and `SourceWaveRow` in `@pv/contracts` still prints it.
--
-- `subject_code` gets no foreign key, for `sales.touch.subject_code`'s reason:
-- one column pointing at three tables cannot be fenced, and a key into
-- `platform.object` would refuse a legitimate send over a missing mirror row.
-- The CHECK on `subject_type` is copied out by hand so the day a fourth book
-- sends mail is a migration somebody reads.
-- Hand-written for the reason 0047-0052 give: drizzle-kit's baseline snapshot
-- is still stuck at 0026.
CREATE TABLE "sales"."mail_sequence_run" (
	"subject_type" text NOT NULL,
	"subject_code" text NOT NULL,
	"mail_run_id" uuid NOT NULL,
	"wave_no" integer NOT NULL,
	"expected" integer,
	CONSTRAINT "mail_sequence_run_subject_type_subject_code_wave_no_pk" PRIMARY KEY("subject_type","subject_code","wave_no"),
	CONSTRAINT "mail_sequence_run_mail_run_id_unique" UNIQUE("mail_run_id"),
	CONSTRAINT "mail_sequence_run_subject_type_known" CHECK ("subject_type" IN ('lead', 'opportunity', 'campaign')),
	CONSTRAINT "mail_sequence_run_wave_positive" CHECK ("wave_no" > 0),
	CONSTRAINT "mail_sequence_run_expected_nonneg" CHECK ("expected" IS NULL OR "expected" >= 0),
	CONSTRAINT "mail_sequence_run_no_blank" CHECK ("subject_code" <> '')
);--> statement-breakpoint
ALTER TABLE "sales"."mail_sequence_run" ADD CONSTRAINT "mail_sequence_run_mail_run_id_mail_run_id_fk" FOREIGN KEY ("mail_run_id") REFERENCES "platform"."mail_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "sales"."mail_sequence_run" ("subject_type", "subject_code", "mail_run_id", "wave_no", "expected")
SELECT 'campaign', "campaign_code", "mail_run_id", "wave_no", "expected"
  FROM "sales"."campaign_run";--> statement-breakpoint
DROP TABLE "sales"."campaign_run";
