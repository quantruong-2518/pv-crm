-- 0140 - the org tree (ADR 0118): `platform.org_version` (one header per month the
-- tree changed), `platform.org_node` (unit, kind, name, parent under that header)
-- and `platform.org_member` (person, unit, head flag). Tree in force for P = header
-- with the greatest `from_period <= P`. Fences: one unit per person (member PK), one
-- head per unit (partial unique), head is a member (it is a flag on the member row),
-- one company per version (partial unique), parent in the same version (composite
-- FK), only the company is parentless (CHECK). The kind ladder is the door's. Kind
-- list and name/period CHECKs copied by hand. All three join `pv_change` under 'kpi'.
--
-- Data: one version V = greatest('2026-12', this Vietnam month, the month after the
-- last month >= this one with a non-draft allocation), as `effectiveFrom`. It holds a
-- company "Công ty" and every team of the roster in force at V that has members, with
-- unit_id = kpi_team.id, members copied, lead -> head. saved_by = that roster's saver,
-- else the oldest director, else the oldest actor; no actor at all (fresh DB) = no
-- version. Additive: new tables only. ORDER: migrate BEFORE deploy. Re-runnable: IF
-- NOT EXISTS, DROP before every ADD, and the copy runs only while no version exists.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "platform"."org_version" (
	"from_period" text PRIMARY KEY NOT NULL,
	"saved_by" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_version_period_shape" CHECK ("from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$')
);--> statement-breakpoint
ALTER TABLE "platform"."org_version" DROP CONSTRAINT IF EXISTS "org_version_saved_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."org_version" ADD CONSTRAINT "org_version_saved_by_actor_id_fk" FOREIGN KEY ("saved_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform"."org_node" (
	"from_period" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "org_node_pk" PRIMARY KEY("from_period","unit_id"),
	CONSTRAINT "org_node_kind_known" CHECK ("kind" IN ('company', 'department', 'team')),
	CONSTRAINT "org_node_root_is_company" CHECK (("kind" = 'company') = ("parent_id" IS NULL)),
	CONSTRAINT "org_node_name_length" CHECK (length(btrim("name")) BETWEEN 1 AND 80)
);--> statement-breakpoint
ALTER TABLE "platform"."org_node" DROP CONSTRAINT IF EXISTS "org_node_from_period_org_version_from_period_fk";--> statement-breakpoint
ALTER TABLE "platform"."org_node" ADD CONSTRAINT "org_node_from_period_org_version_from_period_fk" FOREIGN KEY ("from_period") REFERENCES "platform"."org_version"("from_period") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."org_node" DROP CONSTRAINT IF EXISTS "org_node_parent_fk";--> statement-breakpoint
ALTER TABLE "platform"."org_node" ADD CONSTRAINT "org_node_parent_fk" FOREIGN KEY ("from_period","parent_id") REFERENCES "platform"."org_node"("from_period","unit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_node_one_company_uq" ON "platform"."org_node" USING btree ("from_period") WHERE "kind" = 'company';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform"."org_member" (
	"from_period" text NOT NULL,
	"actor_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"head" boolean DEFAULT false NOT NULL,
	CONSTRAINT "org_member_pk" PRIMARY KEY("from_period","actor_id")
);--> statement-breakpoint
ALTER TABLE "platform"."org_member" DROP CONSTRAINT IF EXISTS "org_member_from_period_org_version_from_period_fk";--> statement-breakpoint
ALTER TABLE "platform"."org_member" ADD CONSTRAINT "org_member_from_period_org_version_from_period_fk" FOREIGN KEY ("from_period") REFERENCES "platform"."org_version"("from_period") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."org_member" DROP CONSTRAINT IF EXISTS "org_member_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."org_member" ADD CONSTRAINT "org_member_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."org_member" DROP CONSTRAINT IF EXISTS "org_member_unit_fk";--> statement-breakpoint
ALTER TABLE "platform"."org_member" ADD CONSTRAINT "org_member_unit_fk" FOREIGN KEY ("from_period","unit_id") REFERENCES "platform"."org_node"("from_period","unit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_member_one_head_uq" ON "platform"."org_member" USING btree ("from_period","unit_id") WHERE "head";--> statement-breakpoint

DROP TRIGGER IF EXISTS "pv_change_write" ON "platform"."org_version";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "platform"."org_version" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "platform"."org_version";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "platform"."org_version" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_write" ON "platform"."org_node";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "platform"."org_node" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "platform"."org_node";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "platform"."org_node" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_write" ON "platform"."org_member";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "platform"."org_member" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "platform"."org_member";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "platform"."org_member" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint

DO $$
DECLARE
	now_month text := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM');
	last_sent text;
	v text;
	roster text;
	by_id text;
	company uuid := '00000000-0000-4000-8000-000000000001';
BEGIN
	IF EXISTS (SELECT 1 FROM "platform"."org_version") THEN
		RETURN;
	END IF;
	-- `superseded` counts as sent, as in `effectiveFrom`.
	SELECT max("period") INTO last_sent FROM "sales"."kpi_allocation"
		WHERE "period" >= now_month AND "status" <> 'draft';
	v := greatest('2026-12', now_month,
		to_char((coalesce(last_sent, '2000-01') || '-01')::date + interval '1 month', 'YYYY-MM'));
	-- No roster header after V can exist: the api writes rosters at `effectiveFrom`, never beyond V.
	SELECT max("from_period") INTO roster FROM "sales"."kpi_team_roster" WHERE "from_period" <= v;
	SELECT "saved_by" INTO by_id FROM "sales"."kpi_team_roster" WHERE "from_period" = roster;
	IF by_id IS NULL THEN
		SELECT "id" INTO by_id FROM "platform"."actor"
			ORDER BY ('director' = ANY("role_ids")) DESC, "created_at", "id" LIMIT 1;
	END IF;
	IF by_id IS NULL THEN
		RETURN;
	END IF;

	INSERT INTO "platform"."org_version" ("from_period", "saved_by") VALUES (v, by_id);
	INSERT INTO "platform"."org_node" ("from_period", "unit_id", "kind", "name", "parent_id")
		VALUES (v, company, 'company', 'Công ty', NULL);
	INSERT INTO "platform"."org_node" ("from_period", "unit_id", "kind", "name", "parent_id")
		SELECT v, t."id", 'team', t."name", company FROM "sales"."kpi_team" t
		WHERE t."id" IN (SELECT "team_id" FROM "sales"."kpi_team_member" WHERE "from_period" = roster);
	INSERT INTO "platform"."org_member" ("from_period", "actor_id", "unit_id", "head")
		SELECT v, "actor_id", "team_id", "lead" FROM "sales"."kpi_team_member" WHERE "from_period" = roster;
END;
$$;
