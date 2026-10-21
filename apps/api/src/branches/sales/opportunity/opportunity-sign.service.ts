import { Injectable } from '@nestjs/common'
import type { Actor, RoleId } from '@pv/engines'
import {
  ConfigProposalReceipt,
  ContractSignProposal,
  isSellerRole,
  type ContractSign,
  type ContractSignedReceipt,
  type ObjectCode,
  type OpportunityAct,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { ApprovalService, type ApprovalApplier } from '@api/platform/approval/approval.service'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { ApprovalRowDb } from '@api/platform/approval/approval.schema'
import { assertKindUsable, kindLabel } from '../config/contract-kind'
import { ContractRepository } from '../contract/contract.repository'
import { fromSign } from '../contract/contract.mapper'
import { dropStep } from '../next-step/next-step.handover'
import { adoptedPlace } from '../quotation/quotation.mapper'
import { QuotationRepository } from '../quotation/quotation.repository'
import type { QuotationRowDb } from '../quotation/quotation.schema'
import { TouchService } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { announceSigned } from './deal-money.bell'
import { closeForSign, NOTE, stageEventOf, toRef } from './opportunity.mapper'
import { DEAL_HELD_REFUSAL, terminatedSentence } from './opportunity-lifecycle'
import {
  actorsByIds,
  isActiveSeller,
  lanePeople,
  primaryOf,
  salePrimaryOf,
} from './opportunity-owners'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'

/** Signing a deal, through E3 (ADR 0057 §7).
 *
 *  The door (`propose`) writes no contract: it checks everything the approval
 *  would check — scope, state — and raises a `contract-sign` request, so an
 *  approver is never asked to say yes to something that would fail. The
 *  contract is written by `apply`, inside the transaction that settles the
 *  approval, with the RAISER as the signing actor: they reported the
 *  signature, the approver only confirmed it. A director or head of sales
 *  needs no second yes (ADR 0091): for them the door writes the contract
 *  itself, under the same checks, and leaves an audit row.
 *
 *  A won deal may sign again (ADR 0069 §5): each request carries its own amount,
 *  currency and kind, writes its own contract, and leaves the deal's columns
 *  alone — only the FIRST signature takes the deal off the board.
 */
@Injectable()
export class OpportunitySign implements ApprovalApplier {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly contracts: ContractRepository,
    private readonly workstreams: WorkstreamRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly approvals: ApprovalService,
    private readonly quotes: QuotationRepository,
    private readonly audit: AuditRepository,
    private readonly hub: NotificationHub,
  ) {}

  /** `POST /sales/opportunities/:code/contract` — 202 with a receipt, or the
   *  contract's code when the signer needs no approval.
   *
   *  Checked twice: on the pool to fail fast, then again under the deal's row
   *  lock with the request opened in that same transaction — a stop takes the
   *  same lock and refuses a deal with a sign waiting, so the two serialise. */
  async propose(
    who: Actor,
    code: ObjectCode,
    asked: ContractSign,
  ): Promise<ConfigProposalReceipt | ContractSignedReceipt> {
    const body = withCloser(who, asked)
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    /* On the pool, before the lock: PGlite has one connection, so a pool read
       inside the transaction would wait on the transaction forever. */
    const [pending, chain] = await Promise.all([
      this.approvals.pendingOn(code),
      this.approvals.chainFor(SIGN_APPROVERS),
    ])
    await this.assertProposable(this.deals.readonlyHandle, found, body, pending.some(isSign))
    if (signsDirect(who)) return this.signNow(who, code, body)

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
        consequence: consequenceOf(fresh, body, await kindLabel(tx, body.kind)),
        payload: proposal,
        chain,
        links: [{ objectCode: code, objectLabel: fresh.row.name }],
      }
      return this.approvals.open(who, draft, tx)
    })

    return ConfigProposalReceipt.parse({ requestId: request.id, state: request.state })
  }

  /** The same door for a signer who needs no approval: checks under the deal
   *  lock, then the signature and its audit row in one transaction. */
  private signNow(
    who: Actor,
    code: ObjectCode,
    body: ContractSign,
  ): Promise<ContractSignedReceipt> {
    return this.deals.run(async (tx) => {
      const lock = await this.deals.lockDeal(tx, code)
      const fresh = lock ? await this.deals.byCode(who, code, tx) : null
      if (!lock || !fresh || !fresh.inScope) throw notFound('cơ hội', code)
      await this.assertProposable(tx, fresh, body, lock.pendingSign)
      const sign = { ...body, signedAt: body.signedAt ?? new Date().toISOString() }
      const by = { id: who.id, name: who.name }
      const contractCode = await this.write(tx, fresh, sign, by, { actorId: who.id, skip: [] })
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code,
          note: `contract ${contractCode} signed without approval (${who.roleIds.join(', ')})`,
        },
        tx,
      )
      return { contractCode }
    })
  }

  /** Every refusal the door makes: the deal (`signVerdict`, 409), the round the
   *  signature claims to win (409), then the body (422 owner). */
  private async assertProposable(
    handle: Db,
    found: OpportunityRead,
    body: ContractSign,
    pendingSign: boolean,
  ): Promise<void> {
    const rounds = await this.quotes.byDeal(handle, found.row.code)
    const facts = signFactsOf(found, rounds.length > 0)
    const verdict = signVerdict({ ...facts, pendingSign })
    if (!verdict.ok) throw conflict(verdict.reason)
    await assertKindUsable(handle, rounds, body.kind)
    const round = body.quotationId === undefined ? null : waiting(rounds, body.quotationId)
    if (body.quotationId !== undefined && !round) {
      throw conflict('Lần báo giá đã chọn không còn chờ khách. Tải lại rồi chọn lại.')
    }
    if (round?.kind && round.kind !== body.kind) {
      throw conflict('Loại hợp đồng khác loại của lần báo giá đã chọn.')
    }
    /* A kind-less round takes the contract's kind when it wins; ask now whether
       that kind has room, so nobody approves a signature that cannot land. */
    if (round && round.kind === null) {
      adoptedPlace(rounds, body.kind, await kindLabel(handle, body.kind))
    }
    await assertCloser(handle, body.ownerId)
  }

  /** `ApprovalApplier` for `contract-sign`. Everything is checked again against
   *  the deal as it is NOW; a refusal rolls the approval back to waiting. */
  async apply(tx: Db, request: ApprovalRowDb): Promise<void> {
    const { opportunityCode: code, sign } = ContractSignProposal.parse(request.payload)
    /* Lock first: an edit racing this approval waits, or has already landed. */
    if (!(await this.deals.lockDeal(tx, code))) throw notFound('cơ hội', code)
    const found = await this.deals.byCode(null, code, tx)
    if (!found) throw notFound('cơ hội', code)
    const quoted = await this.quotes.exists(tx, code)
    const verdict = signableVerdict(signFactsOf(found, quoted))
    if (!verdict.ok) throw conflict(verdict.reason)
    /* The closer frozen into the request may have left or changed role since. */
    await assertCloser(tx, sign.ownerId)

    /* The bell's actor is the decider; the raiser already hears `approval-approved`. */
    const decider = [...request.chain].reverse().find((l) => l.state === 'approved')?.personId
    const by = { id: request.raisedById, name: request.raisedBy }
    await this.write(tx, found, sign, by, { actorId: decider, skip: [request.raisedById] })
  }

  /** The signature itself, in the caller's transaction: contract row, its
   *  mirror row and the edge, the run, touches — and on the FIRST signature the
   *  deal leaving the board, its mirror row and its next step dropped (§10).
   *  Mirror row BEFORE the contract row — `sales.contract.code` has a foreign
   *  key into `platform.object`, checked per statement. `bell` names who the
   *  `contract-signed` line treats as its cause and who it leaves out. */
  private async write(
    tx: Db,
    found: OpportunityRead,
    body: ContractSign,
    by: { id: string; name: string },
    bell: { actorId: string | undefined; skip: string[] },
  ): Promise<string> {
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
    /* A lane old code left without a primary gets one before it is frozen. */
    const sale = found.owners.filter((o) => o.role === 'SALE').map((o) => o.id)
    if (sale.length > 0 && primaryOf(found.owners) === null) {
      await this.deals.setSalePrimary(tx, code, salePrimaryOf(await lanePeople(tx, sale), null))
    }
    await this.contracts.insert(tx, values)
    /* The schedule the approver just read is written with the paper (ADR 0090). */
    if (body.installments?.length) {
      await this.contracts.insertInstallments(tx, contractCode, body.installments)
    }
    await this.winRound(tx, code, body, contractCode, signedAt)
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
    await announceSigned(tx, this.hub, {
      ...bell,
      code,
      label: row.name,
      contractCode,
      director: await this.hub.sharedInRoles(tx, ['director'], 'Sales'),
      owners: found.owners.map((o) => o.id),
      commissionOwner: values.ownerId ?? undefined,
    })
    return contractCode
  }

  /** The round the signature names turns `won` and its negotiation carries
   *  the contract. A round closed, superseded or given another kind while the
   *  request waited refuses the approval, like every other fact `apply`
   *  re-checks. A kind-less round takes the contract's kind as it wins. */
  private async winRound(
    tx: Db,
    code: string,
    sign: Pick<ContractSign, 'quotationId' | 'kind'>,
    contractCode: string,
    signedAt: Date,
  ): Promise<void> {
    if (sign.quotationId === undefined) return
    const rows = await this.quotes.byDeal(tx, code)
    let round = waiting(rows, sign.quotationId)
    if (round && round.kind !== null && round.kind !== sign.kind) {
      throw conflict(
        'Loại của lần báo giá đã khác loại hợp đồng trong đề nghị ký. Từ chối đề nghị rồi gửi lại.',
      )
    }
    if (round && round.kind === null) {
      const place = adoptedPlace(rows, sign.kind, await kindLabel(tx, sign.kind))
      await this.quotes.adopt(tx, round, place)
      round = { ...round, ...place }
    }
    if (!round || !(await this.quotes.win(tx, round, contractCode, signedAt))) {
      throw conflict('Lần báo giá của đề nghị ký không còn chờ khách. Từ chối đề nghị rồi gửi lại.')
    }
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

/** The round `id` when it belongs to these rows and is still pending. */
const waiting = (rows: readonly QuotationRowDb[], id: string): QuotationRowDb | undefined =>
  rows.find((r) => r.id === id && r.outcome === 'pending')

const isSign = (r: ApprovalRowDb): boolean => r.kind === 'contract-sign'

/** What the sign rules read off a deal; `quoted` = it has a `sales.quotation` row. */
export type SignFacts = {
  code: string
  lost: boolean
  signed: boolean
  quoted: boolean
  hasSeller: boolean
  /** A hold blocks the request, not the approval: none can be set while one waits. */
  held: boolean
  /** Every contract terminated (ADR 0107 §2): final, a comeback is a new deal. */
  terminated: boolean
}

export const signFactsOf = (found: OpportunityRead, quoted: boolean): SignFacts => ({
  code: found.row.code,
  lost: found.row.state === 'lost',
  signed: found.signed,
  quoted,
  hasSeller: found.hasSeller,
  held: found.held,
  terminated: found.terminated,
})

/** The refusals the approval re-checks when it applies. A won deal passes
 *  (sign again); a terminated one does not (ADR 0107 §2). The second is the quotation gate (ADR 0064 §3): no FIRST
 *  contract without a row in the quotation ledger — a fact, not `stage`, which a
 *  back-dated column could fake. */
export function signableVerdict(f: SignFacts): OpportunityAct {
  if (f.terminated) return refuse(terminatedSentence(f.code, 'ký'))
  if (f.lost)
    return refuse(`Cơ hội ${f.code} đã dừng, không ký được. Muốn chăm lại thì đi từ lead.`)
  if (!f.signed && !f.quoted) {
    return refuse(`Cơ hội ${f.code} chưa có báo giá. Ghi báo giá trước khi ký.`)
  }
  return { ok: true }
}

/** Every refusal the sign door makes about the deal and the reader, in its
 *  order — the door and the profile's `acts.sign` both read it. The SALE lane
 *  may stay empty until signing and no longer (ADR 0071 §4). */
export function signVerdict(f: SignFacts & { pendingSign: boolean }): OpportunityAct {
  /* First: resuming is the one press that leads anywhere on a held deal. */
  if (f.held && !f.lost) return refuse(DEAL_HELD_REFUSAL)
  const signable = signableVerdict(f)
  if (!signable.ok) return signable
  if (!f.hasSeller)
    return refuse('Cơ hội chưa có Sale đứng đơn. Thêm một Sale trước khi đề nghị ký.')
  if (f.pendingSign) return refuse(`Cơ hội ${f.code} đã có yêu cầu ký đang chờ duyệt.`)
  return { ok: true }
}

const refuse = (reason: string): OpportunityAct => ({ ok: false, reason })

const NOT_ACTIVE_SELLER = 'Người chốt hợp đồng phải là người bán đang làm việc.'

/** The closer may be any active seller, on the deal's lane or not (ADR 0110
 *  §1). Read on `handle`: under the lock a pool read would wait forever. */
async function assertCloser(handle: Db, ownerId: string | undefined): Promise<void> {
  if (ownerId === undefined) return
  const [closer] = await actorsByIds(handle, [ownerId])
  if (!closer || !isActiveSeller(closer)) {
    throw invalid({ ownerId: [NOT_ACTIVE_SELLER] }, NOT_ACTIVE_SELLER)
  }
}

/** No closer named: the signer when they sell, else the deal's holder later in
 *  `fromSign` (ADR 0110 §1). Frozen into the request here, so `apply` writes
 *  the raiser without reading their roles again. */
const withCloser = (who: Actor, body: ContractSign): ContractSign =>
  body.ownerId !== undefined || !isSellerRole(who.roleIds) ? body : { ...body, ownerId: who.id }

/** Who says yes to a signature: one link, the director — the same policy the
 *  sales config proposals follow (`config.approval.ts`). A second approver is a
 *  policy decision, one line here. */
export const SIGN_APPROVERS: RoleId[] = ['director']

/** Whose signature needs no approval (ADR 0091): the two seats above the
 *  sales floor. A seller's still goes through `SIGN_APPROVERS`. */
const SIGN_DIRECT: RoleId[] = ['director', 'head-of-sales']

export const signsDirect = (who: Actor): boolean =>
  who.roleIds.some((role) => SIGN_DIRECT.includes(role))

/** What the approver reads instead of the payload: deal, customer, kind, amount. */
function consequenceOf(found: OpportunityRead, body: ContractSign, kind: string): string {
  const money = `${body.amount.toLocaleString('vi-VN')} ${body.currency}`
  return `Ký hợp đồng ${kind} cho cơ hội ${found.row.code} · ${found.account} · ${money}`
}
