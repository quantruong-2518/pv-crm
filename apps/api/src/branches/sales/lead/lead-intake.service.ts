import { Injectable } from '@nestjs/common'
import { LeadIntakeResponse, type LeadIntakeBody, type LeadIntakeQuery } from '@pv/contracts'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { isDbConstraint } from '@api/platform/http/db-error'
import { fromIntake, refOf } from './lead-write.mapper'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadIntakeRepository, type IntakeClient } from './lead-intake.repository'

@Injectable()
export class LeadIntakeService {
  constructor(
    private readonly intake: LeadIntakeRepository,
    private readonly writes: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly mirror: ObjectMirror,
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

    try {
      await this.writes.run(async (tx) => {
        await this.mirror.put(tx, refOf(code, write))
        await this.writes.insertLandingLead(tx, { ...write.values, code })
        await this.intake.writeAttempt(tx, { ...attempt, status: 'accepted', leadCode: code })
      })
    } catch (error) {
      if (!isDbConstraint(error, 'lead_email_live_idx')) throw error

      /* Record attribution for a repeated submit, but never tell the public
         caller whether this mailbox already existed. */
      const existing = await this.writes.liveByEmail(this.writes.readonlyHandle, [body.email])
      await this.intake.writeAttempt(this.intake.handle, {
        ...attempt,
        status: 'duplicate',
        leadCode: existing.get(body.email),
      })
    }

    return LeadIntakeResponse.parse({ accepted: true })
  }
}
