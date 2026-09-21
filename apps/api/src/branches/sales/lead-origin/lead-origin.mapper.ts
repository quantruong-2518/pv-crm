import type { LeadMotion, LeadOrigin } from '@pv/contracts'
import type { LeadOriginRowDb } from './lead-origin.schema'

/** Catalog rows → `LeadOrigin`. The catalog is tens of rows, so the repository
 *  reads origins, aliases and motion links as three flat lists and they are
 *  stitched here rather than aggregated in SQL. */

/** One origin row plus the count that is not a column. */
export type LeadOriginRead = { row: LeadOriginRowDb; leadCount: number }

export type LeadOriginLinks = {
  aliases: readonly { key: string; originId: string }[]
  motions: readonly { originId: string; motion: LeadMotion }[]
}

export function toContract(read: LeadOriginRead, links: LeadOriginLinks): LeadOrigin {
  const { row, leadCount } = read
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    active: row.active,
    ...(row.mergedInto ? { mergedInto: row.mergedInto } : {}),
    motions: links.motions.filter((m) => m.originId === row.id).map((m) => m.motion),
    aliases: links.aliases
      .filter((a) => a.originId === row.id)
      .map((a) => a.key)
      .sort(),
    leadCount,
  }
}
