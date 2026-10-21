-- 0130 - one nurturing list (ADR 0109), CONTRACT half of 0129. Run it only
-- after the new build is live and no old machine is left: from here the old
-- build's writes (`disqualified`, an owned or reasonless `nurturing`,
-- `lead-stopped`, `added_while_nurturing`) are refused.
--
-- The window between 0129 and the deploy may have left such rows, so 0129's
-- moves run again first, word for word, plus one more: a lead the old build
-- took out of the pool kept its exit pair, which now belongs to `nurturing`
-- alone. Then every fence tightens and the C5 column goes.
-- ORDER INSIDE: fences dropped first, re-added last, as in 0129.
-- Re-runnable: IF EXISTS on DDL, every data statement guarded.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.

ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_state_known";--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_disqualified_has_reason";--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_nurturing_has_reason";--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_open_owner_matches";--> statement-breakpoint
ALTER TABLE "sales"."workstream" DROP CONSTRAINT IF EXISTS "workstream_stand_key_known";--> statement-breakpoint
ALTER TABLE "sales"."workstream" DROP CONSTRAINT IF EXISTS "workstream_stand_lead_key_known";--> statement-breakpoint
ALTER TABLE "sales"."hold" DROP CONSTRAINT IF EXISTS "hold_end_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."meeting" DROP CONSTRAINT IF EXISTS "meeting_cancel_cause_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint

-- `disqualified` leaves the touch-side trigger: `nurturing` is now the only
-- state whose rung is read off the trail, so the only one a touch can move.
CREATE OR REPLACE FUNCTION "sales"."workstream_stand_bump_touch"()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  ws text;
BEGIN
  SELECT l.workstream_code INTO ws
    FROM sales.lead l
   WHERE l.code = NEW.subject_code
     AND l.state = 'nurturing';
  IF ws IS NOT NULL THEN PERFORM sales.workstream_stand_sync(ARRAY[ws]); END IF;
  RETURN NULL;
END
$fn$;--> statement-breakpoint

-- Every parked lead joins the pool. A `disqualified` lead keeps its reason and
-- moment. A `nurturing` lead with no reason, or still with a holder (the old
-- build's park), takes them from its latest `nurtured` touch: no reason there
-- is a deal-stop park (EX-08); no touch at all reads 'other' at `state_since`.
UPDATE "sales"."lead" l
   SET "state" = 'nurturing',
       "owner_id" = NULL,
       "exit_reason" = CASE WHEN l."exit_reason" IS NULL OR (l."state" = 'nurturing' AND l."owner_id" IS NOT NULL)
                            THEN COALESCE((SELECT COALESCE(t."reason_id", 'EX-08')
                                             FROM "sales"."touch" t
                                            WHERE t."subject_code" = l."code" AND t."subject_kind" = 'lead'
                                              AND t."kind" = 'nurtured'
                                            ORDER BY t."at" DESC, t."id" DESC LIMIT 1),
                                          'other')
                            ELSE l."exit_reason" END,
       "exited_at" = CASE WHEN l."exit_reason" IS NULL OR (l."state" = 'nurturing' AND l."owner_id" IS NOT NULL)
                          THEN COALESCE((SELECT t."at"
                                           FROM "sales"."touch" t
                                          WHERE t."subject_code" = l."code" AND t."subject_kind" = 'lead'
                                            AND t."kind" = 'nurtured'
                                          ORDER BY t."at" DESC, t."id" DESC LIMIT 1),
                                        l."state_since")
                          ELSE l."exited_at" END
 WHERE l."state" IN ('nurturing', 'disqualified')
   AND (l."state" = 'disqualified' OR l."owner_id" IS NOT NULL OR l."exit_reason" IS NULL);--> statement-breakpoint

-- Out of the pool means no park reason: the old build's resume and claim
-- left the pair behind, and `lead_nurturing_has_reason` refuses it below.
UPDATE "sales"."lead" SET "exit_reason" = NULL, "exited_at" = NULL
 WHERE "state" <> 'nurturing' AND ("exit_reason" IS NOT NULL OR "exited_at" IS NOT NULL);--> statement-breakpoint

-- The mirror row, which `toRef` would write: E2's scope axis reads
-- `owner_id`, so a stale holder there would keep reach over a pool lead.
UPDATE "platform"."object" o
   SET "state" = 'nurturing', "owner" = NULL, "owner_id" = NULL
  FROM "sales"."lead" l
 WHERE o."code" = l."code" AND l."state" = 'nurturing'
   AND (o."state", o."owner", o."owner_id") IS DISTINCT FROM ('nurturing', NULL, NULL);--> statement-breakpoint

-- A pool lead has nobody to do a next step or to come back to a hold, the
-- same two effects every park door now writes.
DELETE FROM "sales"."next_step" s
 USING "sales"."lead" l
 WHERE s."subject_code" = l."code" AND l."state" = 'nurturing';--> statement-breakpoint
UPDATE "sales"."hold" h
   SET "ended_at" = now(), "end_kind" = 'to-waiting'
  FROM "sales"."lead" l
 WHERE h."subject_type" = 'lead' AND h."subject_code" = l."code"
   AND l."state" = 'nurturing' AND h."ended_at" IS NULL;--> statement-breakpoint

-- Re-draw every pool lead's run. `state` in the SET list above already fired the
-- stand trigger per row; this also covers a pool lead that UPDATE's filter
-- skipped, since the rule for `nurturing` changed under rows already drawn.
SELECT "sales"."workstream_stand_sync"(ARRAY(
  SELECT DISTINCT l."workstream_code" FROM "sales"."lead" l
   WHERE l."state" = 'nurturing' AND l."workstream_code" IS NOT NULL));--> statement-breakpoint

-- Their runs closed by `workstream-sync.ts` SYNC_CLOSED's NEW rule, copied
-- out with `open-deal.ts` inlined: `nurturing` takes `disqualified`'s place,
-- so a pool lead with no deal closes LOST at `exited_at`. Change one, change both.
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
        SELECT (s."live_contract" AND NOT s."open_deal") AS "won",
               (SELECT max(k."signed_at") FROM "sales"."contract" k
                 WHERE k."lead_code" = l."code"
                   AND NOT EXISTS (SELECT 1 FROM "sales"."contract_termination" t
                                    WHERE t."contract_code" = k."code")) AS "signed_at",
               CASE WHEN NOT s."live_contract" AND s."any_deal" AND NOT s."open_deal"
                         AND (l."state" IN ('nurturing', 'new')
                              OR EXISTS (SELECT 1 FROM "sales"."contract" k WHERE k."lead_code" = l."code"))
                      THEN greatest(
                             (SELECT max(o."closed_at") FROM "sales"."opportunity" o WHERE o."lead_code" = l."code"),
                             (SELECT max(t."terminated_at") FROM "sales"."contract_termination" t
                                JOIN "sales"."contract" k ON k."code" = t."contract_code"
                               WHERE k."lead_code" = l."code"),
                             CASE l."state" WHEN 'nurturing' THEN l."exited_at" END)
                    WHEN l."state" = 'nurturing' AND NOT s."any_deal"
                      THEN l."exited_at"
               END AS "lost_at"
          FROM "sales"."lead" l
          CROSS JOIN LATERAL (
            SELECT EXISTS (SELECT 1 FROM "sales"."contract" c
                            WHERE c."lead_code" = l."code"
                              AND NOT EXISTS (SELECT 1 FROM "sales"."contract_termination" t
                                               WHERE t."contract_code" = c."code")) AS "live_contract",
                   EXISTS (SELECT 1 FROM "sales"."opportunity" o
                            WHERE o."lead_code" = l."code" AND o."state" = 'open'
                              AND NOT EXISTS (SELECT 1 FROM "sales"."contract" k
                                               WHERE k."opportunity_code" = o."code")) AS "open_deal",
                   EXISTS (SELECT 1 FROM "sales"."opportunity" o WHERE o."lead_code" = l."code") AS "any_deal"
          ) s
         WHERE l."workstream_code" = w2."code"
      ) x ON true
     WHERE w2."code" IN (SELECT l."workstream_code" FROM "sales"."lead" l
                          WHERE l."state" = 'nurturing' AND l."workstream_code" IS NOT NULL)
  ) v
 WHERE w."code" = v."code"
   AND (w."closed_at", w."close_reason") IS DISTINCT FROM (v."closed_at", v."close_reason");--> statement-breakpoint

-- Stored values of retired enum members, renamed to the member that now
-- means the same thing. Policy rows are deleted, not renamed: `kind` is the
-- key, and a mute set for `lead-nurtured` itself must win over an old one.
UPDATE "sales"."hold" SET "end_kind" = 'to-waiting' WHERE "end_kind" = 'disqualified';--> statement-breakpoint
UPDATE "sales"."meeting" SET "cancel_cause" = 'lead-nurtured' WHERE "cancel_cause" = 'lead-disqualified';--> statement-breakpoint
UPDATE "platform"."notification"
   SET "kind" = CASE "kind" WHEN 'lead-stopped' THEN 'lead-nurtured' ELSE 'lead-resumed' END
 WHERE "kind" IN ('lead-stopped', 'lead-reopened');--> statement-breakpoint
DELETE FROM "platform"."notification_kind_policy" WHERE "kind" IN ('lead-stopped', 'lead-reopened');--> statement-breakpoint

-- It served only the campaign-end park, which ADR 0109 §3 removes.
ALTER TABLE "sales"."campaign_member" DROP COLUMN IF EXISTS "added_while_nurturing";--> statement-breakpoint

-- Six `LeadState` values now, not seven.
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_state_known" CHECK ("state" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                'converted'));--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_nurturing_has_reason" CHECK (("state" = 'nurturing') = ("exit_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_open_owner_matches" CHECK ("state" NOT IN ('new', 'assigned', 'verifying', 'working', 'nurturing')
          OR (("state" IN ('new', 'nurturing')) = ("owner_id" IS NULL)));--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_key_known" CHECK (
  CASE "stand_kind"
    WHEN 'HĐ' THEN "stand_key" = 'signed'
    WHEN 'OP' THEN "stand_key" IN ('new', 'assigned', 'engaged', 'quotation')
    WHEN 'LD' THEN "stand_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                                   'converted')
    ELSE true
  END
);--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_lead_key_known" CHECK (
  "stand_lead_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                       'converted')
);--> statement-breakpoint
ALTER TABLE "sales"."hold" ADD CONSTRAINT "hold_end_kind_known" CHECK ("end_kind" IS NULL OR "end_kind" IN ('resumed', 'to-waiting', 'touch', 'stopped', 'converted'));--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_cancel_cause_known" CHECK ("cancel_cause" IS NULL OR "cancel_cause" IN ('opportunity-lost', 'lead-nurtured', 'lead-disabled'));--> statement-breakpoint

-- 0128's fifty-eight kinds minus `lead-stopped` and `lead-reopened`: fifty-six.
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated'));
