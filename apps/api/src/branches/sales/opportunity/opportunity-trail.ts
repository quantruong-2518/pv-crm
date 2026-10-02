import type { Actor } from '@pv/engines'
import type { OpportunityProduct, OpportunityUpdate } from '@pv/contracts'
import { byOf, type TouchEntry } from '../touch/touch.service'
import { NOTE } from './opportunity.mapper'
import type { OpportunityRead } from './opportunity.repository'

/** What a profile save leaves on the timeline: one `field-filled` touch per
 *  field it changed, old value → new — the kind the SALE lane's change already
 *  writes (`recordSaleLane`). Values are compared as the sentence prints them,
 *  so an unchanged field writes nothing and a reordered list is not a change.
 *  SALE owners are absent: `recordSaleLane` writes theirs. */
export function editTrail(input: {
  found: OpportunityRead
  body: OpportunityUpdate
  names: ReadonlyMap<string, string>
  products: readonly OpportunityProduct[]
  who: Pick<Actor, 'id' | 'name'>
}): TouchEntry[] {
  const { found, body, names } = input
  const row = found.row
  const bdBefore = found.owners.filter((o) => o.role === 'BD').map((o) => o.name)
  const fields: [string, string, string][] = [
    ['Tên cơ hội', row.name, body.name],
    ['Giá trị', money(row.amount, row.currency), money(body.amount, body.currency)],
    ['Ngày dự kiến chốt', day(row.expectedClose), day(body.expectedClose)],
    ['Xác suất', percent(row.probability), percent(body.probability ?? null)],
    ['Sản phẩm', list(found.products.map((p) => p.name)), list(input.products.map((p) => p.name))],
    ['BD', list(bdBefore), list(body.bdOwners.map((id) => names.get(id) ?? id))],
    [
      'Tệp đính kèm',
      list(row.attachments.map((f) => f.name)),
      list(body.attachments.map((f) => f.name)),
    ],
  ]
  return fields
    .filter(([, before, after]) => before !== after)
    .map(([field, before, after]) => ({
      subjectCode: row.code,
      subjectKind: 'opportunity' as const,
      kind: 'field-filled' as const,
      ...byOf(input.who),
      note: NOTE.edited(field, before, after),
    }))
}

const NONE = 'chưa có'

const money = (amount: number | null, currency: string | null): string =>
  amount === null ? NONE : `${amount.toLocaleString('vi-VN')} ${currency ?? ''}`.trim()

/** `YYYY-MM-DD` → `DD/MM/YYYY`, the way every screen prints a day. */
const day = (d: string | null): string => (d ? d.split('-').reverse().join('/') : NONE)

const percent = (p: number | null): string => (p === null ? NONE : `${p}%`)

const list = (xs: readonly string[]): string =>
  xs.length === 0 ? NONE : [...xs].sort((a, b) => a.localeCompare(b, 'vi')).join(', ')
