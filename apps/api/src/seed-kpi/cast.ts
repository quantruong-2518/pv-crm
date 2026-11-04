import type { Branch, RoleId } from '@pv/engines'

/** Who the KPI test book is about, and the markers that find it again.
 *
 *  The visible marker `TAG` is for people reading a screen; purge never reads
 *  it. Purge finds rows by the technical markers only: actor ids under
 *  `SEED_ID`, mailboxes under `SEED_MAIL`, org units under `SEED_UUID`. */

export const TAG = '[TEST KPI] '
export const SEED_ID = 'u-kpi-'
export const SEED_MAIL = '@kpi-seed.test'
export const SEED_UUID = '5eed0000-'

/** The real seats the book leans on: they accept, approve and collect. */
export const DIRECTOR = 'u-quantb'
export const HEAD = 'u-grace'

export type Key =
  | 'head2'
  | 'mkt1'
  | 'mkt2'
  | 'mkt3'
  | 'bd1'
  | 'bd2'
  | 'bd3'
  | 'pre1'
  | 'pre2'
  | 'pre3'
  | 'sale1'
  | 'sale2'
  | 'sale3'
  | 'ae1'
  | 'ae2'
  | 'ae3'

export type Person = {
  key: Key
  id: string
  name: string
  email: string
  role: string
  roleIds: RoleId[]
  branches: Branch[]
  ownOnly: boolean
}

const seat = (key: Key, name: string, role: string, roleId: RoleId): Person => ({
  key,
  id: `${SEED_ID}${key}`,
  name: `${TAG}${name}`,
  email: `kpi.${key}${SEED_MAIL}`,
  role,
  roleIds: [roleId],
  /* KPI scores only enabled seats licensed for Sales. */
  branches: ['One', 'Sales'],
  /* The real `sale` seat reads only its own book (`staff.ts`). */
  ownOnly: roleId === 'sale',
})

export const PEOPLE: Person[] = [
  seat('head2', 'Trưởng phòng 2', 'Trưởng phòng Kinh doanh', 'head-of-sales'),
  seat('mkt1', 'Marketing 1', 'Marketing', 'marketing'),
  seat('mkt2', 'Marketing 2', 'Marketing', 'marketing'),
  seat('mkt3', 'Marketing 3', 'Marketing', 'marketing'),
  seat('bd1', 'BD 1', 'BD', 'bd'),
  seat('bd2', 'BD 2', 'BD', 'bd'),
  seat('bd3', 'BD 3', 'BD', 'bd'),
  seat('pre1', 'Presales 1', 'Presales', 'presales'),
  seat('pre2', 'Presales 2', 'Presales', 'presales'),
  seat('pre3', 'Presales 3', 'Presales', 'presales'),
  seat('sale1', 'Sale 1', 'Sale', 'sale'),
  seat('sale2', 'Sale 2', 'Sale', 'sale'),
  seat('sale3', 'Sale 3', 'Sale', 'sale'),
  seat('ae1', 'AE 1', 'Account Executive', 'account-executive'),
  seat('ae2', 'AE 2', 'Account Executive', 'account-executive'),
  seat('ae3', 'AE 3', 'Account Executive', 'account-executive'),
]

export const idOf = (key: Key): string => `${SEED_ID}${key}`

/** A Vietnam wall-clock stamp, `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`, as an
 *  instant: the KPI month edges are Vietnam days, so the book is written in them. */
export function vn(stamp: string): Date {
  const [day, time = '09:00'] = stamp.split(' ')
  return new Date(`${day}T${time}:00+07:00`)
}

export const plusHours = (at: Date, hours: number): Date => new Date(at.getTime() + hours * 3.6e6)

/** The Vietnam calendar day of an instant. */
export const vnDay = (at: Date): string =>
  new Date(at.getTime() + 7 * 3.6e6).toISOString().slice(0, 10)
