import { and, eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { contract, type ContractRowDb } from './contract.schema'

/** Một dòng hợp đồng kèm tên người ăn hoa hồng. */
export type ContractRead = {
  row: ContractRowDb
  ownerName: string | null
}

/** Một số từ `sales.contract_code_seq`, in ra dạng `HĐ-%04d`.
 *
 *  Dãy khai ở `contract.schema.ts` để `drizzle-kit` sở hữu nó; Drizzle không có
 *  node biểu thức cho `nextval` nên tên phải viết lại đúng một lần ở đây — cùng
 *  đánh đổi mà `lead.repository.ts` và `opportunity.repository.ts` đã ghi.
 *
 *  Tiền tố có dấu, và nó nằm trong một chuỗi SQL. An toàn vì kết nối chạy
 *  UTF-8 hai đầu và chuỗi này là hằng số trong mã nguồn, không ghép từ dữ liệu
 *  người dùng — nhưng nó cũng chính là lý do `MaHopDong` phải là một primitive
 *  riêng thay vì `MaObject`, và lý do đó đã ghi ở hợp đồng. */
const NEXT_CODE = sql`SELECT 'HĐ-' || lpad(nextval('sales.contract_code_seq')::text, 4, '0') AS code`

/** Chỗ DUY NHẤT có SQL ghi vào `sales.contract`.
 *
 *  ------------------------------------------------------------------
 *  BẢNG NÀY ĐÃ CÓ HAI NGƯỜI ĐỌC TRƯỚC KHI CÓ NGƯỜI GHI
 *  ------------------------------------------------------------------
 *  `OpportunityRepository.signed()` và `LeadRepository.signed()` đều hỏi thẳng
 *  `contract` bằng `EXISTS`, và cả hai ra đời trước file này. Chúng KHÔNG được
 *  gọi qua đây và không nên: một `EXISTS` phải nằm trong chính câu truy vấn của
 *  sổ để đi cùng một lượt quét, còn gọi qua một repository khác là một vòng
 *  mạng thứ hai cho mỗi dòng.
 *
 *  Nên ranh giới ở đây là GHI, không phải bảng: ai cũng đọc được `contract`
 *  trong câu của mình, chỉ có một đường ghi vào nó. */
@Injectable()
export class ContractRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Giữ trước mã kế tiếp. Gọi TRƯỚC khi mở transaction — cùng lý do đầy đủ ở
   *  `OpportunityRepository.nextCode()`: hỏi dãy trong lúc transaction của mình
   *  đang giữ một kết nối là một request chiếm hai kết nối. */
  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) {
      throw new Error('sales.contract_code_seq trả về rỗng — migration đã chạy chưa?')
    }
    return code
  }

  async insert(tx: Db, row: typeof contract.$inferInsert): Promise<ContractRowDb> {
    const [written] = await tx.insert(contract).values(row).returning()
    if (!written) throw new Error(`sales.contract: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  /** Hợp đồng của một cơ hội, nếu có.
   *
   *  Khớp CẢ HAI cột chứ không riêng mã đơn — cùng cặp mà `contract_opportunity_fk`
   *  neo, và đọc bằng cả cặp là cách câu truy vấn nói lại đúng bất biến bảng
   *  đang giữ (cùng lý lẽ với `OpportunityRepository.signed`). */
  async byOpportunity(opportunityCode: string, leadCode: string): Promise<ContractRead | null> {
    const [found] = await this.db
      .select({ row: contract, ownerName: actor.name })
      .from(contract)
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .where(and(eq(contract.opportunityCode, opportunityCode), eq(contract.leadCode, leadCode)))
      .limit(1)

    return found ?? null
  }
}
