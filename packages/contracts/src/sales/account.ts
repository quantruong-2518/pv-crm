import { z } from 'zod'
import { PageQuery, SortDir, paged } from '../pagination'
import { Dong, MaObject, Moc, intFromQuery, textNhap, textNhapTuyChon } from '../primitives'
import { LeadCategory } from './enums'

/** The CUSTOMER COMPANY book — `/sales/accounts`.
 *
 *      GET   /sales/accounts             company-book READ permission
 *      GET   /sales/accounts/:code       company-book READ permission
 *      POST  /sales/accounts             company-book WRITE permission
 *      PATCH /sales/accounts/:code       company-book WRITE permission
 *
 *  ------------------------------------------------------------------
 *  A NEW PERMISSION DOMAIN, WHERE `contact.ts` DELIBERATELY TOOK NONE
 *  ------------------------------------------------------------------
 *  The contact book runs on the lead read/write pair because a contact is part
 *  of one lead's profile — the same lead, described more precisely. An account
 *  is not that. It sits ABOVE the lead book and outlives any single enquiry:
 *  merging two companies, correcting a tax code, or renaming a customer changes
 *  what every lead, deal and contract under it is about. Handing that to
 *  the lead write permission would mean every Sale who can edit their own lead
 *  can also rename the customer for the whole department.
 *
 *  It is also NOT scoped by owner, and that absence is the second half of the
 *  same decision. `lead.xem` rides axis 3 (`ownOnly`) so a Sale sees their own
 *  rows; a company is not owned by a seller. Scoping this book would mean a
 *  Sale opening a new enquiry cannot see that the company is already a customer
 *  of the person at the next desk — which is the single most expensive thing
 *  this book exists to prevent.
 *
 *  ------------------------------------------------------------------
 *  NO DELETE DOOR, AND NO `active` FLAG EITHER
 *  ------------------------------------------------------------------
 *  Unlike `config_entry`, this book has neither. A company with leads pointing
 *  at it cannot be removed — the foreign keys refuse — and a company with none
 *  is a row that costs nothing to keep. Switching one "off" would raise a
 *  question no screen can answer: what happens to the four deals underneath it.
 *
 *  Two companies that turn out to be one is a MERGE, which is a different
 *  operation with a different shape (re-point the children, keep both codes
 *  resolvable) and it is not in this sweep. `account_identity_uniq` in the
 *  schema is what keeps the need for it rare. */

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** What one company looks like on the wire.
 *
 *  The four counts at the bottom are computed, not stored, and they ride with
 *  the row rather than behind a second call for the reason the config bundle
 *  ships `usage`: the question "is this company worth opening" is answered by
 *  those numbers, so a list without them is a list of names. */
export const AccountRow = z.object({
  code: MaObject,
  name: textNhap(200),
  legalName: z.string().optional(),
  taxCode: z.string().optional(),

  address: z.string().optional(),
  province: z.string().optional(),
  category: LeadCategory.nullable(),

  headcount: z.number().int().nonnegative().nullable(),
  plants: z.number().int().nonnegative().nullable(),

  note: z.string().optional(),

  /** How many enquiries this company has produced, ever. */
  leads: z.number().int().nonnegative(),
  /** Deals still open — the ones a seller can still lose. */
  openDeals: z.number().int().nonnegative(),
  /** Contracts signed. This is the number that makes an account a CUSTOMER
   *  rather than a name, and it is why the two scenarios of this repo are
   *  split into one that has bought and one that has not. */
  signedDeals: z.number().int().nonnegative(),
  /** Total value of everything signed, in dong. Converted server-side using the
   *  one rate table, for the same reason the opportunity book sorts by a
   *  converted amount: two sums of one company have to come from one table or
   *  the screen disagrees with itself. */
  signedAmountVnd: Dong,

  createdAt: Moc,
  updatedAt: Moc,
})

export const AccountBookResponse = paged(AccountRow)

/** One company, plus the rows hanging off it.
 *
 *  The profile ships its children INLINE rather than behind three more calls.
 *  The alternative — a call per panel — is what the lead profile does, and it
 *  is right there because a lead's timeline can run to hundreds of rows. A
 *  company's children are bounded by how much business one customer has done
 *  with us, which fits on a screen; three round trips to draw one page is the
 *  cost of pretending otherwise. */
export const AccountProfile = AccountRow.extend({
  /** Every enquiry, newest first. */
  leadRows: z.array(
    z.object({
      code: MaObject,
      company: textNhap(200),
      tier: z.string().optional(),
      stage: z.string().optional(),
      ownerName: z.string().optional(),
      createdAt: Moc,
    }),
  ),
  /** Every deal, newest first — open and closed, because "what have we tried to
   *  sell them" includes the attempts that failed. */
  dealRows: z.array(
    z.object({
      code: MaObject,
      name: textNhap(200),
      state: z.string(),
      amountVnd: Dong.nullable(),
      signed: z.boolean(),
      createdAt: Moc,
    }),
  ),
  /** Everyone we know at the company, resolved through their leads — see the
   *  docblock of `contact.schema.ts` for why the contact row does not carry an
   *  account code of its own. */
  contactRows: z.array(
    z.object({
      code: MaObject,
      leadCode: MaObject,
      name: textNhap(120),
      title: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      isPrimary: z.boolean(),
    }),
  ),
})

// ---------------------------------------------------------------------------
// ASKING THE BOOK A NARROWER QUESTION
// ---------------------------------------------------------------------------

/** Columns the book sorts by.
 *
 *  `signedAmountVnd` and the three counts are all aggregates, and they are
 *  sortable anyway: "who are our biggest customers" is the question this book
 *  is opened for, and answering it by sorting the page you happen to be on is
 *  answering a different question. The server sorts over the whole book. */
export const AccountSortKey = z.enum([
  'name',
  'province',
  'leads',
  'openDeals',
  'signedDeals',
  'signedAmountVnd',
  'createdAt',
])

export const AccountBookQuery = PageQuery.extend({
  sort: AccountSortKey.default('name'),
  dir: SortDir.default('asc'),

  /** Name, legal name or tax code — one box, because a person looking for a
   *  company types whichever of the three they happen to remember. */
  q: z.string().trim().min(1).max(120).optional(),
  province: z.string().trim().min(1).max(120).optional(),
  category: LeadCategory.optional(),

  /** `1` = only companies that have signed something; `0` = only those that
   *  have not. Absent = both.
   *
   *  A number rather than `Bool` because the two answers are the two frozen
   *  scenarios of this repo — bought and not bought — and a screen switching
   *  between them is switching between two customer books, not toggling a
   *  filter off and on. */
  customer: intFromQuery.pipe(z.union([z.literal(0), z.literal(1)])).optional(),
})

// ---------------------------------------------------------------------------
// THE WRITE DOORS
// ---------------------------------------------------------------------------

/** The fields a person fills in, on either door — same technique as
 *  `dealFields` next door, and for the same reason: the create dialog and the
 *  profile form are one form in two places. */
const companyFields = {
  name: textNhap(200),
  legalName: textNhapTuyChon(200),
  /** Free text rather than a digit pattern. Vietnamese tax codes are 10 or 13
   *  digits with a hyphen, but this book also holds foreign customers, and a
   *  regex that refuses a real company's real number is a regex that teaches
   *  people to leave the field empty. The uniqueness index does the work that
   *  matters. */
  taxCode: textNhapTuyChon(32),

  address: textNhapTuyChon(300),
  province: textNhapTuyChon(120),
  category: LeadCategory.optional(),

  headcount: z.number().int().nonnegative().max(1_000_000).optional(),
  plants: z.number().int().nonnegative().max(1_000).optional(),

  note: textNhapTuyChon(1_000),
}

/** `POST /sales/accounts`.
 *
 *  `code` is absent for the reason every create door in this branch omits it:
 *  the only legal source is the server's sequence, and a body that could name
 *  its own code could land on another company's row. */
export const AccountCreate = z.object(companyFields)

/** `PATCH /sales/accounts/:code` — the profile's save button.
 *
 *  Carries the WHOLE editable set rather than the changed fields, matching
 *  `OpportunityUpdate`. Here the reason is weaker than it is there — this shape
 *  has no cross-field rules to check — and the consistency is the point: two
 *  profile forms in one branch that disagree about whether a missing key means
 *  "unchanged" or "clear it" is a bug waiting for whoever writes the third. */
export const AccountUpdate = z.object(companyFields)

/** Attaching a lead to a company, from the lead's side.
 *
 *  `PATCH /sales/leads/:code/account`, lead WRITE permission — this one IS a
 *  lead-level edit, unlike everything else in this file, because it changes
 *  which company one enquiry belongs to and touches no company row.
 *
 *  `null` detaches. That is a real operation rather than a hole: a lead
 *  attached to the wrong company must be removable from it without inventing a
 *  third company to park it under. */
export const LeadAccountAttach = z.object({
  accountCode: MaObject.nullable(),
})

export type AccountRow = z.infer<typeof AccountRow>
export type AccountProfile = z.infer<typeof AccountProfile>
export type AccountBookResponse = z.infer<typeof AccountBookResponse>
export type AccountBookQuery = z.infer<typeof AccountBookQuery>
export type AccountSortKey = z.infer<typeof AccountSortKey>
export type AccountCreate = z.infer<typeof AccountCreate>
export type AccountUpdate = z.infer<typeof AccountUpdate>
export type LeadAccountAttach = z.infer<typeof LeadAccountAttach>
