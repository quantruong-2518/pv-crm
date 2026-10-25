import type { ObjectRef } from '@pv/engines'
import type {
  ContractDetailRow,
  ContractParticipant,
  ContractPenalty,
  ContractRow,
  ContractSign,
  ContractTermination,
  InstallmentConditionRow,
  InstallmentDocRow,
  InstallmentDraft,
  InstallmentNoteRow,
  InstallmentRecordRow,
  InstallmentRow,
  InstallmentSummaryRow,
} from '@pv/contracts'
import { OPPORTUNITY_STOP_REASON_OTHER, OPPORTUNITY_STOP_REASON_OTHER_LABEL } from '@pv/contracts'
import type { TerminationRead } from './contract-termination.repository'
import type {
  contract,
  contractInstallment,
  ContractConditionRowDb,
  ContractDocumentRowDb,
  ContractInstallmentRowDb,
  ContractNoteRowDb,
  ContractRecordRowDb,
  ContractRowDb,
} from './contract.schema'

/** Cột của một dòng `sales.contract`, kèm khoá — khác `OpportunityValues` ở
 *  chỗ đó, và khác có lý do: mã hợp đồng KHÔNG suy được từ dòng, nó do dãy cấp,
 *  nên không có bản nháp nào hợp lệ mà thiếu mã. */
export type ContractValues = typeof contract.$inferInsert

/** One schedule line as typed -> the row at position `no`. The sign door and the
 *  schedule door both write instalments, so the column mapping lives once. */
export function fromDraft(
  contractCode: string,
  draft: InstallmentDraft,
  no: number,
): typeof contractInstallment.$inferInsert {
  return {
    contractCode,
    no,
    label: draft.label,
    share: draft.share,
    amount: draft.amount,
    due: new Date(draft.due),
  }
}

/** Request body + deal row → columns.
 *
 *   · money and kind — always from the body: a won deal signs again (ADR 0069
 *     §5), so the deal's value cannot stand in for each paper's.
 *   · `signedAt` — absent = now; typing it is for a late entry.
 *   · `ownerId` — the creator (ADR 0113): the signer, or the request's raiser.
 *   · `collectorId` — always from the body, required: no default, not even the
 *     closer, so a contract never starts with an implied person chasing money.
 *
 *  `leadCode` comes off the deal row, never the body: `contract_opportunity_fk`
 *  anchors the `(opportunity_code, lead_code)` pair, so a caller's value is
 *  either redundant or an INSERT Postgres refuses. */
export function fromSign(
  body: ContractSign,
  code: string,
  deal: { code: string; leadCode: string; workstreamCode: string | null },
  ownerId: string,
  now: Date,
): ContractValues {
  return {
    code,
    opportunityCode: deal.code,
    leadCode: deal.leadCode,
    /* The run of the signed deal — copied, never re-derived. Whether signing
       closes the run is `WorkstreamRepository.syncClosed`'s call, not this row's. */
    workstreamCode: deal.workstreamCode,
    kind: body.kind,
    amount: body.amount,
    currency: body.currency,
    signedAt: body.signedAt === undefined ? now : new Date(body.signedAt),
    collectorId: body.collectorId,
    ownerId,
  }
}

/** Dòng bảng → dây.
 *
 *  `customer` arrives as an argument rather than off `row`: it lives on the
 *  lead, not on `sales.contract`, so every caller has to say where it got it.
 *  The two read paths join it; the sign door hands over the deal's account name,
 *  which is the same company by construction. */
export function toContract(
  row: ContractRowDb,
  names: { ownerName: string | null; collectorName: string | null },
  customer: string,
  participants: ContractParticipant[],
  termination: TerminationRead | null,
): ContractRow {
  const { ownerName, collectorName } = names
  return {
    code: row.code,
    opportunityCode: row.opportunityCode,
    leadCode: row.leadCode,
    customer,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    signedAt: row.signedAt.toISOString(),
    /* Cặp id/tên đi cùng nhau hoặc cùng vắng. Một hợp đồng chưa gán người có
       `owner_id` NULL, và lúc đó cái tên cũng không tồn tại — trả `ownerId`
       kèm `ownerName` rỗng là bày ra một người không có. */
    ...(row.ownerId && ownerName ? { ownerId: row.ownerId, ownerName } : {}),
    ...(collectorName ? { collectorId: row.collectorId, collectorName } : {}),
    participants,
    termination: termination && toTermination(termination),
  }
}

/** The label falls back to the key: a catalogue row deleted outright must not
 *  turn a recorded termination into an empty string the wire refuses. */
function toTermination(read: TerminationRead): ContractTermination {
  const { row, byName, reasonName } = read
  const other = row.reasonKey === OPPORTUNITY_STOP_REASON_OTHER
  return {
    terminatedAt: row.terminatedAt.toISOString(),
    reasonKey: row.reasonKey,
    reasonLabel: reasonName ?? (other ? OPPORTUNITY_STOP_REASON_OTHER_LABEL : row.reasonKey),
    note: row.note,
    collectedAmount: row.collectedAmount,
    refundedAmount: row.refundedAmount,
    byId: row.terminatedById,
    byName,
    penalty: toPenalty(read),
  }
}

/** NULL direction = no penalty; the 0146 CHECKs keep direction and amount paired. */
function toPenalty({ row, settledByName }: TerminationRead): ContractPenalty | null {
  if (row.penaltyDirection === null || row.penaltyAmount === null) return null
  return {
    direction: row.penaltyDirection,
    amount: row.penaltyAmount,
    settledOn: row.penaltySettledOn,
    settledById: row.penaltySettledById,
    settledByName,
  }
}

/** Mirror row of a contract, for the service's second E2 grid.
 *
 *  `label` is the customer name rather than the code: the code is already
 *  `ref.code`, and an audit line naming a company is the one a human can act
 *  on. `ownerId` is the commission holder E2 compares (ADR 0070), `owner` only
 *  their label — both or neither, since an owner without an id reads as
 *  somebody else's. No owner means no scope check, and that is right for a
 *  contract nobody has been assigned yet. */
export function toRef(
  row: ContractRowDb,
  opts: { label: string; owner: { id: string; name: string } | null },
): ObjectRef {
  return {
    code: row.code,
    kind: 'HĐ',
    branch: 'Sales',
    label: opts.label,
    ...(opts.owner ? { owner: opts.owner.name, ownerId: opts.owner.id } : {}),
  }
}

/** One book line — the row plus the lean schedule.
 *
 *  Built on `toContract` instead of beside it: the sign door answers with a
 *  contract that has no schedule yet, and two functions writing the same six
 *  fields is two places for one of them to start lying. */
export function toBookRow(read: {
  row: ContractRowDb
  ownerName: string | null
  collectorName: string | null
  customer: string
  participants: ContractParticipant[]
  termination: TerminationRead | null
  installments: ContractInstallmentRowDb[]
}): ContractRow {
  return {
    ...toContract(read.row, read, read.customer, read.participants, read.termination),
    installments: read.installments.map(toInstallmentSummary),
  }
}

/** One contract profile — the header the book never prints, plus the full
 *  schedule. */
export function toDetail(read: {
  row: ContractRowDb
  ownerName: string | null
  collectorName: string | null
  customer: string
  participants: ContractParticipant[]
  termination: TerminationRead | null
  contact: string
  contactRole: string | null
  installments: {
    row: ContractInstallmentRowDb
    paidByName: string | null
    conditions: ContractConditionRowDb[]
    docs: ContractDocumentRowDb[]
    records: ContractRecordRowDb[]
    notes: ContractNoteRowDb[]
  }[]
}): ContractDetailRow {
  return {
    ...toContract(read.row, read, read.customer, read.participants, read.termination),
    contact: read.contact,
    /* The lead may carry no job title, and the wire field is required because
       the header prints the contact and the role as one phrase. Falling back
       to the label the frozen book already uses for a contact that is a desk
       rather than a person keeps that phrase readable; an empty string would
       leave a dangling separator on screen. */
    contactRole: read.contactRole ?? 'đầu mối chung',
    installments: read.installments.map(toInstallment),
  }
}

function toInstallmentSummary(row: ContractInstallmentRowDb): InstallmentSummaryRow {
  return {
    no: row.no,
    label: row.label,
    share: row.share,
    amount: row.amount,
    due: row.due.toISOString(),
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
  }
}

function toInstallment(read: {
  row: ContractInstallmentRowDb
  paidByName: string | null
  conditions: ContractConditionRowDb[]
  docs: ContractDocumentRowDb[]
  records: ContractRecordRowDb[]
  notes: ContractNoteRowDb[]
}): InstallmentRow {
  return {
    ...toInstallmentSummary(read.row),
    /* Both or neither, like owner id/name: a recorder without a name would
       print as nobody, and a seeded paid row has no recorder at all. */
    ...(read.row.paidById && read.paidByName && read.row.paidRecordedAt
      ? {
          paidBy: { id: read.row.paidById, name: read.paidByName },
          paidRecordedAt: read.row.paidRecordedAt.toISOString(),
        }
      : {}),
    conditions: read.conditions.map(toCondition),
    docs: read.docs.map(toDoc),
    records: read.records.map(toRecord),
    notes: read.notes.map(toNote),
  }
}

function toCondition(row: ContractConditionRowDb): InstallmentConditionRow {
  return {
    id: row.id,
    side: row.side,
    what: row.what,
    due: row.due.toISOString(),
    ...(row.doneAt ? { doneAt: row.doneAt.toISOString() } : {}),
    who: row.who,
  }
}

function toDoc(row: ContractDocumentRowDb): InstallmentDocRow {
  return { id: row.id, name: row.name, state: row.state, hint: row.hint }
}

function toRecord(row: ContractRecordRowDb): InstallmentRecordRow {
  return {
    id: row.id,
    at: row.at.toISOString(),
    channel: row.channel,
    what: row.what,
    detail: row.detail,
    state: row.state,
  }
}

function toNote(row: ContractNoteRowDb): InstallmentNoteRow {
  return { id: row.id, at: row.at.toISOString(), who: row.who, text: row.text }
}
