import { Logger } from '@nestjs/common'
import { z } from 'zod'

/** The national business registry, asked one tax code at a time — what turns a
 *  tax code the web suggested into a sure one (AI fill, spec step 3).
 *
 *  Behind an interface so the source can be swapped (another registry, a paid
 *  API) without touching the enricher. A lookup never throws: a registry that
 *  is down only means the code stays unverified, and the fill goes on. */

export type TaxRecord = {
  name: string
  internationalName: string | null
  shortName: string | null
  address: string | null
}

export interface TaxRegistry {
  /** `null` = not verified: no such code, or the registry could not be asked. */
  lookup(taxCode: string): Promise<TaxRecord | null>
}

export const TAX_REGISTRY = Symbol('pv.sales.taxRegistry')

/** The vendor's shape, checked rather than trusted: it is someone else's API. */
const VietQrAnswer = z.object({
  code: z.string(),
  data: z
    .object({
      name: z.string().min(1),
      internationalName: z.string().nullish(),
      shortName: z.string().nullish(),
      address: z.string().nullish(),
    })
    .nullish(),
})

const TIMEOUT_MS = 3_000

/** VietQR's free lookup; `code: "00"` is its only success. */
export class VietQrTaxRegistry implements TaxRegistry {
  private readonly log = new Logger('TaxRegistry')

  async lookup(taxCode: string): Promise<TaxRecord | null> {
    try {
      const response = await fetch(
        `https://api.vietqr.io/v2/business/${encodeURIComponent(taxCode)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      )
      if (!response.ok) throw new Error(`status ${response.status}`)
      const answer = VietQrAnswer.parse(await response.json())
      if (answer.code !== '00' || !answer.data) return null
      const { name, internationalName, shortName, address } = answer.data
      return {
        name,
        internationalName: internationalName ?? null,
        shortName: shortName ?? null,
        address: address ?? null,
      }
    } catch (error) {
      const why =
        error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : 'unknown'
      this.log.warn(`vietqr lookup failed — ${why}`)
      return null
    }
  }
}
