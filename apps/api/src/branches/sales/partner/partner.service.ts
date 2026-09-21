import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  PartnerCreateResponse,
  PartnerListResponse,
  PartnerPatchResponse,
  type PartnerCreate,
  type PartnerListQuery,
  type PartnerPatch,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { invalid, notFound } from '@api/platform/http/problem'
import { toContract } from './partner.mapper'
import { PartnerRepository } from './partner.repository'

/** The partner book: list, add, tidy, and `live` — the lookup the lead write
 *  doors call inside their own transaction. No delete; see `partner.schema.ts`. */
@Injectable()
export class PartnerService {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly audit: AuditRepository,
    /* One axis-1 question — may this caller see hidden partners — hence `allows`. */
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** `q.motion` is ignored — a partner belongs to no motion. Hidden rows are
   *  for those who tidy the book; anyone else asking for them gets live ones. */
  async list(who: Actor, q: PartnerListQuery): Promise<PartnerListResponse> {
    const includeInactive = !!q.includeInactive && this.access.allows(who, 'lead-origin.manage')
    const rows = await this.repo.list({ ...(q.q ? { q: q.q } : {}), includeInactive })
    return PartnerListResponse.parse({ rows: rows.map(toContract) })
  }

  async create(who: Actor, body: PartnerCreate): Promise<PartnerCreateResponse> {
    const row = await this.repo.run(async (tx) => {
      await this.assertOrigin(tx, body.originId)
      const code = await this.repo.nextCode(tx)
      const written = await this.repo.insert(tx, { code, ...body, createdBy: who.id })
      await this.note(tx, who.id, { kind: 'partner-create', code, ...body })
      return written
    })
    return PartnerCreateResponse.parse(toContract(row))
  }

  async patch(who: Actor, code: string, body: PartnerPatch): Promise<PartnerPatchResponse> {
    const row = await this.repo.run(async (tx) => {
      if (body.originId !== undefined) await this.assertOrigin(tx, body.originId)
      const written = await this.repo.update(tx, code, body)
      if (!written) throw notFound('đối tác', code)
      /* A lead's origin is a snapshot taken at intake: re-filing the partner leaves them. */
      const snapshot = body.originId !== undefined ? { existingLeadsKeepOrigin: true } : {}
      await this.note(tx, who.id, { kind: 'partner-patch', code, ...body, ...snapshot })
      return written
    })
    return PartnerPatchResponse.parse(toContract(row))
  }

  /** An active partner by code, or null — hidden counts as absent. */
  async live(
    db: Db,
    code: string,
  ): Promise<{ code: string; name: string; originId: string } | null> {
    const row = await this.repo.byCode(db, code)
    return row?.active ? { code: row.code, name: row.name, originId: row.originId } : null
  }

  private async assertOrigin(tx: Db, originId: string): Promise<void> {
    if (!(await this.repo.originOffered(tx, originId))) {
      throw invalid({
        originId: ['Nguồn phải đang bật và thuộc một phương án hỏi mã giới thiệu.'],
      })
    }
  }

  private note(tx: Db, actorId: string, payload: Record<string, unknown>): Promise<void> {
    return this.audit.write({ actorId, action: 'edit', note: JSON.stringify(payload) }, tx)
  }
}
