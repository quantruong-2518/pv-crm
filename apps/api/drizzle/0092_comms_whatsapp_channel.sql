-- WhatsApp joins `CommsChannel`, and `ThreadChannel` is CommsChannel + 'meeting',
-- so both hand-written channel fences widen together. Additive only: every row
-- the old lists accepted the new lists still accept.
ALTER TABLE "comms"."identity" DROP CONSTRAINT "identity_channel_known";--> statement-breakpoint
ALTER TABLE "comms"."identity" ADD CONSTRAINT "identity_channel_known" CHECK ("channel" IN ('email', 'zalo-oa', 'telegram', 'whatsapp', 'phone', 'in-app'));--> statement-breakpoint
ALTER TABLE "comms"."thread" DROP CONSTRAINT "thread_channel_known";--> statement-breakpoint
ALTER TABLE "comms"."thread" ADD CONSTRAINT "thread_channel_known" CHECK ("channel" IN ('email', 'zalo-oa', 'telegram', 'whatsapp', 'phone', 'in-app', 'meeting'));
