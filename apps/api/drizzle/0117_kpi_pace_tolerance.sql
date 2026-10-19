-- 0117 - the pace tolerance setting: `kpi.pace.tolerance-percent`, a whole
-- percent (0-99) a metric may sit below the pace line and still read "on
-- track". `setting_key_known` is restated with 0113's eleven keys plus this one.
--
-- Its default is 0, and a row is only an override, so putting it back to 0
-- after a 5 upserts the value 0. `setting_value_positive` (`"value" > 0`)
-- would refuse that, so it is recreated with one named exception for this key.
-- Every other key keeps the strict rule: `kpi.alert.slip-percent = 0` is still
-- refused. Widening only: every row the old lists accepted still passes.
-- ORDER: migrate BEFORE deploy (the old api never writes the new key).
-- Re-runnable: DROP ... IF EXISTS before each ADD.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "platform"."setting" DROP CONSTRAINT IF EXISTS "setting_key_known";--> statement-breakpoint
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_key_known" CHECK ("key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days', 'sales.activity.warn-days', 'sales.activity.alert-days', 'auth.session.remembered-days', 'kpi.alert.slip-percent', 'kpi.alert.hit-percent', 'kpi.pace.tolerance-percent'));--> statement-breakpoint
ALTER TABLE "platform"."setting" DROP CONSTRAINT IF EXISTS "setting_value_positive";--> statement-breakpoint
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_value_positive" CHECK ("value" > 0 OR "key" = 'kpi.pace.tolerance-percent');
