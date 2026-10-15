import { and, eq } from 'drizzle-orm'
import type { ContractKind } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { invalid } from '@api/platform/http/problem'
import { configEntry } from './config.schema'

/** Reads of the `CONTRACT_KIND` catalogue for the doors that carry a `kind`.
 *
 *  The code is an open string now, so membership is judged here and not by the
 *  zod shape. Only NEW writes need an active entry: a kind hidden later keeps
 *  displaying on rows already stored, which is why `kindLabel` ignores `active`. */

/** The entry's name, retired entries included; the code itself when no row has it. */
export async function kindLabel(handle: Db, kind: ContractKind): Promise<string> {
  const [found] = await handle
    .select({ name: configEntry.name })
    .from(configEntry)
    .where(and(eq(configEntry.list, 'CONTRACT_KIND'), eq(configEntry.id, kind)))
    .limit(1)
  return found?.name ?? kind
}

/** 400 on the `kind` field unless the write may use `kind`. An unknown code is
 *  always refused; a retired one only when the deal holds no row of it yet, so
 *  a negotiation already under way (`rows`) can still be signed and quoted. */
export async function assertKindUsable(
  handle: Db,
  rows: readonly { kind: ContractKind | null }[],
  kind: ContractKind | undefined,
): Promise<void> {
  if (kind === undefined) return
  const [found] = await handle
    .select({ active: configEntry.active })
    .from(configEntry)
    .where(and(eq(configEntry.list, 'CONTRACT_KIND'), eq(configEntry.id, kind)))
    .limit(1)
  if (!found) throw invalid({ kind: ['Loại hợp đồng không có trong danh sách. Chọn lại loại.'] })
  if (!found.active && !rows.some((r) => r.kind === kind)) {
    throw invalid({ kind: ['Loại hợp đồng này đã tắt. Chọn loại khác.'] })
  }
}
