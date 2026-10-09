-- 0094 - global search learns a seventh kind, `partner` (found by its ref).
--
-- `search_recent_picked_kind_known` copies `SEARCH_KINDS` by hand (0088), so the
-- list growing is this migration. It only WIDENS the check: every existing row
-- still passes, and the previous api never writes the new kind.
ALTER TABLE "sales"."search_recent" DROP CONSTRAINT "search_recent_picked_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."search_recent" ADD CONSTRAINT "search_recent_picked_kind_known" CHECK ("picked_kind" IS NULL OR "picked_kind" IN ('lead', 'account', 'contact', 'opportunity', 'campaign', 'contract', 'partner'));
