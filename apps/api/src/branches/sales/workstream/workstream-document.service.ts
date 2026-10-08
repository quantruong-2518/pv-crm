import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  LeadAttachmentsResponse,
  WorkstreamDocumentDeclareResponse,
  type ObjectCode,
  type WorkstreamDocumentDeclareBody,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { invalid, notFound } from '@api/platform/http/problem'
import { StorageService } from '@api/platform/storage/storage.service'
import { toAttachment } from '../lead/lead-scan.mapper'
import { WorkstreamDocumentRepository } from './workstream-document.repository'
import { WorkstreamRepository } from './workstream.repository'

/** Documents of a run through a presigned PUT, comm-attachment's flow:
 *  declare → PUT straight to storage → `uploaded`. Every door asks the run's
 *  own read fence and answers the same 404 for "no such run" and "not yours",
 *  as `WorkstreamService.profile` does. Storage calls run outside the
 *  transaction, for lead-scan's PGlite reason. */
@Injectable()
export class WorkstreamDocumentService {
  private readonly log = new Logger('WorkstreamDocument')

  constructor(
    private readonly repo: WorkstreamDocumentRepository,
    private readonly runs: WorkstreamRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async list(who: Actor, code: ObjectCode): Promise<LeadAttachmentsResponse> {
    await this.fence(who, code)
    const out = []
    for (const a of await this.repo.listOf(code, this.access.allows(who, 'lead.view'))) {
      const url = await this.storage.presignGet(a.row.storageKey)
      const thumbUrl = a.row.thumbKey ? await this.storage.presignGet(a.row.thumbKey) : null
      out.push(toAttachment(a, url, thumbUrl))
    }
    return LeadAttachmentsResponse.parse({ rows: out })
  }

  async declare(
    who: Actor,
    code: ObjectCode,
    body: WorkstreamDocumentDeclareBody,
  ): Promise<WorkstreamDocumentDeclareResponse> {
    await this.fence(who, code)
    const { kept, pending } = await this.repo.load(code, who.id)
    if (kept >= MAX_DOCUMENTS || pending >= MAX_PENDING) {
      throw invalid({ name: ['Hành trình đã đủ số tài liệu cho phép — xoá bớt trước khi thêm.'] })
    }
    const id = randomUUID()
    const storageKey = keyOf(code, id)
    await this.repo.insert({
      id,
      storageKey,
      name: body.name,
      mime: body.mime,
      bytes: body.bytes,
      sha256: body.sha256,
      ownerKind: 'workstream',
      createdBy: who.id,
    })
    const putUrl = await this.storage.presignPut(storageKey, body.mime, body.bytes)
    return WorkstreamDocumentDeclareResponse.parse({ id, putUrl })
  }

  /** Trusts the caller that the PUT landed, as lead-scan's `start` does. */
  async uploaded(who: Actor, code: ObjectCode, id: string): Promise<void> {
    await this.fence(who, code)
    await this.repo.run(async (tx) => {
      const row = await this.repo.attach(tx, keyOf(code, id), code)
      if (!row) throw notFound('tệp', id)
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code,
          note: `workstream document ${id} attached (${row.mime}, ${row.bytes} B)`,
        },
        tx,
      )
    })
  }

  async remove(who: Actor, code: ObjectCode, id: string): Promise<void> {
    await this.fence(who, code)
    const gone = await this.repo.run(async (tx) => {
      const row = await this.repo.remove(tx, keyOf(code, id), code, who.id)
      if (!row) throw notFound('tệp', id)
      await this.audit.write(
        { actorId: who.id, action: 'edit', code, note: `workstream document ${id} removed` },
        tx,
      )
      return row
    })
    await this.storage.remove(gone.storageKey).catch((error: unknown) => {
      this.log.warn(`workstream document: could not remove ${gone.storageKey} — ${String(error)}`)
    })
  }

  private async fence(who: Actor, code: ObjectCode): Promise<void> {
    const found = await this.runs.byCode(who, code)
    if (!found || !found.inScope) throw notFound('hành trình', code)
  }
}

/** A shelf, not an archive; and a cap on declares nobody confirmed, so a loop
 *  of declare calls cannot fill the table. */
const MAX_DOCUMENTS = 100
const MAX_PENDING = 20

/** Server-made; scanned files carry other keys, so this door cannot delete them. */
const keyOf = (code: string, id: string) => `workstream-doc/${code}/${id}`
