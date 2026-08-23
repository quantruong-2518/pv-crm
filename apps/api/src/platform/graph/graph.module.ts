import { Module } from '@nestjs/common'
import { GraphRepository } from './graph.repository'
import { GraphService } from './graph.service'

/** E1 ở phía máy chủ. KHÔNG `@Global()` — module nào cần chuỗi ContextRail thì
 *  `imports: [GraphModule]`, để đọc `@Module` là biết ai dùng đồ thị. */
@Module({ providers: [GraphRepository, GraphService], exports: [GraphService] })
export class GraphModule {}
