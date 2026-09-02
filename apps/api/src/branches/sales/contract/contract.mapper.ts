import type { ObjectRef } from '@pv/engines'
import type {
  ContractDetailRow,
  ContractRow,
  ContractSign,
  CurrencyCode,
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

/** Thân request + dòng cơ hội → cột.
 *
 *  ------------------------------------------------------------------
 *  BA MẶC ĐỊNH, VÀ CẢ BA ĐỀU ĐỌC TỪ ĐƠN CHỨ KHÔNG TỪ HƯ KHÔNG
 *  ------------------------------------------------------------------
 *   · tiền — `amount`/`currency` vắng mặt thì lấy của đơn. Ký đúng bằng số đã
 *     chào là trường hợp thường, và bắt gõ lại một con số đã có là mời gõ sai.
 *     Vắng mặt CẢ HAI là điều kiện: hợp đồng đã kiểm cặp đó ở `.refine`, nên
 *     tới đây chỉ còn "có cả hai" hoặc "không có gì".
 *   · `signedAt` — vắng mặt = bây giờ. Người bấm nút "Chốt thắng" đang cầm bút,
 *     nên `now` là câu trả lời thật; nhập tay là cho lượt vào sổ muộn.
 *   · `ownerId` — vắng mặt = Sale đứng đơn đầu tiên. Hoa hồng đi theo người
 *     đứng đơn trừ khi có người nói khác.
 *
 *  `leadCode` KHÔNG lấy từ thân request và không có ô nào để lấy: nó đọc từ
 *  chính dòng cơ hội. Khoá ngoại ghép `contract_opportunity_fk` neo cặp
 *  `(opportunity_code, lead_code)`, nên một giá trị do người gọi gửi lên hoặc
 *  trùng cái đã có — tức thừa — hoặc lệch, tức là một câu INSERT Postgres từ
 *  chối. Cột nào bảng đã biết thì đừng hỏi lại. */
export function fromSign(
  body: ContractSign,
  code: string,
  deal: {
    code: string
    leadCode: string
    amount: number | null
    currency: CurrencyCode | null
  },
  fallbackOwnerId: string | null,
  now: Date,
): ContractValues {
  const money =
    body.amount === undefined
      ? { amount: deal.amount, currency: deal.currency }
      : { amount: body.amount, currency: body.currency ?? null }

  const ownerId = body.ownerId ?? fallbackOwnerId

  return {
    code,
    opportunityCode: deal.code,
    leadCode: deal.leadCode,
    amount: money.amount,
    currency: money.currency,
    signedAt: body.signedAt === undefined ? now : new Date(body.signedAt),
    ...(ownerId === null ? {} : { ownerId }),
  }
}

/** Dòng bảng → dây. */
export function toContract(row: ContractRowDb, ownerName: string | null): ContractRow {
  return {
    code: row.code,
    opportunityCode: row.opportunityCode,
    leadCode: row.leadCode,
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
 *  on. `owner` carries the commission holder's NAME because that is what E2
 *  compares against `actor.name` — the id lives on the row, the label lives
 *  here (debt 2 of the backend handover). No owner means no scope check, and
 *  that is right for a contract nobody has been assigned yet. */
export function toRef(
  row: ContractRowDb,
  opts: { label: string; ownerName: string | null },
): ObjectRef {
  return {
    code: row.code,
    kind: 'HĐ',
    branch: 'Sales',
    label: opts.label,
    ...(opts.ownerName ? { owner: opts.ownerName } : {}),
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
  installments: ContractInstallmentRowDb[]
}): ContractRow {
  return {
    ...toContract(read.row, read.ownerName),
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
    ...toContract(read.row, read.ownerName),
    customer: read.customer,
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
