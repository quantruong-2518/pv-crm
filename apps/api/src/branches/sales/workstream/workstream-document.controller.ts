import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ObjectCode, WorkstreamDocumentDeclareBody, WorkstreamDocumentParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { WorkstreamDocumentService } from './workstream-document.service'

const DocumentId = WorkstreamDocumentParams.shape.documentId

/** The four doors of `contracts/sales/workstream-document.ts`, all on
 *  `workstream.view` + scope: a run's documents belong to whoever can see the run. */
@Controller('sales/workstreams/:code/documents')
export class WorkstreamDocumentController {
  constructor(private readonly documents: WorkstreamDocumentService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  list(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.documents.list(who, code)
  }

  @Post()
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  declare(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(WorkstreamDocumentDeclareBody)) body: WorkstreamDocumentDeclareBody,
  ) {
    return this.documents.declare(who, code, body)
  }

  @Post(':documentId/uploaded')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  uploaded(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Param('documentId', zod(DocumentId)) id: string,
  ) {
    return this.documents.uploaded(who, code, id)
  }

  @Delete(':documentId')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'workstream.view', scoped: true })
  remove(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Param('documentId', zod(DocumentId)) id: string,
  ) {
    return this.documents.remove(who, code, id)
  }
}
