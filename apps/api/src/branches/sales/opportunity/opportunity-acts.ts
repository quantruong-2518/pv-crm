import { Inject, Injectable } from '@nestjs/common'
import { seatedIn, type AccessControl, type Actor, type Permission } from '@pv/engines'
import type { OpportunityAct, OpportunityProfileResponse } from '@pv/contracts'
import { ApprovalService } from '@api/platform/approval/approval.service'
import { ACCESS } from '@api/platform/engines/tokens'
import { acceptVerdict } from './opportunity-accept.service'
import { assignVerdict } from './opportunity-assign.service'
import {
  boardVerdict,
  careVerdict,
  dealAtOf,
  OpportunityLifecycle,
  vnDay,
} from './opportunity-lifecycle'
import { SIGN_APPROVERS, signFactsOf, signVerdict } from './opportunity-sign.service'
import { scopeRefOf } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'
import type { OpportunityRowDb } from './opportunity.schema'

/** The profile's `acts` and `floors`: for each door, this reader's permission
 *  (E2, scoped like the door's `@Need`) and then the door's OWN predicate —
 *  `careVerdict`, `signVerdict`, `boardVerdict`, `acceptVerdict`,
 *  `assignVerdict`, `editVerdict`. No rule is restated here; a door that
 *  changes its guard changes what the screen is told. */

/** The profile save door and the contacts door: a stopped deal is frozen. */
export function editVerdict(row: OpportunityRowDb): OpportunityAct {
  return row.state === 'lost'
    ? {
        ok: false,
        reason: `Cơ hội ${row.code} đã dừng — không sửa được nữa. Muốn chăm lại thì đi từ lead.`,
      }
    : { ok: true }
}

type Verdicts = Pick<OpportunityProfileResponse, 'acts' | 'floors'>

@Injectable()
export class OpportunityActs {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
    private readonly approvals: ApprovalService,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async of(who: Actor, found: OpportunityRead, pendingSign: boolean): Promise<Verdicts> {
    const deal = dealAtOf(found, pendingSign)
    const handle = this.deals.readonlyHandle
    const [chain, quoted, floor] = await Promise.all([
      this.approvals.chainFor(SIGN_APPROVERS),
      this.deals.hasTouch(handle, found.row.code, 'quotation-sent'),
      this.lifecycle.floors(handle, deal),
    ])
    const ref = scopeRefOf(found.row, found.owners, who)
    /* Permission first: a reader who may not press the door is told so, not
       why the deal would refuse. `accept` is the one unscoped door. */
    const gate = (permission: Permission, rule: OpportunityAct, scoped = true): OpportunityAct => {
      const v = this.access.check(who, { branch: 'Sales', permission, ...(scoped ? { ref } : {}) })
      return v.ok ? rule : { ok: false, reason: v.note }
    }
    const approverSeat = chain.some((link) => seatedIn(link, who))
    const acts = {
      activity: gate('opportunity.edit', careVerdict(deal, 'activity')),
      quotation: gate('opportunity.edit', careVerdict(deal, 'quotation')),
      sign: gate(
        'opportunity.close',
        signVerdict({ ...signFactsOf(found, quoted), pendingSign, approverSeat }),
      ),
      stop: gate('opportunity.edit', boardVerdict(deal, 'dừng')),
      accept: gate('opportunity.accept', acceptVerdict(found, pendingSign), false),
      assign: gate('opportunity.assign', assignVerdict(deal)),
      edit: gate('opportunity.edit', editVerdict(found.row)),
    }
    return {
      acts,
      floors: {
        activityFrom: acts.activity.ok ? vnDay(floor.activity) : null,
        quotationFrom: acts.quotation.ok ? vnDay(floor.quotation) : null,
      },
    }
  }
}
