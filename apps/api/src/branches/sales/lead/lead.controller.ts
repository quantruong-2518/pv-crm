import { Controller, Get, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { LeadBookQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { LeadService } from './lead.service'

/** `GET /sales/leads` — sổ lead, module 2 của nhánh Sales.
 *
 *  Controller mỏng có chủ ý: nhận, kiểm, gọi, trả. Không `if` nghiệp vụ, không
 *  SQL, không `req`/`res`. Mọi thứ đáng đọc của endpoint này nằm ở ba dòng khai
 *  báo — đường dẫn, quyền, hình dữ liệu vào. */
@Controller('sales/leads')
export class LeadController {
  constructor(private readonly leads: LeadService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(LeadBookQuery)) q: LeadBookQuery) {
    return this.leads.book(who, q)
  }
}
