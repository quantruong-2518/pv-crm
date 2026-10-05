-- 0078 - free-text industry tags on a lead, typed by the rep as notes. NOT a
-- routing input: `category` keeps deciding who gets the lead. Existing rows
-- take '{}'. Hand-written for the reason 0047-0077 give: drizzle-kit's baseline
-- snapshot is stuck at 0026. The CHECK text is copied by hand from lead.schema.ts.
ALTER TABLE "sales"."lead" ADD COLUMN "industries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_industries_max" CHECK (cardinality("industries") <= 4);--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_industries_no_blank" CHECK (array_position("industries", NULL) IS NULL
          AND (cardinality("industries") = 0
               OR array_to_string("industries", chr(31)) !~ '(^|\x1f)\s*(\x1f|$)'));
