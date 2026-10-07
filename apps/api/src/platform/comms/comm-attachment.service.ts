import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  CommAttachment,
  CommAttachmentDeclareResponse,
  CommAttachmentsResponse,
  type CommAttachmentDeclareBody,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { notFound } from '@api/platform/http/problem'
import { StorageService } from '@api/platform/storage/storage.service'
import { CommAttachmentRepository, type CommAttachmentRead } from './comm-attachment.repository'
import { toCommAttachment } from './comms.mapper'
import { DebriefService } from './debrief.service'

/** Files on a comm record (ADR 0075 §4) through a presigned PUT, the lead-scan
 *  flow: declare → PUT straight to storage → `uploaded`. Reading takes the
 *  record's read fence, changing takes whoever may close it (`closable`). Storage
 *  calls run outside the transaction, for lead-scan's PGlite reason. */
@Injectable()
export class CommAttachmentService {
  private readonly log = new Logger('CommAttachment')

  constructor(
    private readonly repo: CommAttachmentRepository,
    private readonly records: DebriefService,
    private readonly storage: StorageService,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async list(who: Actor, id: string): Promise<CommAttachmentsResponse> {
    const record = await this.records.readable(who, id)
    const rows = await this.withUrls(who, record.row.subjectCode, id, await this.repo.listOf(id))
    return CommAttachmentsResponse.parse({ rows })
  }

  async declare(
    who: Actor,
    id: string,
    body: CommAttachmentDeclareBody,
  ): Promise<CommAttachmentDeclareResponse> {
    await this.records.closable(who, id)
    const fileId = randomUUID()
    const storageKey = keyOf(id, fileId)
    await this.repo.insert({
      id: fileId,
      storageKey,
      name: body.name,
      mime: body.mime,
      bytes: body.bytes,
      sha256: body.sha256,
      ownerKind: 'comm',
      createdBy: who.id,
    })
    const putUrl = await this.storage.presignPut(storageKey, body.mime, body.bytes)
    return CommAttachmentDeclareResponse.parse({ id: fileId, putUrl })
  }

  /** Trusts the caller that the PUT landed, as lead-scan's `start` does. */
  async uploaded(who: Actor, id: string, fileId: string): Promise<CommAttachment> {
    const record = await this.records.closable(who, id)
    const row = await this.repo.run(async (tx) => {
      const attached = await this.repo.attach(tx, keyOf(id, fileId), id)
      if (!attached) throw notFound('tệp', fileId)
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code: record.row.subjectCode,
          note: `comms.debrief ${id} · file ${fileId} attached (${attached.mime}, ${attached.bytes} B)`,
        },
        tx,
      )
      return attached
    })
    const [file] = await this.withUrls(who, record.row.subjectCode, id, [
      { row, createdByName: who.name },
    ])
    return CommAttachment.parse(file)
  }

  async remove(who: Actor, id: string, fileId: string): Promise<void> {
    const record = await this.records.closable(who, id)
    const key = await this.repo.run(async (tx) => {
      const gone = await this.repo.remove(tx, keyOf(id, fileId))
      if (!gone) throw notFound('tệp', fileId)
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code: record.row.subjectCode,
          note: `comms.debrief ${id} · file ${fileId} removed`,
        },
        tx,
      )
      return gone
    })
    await this.storage.remove(key).catch((error: unknown) => {
      this.log.warn(`comm file: could not remove ${key} — ${String(error)}`)
    })
  }

  /** A file's bytes are content (a recording, minutes): the GET link is cut
   *  for a reader without `comm.view-content`, the rule `toMessage` applies to
   *  a body, and issuing links leaves one audit line, as `trailContentRead` does. */
  private async withUrls(
    who: Actor,
    subjectCode: string,
    id: string,
    reads: readonly CommAttachmentRead[],
  ): Promise<CommAttachment[]> {
    const mayRead = this.access.allows(who, 'comm.view-content')
    const files: CommAttachment[] = []
    for (const read of reads) {
      const url = mayRead ? await this.storage.presignGet(read.row.storageKey) : null
      files.push(toCommAttachment(read, url))
    }
    if (mayRead && files.length > 0) {
      await this.audit.write({
        actorId: who.id,
        action: 'view',
        code: subjectCode,
        note: `comms.debrief ${id} · issued links to ${files.length} file(s)`,
      })
    }
    return files
  }
}

/** Server-made, and the only thing tying a not-yet-uploaded file to its record. */
const keyOf = (debriefId: string, fileId: string) => `comm/${debriefId}/${fileId}`
