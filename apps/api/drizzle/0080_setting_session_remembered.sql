-- 0080 - one more dial on `platform.setting`: `auth.session.remembered-days`,
-- how long a remember-me session lives (registry default 15, was the fixed 7).
-- No column and no row: a key with no row reads its registry default, as 0041
-- lays out. `setting_key_known` is recreated with the nine members of
-- `SettingKey`, copied by hand as 0076 does. Hand-written for the reason
-- 0047-0079 give: drizzle-kit's baseline snapshot is still stuck at 0026.
ALTER TABLE "platform"."setting" DROP CONSTRAINT "setting_key_known";--> statement-breakpoint
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_key_known" CHECK ("key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days', 'sales.activity.warn-days', 'sales.activity.alert-days', 'auth.session.remembered-days'));
