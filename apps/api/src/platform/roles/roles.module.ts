import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RolePermissionRepository } from './role-permission.repository'
import { RolePermissionSeeder } from './role-permission.seeder'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

/** Axis 2 as data.
 *
 *  Exports the repository because the authentication path needs it: every
 *  request resolves the caller's grants, and that resolution has to read the
 *  same table this screen writes. One table, one repository — two readers with
 *  two copies of the query is how the screen and the guard end up disagreeing. */
@Module({
  imports: [AuditModule],
  controllers: [RolesController],
  providers: [RolePermissionRepository, RolePermissionSeeder, RolesService],
  exports: [RolePermissionRepository],
})
export class RolesModule {}
