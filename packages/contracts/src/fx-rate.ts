import { z } from 'zod'
import { Day, Moment } from './primitives'
import { CurrencyCode } from './sales/enums'

/** Daily exchange rates — `platform.fx_rate`, one row per (currency, day).
 *
 *      GET /platform/fx-rates                    permission `setting.manage`
 *      PUT /platform/fx-rates/:currency/:day     permission `setting.manage`
 *      GET /platform/fx-rates/today              any signed-in user
 *
 *  The rate is dong per one unit of the currency, Vietcombank transfer-buying.
 *  Every converted figure names the rate it used (`MoneyFx`), so a number on a
 *  screen can be traced to the row that produced it. VND has no rows: its rate
 *  is 1 by definition. `legacy` marks the single backfill row that keeps closed
 *  months where they were; `manual` beats `vietcombank` for the same day. */

/** Every currency that needs a rate, i.e. all but VND. */
export const FxCurrency = CurrencyCode.exclude(['VND'])

export const FxSource = z.enum(['vietcombank', 'manual', 'legacy'])

/** Two decimals and below 10^12 mirror the column `numeric(14,2)`; anything
 *  else would pass here and fail in the database as an unlabelled 500. */
const FxRate = z
  .number('Nhập tỷ giá.')
  .positive('Tỷ giá phải lớn hơn 0.')
  .multipleOf(0.01, 'Tỷ giá tối đa 2 chữ số thập phân.')
  .lt(1e12, 'Tỷ giá quá lớn.')

/** The rate a converted figure was actually computed with. `day` is the day of
 *  the stored row used, which is earlier than the event day on weekends and
 *  holidays; `provisional` means the event has not happened yet, so today's
 *  rate stands in and the figure may still move. `legacy` is true when the row
 *  used is the pre-go-live default (source `legacy`, day 2000-01-01), whose
 *  day is meaningless to print. */
export const MoneyFx = z.object({
  rate: FxRate,
  day: Day,
  provisional: z.boolean(),
  legacy: z.boolean(),
})

export const FxRateRow = z.object({
  currency: FxCurrency,
  day: Day,
  rate: FxRate,
  source: FxSource,
  /** Who typed it; null unless `source` is `manual`. */
  setBy: z.object({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
  fetchedAt: Moment,
})

/** `GET /platform/fx-rates` — newest day first. Absent = no filter. */
export const FxRateListQuery = z
  .object({ currency: FxCurrency.optional(), from: Day.optional(), to: Day.optional() })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    error: 'Từ ngày phải trước hoặc bằng đến ngày.',
    path: ['to'],
  })

export const FxRateListResponse = z.object({ rows: z.array(FxRateRow) })

export const FxRatePutParams = z.object({ currency: FxCurrency, day: Day })

/** `PUT /platform/fx-rates/:currency/:day` — writes a `manual` row. */
export const FxRatePutBody = z.strictObject({ rate: FxRate })

export const FxRatePutResponse = FxRateRow

/** `GET /platform/fx-rates/today` — what the client uses for provisional previews. */
export const FxTodayRow = z.object({
  currency: FxCurrency,
  rate: FxRate,
  day: Day,
  /** `legacy` is true when the row used is the pre-go-live default (source `legacy`,
   *  day 2000-01-01), whose day is meaningless to print. */
  legacy: z.boolean(),
})

export const FxTodayResponse = z.array(FxTodayRow)

export type FxCurrency = z.infer<typeof FxCurrency>
export type FxSource = z.infer<typeof FxSource>
export type MoneyFx = z.infer<typeof MoneyFx>
export type FxRateRow = z.infer<typeof FxRateRow>
export type FxRateListQuery = z.infer<typeof FxRateListQuery>
export type FxRateListResponse = z.infer<typeof FxRateListResponse>
export type FxRatePutParams = z.infer<typeof FxRatePutParams>
export type FxRatePutBody = z.infer<typeof FxRatePutBody>
export type FxRatePutResponse = z.infer<typeof FxRatePutResponse>
export type FxTodayRow = z.infer<typeof FxTodayRow>
export type FxTodayResponse = z.infer<typeof FxTodayResponse>
