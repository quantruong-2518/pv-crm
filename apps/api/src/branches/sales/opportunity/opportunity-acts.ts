import { Inject, Injectable } from '@nestjs/common'
import { seatedIn, type AccessControl, type Actor, type Permission } from '@pv/engines'
import type { OpportunityAct, OpportunityProfileResponse, OpportunityUpdate } from '@pv/contracts'
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
  type DealAt,
} from './opportunity-lifecycle'
import { SIGN_APPROVERS, signFactsOf, signVerdict } from './opportunity-sign.service'
import { scopeRefOf } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'
import type { OpportunityRowDb } from './opportunity.schema'

/** The profile's `acts` and `floors`: for each door, this reader's permission
 *  (E2, scoped like the door's `@Need`) and then the door's OWN predicate —
 *  `careVerdict`, `signVerdict`, `boardVerdict`, `acceptVerdict`,
 *  `assignVerdict`, `editTermsVerdict`, `editDetailsVerdict`. No rule is
 *  restated here; a door that changes its guard changes what the screen is told. */

/** Contacts, description, attachments (ADR 0077 §5): editable until lost. Gates
 *  the profile save door and the contacts door. */
export function editDetailsVerdict(row: OpportunityRowDb): OpportunityAct {
  return row.state === 'lost'
    ? {
        ok: false,
        reason: `Cơ hội ${row.code} đã dừng — không sửa được nữa. Muốn chăm lại thì đi từ lead.`,
      }
    : { ok: true }
}

/** Amount, expected close, products (ADR 0077 §5): what a sign request names,
 *  so locked while one waits and once a contract is signed. */
export function editTermsVerdict(deal: DealAt): OpportunityAct {
  const code = deal.row.code
  const terms = 'giá trị, ngày dự kiến chốt và sản phẩm'
  if (deal.row.state === 'lost') return editDetailsVerdict(deal.row)
  if (deal.signed) {
    return { ok: false, reason: `Cơ hội ${code} đã ký hợp đồng — ${terms} không sửa được nữa.` }
  }
  if (deal.pendingSign) {
    return {
      ok: false,
      reason: `Cơ hội ${code} đang chờ duyệt ký — chờ duyệt hoặc từ chối đề nghị trước khi sửa ${terms}.`,
    }
  }
  return { ok: true }
}

/** The body changes a term `editTermsVerdict` guards. Products compare as a set;
 *  an absent probability is a cleared one (`fromUpdate`), so it compares as `null`. */
export function touchesTerms(
  found: Pick<OpportunityRead, 'row' | 'products'>,
  body: OpportunityUpdate,
): boolean {
  const had = new Set(found.products.map((p) => p.id))
  return (
    body.amount !== found.row.amount ||
    body.currency !== found.row.currency ||
    body.expectedClose !== found.row.expectedClose ||
    (body.probability ?? null) !== found.row.probability ||
    had.size !== body.products.length ||
    body.products.some((id) => !had.has(id))
  )
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

  /** `acts.assign` as a yes/no for the book's rows: the same permission gate and
   *  `assignVerdict` the profile uses, so the two screens cannot disagree. */
  canAssign(who: Actor, found: OpportunityRead, pendingSign: boolean): boolean {
    const ref = scopeRefOf(found.row, found.owners, who)
    const v = this.access.check(who, { branch: 'Sales', permission: 'opportunity.assign', ref })
    return v.ok && assignVerdict(dealAtOf(found, pendingSign)).ok
  }

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
      editTerms: gate('opportunity.edit', editTermsVerdict(deal)),
      editDetails: gate('opportunity.edit', editDetailsVerdict(found.row)),
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
