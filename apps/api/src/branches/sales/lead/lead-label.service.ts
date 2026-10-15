import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LEAD_OPEN_STATES,
  LEAD_STATE_LABEL,
  type LeadLabelsBody,
  type LeadProfile,
  type LeadState,
  type ObjectCode,
} from '@pv/contracts'
import { conflict } from '@api/platform/http/problem'
import { LeadExitService } from './lead-exit.service'
import { LeadLabelRepository } from './lead-label.repository'
import { LeadService } from './lead.service'
import { LeadWriteRepository } from './lead-write.repository'

/** `PUT /sales/leads/:code/labels` — waiting labels (ADR 0097 §5), by whoever
 *  may edit the lead, in any open state. Scoped and locked exactly like the
 *  lifecycle doors (`LeadExitService`), so a lead handed away meanwhile is refused. */
@Injectable()
export class LeadLabelService {
  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly labels: LeadLabelRepository,
    private readonly doors: LeadExitService,
    private readonly profiles: LeadService,
  ) {}

  async put(who: Actor, code: ObjectCode, body: LeadLabelsBody): Promise<LeadProfile> {
    await this.doors.inScope(who, code)

    await this.repo.run(async (tx) => {
      const held = await this.doors.lockRow(tx, who, code)
      if (!(LEAD_OPEN_STATES as readonly LeadState[]).includes(held.state)) {
        throw conflict(
          `Lead ${code} đang ở “${LEAD_STATE_LABEL[held.state]}” nên không gắn nhãn được.`,
        )
      }
      const allowed = await this.labels.allowed(tx, code, body.labelIds)
      if (body.labelIds.some((id) => !allowed.has(id))) {
        throw conflict('Có nhãn không còn dùng được. Tải lại rồi chọn lại.')
      }
      await this.labels.replace(tx, code, body.labelIds)
    })

    return this.profiles.profile(who, code)
  }
}
