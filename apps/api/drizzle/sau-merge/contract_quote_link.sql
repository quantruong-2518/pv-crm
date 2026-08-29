-- DO NOT RUN THIS YET. It is not in `drizzle/meta/_journal.json` on purpose.
--
-- This file references `sales.quote`, which does NOT exist on branch
-- `feat/module-4-hop-dong`: the quote table is built in parallel on
-- `feat/module-4-bao-gia`. Running it before the two branches meet fails at the
-- foreign key with `relation "sales.quote" does not exist`.
--
-- WHAT TO DO AT MERGE TIME (checklist also in `docs/ban-giao-hop-dong.md`):
--   1. Merge the quote branch, so `sales.quote` and its migration exist.
--   2. Declare `quoteCode` / `quoteStatus` on `contract` in `contract.schema.ts`
--      (the docblock at the bottom of that file says why they are absent today)
--      and the composite foreign key onto `quote(code, status)`.
--   3. Run `drizzle-kit generate` and DIFF what it emits against this file. Keep
--      the generated migration, delete this one — the journal must own it.
--   4. `ContractSign` loses `amount`/`currency` in the same pass (§2.2 of the
--      design); `contract.mapper.ts#toContract` stops hard-coding `quoteCode:
--      null` and reads the column.
--
-- This file is written out rather than left as a note because the shape below
-- is the decision, and a decision that lives only in prose gets re-derived
-- differently. Read `docs/tam-nhin-bao-gia-hop-dong.md` §3 and §11.1 for why the
-- pinned column exists at all.

-- ---------------------------------------------------------------------------
-- The two columns
-- ---------------------------------------------------------------------------
-- Nullable, both of them, and deliberately so: the six old contracts
-- (HĐ-2711…2716) have no quote behind them and their `amount` is genuinely NULL
-- on Neon. Back-filling an invented quote to satisfy a NOT NULL is inventing
-- revenue — the thing the fixture already refused in writing. A schema that
-- permits NULL does not mean the write door may leave it empty: for new rows the
-- service always fills both.
ALTER TABLE "sales"."contract" ADD COLUMN "quote_code" text;
--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD COLUMN "quote_status" text;
--> statement-breakpoint

-- The default is set AFTER the column exists, not in the ADD COLUMN above, and
-- the order carries the whole point: Postgres back-fills existing rows with a
-- default given at ADD COLUMN time, which would stamp 'khach-chot' onto six
-- contracts that never had a quote. Set afterwards, the default applies to rows
-- written from now on and leaves history alone.
ALTER TABLE "sales"."contract" ALTER COLUMN "quote_status" SET DEFAULT 'khach-chot';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The pinned column, made into a Postgres job
-- ---------------------------------------------------------------------------
-- `quote_status` carries exactly one value for its whole life. That is the
-- design, not an oversight: it turns "a signed quote cannot be pulled back" into
-- error 23503 rather than a bug waiting to be found. Moving `quote.status` off
-- 'khach-chot' while a contract points at it is refused by the database.
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_quote_status_pinned"
  CHECK ("quote_status" IS NULL OR "quote_status" = 'khach-chot');
--> statement-breakpoint

-- MATCH FULL, not the default MATCH SIMPLE, and this is the one place this file
-- goes past what the design spells out.
--
-- Under MATCH SIMPLE a composite key is satisfied the moment ANY of its columns
-- is NULL. So `quote_code = 'BG-5001', quote_status = NULL` would pass the key
-- without `BG-5001` having to exist at all — the money path would have a hole
-- shaped like the one this key was added to close. MATCH FULL says all-NULL or
-- none-NULL, which is exactly the two legal shapes: an old contract with no
-- quote, or a contract pinned to an accepted one.
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_quote_fk"
  FOREIGN KEY ("quote_code", "quote_status") REFERENCES "sales"."quote" ("code", "status")
  MATCH FULL;
