import { Module } from '@nestjs/common'
import { EnginesModule } from '../engines/engines.module'
import { EdgeWriter } from './edge-writer'
import { GraphRepository } from './graph.repository'
import { GraphService } from './graph.service'
import { ObjectMirror } from './object-mirror'

/** E1 ở phía máy chủ. KHÔNG `@Global()` — module nào cần chuỗi ContextRail thì
 *  `imports: [GraphModule]`, để đọc `@Module` là biết ai dùng đồ thị.
 *
 *  `ObjectMirror` is exported alongside `GraphService` because the two are the
 *  read and write halves of the same table: a branch that never registers its
 *  objects has nothing for `story()` to walk. Importing this module to read the
 *  rail while writing the mirror somewhere else is the split that lets them
 *  drift.
 *
 *  `EdgeWriter` completes the write half. Nodes alone are a pile, not a chain —
 *  before it existed only `seed.ts` had ever written an edge, so `story()` could
 *  reach every object in the system and connect none of them. It lives here
 *  rather than in whichever branch happened to need the first edge, for the
 *  reason spelled out in its own docblock. */
@Module({
  /* `GraphService` asks E2 for `ACCESS` (see its `storyFor`), and
     `EnginesModule` is not `@Global()` — only `ConfigModule` and `DbModule`
     are. Until `LeadModule` needed the mirror, nothing imported this module, so
     nobody ever asked Nest to build `GraphService` and the missing line cost
     nothing. The first `imports: [GraphModule]` anywhere turns it into
     "Nest can't resolve dependencies of the GraphService (GraphRepository, ?)"
     at boot. */
  imports: [EnginesModule],
  providers: [GraphRepository, GraphService, ObjectMirror, EdgeWriter],
  exports: [GraphService, ObjectMirror, EdgeWriter],
})
export class GraphModule {}
