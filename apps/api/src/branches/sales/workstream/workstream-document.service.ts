import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  LeadAttachmentsResponse,
  WorkstreamDocumentDeclareResponse,
  type ObjectCode,
  type WorkstreamDocumentDeclareBody,
  type WorkstreamDocumentStep,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, invalid, notFound } from '@api/platform/http/problem'
import { StorageService } from '@api/platform/storage/storage.service'
import { assertMayWriteContract } from '../contract/contract-writer'
import { toAttachment } from '../lead/lead-scan.mapper'
import { WorkstreamDocumentRepository } from './workstream-document.repository'
import { WorkstreamRepository } from './workstream.repository'

/** Documents of a run through a presigned PUT, comm-attachment's flow:
 *  declare → PUT straight to storage → `uploaded`. Every door asks the run's
 *  own read fence (widened, see `fence`) and answers the same 404 for "no such
 *  run" and "not yours", as `WorkstreamService.profile` does. Storage calls run outside the
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
    /* Scan sources are the LEAD's files: only its holder reads them here. A
       closer reads only the files of the contracts they closed. */
    const at = await this.fence(who, code)
    const withScans = at.arm === 'lead' && this.access.allows(who, 'lead.view')
    const rows = await this.repo.listOf(code, withScans)
    const out = []
    for (const a of rows.filter((r) => at.arm !== 'closer' || ownsStep(at.papers, r.step))) {
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
    const step = stepFor(await this.fence(who, code), body.step)
    if (step && !(await this.repo.stepInRun(code, step))) {
      throw invalid({ step: ['Mục gắn tệp không thuộc hành trình này.'] })
    }
    /* A contract's or instalment's file is a contract write (ADR 0110 §2). */
    if (step && step.kind !== 'quotation') {
      assertMayWriteContract(who, (await this.repo.closerOf(step.contractCode)) ?? null)
    }
    const { kept, pending } = await this.repo.load(code, who.id)
    if (kept >= MAX_DOCUMENTS || pending >= MAX_PENDING) {
      throw invalid({ name: ['Hành trình đã đủ số tài liệu cho phép. Xoá bớt trước khi thêm.'] })
    }
    const id = randomUUID()
    const storageKey = keyOf(code, id)
    await this.repo.insert(
      {
        id,
        storageKey,
        name: body.name,
        mime: body.mime,
        bytes: body.bytes,
        sha256: body.sha256,
        ownerKind: 'workstream',
        createdBy: who.id,
      },
      step,
    )
    const putUrl = await this.storage.presignPut(storageKey, body.mime, body.bytes)
    return WorkstreamDocumentDeclareResponse.parse({ id, putUrl })
  }

  /** Trusts the caller that the PUT landed, as lead-scan's `start` does. */
  async uploaded(who: Actor, code: ObjectCode, id: string): Promise<void> {
    await this.fence(who, code)
    /* The PUT was signed for this exact length, so a different size means the
       bytes are not the ones declared. Absent: the PUT never landed. */
    const held = await this.storage.size(keyOf(code, id))
    const declared = await this.repo.bytesOf(keyOf(code, id), code)
    if (held === null || declared === null || held !== declared) throw notFound('tệp', id)
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

  /** The lead's holder, then whoever stands on a deal of the run (ADR 0090),
   *  then a closer of one of its contracts, for that contract's files only.
   *  Answers WHICH arm let the actor in. Asks the holder itself, not the run
   *  scope (ADR 0110 §3): only the holder reads the lead's scans. */
  private async fence(who: Actor, code: ObjectCode): Promise<Arm> {
    const found = await this.runs.byCode(who, code)
    if (found?.inScope && (!who.ownOnly || found.lead.ownerId === who.id)) return { arm: 'lead' }
    if (found && (await this.repo.standsOnDeal(who, code))) return { arm: 'deal' }
    const papers = found ? await this.repo.closedInRun(who, code) : []
    if (papers.length > 0) return { arm: 'closer', papers }
    throw notFound('hành trình', code)
  }
}

/** Which arm let the actor in; a closer carries the contracts they closed. */
type Arm = { arm: 'lead' | 'deal' } | { arm: 'closer'; papers: string[] }

/** A closer's file must hang on a contract they closed: an untagged upload
 *  (the contract page sends none) lands on their one paper of the run. */
function stepFor(at: Arm, step: WorkstreamDocumentStep | undefined) {
  if (at.arm !== 'closer') return step
  if (step && step.kind !== 'quotation') return step
  const [only, ...more] = at.papers
  if (step || !only || more.length > 0) throw denied('permission-denied', CLOSER_ONLY)
  return { kind: 'contract' as const, contractCode: only }
}

const CLOSER_ONLY = 'Bạn chỉ thêm được tệp vào hợp đồng mình chốt. Mở hợp đồng đó rồi thêm tệp.'

/** A listed file belongs to one of the closer's contracts. */
const ownsStep = (papers: readonly string[], step: { contractCode: string | null } | null) =>
  !!step?.contractCode && papers.includes(step.contractCode)

/** A shelf, not an archive; and a cap on declares nobody confirmed, so a loop
 *  of declare calls cannot fill the table. */
const MAX_DOCUMENTS = 100
const MAX_PENDING = 20

/** Server-made; scanned files carry other keys, so this door cannot delete them. */
const keyOf = (code: string, id: string) => `workstream-doc/${code}/${id}`
