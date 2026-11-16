import * as companies from './companies'
import * as comms from './emit-comms'
import * as contracts from './emit-contracts'
import * as deals from './emit-deals'
import * as funnel from './emit-funnel'
import * as kpi from './emit-kpi'
import * as leads from './emit-leads'
import * as admin from './emit-admin'
import type { AfterWrite, Ctx } from './types'

/** THE emitter registry, in run order. Domain agents edit their own module and
 *  never this file: each module exports `emitX` and an optional `afterWrite`.
 *  Funnel runs after leads because members and deliveries need lead codes. */

export type Emitter = { key: string; emit: (ctx: Ctx) => void; afterWrite: AfterWrite | undefined }

export const EMITTERS: Emitter[] = [
  { key: 'companies', emit: companies.emitCompanies, afterWrite: companies.afterWrite },
  { key: 'leads', emit: leads.emitLeads, afterWrite: leads.afterWrite },
  { key: 'funnel', emit: funnel.emitFunnel, afterWrite: funnel.afterWrite },
  { key: 'deals', emit: deals.emitDeals, afterWrite: deals.afterWrite },
  { key: 'contracts', emit: contracts.emitContracts, afterWrite: contracts.afterWrite },
  { key: 'comms', emit: comms.emitComms, afterWrite: comms.afterWrite },
  { key: 'kpi', emit: kpi.emitKpi, afterWrite: kpi.afterWrite },
  { key: 'admin', emit: admin.emitAdmin, afterWrite: admin.afterWrite },
]
