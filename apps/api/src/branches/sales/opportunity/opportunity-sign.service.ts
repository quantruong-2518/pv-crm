import { Injectable } from '@nestjs/common'
import { seatedIn, type Actor, type RoleId } from '@pv/engines'
import {
  CONTRACT_KIND_LABEL,
  ConfigProposalReceipt,
  ContractSignProposal,
  type ContractSign,
  type ObjectCode,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { ApprovalService, type ApprovalApplier } from '@api/platform/approval/approval.service'
import type { ApprovalRowDb } from '@api/platform/approval/approval.schema'
import { ContractRepository } from '../contract/contract.repository'
import { fromSign } from '../contract/contract.mapper'
import { dropStep } from '../next-step/next-step.handover'
import { TouchService } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { closeForSign, NOTE, stageEventOf, toRef } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'

/** Signing a deal, through E3 (ADR 0057 §7).
 *
 *  The door (`propose`) writes no contract: it checks everything the approval
 *  would check — scope, state — and raises a `contract-sign` request, so an
 *  approver is never asked to say yes to something that would fail. The
 *  contract is written by `apply`, inside the transaction that settles the
 *  approval, with the RAISER as the signing actor: they reported the
 *  signature, the approver only confirmed it.
 *
 *  A won deal may sign again (ADR 0069 §5): each request carries its own amount,
 *  currency and kind, writes its own contract, and leaves the deal's columns
 *  alone — only the FIRST signature takes the deal off the board.
 *
 *  Signing had no post-commit side effect before E3 (no mail, no queue), so
 *  nothing had to move out of the transaction. */
@Injectable()
export class OpportunitySign implements ApprovalApplier {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly contracts: ContractRepository,
    private readonly workstreams: WorkstreamRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly approvals: ApprovalService,
  ) {}

  /** `POST /sales/opportunities/:code/contract` — 202 with a receipt.
   *
   *  Checked twice: on the pool to fail fast, then again under the deal's row
   *  lock with the request opened in that same transaction — a stop takes the
   *  same lock and refuses a deal with a sign waiting, so the two serialise. */
  async propose(who: Actor, code: ObjectCode, body: ContractSign): Promise<ConfigProposalReceipt> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    const pending = await this.approvals.pendingOn(code)
    await this.assertProposable(this.deals.readonlyHandle, found, body, pending.some(isSign))

    /* On the pool, before the lock: PGlite has one connection, so a pool read
       inside the transaction would wait on the transaction forever. */
    const chain = await this.approvals.chainFor(SIGN_APPROVERS)
    if (chain.some((link) => seatedIn(link, who))) {
      throw conflict(
        'Bạn đang giữ ghế duyệt ký nên không tự gửi đề nghị ký được — nhờ một sale đứng đơn gửi.',
      )
    }

    const request = await this.deals.run(async (tx) => {
      const lock = await this.deals.lockDeal(tx, code)
      const fresh = lock ? await this.deals.byCode(who, code, tx) : null
      if (!lock || !fresh || !fresh.inScope) throw notFound('cơ hội', code)
      await this.assertProposable(tx, fresh, body, lock.pendingSign)

      /* `signedAt` frozen at the press: the person reporting the signature knows
         when the pen moved, the approval days later does not. */
      const proposal: ContractSignProposal = {
        opportunityCode: code,
        sign: { ...body, signedAt: body.signedAt ?? new Date().toISOString() },
      }
      const draft = {
        kind: 'contract-sign' as const,
        consequence: consequenceOf(fresh, body),
        payload: proposal,
        chain,
        links: [{ objectCode: code, objectLabel: fresh.row.name }],
      }
      return this.approvals.open(who, draft, tx)
    })

    return ConfigProposalReceipt.parse({ requestId: request.id, state: request.state })
  }

  /** Every refusal the door makes about the deal and the body, in the order
   *  they have always been made: 409 lost / no quotation, 422 owner, 409 a sign
   *  already waiting. */
  private async assertProposable(
    handle: Db,
    found: OpportunityRead,
    body: ContractSign,
    pendingSign: boolean,
  ): Promise<void> {
    await this.assertSignable(handle, found)
    /* Commission follows a Sale standing on the deal, never a stranger. Owners
       are frozen while the request waits (`touchesSignTerms`). */
    if (body.ownerId !== undefined && !isSaleOwner(found, body.ownerId)) {
      throw invalid(
        { ownerId: ['Người hưởng hoa hồng phải là một Sale đứng tên cơ hội này.'] },
        'Người hưởng hoa hồng không hợp lệ.',
      )
    }
    if (pendingSign) throw conflict(`Cơ hội ${found.row.code} đã có một yêu cầu ký đang chờ duyệt.`)
  }

  /** `ApprovalApplier` for `contract-sign`. Everything is checked again against
   *  the deal as it is NOW; a refusal rolls the approval back to waiting. */
  async apply(tx: Db, request: ApprovalRowDb): Promise<void> {
    const { opportunityCode: code, sign } = ContractSignProposal.parse(request.payload)
    /* Lock first: an edit racing this approval waits, or has already landed. */
    if (!(await this.deals.lockDeal(tx, code))) throw notFound('cơ hội', code)
    const found = await this.deals.byCode(null, code, tx)
    if (!found) throw notFound('cơ hội', code)
    await this.assertSignable(tx, found)

    await this.write(tx, found, sign, { id: request.raisedById, name: request.raisedBy })
  }

  /** Two 409s: the body is fine, the deal is not. A won deal passes (sign again).
   *
   *  The second one is the quotation gate (ADR 0064 §3): no FIRST contract
   *  without a quotation having been sent, which is a `quotation-sent` touch and
   *  nothing else. Read as a fact rather than off `stage`, because a deal can
   *  only be standing in `quotation` BECAUSE that touch exists — and a deal
   *  signed after somebody backdated its column would slip through a stage check. */
  private async assertSignable(handle: Db, found: OpportunityRead): Promise<void> {
    const code = found.row.code
    if (found.row.state === 'lost') {
      throw conflict(`Cơ hội ${code} đã dừng — không ký được. Muốn chăm lại thì đi từ lead.`)
    }
    if (found.signed) return
    if (!(await this.deals.hasTouch(handle, code, 'quotation-sent'))) {
      throw conflict(`Cơ hội ${code} chưa gửi quotation — ghi mốc Quotation trước khi ký.`)
    }
  }

  /** The signature itself, in the caller's transaction: contract row, its
   *  mirror row and the edge, the run, touches — and on the FIRST signature the
   *  deal leaving the board, its mirror row and its next step dropped (§10).
   *  Mirror row BEFORE the contract row — `sales.contract.code` has a foreign
   *  key into `platform.object`, checked per statement. */
  private async write(
    tx: Db,
    found: OpportunityRead,
    body: ContractSign,
    by: { id: string; name: string },
  ): Promise<void> {
    const code = found.row.code
    const contractCode = await this.contracts.nextCode(tx)
    const values = fromSign(body, contractCode, found.row, found.holder?.id ?? null, new Date())
    const signedAt = values.signedAt
    const ownerId = values.ownerId ?? null
    const ownerName =
      ownerId === null ? null : ((await this.deals.actorNames(tx, [ownerId])).get(ownerId) ?? null)

    const row = found.signed
      ? found.row
      : await this.deals.updateOpportunity(tx, code, closeForSign(signedAt))
    await this.mirror.put(tx, {
      code: contractCode,
      kind: 'HĐ',
      branch: 'Sales',
      label: `${found.account} · ${row.name}`,
      ...(ownerId && ownerName ? { owner: ownerName, ownerId } : {}),
      amount: body.amount,
    })
    await this.contracts.insert(tx, values)
    if (row.workstreamCode) await this.workstreams.syncClosed(tx, [row.workstreamCode])
    if (!found.signed) await this.leaveBoard(tx, found, row, contractCode, by, signedAt)
    await this.mirror.link(tx, { from: code, to: contractCode, kind: 'spawned' })

    const actor = { by: by.name, actorId: by.id }
    const note = NOTE.signed(contractCode)
    await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'opportunity',
        kind: 'signed',
        ...actor,
        note,
        at: signedAt,
      },
      {
        subjectCode: row.leadCode,
        subjectKind: 'lead',
        kind: 'signed',
        ...actor,
        note,
        at: signedAt,
      },
    ])
  }

  /** The first signature only: the funnel's exit row (a deal standing in no
   *  column has none to leave), the deal's mirror row, its next step dropped. */
  private async leaveBoard(
    tx: Db,
    found: OpportunityRead,
    row: OpportunityRead['row'],
    contractCode: string,
    by: { id: string; name: string },
    signedAt: Date,
  ): Promise<void> {
    const code = found.row.code
    if (found.row.stage !== null) {
      await this.deals.insertStageEvent(
        tx,
        stageEventOf({
          code,
          from: found.row.stage,
          to: null,
          stageSince: found.row.stageSince,
          at: signedAt,
          by,
          note: NOTE.signed(contractCode),
        }),
      )
    }
    await this.mirror.put(tx, toRef(row, found.holder))
    await dropStep(tx, code)
  }
}

const isSign = (r: ApprovalRowDb): boolean => r.kind === 'contract-sign'

const isSaleOwner = (found: OpportunityRead, id: string): boolean =>
  found.owners.some((o) => o.role === 'SALE' && o.id === id)

/** Who says yes to a signature: one link, the director — the same policy the
 *  sales config proposals follow (`config.approval.ts`). A second approver is a
 *  policy decision, one line here. */
const SIGN_APPROVERS: RoleId[] = ['director']

/** What the approver reads instead of the payload: deal, customer, kind, amount. */
function consequenceOf(found: OpportunityRead, body: ContractSign): string {
  const money = `${body.amount.toLocaleString('vi-VN')} ${body.currency}`
  return `Ký hợp đồng ${CONTRACT_KIND_LABEL[body.kind]} cho cơ hội ${found.row.code} · ${found.account} · ${money}`
}
