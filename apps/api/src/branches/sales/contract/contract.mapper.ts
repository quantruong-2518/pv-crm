import type { ContractRow, ContractSign, CurrencyCode } from '@pv/contracts'
import type { contract, ContractRowDb } from './contract.schema'

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
