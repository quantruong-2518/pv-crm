import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { LeadDisableResponse, type LeadDisableBody } from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { notFound } from '@api/platform/http/problem'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { LeadDisableRepository } from './lead-disable.repository'

/** Why a switched-off lead's unsent mail is held — on the lead's own letters
 *  and on its deals' alike, so the delivery rows read the same. */
const LEAD_DISABLED_WITHHOLD = {
  code: 'lead-disabled',
  summary: 'lead đã bị vô hiệu hoá: thư chưa gửi bị giữ lại',
} as const

/** `POST /sales/leads/disabled` — switch leads off, or back on.
 *
 *  ONE transaction: the stamp on `sales.lead` is the fact, and the mirror rows
 *  (which the graph and comms read), the withheld mail and the audit line all
 *  describe that fact — any of them landing without it is a lie. No state
 *  move and no touch: `state` is kept so switching on restores the lead where
 *  it stood, and the audit row is the record.
 *
 *  Switching back on does NOT release the withheld letters, as reopen does not
 *  (ADR 0068 §5): mail held weeks ago must not leave unannounced. */
@Injectable()
export class LeadDisableService {
  constructor(
    private readonly repo: LeadDisableRepository,
    private readonly mirror: ObjectMirror,
    private readonly mailRuns: MailRunRepository,
    private readonly audit: AuditRepository,
  ) {}

  async set(who: Actor, body: LeadDisableBody): Promise<LeadDisableResponse> {
    const codes = [...new Set(body.codes)]

    const changed = await this.repo.run(async (tx) => {
      const rows = await this.repo.lock(tx, codes)
      const known = new Set(rows.map((r) => r.code))
      const missing = codes.filter((c) => !known.has(c))
      if (missing.length > 0) throw notFound('lead', missing.join(', '))

      /* Already in the asked state = skipped: re-disabling must not move the
         first stamp, the date the screen prints (`UsersService.patch`'s rule). */
      const moving = rows
        .filter((r) => (r.disabledAt !== null) !== body.disabled)
        .map((r) => r.code)
      if (moving.length === 0) return []

      const at = body.disabled ? new Date() : null
      await this.repo.stamp(tx, moving, at ? { at, by: who.id } : null)

      /* No run code: `ObjectKind` has no `'WS'`, so a run has no mirror row. */
      const { contacts, deals, contracts } = await this.repo.hangingOff(tx, moving)
      await this.mirror.setDisabled(tx, [...moving, ...contacts, ...deals, ...contracts], at)

      if (body.disabled) await this.withhold(tx, moving, deals)

      for (const code of moving) {
        await this.audit.write(
          {
            actorId: who.id,
            action: 'edit',
            code,
            note: body.disabled ? `vô hiệu hoá lead ${code}` : `bật lại lead ${code}`,
          },
          tx,
        )
      }
      return moving
    })

    return LeadDisableResponse.parse({ changed })
  }

  /** Queued letters to the lead (`'lead'`) and from its deal book
   *  (`'opportunity'`) — the ledger files them under two aggregate types. */
  private async withhold(
    tx: Db,
    leads: readonly string[],
    deals: readonly string[],
  ): Promise<void> {
    const subjects = [
      ...leads.map((aggregateId) => ({ aggregateType: 'lead', aggregateId })),
      ...deals.map((aggregateId) => ({ aggregateType: 'opportunity', aggregateId })),
    ]
    for (const subject of subjects) {
      await this.mailRuns.withholdSubject(tx, subject, LEAD_DISABLED_WITHHOLD)
    }
  }
}
