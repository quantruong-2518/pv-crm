import { queryOptions, useQuery } from '@tanstack/react-query'
import { billions, millions } from '@pv/ui'
import { FxTodayResponse, type MoneyFx } from '@pv/contracts'
import { api } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { formatNumber, message, translate, type Lang } from '@/app/i18n'
import { dm } from '@/lib/date'

/** Daily exchange rates as the client reads them (ADR 0149).
 *
 *      GET /platform/fx-rates/today      any signed-in user
 *
 *  Today's rate is what a preview uses before the money event exists, so every
 *  figure built from it is provisional. Rows from the server carry their own
 *  `fx`; this file only words it, one way, for every screen that shows it. */

/** Every FX read, today's rate and the admin list alike. */
export const FX_KEY = ['platform', 'fx-rates'] as const
export const FX_TODAY_KEY = [...FX_KEY, 'today'] as const

export const fxTodayQuery = queryOptions({
  queryKey: FX_TODAY_KEY,
  queryFn: ({ signal }) =>
    api.read('/platform/fx-rates/today', { schema: FxTodayResponse, signal }),
  ...cacheTier.aggregate,
})

/** Today's rate behind a preview, `null` for VND (rate 1, nothing to state)
 *  and while the rate has not arrived, so a caller never converts at a guess. */
export function useTodayFx(currency: string | null | undefined): MoneyFx | null {
  const { data } = useQuery(fxTodayQuery)
  if (!currency || currency === 'VND') return null
  const row = data?.find((r) => r.currency === currency)
  return row ? { rate: row.rate, day: row.day, provisional: true, legacy: row.legacy } : null
}

/** A foreign amount in dong at the rate it names, to the whole dong. The one
 *  conversion on the web, for previews only: a server row carries `amountVnd`. */
export const vndAt = (amount: number, fx: Pick<MoneyFx, 'rate'>) => Math.round(amount * fx.rate)

/** The rate and the day it came from; a provisional figure says so in front.
 *  The legacy default has no real day, so it names the rate alone. */
export function fxBasisText(fx: MoneyFx, lang: Lang): string {
  const rate = formatNumber(fx.rate, lang)
  const day = dm(fx.day)
  const copy = fx.legacy
    ? message(
        `${fx.provisional ? 'tạm tính theo ' : ''}tỷ giá mặc định ${rate}`,
        `${fx.provisional ? 'provisional, ' : ''}default rate ${rate}`,
        `${fx.provisional ? '임시 환산, ' : ''}기본 환율 ${rate}`,
      )
    : fx.provisional
      ? message(
          `tạm tính theo tỷ giá ${rate} ngày ${day}`,
          `provisional, rate ${rate} on ${day}`,
          `${day} 환율 ${rate} 기준 임시 환산`,
        )
      : message(`tỷ giá ${rate} ngày ${day}`, `rate ${rate} on ${day}`, `${day} 환율 ${rate}`)
  return translate(copy, lang)
}

/** The whole second line: the dong value, then the rate basis. */
export const fxLineText = (vnd: number, fx: MoneyFx, lang: Lang) =>
  `≈ ${formatNumber(vnd, lang)} ₫ · ${fxBasisText(fx, lang)}`

/** The same line cut to fit a 152px book cell: value in millions (billions from
 *  a billion up), the bare rate and the day. The full line belongs in `title`. */
export const fxLineShort = (vnd: number, fx: MoneyFx, lang: Lang) =>
  [
    `≈ ${vnd >= 1_000_000_000 ? billions(vnd, 1) : millions(vnd, 0)} ₫`,
    formatNumber(fx.rate, lang),
    fx.legacy ? null : dm(fx.day),
  ]
    .filter(Boolean)
    .join(' · ')
