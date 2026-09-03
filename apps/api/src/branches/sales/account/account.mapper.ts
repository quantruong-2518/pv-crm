import type { ObjectRef } from '@pv/engines'
import type { AccountCreate, AccountProfile, AccountRow } from '@pv/contracts'
import type { account } from './account.schema'
import type { AccountRead } from './account.repository'

/** Every column of `sales.account` the application writes. `code` is excluded
 *  for the reason every create door in this branch excludes it — the sequence
 *  is the only legal source — and the two timestamps because the database
 *  fills them. */
export type AccountValues = Omit<typeof account.$inferInsert, 'code' | 'createdAt' | 'updatedAt'>

/** `undefined` on the form becomes `null` in the table, ONE place.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS CONVERSION CANNOT BE SKIPPED ON THE UPDATE PATH
 *  ------------------------------------------------------------------
 *  Three layers of this repo spell "empty" three different ways —
 *  `textNhapTuyChon` turns `''` into `undefined` at the contract, Drizzle reads
 *  `undefined` in a `.set()` as "leave this column alone", and Postgres stores
 *  `NULL`. Passing the parsed body straight into `.set()` therefore makes
 *  clearing a field IMPOSSIBLE: the user empties the tax code box, the contract
 *  drops it, Drizzle skips it, and the old value is still there when the page
 *  reloads. The bug reads as "the save button did nothing", which is the
 *  hardest kind to report.
 *
 *  `AccountUpdate` carries the whole editable set precisely so this function
 *  can be total — every column it names gets a value, so nothing is ambiguous
 *  about what the body meant. */
export function fromForm(body: AccountCreate): AccountValues {
  return {
    name: body.name,
    legalName: body.legalName ?? null,
    taxCode: body.taxCode ?? null,
    address: body.address ?? null,
    province: body.province ?? null,
    category: body.category ?? null,
    headcount: body.headcount ?? null,
    plants: body.plants ?? null,
    note: body.note ?? null,
  }
}

/** The string `account_identity_uniq` indexes, computed on this side so a
 *  find-or-create can ask for the same thing the constraint enforces.
 *
 *  Lower-casing happens here AND in the SQL expression, which is not a
 *  duplication to be cleaned up: the index lower-cases the stored name, this
 *  lower-cases the needle, and both are needed for the two to meet. */
export function identityOf(input: { name: string; taxCode?: string | null }): string {
  const tax = input.taxCode?.trim()
  return tax !== undefined && tax !== '' ? tax : input.name.trim().toLowerCase()
}

/** The eight columns of a lead that describe its COMPANY.
 *
 *  Declared here rather than imported from the lead module, and the direction
 *  matters: `sales.account` must not depend on the shape of `sales.lead`, or a
 *  column added to the busiest table in the branch would change what this one
 *  accepts. What the three lead write paths hand over is a structural match,
 *  checked by the compiler at each call site. */
export type LeadCompanyFacts = {
  company: string
  legalName?: string | null
  taxCode?: string | null
  address?: string | null
  province?: string | null
  category?: AccountCreate['category'] | null
  headcount?: number | null
  plants?: number | null
}

/** Same rule as `identityOf`, reading a lead's spelling of the same two facts.
 *
 *  A thin wrapper rather than making the callers rename `company` to `name`:
 *  the batch import path needs the key without building an intermediate object
 *  per row, and one adapter here beats three at the call sites. */
export function identityOfLead(lead: LeadCompanyFacts): string {
  return identityOf({ name: lead.company, taxCode: lead.taxCode ?? null })
}

/** The mirror row in E1's graph.
 *
 *  `state` carries whether this company has bought anything, because that is
 *  the one fact about a company that changes what every other screen does with
 *  it — and `ObjectRef` is what the ContextRail renders from. `amount` is left
 *  off deliberately: a company has no single amount, and filling it with the
 *  signed total would put a number on the rail that means something different
 *  from the number on every other object there. */
export function refOf(
  code: string,
  values: Pick<AccountValues, 'name'>,
  signed: boolean,
): ObjectRef {
  return {
    code,
    kind: 'AC',
    branch: 'Sales',
    label: values.name,
    state: signed ? 'khách' : 'tiềm năng',
  }
}

export function toContract(read: AccountRead): AccountRow {
  return {
    code: read.code,
    name: read.name,
    ...(read.legalName ? { legalName: read.legalName } : {}),
    ...(read.taxCode ? { taxCode: read.taxCode } : {}),
    ...(read.address ? { address: read.address } : {}),
    ...(read.province ? { province: read.province } : {}),
    category: read.category ?? null,
    headcount: read.headcount,
    plants: read.plants,
    ...(read.note ? { note: read.note } : {}),
    leads: read.leads,
    openDeals: read.openDeals,
    signedDeals: read.signedDeals,
    signedAmountVnd: read.signedAmountVnd,
    createdAt: read.createdAt.toISOString(),
    updatedAt: read.updatedAt.toISOString(),
  }
}

export function toProfile(
  read: AccountRead,
  children: {
    leadRows: AccountProfile['leadRows']
    dealRows: AccountProfile['dealRows']
    contactRows: AccountProfile['contactRows']
  },
): AccountProfile {
  return { ...toContract(read), ...children }
}
