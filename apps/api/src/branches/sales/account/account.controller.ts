import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import {
  AccountBookQuery,
  AccountCreate,
  AccountUpdate,
  MaObject,
  type AccountBookQuery as AccountBookQueryType,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { AccountService } from './account.service'

/** `/sales/accounts` — the customer-company book.
 *
 *  NO endpoint declares `scoped: true`, and that absence repeated four times
 *  is one decision restated four times, not four separate omissions: a
 *  company does not belong to any one salesperson, so enforcing the scope
 *  axis here would hide the department's own customers from that same
 *  department. The full reasoning is at the account-view permission
 *  declaration in `packages/engines/src/e2-access.ts`.
 *
 *  NO `@Delete`. A company that still has leads pointing at it is rejected
 *  by the foreign key; a company nothing points at anymore costs nothing to
 *  keep — and "deactivating" a company is a question no screen can answer:
 *  where would the four deals underneath it go. */
@Controller('sales/accounts')
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'khách-hàng.xem' })
  book(@Query(zod(AccountBookQuery)) q: AccountBookQueryType) {
    return this.accounts.book(q)
  }

  @Get(':code')
  @Need({ branch: 'Sales', permission: 'khách-hàng.xem' })
  profile(@Param('code', zod(MaObject)) code: MaObject) {
    return this.accounts.profile(code)
  }

  @Post()
  @Need({ branch: 'Sales', permission: 'khách-hàng.sửa' })
  create(@Body(zod(AccountCreate)) body: AccountCreate) {
    return this.accounts.create(body)
  }

  @Patch(':code')
  @Need({ branch: 'Sales', permission: 'khách-hàng.sửa' })
  update(
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(AccountUpdate)) body: AccountUpdate,
  ) {
    return this.accounts.update(code, body)
  }
}
