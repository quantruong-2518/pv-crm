import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ContractBookQuery,
  ContractCode,
  ContractConditionParams,
  ContractInstallmentParams,
  ContractInstallmentsBody,
  ContractTerminateBody,
  InstallmentConditionBody,
  InstallmentPaidBody,
  InstallmentRecordBody,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { ContractService } from './contract.service'
import { ContractScheduleService } from './contract-schedule.service'
import { ContractTerminationService } from './contract-termination.service'

/** `/sales/contracts` — the contract book, plus the write doors of a signed
 *  contract's schedule (`contracts/sales/contract-schedule.ts`, ADR 0090).
 *
 *  Thin on purpose, like its two siblings: take, validate, call, return. No
 *  business `if`, no SQL, nothing worth reading outside the declarations.
 *
 *  ------------------------------------------------------------------
 *  ONE PERMISSION, AND THIS IS THE FIRST ROUTE TO ASK FOR IT
 *  ------------------------------------------------------------------
 *  Both doors ask the view-contract permission with `scoped: true`. Until the
 *  contract kind gained a permission domain in E2, every question about a
 *  contract was waved through; these are the routes that domain was added for.
 *
 *  Signing still does NOT live here. A contract is created at
 *  `POST /sales/opportunities/:code/contract`, because signing is an action on
 *  a deal and the composite foreign key anchors a contract to exactly one
 *  (deal, lead) pair. Reading is the other way round: the book is a resource of
 *  its own, with its own root, which is what the sign door's docblock said
 *  would happen the day a contract screen existed.
 *
 *  ------------------------------------------------------------------
 *  THE BOOK QUERY
 *  ------------------------------------------------------------------
 *  Paging, status, owner, signed-date range, search and sort all arrive as
 *  `ContractBookQuery`, so a filter can never act on one page only. */
@Controller('sales/contracts')
export class ContractController {
  constructor(
    private readonly contracts: ContractService,
    private readonly schedule: ContractScheduleService,
    private readonly termination: ContractTerminationService,
  ) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(ContractBookQuery)) q: ContractBookQuery) {
    return this.contracts.book(who, q)
  }

  /** The whole book as one row of numbers.
   *
   *  MUST stand before `@Get(':code')`: Fastify matches in declaration order,
   *  so the other way round the word `summary` falls into the path param and
   *  dies in `zod(ContractCode)` with a 400 about a malformed code — technically
   *  right and meaningless to whoever reads the log.
   *
   *  NOT `scoped`, unlike the two doors around it. Same call both scorecards
   *  made: these are the desk's figures, and cutting them by who owns what
   *  makes everyone read a different number under one label. Whoever cannot
   *  open the book still cannot see them. */
  @Get('summary')
  @Need({ branch: 'Sales', permission: 'contract.view' })
  summary() {
    return this.contracts.summary()
  }

  /** The terminate drawer's picker. Before `:code` for `summary`'s reason; asks
   *  the terminate permission because nobody else opens that drawer. */
  @Get('termination-reasons')
  @Need({ branch: 'Sales', permission: 'contract.terminate' })
  terminationReasons() {
    return this.termination.reasons()
  }

  /** One contract, fully nested.
   *
   *  `ContractCode` rather than `ObjectCode` is the first fence, and it is not
   *  interchangeable: a contract code carries a letter outside `A-Z`, so the
   *  generic object-code primitive rejects it. The second fence — does it
   *  exist, is it yours — belongs to the service, which needs the row to
   *  answer. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(ContractCode)) code: ContractCode) {
    return this.contracts.profile(who, code)
  }

  /** ADR 0107: a direct door, final. Answers the contract re-read. */
  @Post(':code/terminate')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'contract.terminate', scoped: true })
  terminate(
    @CurrentActor() who: Actor,
    @Param('code', zod(ContractCode)) code: ContractCode,
    @Body(zod(ContractTerminateBody)) body: ContractTerminateBody,
  ) {
    return this.termination.terminate(who, code, body)
  }

  @Put(':code/installments')
  @Need({ branch: 'Sales', permission: 'contract.edit', scoped: true })
  replaceSchedule(
    @CurrentActor() who: Actor,
    @Param('code', zod(ContractCode)) code: ContractCode,
    @Body(zod(ContractInstallmentsBody)) body: ContractInstallmentsBody,
  ) {
    return this.schedule.replace(who, code, body)
  }

  @Post(':code/installments/:no/paid')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'contract.record-payment', scoped: true })
  markPaid(
    @CurrentActor() who: Actor,
    @Param(zod(ContractInstallmentParams)) p: ContractInstallmentParams,
    @Body(zod(InstallmentPaidBody)) body: InstallmentPaidBody,
  ) {
    return this.schedule.markPaid(who, p.code, p.no, body)
  }

  @Delete(':code/installments/:no/paid')
  @Need({ branch: 'Sales', permission: 'contract.record-payment', scoped: true })
  undoPaid(
    @CurrentActor() who: Actor,
    @Param(zod(ContractInstallmentParams)) p: ContractInstallmentParams,
  ) {
    return this.schedule.undoPaid(who, p.code, p.no)
  }

  /** `contract.edit` OR `contract.record-payment`: `@Need` holds one, so it asks
   *  the view floor both share and the service checks the either/or. */
  @Post(':code/installments/:no/records')
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  addRecord(
    @CurrentActor() who: Actor,
    @Param(zod(ContractInstallmentParams)) p: ContractInstallmentParams,
    @Body(zod(InstallmentRecordBody)) body: InstallmentRecordBody,
  ) {
    return this.schedule.addRecord(who, p.code, p.no, body)
  }

  @Post(':code/installments/:no/conditions')
  @Need({ branch: 'Sales', permission: 'contract.edit', scoped: true })
  addCondition(
    @CurrentActor() who: Actor,
    @Param(zod(ContractInstallmentParams)) p: ContractInstallmentParams,
    @Body(zod(InstallmentConditionBody)) body: InstallmentConditionBody,
  ) {
    return this.schedule.addCondition(who, p.code, p.no, body)
  }

  @Post(':code/installments/:no/conditions/:id/done')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'contract.edit', scoped: true })
  doneCondition(
    @CurrentActor() who: Actor,
    @Param(zod(ContractConditionParams)) p: ContractConditionParams,
  ) {
    return this.schedule.doneCondition(who, p.code, p.no, p.id)
  }
}
