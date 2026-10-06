import type { StaffMember } from './staff'

/** The real people who sign in to production, planted by `db:seed:accounts`.
 *
 *  Separate from `STAFF` on purpose: `STAFF` is the demo cast `seed.ts` hangs
 *  its leads and deals on (`u-sale`, `u-am`, …), so reshaping it would break
 *  the local seed. An account holds several roles; its grants are their union. */
const SALES: StaffMember['branches'] = ['One', 'Sales']

export const ACCOUNTS: StaffMember[] = [
  {
    id: 'u-quantb',
    name: 'Quantb',
    email: 'quantb@pebblevina.com',
    role: 'Admin',
    roleIds: ['director'],
    branches: ['One', 'Sales', 'Supply', 'Factory', 'Finance'],
  },
  {
    id: 'u-grace',
    name: 'Grace',
    email: 'grace@pebblevina.com',
    role: 'Giám đốc Kinh doanh',
    roleIds: ['head-of-sales'],
    branches: SALES,
  },
  {
    id: 'u-vita',
    name: 'Vita',
    email: 'vita@pebblevina.com',
    role: 'Marketing · BD',
    roleIds: ['marketing', 'bd'],
    branches: SALES,
  },
  {
    id: 'u-nari',
    name: 'Nari',
    email: 'nari@pebblevina.com',
    role: 'Account Executive',
    roleIds: ['account-executive'],
    branches: SALES,
  },
  {
    id: 'u-vivian',
    name: 'Vivian',
    email: 'vivian@pebblevina.com',
    role: 'Marketing · BD',
    roleIds: ['marketing', 'bd'],
    branches: SALES,
  },
]
