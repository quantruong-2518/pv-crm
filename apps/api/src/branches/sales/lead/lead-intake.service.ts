import { Injectable } from '@nestjs/common'
import {
  LeadIntakeResponse,
  ORIGIN_NAME_MAX,
  originKey,
  type LeadIntakeBody,
  type LeadIntakeQuery,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { incomingOf } from './lead-admission.mapper'
import { LeadAdmissionService } from './lead-admission.service'
import { fromIntake, LEAD_NOTE } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadWriteService } from './lead-write.service'
import { LeadIntakeRepository, type IntakeClient } from './lead-intake.repository'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LeadOriginService } from '../lead-origin/lead-origin.service'

@Injectable()
export class LeadIntakeService {
  constructor(
    private readonly intake: LeadIntakeRepository,
    private readonly writes: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly births: LeadWriteService,
    private readonly runs: WorkstreamRepository,
    private readonly origins: LeadOriginService,
    private readonly gate: LeadAdmissionService,
  ) {}

  async accept(
    query: LeadIntakeQuery,
    body: LeadIntakeBody,
    client: IntakeClient,
  ): Promise<LeadIntakeResponse> {
    const attempt = { query, ...client }

    /* A bot filling the hidden field gets the same 202 as a human. Revealing
       the trap teaches the bot which field to stop filling. */
    if (body.website.trim() !== '') {
      await this.intake.writeAttempt(this.intake.handle, { ...attempt, status: 'honeypot' })
      return LeadIntakeResponse.parse({ accepted: true })
    }

    const write = fromIntake(body)
    const code = await this.leads.nextCode()
    const run = await this.runs.nextCode()

    /* No live-email fence any more (ADR 0070): a second lead on one mailbox is
       written and flagged by the book's `duplicateOf`, never refused here. */
    await this.writes.run(async (tx) => {
      /* Anonymous, so this door never refuses and never asks. Only the SAME
         person on an open lead re-enters it; a colleague or a second enquiry
         opens a lead on the matched company, so the alert below still goes out. */
      const admitted = await this.gate.admit(tx, null, incomingOf('0', { ...body, people: [body] }))
      if (admitted.verdict === 'same-lead' && admitted.leadCode) {
        await this.gate.reenter(tx, admitted.leadCode, [], null, 'LANDING_PAGE')
        await this.intake.writeAttempt(tx, {
          ...attempt,
          status: 'duplicate',
          leadCode: admitted.leadCode,
        })
        /* No alert: a repeated submit is the same lead (see `notify`). */
        return
      }
      const origin = await this.originOf(tx, query.utm_source)
      /* The same birth every other door makes (company edge, primary contact,
         first touch, the pool watchers' bell) — this door only adds its attempt row. */
      await this.births.bear(tx, {
        code,
        run,
        write,
        extra: {
          campaignId: null,
          originId: origin.id,
          originRaw: origin.raw,
          partnerCode: null,
        },
        who: null,
        owner: null,
        note: LEAD_NOTE.landing,
        accountCode: admitted.accountCode,
      })
      await this.intake.writeAttempt(tx, { ...attempt, status: 'accepted', leadCode: code })
    })

    return LeadIntakeResponse.parse({ accepted: true })
  }

  /** `utm_source` → an EXISTING origin, blank → Website. Lookup only: an
   *  anonymous caller must not grow the catalog, so an unknown source keeps
   *  `origin_id` null and its text in `origin_raw` for a person to file later. */
  private async originOf(
    tx: Db,
    utm: string | undefined,
  ): Promise<{ id: string | null; raw: string | null }> {
    const typed = utm !== undefined && originKey(utm) !== '' ? utm.trim() : undefined
    const found = await this.origins.findLive(tx, typed ?? 'Website')
    return { id: found?.id ?? null, raw: typed?.slice(0, ORIGIN_NAME_MAX) ?? null }
  }
}
