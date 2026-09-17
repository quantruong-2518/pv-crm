-- 0049 - two values the database must now accept, both widened in place:
-- `platform.approval.kind` gains `'contract-sign'` (signing a contract goes
-- through E3), `sales.touch.kind` gains `'reopened'` (a lead that had exited
-- the funnel came back). Each CHECK is dropped and re-added with a SUPERSET of
-- its old values, so every existing row still passes the re-validation.
-- `'reopened'` needs no other touch CHECK touched: like `'exited'` it carries
-- no ends, no tier and no role, and every kind-conditioned clause already
-- lets such a row through.
--
-- The unique index answers "is a sign request already waiting on this deal?"
-- and caps it at one. It cannot fail on existing data: until this migration
-- `approval_kind_known` refused every `'contract-sign'` row.
--
-- Hand-written for the reason `0047` gives: `drizzle-kit generate`'s baseline
-- snapshot is still stuck at `0026`.
ALTER TABLE "platform"."approval" DROP CONSTRAINT "approval_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."approval" ADD CONSTRAINT "approval_kind_known" CHECK ("kind" IN ('config-change', 'contract-sign'));--> statement-breakpoint
CREATE UNIQUE INDEX "approval_contract_sign_waiting_uq" ON "platform"."approval" USING btree (("payload"->>'opportunityCode')) WHERE "kind" = 'contract-sign' AND "state" = 'waiting';--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited', 'reopened'));
