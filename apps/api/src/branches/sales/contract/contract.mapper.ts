import type { ObjectRef } from '@pv/engines'
import type {
  ContractBookRow,
  ContractRow,
  ContractSign,
  ContractTermDraft,
  ContractTermPatch,
  ContractTermRow,
  CurrencyCode,
} from '@pv/contracts'
import type {
  contract,
  contractPaymentTerm,
  ContractRowDb,
  ContractTermRowDb,
} from './contract.schema'
import type { ContractBookRead } from './contract.repository'

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
    /* Hard `null` because the column does not exist yet, not because contracts
       have no quotes: `quote_code` arrives with
       `drizzle/sau-merge/contract_quote_link.sql`, which waits on `sales.quote`
       from the parallel branch. Read the column here in the merge pass — the
       docblock on `ContractRow.quoteCode` names this line. */
    quoteCode: null,
    amount: row.amount,
    currency: row.currency,
    signedAt: row.signedAt.toISOString(),
    /* Cặp id/tên đi cùng nhau hoặc cùng vắng. Một hợp đồng chưa gán người có
       `owner_id` NULL, và lúc đó cái tên cũng không tồn tại — trả `ownerId`
       kèm `ownerName` rỗng là bày ra một người không có. */
    ...(row.ownerId && ownerName ? { ownerId: row.ownerId, ownerName } : {}),
  }
}

/** One instalment row, as the wire carries it.
 *
 *  `status` is copied straight across rather than re-derived from `paid_at`,
 *  even though `contract_payment_term_paid_pair` keeps the two in step: a read
 *  path prints WHAT THE TABLE HOLDS. Re-deriving here would be a second copy of
 *  a rule that already has one, and a second copy only shows itself on the day
 *  it disagrees. */
export function toTerm(row: ContractTermRowDb): ContractTermRow {
  return {
    termNo: row.termNo,
    label: row.label,
    amount: row.amount,
    dueDate: row.dueDate,
    paidAt: row.paidAt?.toISOString() ?? null,
    status: row.status === 'da-thu' ? 'da-thu' : 'cho-thu',
  }
}

/** One row of the contract book — the contract, the customer, the plan. */
export function toBookRow(read: ContractBookRead): ContractBookRow {
  return {
    ...toContract(read.row, read.ownerName),
    account: read.account,
    terms: read.terms.map(toTerm),
  }
}

/** The mirror row of a contract, for E2 and for ContextRail.
 *
 *  `owner` is whoever stands on the DEAL, not whoever takes the commission —
 *  see the docblock on `ContractBookRead.scopeOwner`. `amount` rides along
 *  because `ObjectRef` carries it and the rail prints it; absent, not zero,
 *  when the contract has no value recorded. */
export function toRef(read: ContractBookRead): ObjectRef {
  return {
    code: read.row.code,
    kind: 'HĐ',
    branch: 'Sales',
    label: `${read.row.code} · ${read.account}`,
    ...(read.scopeOwner ? { owner: read.scopeOwner } : {}),
    ...(read.row.amount === null ? {} : { amount: read.row.amount }),
  }
}

/** Create body plus the number the server minted, into columns.
 *
 *  `status` is neither in the body nor guessed here: the column carries the
 *  table's own default, and a collection plan is born uncollected. Writing that
 *  value out here would copy the table's default into code, which is two places
 *  to change on the day it changes. */
export function fromTermDraft(
  body: ContractTermDraft,
  contractCode: string,
  termNo: number,
): typeof contractPaymentTerm.$inferInsert {
  return {
    contractCode,
    termNo,
    label: body.label,
    amount: body.amount,
    ...(body.dueDate === undefined ? {} : { dueDate: body.dueDate }),
  }
}

/** Patch body into the columns it changes.
 *
 *  `status` FOLLOWS `paid_at`, and this is the only place in the source that
 *  decides the pair — the body deliberately does not carry `status` (see
 *  `ContractTermPatch`). A field left out of the body is left out of the object
 *  returned, so `UPDATE` does not touch that column: `undefined` and `null` are
 *  two different sentences, and `dueDate: null` means "clear the date", not
 *  "leave it alone". */
export function fromTermPatch(
  body: ContractTermPatch,
): Partial<typeof contractPaymentTerm.$inferInsert> {
  return {
    ...(body.label === undefined ? {} : { label: body.label }),
    ...(body.amount === undefined ? {} : { amount: body.amount }),
    ...(body.dueDate === undefined ? {} : { dueDate: body.dueDate }),
    ...(body.paidAt === undefined
      ? {}
      : body.paidAt === null
        ? { paidAt: null, status: 'cho-thu' }
        : { paidAt: new Date(body.paidAt), status: 'da-thu' }),
  }
}
