-- 0093 - a partner carries a random display ref, `ABC-123`-shaped.
--
-- `code` (REF-nnnn) stays the key leads point at; `ref` is what the partner
-- book prints in its pill. Six characters from a 32-character letter-and-digit alphabet,
-- at least one of each kind, split 3-3 by a hyphen. Existing rows are filled
-- in the same migration, then the column is locked.
ALTER TABLE "sales"."partner" ADD COLUMN "ref" text;--> statement-breakpoint
DO $$
DECLARE
  r record;
  alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
BEGIN
  FOR r IN SELECT code FROM "sales"."partner" WHERE "ref" IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..6 LOOP
        candidate := candidate || substr(alpha, 1 + floor(random() * length(alpha))::int, 1);
        IF i = 3 THEN candidate := candidate || '-'; END IF;
      END LOOP;
      EXIT WHEN candidate ~ '[A-Z]' AND candidate ~ '[2-9]'
        AND NOT EXISTS (SELECT 1 FROM "sales"."partner" WHERE "ref" = candidate);
    END LOOP;
    UPDATE "sales"."partner" SET "ref" = candidate WHERE code = r.code;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "sales"."partner" ALTER COLUMN "ref" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."partner" ADD CONSTRAINT "partner_ref_shape" CHECK ("ref" ~ '^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$');--> statement-breakpoint
CREATE UNIQUE INDEX "partner_ref_unique" ON "sales"."partner" USING btree ("ref");
