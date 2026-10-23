import { z } from 'zod'
import { PageQuery, paged } from '../pagination'
import { Day, Moment, MoneyVnd, ObjectCode, textInput } from '../primitives'
import { searchText } from '../search-text'
import { NextStep } from './next-step'
import { WorkstreamHolder } from './workstream'

/** The bought-customer book — runs whose every live contract is fully collected (ADR 0121).
 *
 *      GET /sales/after-sale        `contract.view` · ownOnly = carer or contract reader
 *
 *  One row per journey in `growth`. Order is fixed by the server — hot, warm,
 *  then cold and unread, earliest care day first inside each — because the
 *  book exists to say who to call next, not to be re-sorted. The cycle dials
 *  are `RecareCycles` in `./config`: that file names every config proposal,
 *  and this one imports `./next-step`, which imports `./config`. */

/** Read off each customer close-out; the latest reading is current. */
export const CustomerTemperature = z.enum(
  ['hot', 'warm', 'cold'],
  'Nhiệt độ không có trong danh sách',
)

export const CUSTOMER_TEMPERATURE_LABEL: Record<CustomerTemperature, string> = {
  hot: 'Nóng',
  warm: 'Ấm',
  cold: 'Nguội',
}

/** `none` = no reading yet; such a customer rides the cold cycle. */
export const AfterSaleTemperatureFilter = z.enum([...CustomerTemperature.options, 'none'])

/** `due` = the care day has come; `upcoming` = not yet. */
export const AfterSaleCareStatus = z.enum(['all', 'due', 'upcoming'])

export const AfterSaleBookQuery = PageQuery.extend({
  temperature: AfterSaleTemperatureFilter.optional(),
  /** Actor id of one carer. */
  carer: z.string().min(1).max(64).optional(),
  care: AfterSaleCareStatus.default('all'),
  /** Day the last installment was collected, both ends inclusive. */
  completedFrom: Day.optional(),
  completedTo: Day.optional(),
  /** Substring of the run code or the customer's company name. */
  q: searchText,
})

export const AfterSaleTemperatureReading = z.object({
  value: CustomerTemperature,
  at: Moment,
  by: WorkstreamHolder,
})

/** `careDue` is judged by the server against its own day, so the screen never
 *  re-derives "due" from `nextCareOn`. `collected` sums every live contract,
 *  converted to VND by the rate table. */
export const AfterSaleRow = z.object({
  code: ObjectCode,
  leadCode: ObjectCode,
  customer: textInput(200),
  temperature: AfterSaleTemperatureReading.nullable(),
  /** The lead's step — a customer close-out lands its step there. */
  nextStep: NextStep.nullable(),
  /** Empty when no live contract names an owner (0139 left some unnamed). */
  carers: z.array(WorkstreamHolder),
  /** The caller may open the repeat deal: a carer or the lead's holder. */
  canOpenDeal: z.boolean(),
  lastContactAt: Moment.nullable(),
  nextCareOn: Day,
  careDue: z.boolean(),
  collected: MoneyVnd,
  completedAt: Moment,
})

export const AfterSaleBookResponse = paged(AfterSaleRow)

export type CustomerTemperature = z.infer<typeof CustomerTemperature>
export type AfterSaleTemperatureFilter = z.infer<typeof AfterSaleTemperatureFilter>
export type AfterSaleCareStatus = z.infer<typeof AfterSaleCareStatus>
export type AfterSaleBookQuery = z.infer<typeof AfterSaleBookQuery>
export type AfterSaleTemperatureReading = z.infer<typeof AfterSaleTemperatureReading>
export type AfterSaleRow = z.infer<typeof AfterSaleRow>
export type AfterSaleBookResponse = z.infer<typeof AfterSaleBookResponse>
