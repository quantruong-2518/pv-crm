import type { ObjectRef } from '@pv/engines'
import type {
  ContractDetailRow,
  ContractRow,
  ContractSign,
  InstallmentConditionRow,
  InstallmentDocRow,
  InstallmentNoteRow,
  InstallmentRecordRow,
  InstallmentRow,
  InstallmentSummaryRow,
} from '@pv/contracts'
import type {
  contract,
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

/** Request body + deal row → columns.
 *
 *   · money and kind — always from the body: a won deal signs again (ADR 0069
 *     §5), so the deal's value cannot stand in for each paper's.
 *   · `signedAt` — absent = now; typing it is for a late entry.
 *   · `ownerId` — absent = `fallbackOwnerId`, the deal's holder (`holderOf`):
 *     commission follows the holder unless somebody names another Sale.
 *
 *  `leadCode` comes off the deal row, never the body: `contract_opportunity_fk`
 *  anchors the `(opportunity_code, lead_code)` pair, so a caller's value is
 *  either redundant or an INSERT Postgres refuses. */
export function fromSign(
  body: ContractSign,
  code: string,
  deal: { code: string; leadCode: string; workstreamCode: string | null },
  fallbackOwnerId: string | null,
  now: Date,
): ContractValues {
  const ownerId = body.ownerId ?? fallbackOwnerId

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
    ...(ownerId === null ? {} : { ownerId }),
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
  ownerName: string | null,
  customer: string,
): ContractRow {
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
  customer: string
  installments: ContractInstallmentRowDb[]
}): ContractRow {
  return {
    ...toContract(read.row, read.ownerName, read.customer),
    installments: read.installments.map(toInstallmentSummary),
  }
}

/** One contract profile — the header the book never prints, plus the full
 *  schedule. */
export function toDetail(read: {
  row: ContractRowDb
  ownerName: string | null
  customer: string
  contact: string
  contactRole: string | null
  installments: {
    row: ContractInstallmentRowDb
    conditions: ContractConditionRowDb[]
    docs: ContractDocumentRowDb[]
    records: ContractRecordRowDb[]
    notes: ContractNoteRowDb[]
  }[]
}): ContractDetailRow {
  return {
    ...toContract(read.row, read.ownerName, read.customer),
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
  conditions: ContractConditionRowDb[]
  docs: ContractDocumentRowDb[]
  records: ContractRecordRowDb[]
  notes: ContractNoteRowDb[]
}): InstallmentRow {
  return {
    ...toInstallmentSummary(read.row),
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
