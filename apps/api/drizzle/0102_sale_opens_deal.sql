-- 0102 - data only: role `sale` may open a deal (ADR 0088 §16).
--
-- `e2-access.ts` now lists `opportunity.create` under `sale`, but the boot seeder
-- plants defaults only for a permission key with no row in
-- `platform.permission_seed`. This key was planted on 01/10 (ADR 0071) for
-- director, head-of-sales, bd and account-executive, so the seeder will never
-- look at it again and every existing database would keep refusing a Sale. A
-- changed default for an already-planted key has to travel as a migration.
--
-- Cannot undo a deliberate choice: no build ever listed this key under `sale`,
-- so there has been no box on the matrix screen for an administrator to untick.
-- Other roles are left exactly as an administrator has them.
--
-- `granted_by` stays NULL, the same as a seeder-planted row - nobody ticked this.
-- No row in `permission_seed`: on a fresh database that would mark the key as
-- planted and the seeder would then skip it for the other four roles.
--
-- `lead.convert` left `PERMISSIONS` in the same change and is NOT deleted here:
-- `RolePermissionRepository.forgetUnknown()` drops its rows at boot, and only
-- the running build knows which keys are valid. A delete here would also break
-- the old build if this ran before the deploy.
--
-- `ON CONFLICT DO NOTHING` keeps a re-run, and a fresh database the seeder fills
-- later, a no-op. Hand-written; no schema change, so no snapshot.
INSERT INTO "platform"."role_permission" ("role_id", "permission")
VALUES ('sale', 'opportunity.create')
ON CONFLICT ("role_id", "permission") DO NOTHING;
