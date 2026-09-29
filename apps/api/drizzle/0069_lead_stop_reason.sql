-- 0069 - ADR 0070: stop reasons move from a hard-coded `ExitReason` enum to
-- the desk-edited `EXIT_REASON` config list. Same catalogue serves BOTH doors
-- that stop a lead - "Ngừng chăm sóc" (exited) and "Nhóm chờ chăm sóc"
-- (nurtured) - plus a virtual key `'other'` that is never a config row.
--
-- Data moves BEFORE the CHECK tightens, same discipline as 0067/0068.
--
-- RE-RUN SAFETY, spelled out because `/ship` runs the data statements again
-- after deploy to catch rows the OLD api wrote in the migrate->deploy gap:
--   · the two DDL statements (ADD COLUMN, ADD CONSTRAINT) are NOT re-runnable
--     - they already ran once as part of THIS file and must not run twice;
--   · the INSERT and all three UPDATEs below ARE re-runnable in isolation,
--     any number of times, in any order relative to each other - each one's
--     WHERE clause only ever matches a row still in its PRE-migration shape.
--
-- Hand-written for 0047-0068's reason: `generate`'s baseline is stuck at 0026.

-- The reason a stop touch carries. Nullable and loose on purpose - see the
-- column's docblock in touch.schema.ts for why it has no FK.
ALTER TABLE "sales"."touch" ADD COLUMN "reason_id" text;--> statement-breakpoint

-- Seed the six EXIT_REASON rows only if the list is completely empty. Neon
-- resets `sales` on staff reset and may carry none; a database that already
-- has them (this statement run a second time, or a hand-seeded one) is left
-- alone rather than risking a second, differently-worded set under new ids.
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT v."id", 'EXIT_REASON', v."name", v."ord"
  FROM (VALUES
    ('EX-01', 'Không gọi được ai', 1),
    ('EX-02', 'Không phải khách của mình', 2),
    ('EX-03', 'Chưa có ngân sách năm nay', 3),
    ('EX-04', 'Người liên hệ nghỉ việc', 4),
    ('EX-05', 'Khách chọn bên khác', 5),
    ('EX-06', 'Im sau báo giá', 6)
  ) AS v("id", "name", "ord")
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" WHERE "list" = 'EXIT_REASON');--> statement-breakpoint

-- The six OLD `ExitReason` enum keys, mapped to the config id THIS migration
-- itself just minted for each - by id, not by `ord`, because `ord` is desk-
-- editable (drag-to-reorder) and a row's id is not. A lead carrying a key
-- outside this six (there is none today, but a stray value must not silently
-- vanish) falls through to `'other'` below.
--
-- Re-runnable: the WHERE clause only matches a row still holding a raw OLD
-- key, so once a row is mapped to 'EX-0N' it never matches again.
WITH "old_keys" ("key", "ord") AS (
  VALUES ('unreachable', 1), ('not-a-fit', 2), ('no-budget', 3),
         ('contact-left', 4), ('chose-competitor', 5), ('silent-after-quote', 6)
),
"mapping" AS (
  SELECT k."key", c."id"
    FROM "old_keys" k
    JOIN "sales"."config_entry" c ON c."list" = 'EXIT_REASON' AND c."id" = 'EX-0' || k."ord"
)
UPDATE "sales"."lead" l
   SET "exit_reason" = m."id"
  FROM "mapping" m
 WHERE l."exit_reason" = m."key";--> statement-breakpoint

-- Anything left on `lead.exit_reason` that is not now a config id is a key
-- this migration's six-row map did not know - park it under the catch-all
-- rather than leaving a value `lead_disqualified_has_reason` still accepts
-- today but no screen can look up a label for. Re-runnable: a row already
-- carrying a known id or 'other' fails the NOT IN / <> tests and is skipped.
UPDATE "sales"."lead"
   SET "exit_reason" = 'other'
 WHERE "exit_reason" IS NOT NULL
   AND "exit_reason" <> 'other'
   AND "exit_reason" NOT IN (SELECT "id" FROM "sales"."config_entry" WHERE "list" = 'EXIT_REASON');--> statement-breakpoint

-- `exited` touch notes are written "<prefix> · <key>[ · note]"
-- (`lead-write.mapper.ts`'s `exited()`) - but ONLY for a lead. `kind = 'exited'`
-- alone is not enough to scope this: 0068 (a sibling migration, ADR 0069)
-- turns every OPPORTUNITY `care-entered` touch into `exited` too, and those
-- carry an unrelated `LOSS_REASON` id in their note, not one of the six old
-- keys - rewriting them would corrupt a deal's own fail log. `subject_kind`
-- is the fence, and `reason_id IS NULL` is what makes this re-runnable: a row
-- already mapped is never revisited, and the note is rewritten ONLY when the
-- old key actually matched (`k.key IS NOT NULL`) - a lead `exited` row whose
-- note does not parse as one of the six still gets `reason_id = 'other'`, but
-- its note is left exactly as written rather than guessed at.
WITH "old_keys" ("key", "ord") AS (
  VALUES ('unreachable', 1), ('not-a-fit', 2), ('no-budget', 3),
         ('contact-left', 4), ('chose-competitor', 5), ('silent-after-quote', 6)
),
"mapped" AS (
  SELECT t."id" AS "touch_id",
         k."key" AS "old_key",
         COALESCE(c."id", 'other') AS "new_id",
         string_to_array(t."note", ' · ') AS "parts"
    FROM "sales"."touch" t
    LEFT JOIN "old_keys" k ON k."key" = split_part(t."note", ' · ', 2)
    LEFT JOIN "sales"."config_entry" c ON c."list" = 'EXIT_REASON' AND c."id" = 'EX-0' || k."ord"
   WHERE t."kind" = 'exited'
     AND t."subject_kind" = 'lead'
     AND t."reason_id" IS NULL
)
UPDATE "sales"."touch" t
   SET "reason_id" = m."new_id",
       "note" = CASE
                   WHEN m."old_key" IS NOT NULL AND array_length(m."parts", 1) >= 2
                   THEN array_to_string(
                          m."parts"[1:1] || ARRAY[m."new_id"]
                          || m."parts"[3:array_length(m."parts", 1)],
                          ' · ')
                   ELSE t."note"
                 END
  FROM "mapped" m
 WHERE t."id" = m."touch_id";--> statement-breakpoint

-- `nurtured` rows predate any reason capture at all - there is no key to
-- recover, so every one of them becomes the catch-all rather than a guess.
-- `subject_kind = 'lead'` for the same reason as above (nothing else writes
-- this kind today, but the fence costs nothing); `reason_id IS NULL` makes a
-- second run a no-op.
UPDATE "sales"."touch"
   SET "reason_id" = 'other'
 WHERE "kind" = 'nurtured' AND "subject_kind" = 'lead' AND "reason_id" IS NULL;--> statement-breakpoint

-- Only the two kinds that stop a lead may carry a reason. One-way, like
-- `touch_hand_over_sides`'s sibling: old API code between this migration and
-- its own deploy still writes reason-less `exited`/`nurtured` rows, and that
-- has to keep working, not become a 500.
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_reason_only_stop"
  CHECK ("reason_id" IS NULL OR "kind" IN ('nurtured', 'exited'));
