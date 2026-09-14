import type { Branch, RoleId } from '@pv/engines'

/** The people who actually sign in to PV One — one seat per role.
 *
 *  NOT a fixture. `@pv/engines/fixtures/*` holds two frozen demo scenarios
 *  whose actors exist to make the screens tell a story; this list is the real
 *  account book of Pebble Vina, so it lives with the server that plants it and
 *  the demo scenarios are free to keep their own cast.
 *
 *  Exactly one account per `RoleId`, deliberately: a role with nobody in it
 *  cannot be checked by opening a browser, and the two screens that are hardest
 *  to reason about (campaign broadcast, read-only opportunities) belong to the
 *  two roles that are easiest to forget. */
export type StaffMember = {
  id: string
  name: string
  email: string
  /** Display label. Vietnamese on purpose — it is printed, not keyed on. */
  role: string
  roleId: RoleId
  branches: Branch[]
  ownOnly?: boolean
}

/** Every branch the company has. Only the director holds all five; the rest of
 *  the book is a sales department, so it gets One + Sales. */
const ALL: Branch[] = ['One', 'Sales', 'Supply', 'Factory', 'Finance']
const SALES: Branch[] = ['One', 'Sales']

/** Order follows `RoleId` — widest reach first. */
export const STAFF: StaffMember[] = [
  {
    id: 'u-quantb',
    name: 'Quantb',
    email: 'quantb@pebblevina.com',
    role: 'Giám đốc',
    roleId: 'director',
    branches: ALL,
  },
  {
    id: 'u-grace',
    name: 'Grace',
    email: 'grace@pebblevina.com',
    role: 'Trưởng phòng Kinh doanh',
    roleId: 'head-of-sales',
    branches: SALES,
  },
  {
    id: 'u-marketing',
    name: 'Marketing',
    email: 'marketing@pebblevina.com',
    role: 'Marketing',
    roleId: 'marketing',
    branches: SALES,
  },
  {
    id: 'u-bd',
    name: 'BD',
    email: 'bd@pebblevina.com',
    role: 'BD',
    roleId: 'bd',
    branches: SALES,
  },
  {
    id: 'u-presales',
    name: 'Presales',
    email: 'presales@pebblevina.com',
    role: 'Presales',
    roleId: 'presales',
    branches: SALES,
  },
  {
    /** The only seat carrying axis 3: a Sale sees the leads and deals they own
     *  and nothing else. Dropping it here would make the role indistinguishable
     *  from an account executive on every screen. */
    id: 'u-sale',
    name: 'Sale',
    email: 'sale@pebblevina.com',
    role: 'Sale',
    roleId: 'sale',
    branches: SALES,
    ownOnly: true,
  },
  {
    id: 'u-am',
    name: 'AM',
    email: 'am@pebblevina.com',
    role: 'Account Executive',
    roleId: 'account-executive',
    branches: SALES,
  },
]
