import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor, Permission } from '@pv/engines'
import {
  ContractKindsResponse,
  OPPORTUNITY_STOP_REASON_OTHER,
  QuotationReasonsResponse,
  QuotationRow,
  type ContractKind,
  type ObjectCode,
  type OpportunityMoney,
  type QuotationPatchBody,
  type QuotationReason,
  type QuotationRecordBody,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { assertKindUsable, kindLabel } from '../config/contract-kind'
import { ContractRepository, type ContractRead } from '../contract/contract.repository'
import { announceRound, dealOwnerIds } from '../opportunity/deal-money.bell'
import {
  OpportunityLifecycle,
  terminatedSentence,
  vnDay,
  type DealAt,
} from '../opportunity/opportunity-lifecycle'
import { OpportunityMoves } from '../opportunity/opportunity-moves.service'
import { OpportunityRepository } from '../opportunity/opportunity.repository'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import { dealMoneyOf } from './deal-money'
import { adoptedPlace, reasonIdsOf, slotOf, toQuotationRow } from './quotation.mapper'
import { QuotationRepository } from './quotation.repository'
import type { QuotationRowDb, QuotationValues } from './quotation.schema'

/** The quotation ledger's doors, and THE writer of a round (ADR 0090).
 *
 *  `record` is the one place a `sales.quotation` row is born, always beside
 *  its `quotation-sent` timeline row: the hand door and the mail-sent hook
 *  both call it, so the two cannot count differently. Numbers are minted
 *  under the deal's row lock, which every caller already holds.
 *
 *  The three write doors take the milestone door's shape (`OpportunityMoves`):
 *  lock, read under the lock (out of scope is a 404 there), write, audit. */

type By = { id: string; name: string }

/** A send by hand carries the whole body; a mail template knows only its subject. */
export type QuotationSending =
  ({ source: 'manual' } & QuotationRecordBody) | { source: 'mail'; note: string }

@Injectable()
export class QuotationService {
  constructor(
    private readonly repo: QuotationRepository,
    private readonly deals: OpportunityRepository,
    private readonly moves: OpportunityMoves,
    private readonly lifecycle: OpportunityLifecycle,
    private readonly contracts: ContractRepository,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly hub: NotificationHub,
  ) {}

  /** `GET /sales/opportunities/quotation-reasons`. */
  async reasons(): Promise<QuotationReasonsResponse> {
    return QuotationReasonsResponse.parse({ rows: await this.repo.reasons() })
  }

  /** `GET /sales/opportunities/contract-kinds`. */
  async kinds(): Promise<ContractKindsResponse> {
    return ContractKindsResponse.parse({ rows: await this.repo.kinds() })
  }

  /** `POST /sales/opportunities/:code/quotations`. */
  async create(who: Actor, code: ObjectCode, body: QuotationRecordBody): Promise<QuotationRow> {
    return this.deals.run(async (tx) => {
      const deal = await this.moves.locked(tx, who, code)
      const by = { id: who.id, name: who.name }
      const written = await this.record(tx, deal, by, { source: 'manual', ...body })
      return this.settled(tx, who, written, 'recorded')
    })
  }

  /** `PATCH …/quotations/:id` — fill in a round that is still waiting. Naming
   *  its kind moves it into that kind's numbering, where the kind may not
   *  already have a round waiting (one pending per negotiation). A backfilled
   *  round a person gave a kind is theirs from then on: it turns `manual`. */
  async patch(
    who: Actor,
    code: ObjectCode,
    id: string,
    body: QuotationPatchBody,
  ): Promise<QuotationRow> {
    return this.deals.run(async (tx) => {
      assertNotTerminated(await this.moves.locked(tx, who, code))
      const rows = await this.repo.byDeal(tx, code)
      const round = pendingOf(rows, id)
      assertValidUntil(body.validUntil, round.sentAt)
      const owned = round.source === 'backfill' && (body.kind ?? round.kind) !== null
      const written = await this.repo.updatePending(tx, id, {
        ...(await placeOf(tx, rows, round, body.kind)),
        ...(owned ? { source: 'manual' as const, createdBy: round.createdBy ?? who.id } : {}),
        ...(body.amount === undefined ? {} : { amount: body.amount, currency: body.currency }),
        ...(body.validUntil === undefined ? {} : { validUntil: body.validUntil }),
      })
      if (!written) throw gone()
      return this.settled(tx, who, written, 'edited')
    })
  }

  /** `POST …/quotations/:id/close` — the round ends `not-closed`; the deal's
   *  own state is left alone, which is how a won deal records a failed round. */
  async close(
    who: Actor,
    code: ObjectCode,
    id: string,
    body: QuotationReason,
  ): Promise<QuotationRow> {
    return this.deals.run(async (tx) => {
      assertNotTerminated(await this.moves.locked(tx, who, code))
      const round = pendingOf(await this.repo.byDeal(tx, code), id)
      const written = await this.closeRound(tx, round, body, new Date())
      return this.settled(tx, who, written, 'closed')
    })
  }

  /** THE writer. The timeline row and the stage move first (`careVerdict` and
   *  the date floor refuse there), then the ledger row that points at it.
   *
   *  By hand, a negotiation that still has a round waiting takes the new one
   *  only with `supersede`, which closes the old round. A mail send has no
   *  reason to give, so it never closes anything: it opens the next kind-less
   *  negotiation instead. */
  async record(tx: Db, deal: DealAt, by: By, sending: QuotationSending): Promise<QuotationRowDb> {
    const manual = sending.source === 'manual' ? sending : null
    const code = deal.row.code
    const rows = await this.repo.byDeal(tx, code)
    await assertKindUsable(tx, rows, manual?.kind)
    const sent = await this.lifecycle.quotation(tx, deal, by, {
      at: manual?.sentAt === undefined ? undefined : new Date(manual.sentAt),
      note: sending.note,
    })
    assertValidUntil(manual?.validUntil, sent.at)

    const slot = slotOf(rows, manual?.kind ?? null)
    let place = { negotiationNo: slot.negotiationNo + 1, roundNo: 1 }
    if (slot.pending && manual) {
      if (!manual.supersede) {
        throw conflict(
          `Lần báo giá ${slot.pending.roundNo} đang chờ khách. Chọn lý do không chốt lần đó rồi ghi lần mới.`,
        )
      }
      /* A back-dated send must not close the old round before it was sent. */
      const closedAt = slot.pending.sentAt > sent.at ? slot.pending.sentAt : sent.at
      await this.closeRound(tx, slot.pending, manual.supersede, closedAt)
      place = { negotiationNo: slot.negotiationNo, roundNo: slot.nextRound }
    }

    const written = await this.repo.insert(tx, {
      opportunityCode: code,
      ...place,
      ...(manual
        ? {
            kind: manual.kind,
            amount: manual.amount,
            currency: manual.currency,
            validUntil: manual.validUntil ?? null,
          }
        : {}),
      sentAt: sent.at,
      source: sending.source,
      outcome: 'pending',
      touchId: sent.touchId,
      createdBy: by.id,
    })
    /* One line per act: a pending round only exists on a deal already at
       `quotation` or won, so a supersede never shares an act with a move. */
    const superseded = slot.pending !== null && !!manual?.supersede
    const moved = sent.row.stage !== deal.row.stage || sent.row.state !== deal.row.state
    if (superseded || !moved) {
      const owners = await dealOwnerIds(tx, this.hub, this.deals, code)
      const round = { code, label: deal.row.name, actorId: by.id, roundId: written.id }
      await announceRound(tx, this.hub, { ...round, superseded, owners })
    }
    return written
  }

  /** The profile's `money` block. Each contract is judged by the contract
   *  door's own rule (`contract.view` AND in its scope): outside it the paper
   *  and its rounds still show, its payments do not. */
  async money(
    who: Actor,
    deal: OpportunityRowDb,
    signed: readonly ContractRead[],
  ): Promise<OpportunityMoney> {
    const handle = this.deals.readonlyHandle
    const may = (permission: Permission): boolean =>
      this.access.check(who, { branch: 'Sales', permission }).ok
    const codes = signed.map((c) => c.row.code)
    const visible = await this.contracts.inScopeAmong(who, may('contract.view') ? codes : [])
    const [rows, installments, terminated] = await Promise.all([
      this.repo.byDeal(handle, deal.code),
      this.contracts.installmentsOf([...visible]),
      this.deals.terminatedAmong(handle, codes),
    ])
    const shown = await this.shown(handle, rows, codes)
    return dealMoneyOf({
      visible,
      can: { editSchedule: may('contract.edit'), recordPayment: may('contract.record-payment') },
      dealCurrency: deal.currency,
      contracts: signed.map((c) => c.row),
      terminated,
      installments,
      ...shown,
      today: vnDay(new Date()),
    })
  }

  /** One round ends `not-closed` with a catalogue reason, or the virtual
   *  `other` whose sentence the contract already required. */
  private async closeRound(
    tx: Db,
    round: QuotationRowDb,
    why: QuotationReason,
    at: Date,
  ): Promise<QuotationRowDb> {
    if (why.reasonId !== OPPORTUNITY_STOP_REASON_OTHER) {
      const live = await this.repo.reasons(tx)
      if (!live.some((r) => r.id === why.reasonId)) {
        throw conflict('Lý do không có trong danh mục. Chọn lại lý do.')
      }
    }
    const written = await this.repo.updatePending(tx, round.id, {
      outcome: 'not-closed',
      closedAt: at,
      reasonId: why.reasonId,
      reasonNote: why.note ?? null,
    })
    if (!written) throw gone()
    return written
  }

  /** What a write door owes after its row: the audit line (ADR 0090 §17) and
   *  the answer, both on the door's own transaction. */
  private async settled(
    tx: Db,
    who: Actor,
    row: QuotationRowDb,
    did: string,
  ): Promise<QuotationRow> {
    const place = `${row.kind ?? 'no kind'} ${row.negotiationNo}/${row.roundNo}`
    await this.audit.write(
      {
        actorId: who.id,
        action: 'edit',
        code: row.opportunityCode,
        note: `quotation ${row.id} ${did} (${place}, ${row.outcome})`,
      },
      tx,
    )
    const { rounds } = await this.shown(tx, [row], [])
    return QuotationRow.parse(rounds[0])
  }

  /** Rows as the wire prints them, with the two lookups a row cannot answer
   *  itself: reason labels and tagged-file counts. */
  private async shown(handle: Db, rows: readonly QuotationRowDb[], contractCodes: string[]) {
    const [reasons, files] = await Promise.all([
      this.repo.reasonNames(handle, reasonIdsOf(rows)),
      this.repo.fileCounts(
        handle,
        rows.map((r) => r.id),
        contractCodes,
      ),
    ])
    const perRound = new Map(files.flatMap((f) => (f.quotationId ? [[f.quotationId, f.n]] : [])))
    const ctx = { today: vnDay(new Date()), reasons, files: perRound }
    return { rounds: rows.map((r) => toQuotationRow(r, ctx)), files }
  }
}

/** The round a patch or close door acts on: of this deal, and still waiting. */
function pendingOf(rows: readonly QuotationRowDb[], id: string): QuotationRowDb {
  const round = rows.find((r) => r.id === id)
  if (!round) throw notFound('lần báo giá', id)
  if (round.outcome !== 'pending') throw gone()
  return round
}

/** Where a round goes when its kind is named. A round that already has a kind
 *  keeps it; a kind-less one opens the kind's next negotiation. */
async function placeOf(
  tx: Db,
  rows: readonly QuotationRowDb[],
  round: QuotationRowDb,
  kind: ContractKind | undefined,
): Promise<Pick<QuotationValues, 'kind' | 'negotiationNo' | 'roundNo'> | Record<string, never>> {
  if (kind === undefined || kind === round.kind) return {}
  if (round.kind !== null) {
    throw conflict('Lần báo giá này đã có loại hợp đồng, không đổi được.')
  }
  await assertKindUsable(tx, rows, kind)
  return { ...adoptedPlace(rows, kind, await kindLabel(tx, kind)), roundNo: 1 }
}

/** A VN-day rule the row is needed for: valid at least through its send day. */
function assertValidUntil(validUntil: string | undefined, sentAt: Date): void {
  if (validUntil !== undefined && validUntil < vnDay(sentAt)) {
    throw invalid({ validUntil: ['Ngày hết hiệu lực không được trước ngày gửi.'] })
  }
}

const gone = () => conflict('Lần báo giá này không còn chờ khách. Tải lại rồi thử lại.')

/** A terminated deal is final (ADR 0107 §2): its rounds are not edited or closed. */
function assertNotTerminated(deal: DealAt): void {
  if (deal.terminated) throw conflict(terminatedSentence(deal.row.code, 'sửa báo giá'))
}
