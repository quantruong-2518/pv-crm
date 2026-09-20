-- 0054 - `touch_kind_known` gains `first-action`, the PIC's first move on a
-- lead (ADR 0058's `new|assigned` -> `verifying` rung). Sending mail, attaching
-- an account and logging a comms message all crossed that rung while writing no
-- trail of their own, so the journey screen drew a step with no date.
--
-- The list is copied out by hand, not generated, for the reason 0046/0049/0052
-- give: a CHECK is a string in a migration, so the day the contract's enum grows
-- has to be a migration a person reads.
--
-- Nothing else on the table is touched, and that is a finding, not an omission:
-- a `first-action` row carries no `to_tier` (`touch_tier_raised_has_tier` names
-- only `tier-raised`/`verified`) and neither end of a hand-over
-- (`touch_hand_over_sides` demands ends of nobody, and permits them only on
-- `handed-over`/`created` - which a `first-action` row does not want anyway).
-- Hand-written for the reason 0047-0053 give: drizzle-kit's baseline snapshot
-- is still stuck at 0026.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'first-action', 'verified', 'nurtured', 'resumed', 'archived',
                     'first-meeting', 'entered-pipeline', 'stage-changed', 'signed',
                     'exited', 'reopened'));
