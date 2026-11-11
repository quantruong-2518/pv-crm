import { Logger } from '@nestjs/common'
import { z } from 'zod'
import type { FxCurrency } from '@pv/contracts'

/** The Vietcombank daily rate sheet, asked for one currency's transfer-buying
 *  rate. Behind an interface so the source can be swapped and tests can fake it.
 *  A read never throws: a feed that is down only means today's row waits for the
 *  next try.
 *
 *  The sheet is small flat XML (`<Exrate CurrencyCode="USD" Transfer="26,305.00"/>`),
 *  read with a regex because no XML library is a dependency. Numbers carry comma
 *  thousands separators and "-" means no value. The vendor asks for at most one
 *  request every 5 minutes: the sweeper's 15-minute retry keeps well under it. */
export interface FxFeed {
  /** VND per unit, or `null` when the feed has no usable number right now, or
   *  its sheet is not dated `today` (`YYYY-MM-DD`, Vietnam): a stale sheet must
   *  not be stored under today's date. */
  transferRate(currency: FxCurrency, today: string): Promise<number | null>
}

export const FX_FEED = Symbol('pv.platform.fxFeed')

const URL = 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx'
const TIMEOUT_MS = 5_000

/** Checked rather than trusted: it is someone else's sheet. Rounded to the
 *  column's two decimals so a three-decimal rate cannot fail the insert. */
const Transfer = z
  .string()
  .transform((s) => Number(s.replaceAll(',', '')))
  .pipe(z.number().positive().lt(1e12))
  .transform((n) => Math.round(n * 100) / 100)

/** The sheet's `<DateTime>` is US style, `11/11/2026 1:43:56 PM` (month first, seen on
 *  the live sheet). Day first would let a sheet stuck on 11/12 pass on 12/11. */
const datedToday = (xml: string, today: string): boolean => {
  const m = /<DateTime>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(xml)
  if (!m) return false
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}` === today
}

export class VietcombankFeed implements FxFeed {
  private readonly log = new Logger('fx')

  async transferRate(currency: FxCurrency, today: string): Promise<number | null> {
    try {
      const response = await fetch(URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new Error(`status ${response.status}`)
      const xml = await response.text()
      if (!datedToday(xml, today)) throw new Error('sheet is not dated today')
      const tag = new RegExp(`<Exrate\\b[^>]*\\bCurrencyCode="${currency}"[^>]*>`).exec(xml)?.[0]
      const raw = tag ? /\bTransfer="([^"]*)"/.exec(tag)?.[1] : undefined
      const parsed = Transfer.safeParse(raw)
      if (!parsed.success)
        throw new Error(`no usable Transfer for ${currency} (${raw ?? 'absent'})`)
      return parsed.data
    } catch (error) {
      const why =
        error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : 'unknown'
      this.log.warn(`vietcombank fetch failed — ${why}`)
      return null
    }
  }
}
