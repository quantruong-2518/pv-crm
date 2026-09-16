-- 0041 - `platform.setting`, the box of dials an operator turns.
--
-- A ROW HERE IS AN OVERRIDE, NOT A DEFINITION. Default value, unit, bounds and
-- the sentence an operator reads all live in `SETTING_REGISTRY`
-- (`packages/contracts/src/setting.ts`), in code. A key with no row is not an
-- error and not missing data - it is the ordinary state of a system nobody has
-- tuned yet, and the read serves the registry default.
--
-- The first sketch of this table was
-- `key · value · unit · updated_by · updated_at`. `unit` is dropped here, and so
-- is every other descriptive column that sketch implies (min, max, the operator
-- description): the registry already says five keys count days and one counts
-- steps. A column repeating that is a second source for one fact, and the copy
-- down here drifts from the copy up there the first time a key is retuned -
-- silently, because nothing compares them.
--
-- WHY THIS IS NOT ANOTHER ROW IN `sales.config_entry`. That table is a registry
-- of named picklists: every row is an entry a person CHOOSES, with an id, a name
-- and an order. A bare threshold has no name to show, no order to hold and
-- belongs to no list; putting one there would mean opening a ninth list and
-- loosening a CHECK that is anchored on purpose. The boundary, stated once:
-- `config_entry` holds vocabulary a user types, `platform.setting` holds system
-- constants an operator tunes.
--
-- WHICH FENCE IS THE TABLE'S AND WHICH IS THE CONTRACT'S. The table guards what
-- is true of all six keys however the registry is retuned - the key is one of
-- six known names, the number is positive. The PER-KEY bound (max-steps tops out
-- at 50, blob retention at 730) is `SettingPatch`'s, enforced by zod at the door:
-- it is registry data, it is expected to be retuned, and a CHECK holding a copy
-- would turn every retune into a migration and leave the two disagreeing until
-- then.
--
-- `setting_key_known` is the opposite case. Its six values are copied out by
-- hand, character for character from `SettingKey`, because the day a seventh key
-- exists that has to be a migration a person reads - the same reason
-- `identity_channel_known` and `touch_kind_known` are written out rather than
-- generated.
CREATE TABLE "platform"."setting" (
	-- The key IS the identity of the row: one override per key, no surrogate id.
	"key" text PRIMARY KEY NOT NULL,
	-- Days for five keys, a count of steps for the sixth. Which one applies is
	-- the registry's business, not a column here.
	"value" integer NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setting_key_known" CHECK ("key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days')),
	-- True of all six keys: a non-positive constant is one the reading code
	-- cannot act on - zero days of retention, zero steps in a sequence, a link
	-- that expires in zero days.
	CONSTRAINT "setting_value_positive" CHECK ("value" > 0)
);
--> statement-breakpoint
-- A real fence, not discipline: an override is only ever written by a signed-in
-- operator holding `setting.manage`, so the `actor` row exists by the time the
-- write runs. There is no machine writer to leave NULL for - a value nobody
-- chose is the registry default, which is the ABSENCE of a row rather than a row
-- without an author.
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_updated_by_actor_id_fk" FOREIGN KEY ("updated_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;
