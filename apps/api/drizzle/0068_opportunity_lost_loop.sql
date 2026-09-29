-- 0068 - ADR 0069: stopping an opportunity is final. The stored state `care`
-- becomes `lost`, its three columns become the fail log (`stopped_at_stage`,
-- `stop_reason`, `stop_note`), and there is no reopen door any more. Also: a
-- contract names its kind, a loss reason may say "do not contact", and a mail
-- template may record a deal milestone.
--
-- Data moves BEFORE each CHECK is re-added, so no ADD CONSTRAINT below ever
-- sees a value it is about to refuse. Every UPDATE matches zero rows on a
-- second run.
--
-- No SQL function changes. `workstream_stand()` never read `care` (it reads
-- `stage IS NOT NULL`, which a lost deal has not), and the LOST rule of a run
-- lives in `syncClosed`, not in SQL - so the backfill below copies it out.
-- `lead_open_owner_matches` and `lead_email_live_idx` already accept the
-- `converted` -> `nurturing`/`new` move, so it needs no constraint change.
--
-- Hand-written for 0047-0067's reason: `generate`'s baseline is stuck at 0026.

-- The four constraints that spell `care` go first: renaming the columns would
-- carry them along under names that no longer say what they fence.
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_care_closed";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_care_off_board";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_open_has_no_care";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_care_from_stage_known";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_state_known";--> statement-breakpoint

ALTER TABLE "sales"."opportunity" RENAME COLUMN "care_from_stage" TO "stopped_at_stage";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" RENAME COLUMN "care_reason" TO "stop_reason";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" RENAME COLUMN "care_note" TO "stop_note";--> statement-breakpoint

-- A parked deal already carries a full fail log (0061's `care_closed` made
-- sure), so only the key changes. `stage` stays NULL, so the stand trigger
-- does not fire and no run moves.
UPDATE "sales"."opportunity" SET "state" = 'lost' WHERE "state" = 'care';--> statement-breakpoint

-- `OpportunityState.options`, copied out by hand: `won` stays derived.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_state_known" CHECK ("state" IN ('open', 'lost'));--> statement-breakpoint

-- A stop writes the whole fail log: where it stood, why, and when it ended.
-- Who concluded it is `opportunity_stage_event.by_id`, fenced there.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_lost_closed" CHECK (
  "state" <> 'lost'
  OR ("stopped_at_stage" IS NOT NULL AND "stop_reason" IS NOT NULL AND "closed_at" IS NOT NULL)
);--> statement-breakpoint

-- A lost deal has left the board; one still holding `stage` would be counted
-- in a column by the board and as stopped by the scorecard.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_lost_off_board" CHECK (
  "state" <> 'lost' OR "stage" IS NULL
);--> statement-breakpoint

-- The other direction: a live deal carries no fail log. `closed_at` is not in
-- the list - it is also the day a won deal signed, and won is stored `open`.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_open_has_no_stop" CHECK (
  "state" <> 'open'
  OR ("stopped_at_stage" IS NULL AND "stop_reason" IS NULL AND "stop_note" IS NULL)
);--> statement-breakpoint

-- `StageKey.options`, copied out by hand: a funnel report groups stops by it.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_stopped_at_stage_known" CHECK (
  "stopped_at_stage" IS NULL
  OR "stopped_at_stage" IN ('new', 'assigned', 'sample', 'poc', 'quotation')
);--> statement-breakpoint

-- ADR 0069 §3 for the deals the rewrite above just made lost, else no door
-- could ever park these leads: a `converted` lead with a deal, every deal
-- lost and no contract goes back to waiting with its holder, or to the pool
-- when it has none. SQL twin of `LeadStateWriter.dealsLost`, in one statement
-- so the mirror row and the `nurtured` row ride on the RETURNING list. Both
-- landings get that row, worded by `NOTE.lastLost`, credited to the system:
-- the stop that caused it is already dated on the deal.
WITH "moved" AS (
  UPDATE "sales"."lead" l
     SET "state" = CASE WHEN l."owner_id" IS NULL THEN 'new' ELSE 'nurturing' END,
         "state_since" = now()
   WHERE l."state" = 'converted'
     AND NOT EXISTS (SELECT 1 FROM "sales"."contract" k WHERE k."lead_code" = l."code")
     AND EXISTS (SELECT 1 FROM "sales"."opportunity" o WHERE o."lead_code" = l."code")
     AND NOT EXISTS (SELECT 1 FROM "sales"."opportunity" o
                      WHERE o."lead_code" = l."code" AND o."state" <> 'lost')
  RETURNING l."code", l."state"
),
"mirrored" AS (
  UPDATE "platform"."object" m SET "state" = mv."state"
    FROM "moved" mv WHERE m."code" = mv."code"
)
INSERT INTO "sales"."touch" ("subject_code", "subject_kind", "kind", "by", "note")
SELECT mv."code", 'lead', 'nurtured', 'Hệ thống',
       CASE mv."state" WHEN 'new' THEN 'Cơ hội cuối đã dừng — lead không có người giữ nên về kho chung'
                       ELSE 'Cơ hội cuối đã dừng — lead về nhóm chờ chăm sóc' END
  FROM "moved" mv;--> statement-breakpoint

-- Their runs, and any other run with a lost deal, re-derived by
-- `workstream-sync.ts` SYNC_CLOSED copied out verbatim (`leadSigned` and
-- `leadDealsAllLost` inlined). Change that file and change this copy.
UPDATE "sales"."workstream" w
   SET "closed_at" = v."closed_at", "close_reason" = v."close_reason"
  FROM (
    SELECT w2."code",
           CASE WHEN x."won" THEN greatest(x."signed_at", w2."opened_at")
                WHEN x."lost_at" IS NOT NULL THEN greatest(x."lost_at", w2."opened_at")
           END AS "closed_at",
           CASE WHEN x."won" THEN 'WON'
                WHEN x."lost_at" IS NOT NULL THEN 'LOST'
           END AS "close_reason"
      FROM "sales"."workstream" w2
      JOIN LATERAL (
        SELECT (EXISTS (SELECT 1 FROM "sales"."contract" k WHERE k."lead_code" = l."code")
                AND NOT EXISTS (SELECT 1 FROM "sales"."opportunity" o
                                 WHERE o."lead_code" = l."code" AND o."state" = 'open'
                                   AND NOT EXISTS (SELECT 1 FROM "sales"."contract" k
                                                    WHERE k."opportunity_code" = o."code"))) AS "won",
               (SELECT max(k."signed_at") FROM "sales"."contract" k WHERE k."lead_code" = l."code") AS "signed_at",
               CASE WHEN l."state" IN ('nurturing', 'disqualified', 'new')
                         AND NOT EXISTS (SELECT 1 FROM "sales"."contract" k WHERE k."lead_code" = l."code")
                         AND EXISTS (SELECT 1 FROM "sales"."opportunity" o WHERE o."lead_code" = l."code")
                         AND NOT EXISTS (SELECT 1 FROM "sales"."opportunity" o
                                          WHERE o."lead_code" = l."code" AND o."state" <> 'lost')
                      THEN greatest(
                             (SELECT max(o."closed_at") FROM "sales"."opportunity" o WHERE o."lead_code" = l."code"),
                             CASE l."state" WHEN 'disqualified' THEN l."exited_at" END)
                    WHEN l."state" = 'disqualified'
                         AND NOT EXISTS (SELECT 1 FROM "sales"."opportunity" o WHERE o."lead_code" = l."code")
                      THEN l."exited_at"
               END AS "lost_at"
          FROM "sales"."lead" l
         WHERE l."workstream_code" = w2."code"
      ) x ON true
     WHERE w2."code" IN (SELECT l."workstream_code" FROM "sales"."lead" l
                           JOIN "sales"."opportunity" o ON o."lead_code" = l."code"
                          WHERE o."state" = 'lost')
  ) v
 WHERE w."code" = v."code"
   AND (w."closed_at", w."close_reason") IS DISTINCT FROM (v."closed_at", v."close_reason");--> statement-breakpoint

-- `care-entered` was the stop itself, so its rows become `exited` - the kind a
-- lead leaving the funnel already uses; `subject_kind` tells the two apart.
-- `care-left` rows stay: they record reopenings that really happened.
UPDATE "sales"."touch" SET "kind" = 'exited' WHERE "kind" = 'care-entered';--> statement-breakpoint

-- Twenty-five `TouchKind` values: `care-entered` goes, `care-left` stays
-- valid forever with no writer, like `first-action`/`verified`.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'quotation-sent',
                     'care-left', 'next-step-done',
                     'mail-failed', 'mail-sync-failed'));--> statement-breakpoint

-- Nullable for ever: contracts signed before this migration never named a
-- kind, and inventing one would put a word in the director's mouth. The sign
-- door requires it from now on; that is zod's job, not this table's.
ALTER TABLE "sales"."contract" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_kind_known" CHECK (
  "kind" IS NULL OR "kind" IN ('licence', 'deployment', 'training')
);--> statement-breakpoint

-- "Không liên hệ". NOT NULL DEFAULT false because every existing row already
-- has an answer: nobody asked not to be contacted. Fenced to its one list,
-- the same price `config_stage_only_loss_reason` pays.
ALTER TABLE "sales"."config_entry" ADD COLUMN "do_not_contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_do_not_contact_only_loss_reason" CHECK (
  NOT "do_not_contact" OR "list" = 'LOSS_REASON'
);--> statement-breakpoint

-- The any-rung reasons of canvas board F-Wait (`stage` NULL). Ids LR-90..94
-- sit far above the repository's `max + 1` counter, so they cannot take a code
-- the desk already issued, and the next desk entry becomes LR-95. `ord` is
-- appended after whatever the list holds today. A live entry with the same
-- name is left alone rather than duplicated (`config_name_live` would refuse
-- it) and NAMED in a NOTICE, so `/ship` sees which reason kept the old row -
-- and so its `do_not_contact` stays false. Existing LR rows are never rewritten.
DO $$
DECLARE
  v record;
  kept text;
BEGIN
  FOR v IN SELECT * FROM (VALUES ('LR-90', 'Chưa có ngân sách năm nay', false),
                                 ('LR-91', 'Người liên hệ nghỉ việc', true),
                                 ('LR-92', 'Khách chọn bên khác', false),
                                 ('LR-93', 'Khách hoãn dự án', false),
                                 ('LR-94', 'Không phải khách của mình', true)) AS t("id", "name", "dnc")
            ORDER BY 1
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM "sales"."config_entry" c WHERE c."id" = v."id");
    SELECT c."id" INTO kept FROM "sales"."config_entry" c
     WHERE c."list" = 'LOSS_REASON' AND c."active" AND lower(c."name") = lower(v."name")
     LIMIT 1;
    IF kept IS NOT NULL THEN
      RAISE NOTICE '0068: % "%" skipped, live LOSS_REASON % already has that name', v."id", v."name", kept;
      CONTINUE;
    END IF;
    INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord", "active", "stage", "do_not_contact")
    SELECT v."id", 'LOSS_REASON', v."name", COALESCE(max("ord"), 0) + 1, true, NULL, v."dnc"
      FROM "sales"."config_entry" WHERE "list" = 'LOSS_REASON';
  END LOOP;
END $$;--> statement-breakpoint

-- The milestone a send from the opportunity door records. Only the two a
-- letter can be; a POC is run, not mailed.
ALTER TABLE "sales"."mail_template" ADD COLUMN "milestone" text;--> statement-breakpoint
ALTER TABLE "sales"."mail_template" ADD CONSTRAINT "mail_template_milestone_known" CHECK (
  "milestone" IS NULL OR "milestone" IN ('sample', 'quotation')
);
