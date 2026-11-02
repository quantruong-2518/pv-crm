import { Controller, Get, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { AiReadListResponse, AiReadQuery } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { AuditRepository } from './audit.repository'

/** `/audit` — the trail of what the AI read (ADR 0134, question 142).
 *
 *  No `branch`: the trail covers every line the AI reads, not one product line.
 *  `scoped`: a whole-book reader sees every line, an own-only reader their own
 *  (`AuditRepository.aiReads`). A line holds no question or result to trim, so
 *  rows go out as stored. `hidden` stays 0 for both: counting the lines cut from
 *  an own-only reader would tell them others read that code, which is the leak
 *  the scope closes. */
@Controller('audit')
export class AuditController {
  constructor(private readonly audits: AuditRepository) {}

  @Get('ai-reads')
  @Need({ permission: 'ai-read.view', scoped: true })
  async aiReads(
    @CurrentActor() who: Actor,
    @Query(zod(AiReadQuery)) q: AiReadQuery,
  ): Promise<AiReadListResponse> {
    const { rows, total } = await this.audits.aiReads(who, q)
    const stamped = rows.map((r) => ({ ...r, at: r.at.toISOString() }))
    return AiReadListResponse.parse({ rows: stamped, total, hidden: 0 })
  }
}
