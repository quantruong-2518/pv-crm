-- 0032 - the role matrix stops being a compile-time constant.
--
-- Until today `ROLE_PERMISSIONS` in `@pv/engines` WAS the answer to "what may
-- this role do", which meant changing it was a deploy. Two tables move that
-- answer into the database without giving up the property the constant had.
--
--  1. platform.role_permission  - one row per granted (role, permission) pair.
--     Absence is denial; there is no `granted` boolean, because a false row and
--     a missing row would be two ways to say the same thing and they would
--     eventually disagree. `granted_by` is ON DELETE SET NULL: losing the
--     account that made a grant must never take the grant with it.
--
--  2. platform.permission_seed  - one row per permission the seeder has ever
--     planted, and the reason table 1 alone is not enough. The seeder has to
--     tell "nobody has ever seeded this permission" apart from "an administrator
--     revoked it from every role", and table 1 looks identical in both cases.
--     Without this, every boot would resurrect grants somebody deliberately
--     removed; with it, a permission is seeded exactly once in its lifetime.
--
-- Both tables are written by hand rather than generated, the way 0002 was.
CREATE TABLE "platform"."role_permission" (
	"role_id" text NOT NULL,
	"permission" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text,
	CONSTRAINT "role_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "platform"."permission_seed" (
	"permission" text PRIMARY KEY NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform"."role_permission" ADD CONSTRAINT "role_permission_granted_by_actor_id_fk" FOREIGN KEY ("granted_by") REFERENCES "platform"."actor"("id") ON DELETE set null ON UPDATE no action;
