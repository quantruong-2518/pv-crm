import { Injectable } from '@nestjs/common'
import type { Actor, RoleId } from '@pv/engines'
import {
  ConfigProposalReceipt,
  ContractSignProposal,
  type ContractSign,
  type ObjectCode,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { ApprovalService, type ApprovalApplier } from '@api/platform/approval/approval.service'
import type { ApprovalRowDb } from '@api/platform/approval/approval.schema'
import { ContractRepository } from '../contract/contract.repository'
import { fromSign } from '../contract/contract.mapper'
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

  /** `POST /sales/opportunities/:code/contract` — 202 with a receipt. */
  async propose(who: Actor, code: ObjectCode, body: ContractSign): Promise<ConfigProposalReceipt> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    this.assertSignable(found)

    const pending = await this.approvals.pendingOn(code)
    if (pending.some((r) => r.kind === 'contract-sign')) {
      throw conflict(`Cơ hội ${code} đã có một yêu cầu ký đang chờ duyệt.`)
    }

    /* `signedAt` frozen at the press: the person reporting the signature knows
       when the pen moved, the approval days later does not. A race past the
       check above dies on `approval_contract_sign_waiting_uq` (409 via the book). */
    const proposal: ContractSignProposal = {
      opportunityCode: code,
      sign: { ...body, signedAt: body.signedAt ?? new Date().toISOString() },
    }
    /* The chain is frozen on the row now, so a raiser holding a seat on it
       would approve their own signature — matched by name, as `decideOn` does. */
    const chain = await this.approvals.chainFor(SIGN_APPROVERS)
    if (chain.some((link) => link.person === who.name)) {
      throw conflict(
        'Bạn đang giữ ghế duyệt ký nên không tự gửi đề nghị ký được — nhờ một sale đứng đơn gửi.',
      )
    }
    const request = await this.approvals.open(who, {
      kind: 'contract-sign',
      consequence: consequenceOf(found, body),
      payload: proposal,
      chain,
      links: [{ objectCode: code, objectLabel: found.row.name }],
    })

    return ConfigProposalReceipt.parse({ requestId: request.id, state: request.state })
  }

  /** `ApprovalApplier` for `contract-sign`. Everything is checked again against
   *  the deal as it is NOW; a refusal rolls the approval back to waiting. */
  async apply(tx: Db, request: ApprovalRowDb): Promise<void> {
    const { opportunityCode: code, sign } = ContractSignProposal.parse(request.payload)
    /* Lock first: an edit racing this approval waits, or has already landed. */
    if (!(await this.deals.lockDeal(tx, code))) throw notFound('cơ hội', code)
    const found = await this.deals.byCode(null, code, tx)
    if (!found) throw notFound('cơ hội', code)
    this.assertSignable(found)

    await this.write(tx, found, sign, { id: request.raisedById, name: request.raisedBy })
  }

  /** Signed and lost are both 409: the body is fine, the deal's state is not. */
  private assertSignable(found: OpportunityRead): void {
    const code = found.row.code
    if (found.signed) {
      throw conflict(
        found.contractCode
          ? `Cơ hội ${code} đã ký — hợp đồng ${found.contractCode}.`
          : `Cơ hội ${code} đã ký.`,
      )
    }
    if (found.row.state === 'close-lost') {
      throw conflict(`Cơ hội ${code} đã thua — mở lại đơn trước khi ký.`)
    }
  }

  /** The signature itself, in the caller's transaction: contract row, both
   *  mirror rows and the edge, the deal leaving the board, the run, touches.
   *  Mirror row BEFORE the contract row — `sales.contract.code` has a foreign
   *  key into `platform.object`, checked per statement. */
  private async write(
    tx: Db,
    found: OpportunityRead,
    body: ContractSign,
    by: { id: string; name: string },
  ): Promise<void> {
    const code = found.row.code
    const saleOwner = found.owners.find((o) => o.role === 'SALE') ?? null
    const contractCode = await this.contracts.nextCode(tx)
    const values = fromSign(body, contractCode, found.row, saleOwner?.id ?? null, new Date())
    const signedAt = values.signedAt
    const ownerId = values.ownerId ?? null
    const ownerName =
      ownerId === null ? null : ((await this.deals.actorNames(tx, [ownerId])).get(ownerId) ?? null)

    const row = await this.deals.updateOpportunity(tx, code, closeForSign(signedAt))
    await this.mirror.put(tx, {
      code: contractCode,
      kind: 'HĐ',
      branch: 'Sales',
      label: `${found.account} · ${row.name}`,
      ...(ownerName ? { owner: ownerName } : {}),
      ...(values.amount === null ? {} : { amount: values.amount }),
    })
    await this.contracts.insert(tx, values)
    if (row.workstreamCode) await this.workstreams.syncClosed(tx, [row.workstreamCode])

    /* The funnel's exit row; a deal standing in no column has none to leave. */
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

    await this.mirror.put(tx, toRef(row, saleOwner?.name ?? null))
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
}

/** Who says yes to a signature: one link, the director — the same policy the
 *  sales config proposals follow (`config.approval.ts`). A second approver is a
 *  policy decision, one line here. */
const SIGN_APPROVERS: RoleId[] = ['director']

/** What the approver reads instead of the payload: deal, customer, amount. */
function consequenceOf(found: OpportunityRead, body: ContractSign): string {
  const amount = body.amount ?? found.row.amount
  const currency = body.amount === undefined ? found.row.currency : body.currency
  const money =
    amount === null
      ? 'chưa có giá trị'
      : `${amount.toLocaleString('vi-VN')} ${currency ?? ''}`.trim()
  return `Ký hợp đồng cho cơ hội ${found.row.code} · ${found.account} · ${money}`
}
