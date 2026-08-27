import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { LeadBookQuery, LeadCreate, LeadImportBody } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { LeadService } from './lead.service'
import { LeadWriteService } from './lead-write.service'

/** `/sales/leads` — sổ lead, module 2 của nhánh Sales.
 *
 *  Controller mỏng có chủ ý: nhận, kiểm, gọi, trả. Không `if` nghiệp vụ, không
 *  SQL, không `req`/`res`. Mọi thứ đáng đọc của các endpoint này nằm ở mấy dòng
 *  khai báo — đường dẫn, quyền, hình dữ liệu vào.
 *
 *  ------------------------------------------------------------------
 *  TWO PERMISSIONS, AND THE THREE WRITE DOORS SHARE ONE
 *  ------------------------------------------------------------------
 *  Reading the book needs `lead.xem` and is `scoped: true` — a holder who only
 *  sees their own rows sees only their own rows. The three doors below need
 *  `lead.sửa`, including the preview: a dry run still reads the whole book to
 *  answer "does this mailbox already belong to somebody", and that answer is
 *  worth as much to someone fishing as the rows themselves.
 *
 *  ------------------------------------------------------------------
 *  `import/preview` IS DECLARED BEFORE `import`, AND IT IS NOT COSMETIC
 *  ------------------------------------------------------------------
 *  They are two different paths, so Fastify's router does not care. A reader
 *  does: the two differ by one word and only one of them writes, so the safe
 *  one is stated first and states its own emptiness in `@HttpCode(200)` —
 *  201 means "something was created", and this creates nothing at all. */
@Controller('sales/leads')
export class LeadController {
  constructor(
    private readonly leads: LeadService,
    private readonly write: LeadWriteService,
  ) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(LeadBookQuery)) q: LeadBookQuery) {
    return this.leads.book(who, q)
  }

  /** Một lead, gõ tay. 201 kèm nguyên dòng sổ — màn chèn được ngay, không phải
   *  gọi lần thứ hai, và người gõ thấy luôn giá trị đã được chuẩn hoá. */
  @Post()
  @Need({ branch: 'Sales', permission: 'lead.sửa' })
  create(@Body(zod(LeadCreate)) body: LeadCreate) {
    return this.write.create(body)
  }

  /** Chạy thử. KHÔNG ghi gì — kể cả một con số của dãy mã. */
  @Post('import/preview')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.sửa' })
  preview(@Body(zod(LeadImportBody)) body: LeadImportBody) {
    return this.write.preview(body)
  }

  /** Nạp thật. Cả lô vào hết hoặc không dòng nào vào. */
  @Post('import')
  @Need({ branch: 'Sales', permission: 'lead.sửa' })
  import(@CurrentActor() who: Actor, @Body(zod(LeadImportBody)) body: LeadImportBody) {
    return this.write.commit(who, body)
  }
}
