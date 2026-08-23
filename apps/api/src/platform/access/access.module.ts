import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { RouteAudit } from './route-audit.service'

/** Hàng rào quyền. KHÔNG `@Global()` — `AppModule` nhập nó tường minh, để đọc
 *  đồ thị module là thấy ai gác cửa. */
@Module({ imports: [DiscoveryModule], providers: [RouteAudit] })
export class AccessModule {}
