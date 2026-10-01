import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { CommAttachmentDeclareBody, CommAttachmentParams, DebriefId } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { CommAttachmentService } from './comm-attachment.service'

const FileId = CommAttachmentParams.shape.attachmentId

/** Files on a comm record — the four doors of `contracts/comms/attachment.ts`,
 *  all on `comm.view` for `DebriefController`'s reason; the owner and reach
 *  fences live in the service. */
@Controller('comms/debriefs/:id/attachments')
export class CommAttachmentController {
  constructor(private readonly files: CommAttachmentService) {}

  @Get()
  @Need({ permission: 'comm.view' })
  list(@CurrentActor() who: Actor, @Param('id', zod(DebriefId)) id: string) {
    return this.files.list(who, id)
  }

  @Post()
  @Need({ permission: 'comm.view' })
  declare(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(CommAttachmentDeclareBody)) body: CommAttachmentDeclareBody,
  ) {
    return this.files.declare(who, id, body)
  }

  /** 200: marks a row that already exists. */
  @Post(':attachmentId/uploaded')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  uploaded(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Param('attachmentId', zod(FileId)) fileId: string,
  ) {
    return this.files.uploaded(who, id, fileId)
  }

  @Delete(':attachmentId')
  @HttpCode(204)
  @Need({ permission: 'comm.view' })
  remove(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Param('attachmentId', zod(FileId)) fileId: string,
  ) {
    return this.files.remove(who, id, fileId)
  }
}
