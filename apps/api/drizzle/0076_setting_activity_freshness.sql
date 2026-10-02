-- 0076 - two more dials on `platform.setting`: `sales.activity.warn-days` and
-- `sales.activity.alert-days`, how many quiet days before an opportunity nags
-- and then alarms. No column and no row: a key with no row reads its registry
-- default (6 and 9), as 0041 lays out.
--
-- `setting_key_known` is dropped and recreated with the eight members of
-- `SettingKey`, copied out by hand character for character - the reason 0041
-- gives for not generating it. The per-key bounds and alert > warn stay with
-- zod (`ActivityFreshnessPatch`): retuning those must not cost a migration.
-- Hand-written for the reason 0047-0075 give: drizzle-kit's baseline snapshot
-- is still stuck at 0026.
ALTER TABLE "platform"."setting" DROP CONSTRAINT "setting_key_known";--> statement-breakpoint
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_key_known" CHECK ("key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days', 'sales.activity.warn-days', 'sales.activity.alert-days'));
