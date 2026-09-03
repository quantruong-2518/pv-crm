import { Injectable } from '@nestjs/common'
import {
  AccountBookResponse,
  AccountProfile,
  AccountRow,
  type AccountBookQuery,
  type AccountCreate,
  type AccountUpdate,
  type MaObject,
} from '@pv/contracts'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { notFound } from '@api/platform/http/problem'
import type { Db } from '@api/platform/db/db.module'
import { AccountRepository } from './account.repository'
import {
  fromForm,
  identityOfLead,
  refOf,
  toContract,
  toProfile,
  type LeadCompanyFacts,
} from './account.mapper'

/** The customer-company book — a standalone module, not hung under lead.
 *
 *  ------------------------------------------------------------------
 *  NO SCOPE AXIS, AND THAT IS A DECISION, NOT AN OMISSION
 *  ------------------------------------------------------------------
 *  Every other service in this branch takes `who: Actor` and asks `inScope`.
 *  Not here, because a company does not belong to any one salesperson — the
 *  full reasoning lives in `packages/contracts/src/sales/account.ts` and at
 *  the account-view permission declaration in `e2-access.ts`. The other
 *  two gates (license and role) still guard fully, at the controller's
 *  `@Need`.
 *
 *  `hidden` on every page is therefore always 0: no row gets cut by
 *  permission, so there is nothing to count. Returning 0 rather than
 *  dropping the field — `paged()`'s envelope is the shape every book
 *  shares, and a book missing a field is a book the screen has to handle
 *  specially. */
@Injectable()
export class AccountService {
  constructor(
    private readonly repo: AccountRepository,
    private readonly mirror: ObjectMirror,
  ) {}

  async book(q: AccountBookQuery): Promise<AccountBookResponse> {
    const page = await this.repo.book(q)
    return AccountBookResponse.parse({
      rows: page.rows.map(toContract),
      total: page.total,
      hidden: 0,
    })
  }

  async profile(code: MaObject): Promise<AccountProfile> {
    const found = await this.repo.byCode(code)
    if (!found) throw notFound('công ty', code)

    /* Three reads in PARALLEL, not sequential. They are independent of each
       other — no read needs another's result — so queueing them one after
       another would add three network round trips for a screen that renders
       once. */
    const [leadRows, dealRows, contactRows] = await Promise.all([
      this.repo.leadsOf(code),
      this.repo.dealsOf(code),
      this.repo.contactsOf(code),
    ])

    return AccountProfile.parse(
      toProfile(found, {
        leadRows: leadRows.map((r) => ({
          code: r.code,
          company: r.company,
          ...(r.tier ? { tier: r.tier } : {}),
          ...(r.stage ? { stage: r.stage } : {}),
          ...(r.ownerName ? { ownerName: r.ownerName } : {}),
          createdAt: r.createdAt.toISOString(),
        })),
        dealRows: dealRows.map((r) => ({
          code: r.code,
          name: r.name,
          state: r.state,
          amountVnd: r.amountVnd === null ? null : Number(r.amountVnd),
          signed: r.contractCode !== null,
          createdAt: r.createdAt.toISOString(),
        })),
        contactRows: contactRows.map((r) => ({
          code: r.code,
          leadCode: r.leadCode,
          name: r.name,
          ...(r.title ? { title: r.title } : {}),
          ...(r.email ? { email: r.email } : {}),
          ...(r.phone ? { phone: r.phone } : {}),
          isPrimary: r.isPrimary,
        })),
      }),
    )
  }

  async create(body: AccountCreate): Promise<AccountRow> {
    const code = await this.repo.nextCode()
    const values = fromForm(body)

    await this.repo.run(async (tx) => {
      /* Mirror row BEFORE the business row, the same order every service with
         an E1 object uses: `account.code` foreign-keys into
         `platform.object(code)`, so the reverse order kills the first INSERT
         because the target does not exist yet. */
      await this.mirror.put(tx, refOf(code, values, false))
      await this.repo.insert(tx, { ...values, code })
    })

    /* Read back rather than build the response from the draft: the row's
       four numbers are counts over three other tables, and a company that
       just opened always has four zeros — but "always" here is an
       assumption, and the read-back is the fact. */
    const written = await this.repo.byCode(code)
    if (!written) throw new Error(`sales.account: vừa ghi ${code} mà đọc lại không thấy`)
    return AccountRow.parse(toContract(written))
  }

  async update(code: MaObject, body: AccountUpdate): Promise<AccountRow> {
    const values = fromForm(body)

    const written = await this.repo.run(async (tx) => {
      const row = await this.repo.update(tx, code, values)
      if (!row) return null
      /* If the company name changes, the label on ContextRail must change in
         the SAME transaction — letting them drift means the screen prints
         the old name and nothing turns red to flag it. */
      await this.mirror.put(tx, refOf(code, values, false))
      return row
    })

    if (!written) throw notFound('công ty', code)

    const read = await this.repo.byCode(code)
    if (!read) throw notFound('công ty', code)
    return AccountRow.parse(toContract(read))
  }

  /** Attach a lead to a company, or detach it.
   *
   *  Carries along every DEAL of that lead — `opportunity.account_code` is a
   *  copy of `lead.account_code`, not a second opinion (see
   *  `syncDealsOfLead`). Called from `LeadService`, after the lead has passed
   *  its `guard()`: the permission here is the lead's edit permission,
   *  because the row being changed is a lead row. */
  async attachLead(leadCode: MaObject, accountCode: MaObject | null): Promise<void> {
    const moved = await this.repo.run(async (tx) => {
      if (accountCode !== null) {
        const target = await this.repo.byCode(accountCode)
        if (!target) throw notFound('công ty', accountCode)
      }
      const ok = await this.repo.attachLead(tx, leadCode, accountCode)
      if (ok) await this.repo.syncDealsOfLead(tx, leadCode, accountCode)
      return ok
    })

    if (!moved) throw notFound('lead', leadCode)
  }

  /** Find a company by the identity rule, opening a new one if none exists —
   *  INSIDE the caller's transaction.
   *
   *  ------------------------------------------------------------------
   *  WHY IT TAKES `tx` FROM OUTSIDE INSTEAD OF OPENING ITS OWN
   *  ------------------------------------------------------------------
   *  The caller is the LEAD-WRITE path: manual entry, import, the landing
   *  page. All three already have a transaction open to write the lead along
   *  with its mirror row, and the company has to land in that same
   *  transaction. Without that, a rolled-back lead would still leave an
   *  empty company behind, and the customer book would grow names that
   *  never actually asked to buy anything.
   *
   *  The code is also reserved on that same `tx` (`nextCodeOn`), so this
   *  function only spends a number when it ACTUALLY opens a new company.
   *  Making the caller reserve a code up front would burn it nine times out
   *  of ten — the company is already on file — and would force the import
   *  path to reserve five thousand codes for five thousand rows of the same
   *  thirty companies.
   *
   *  ------------------------------------------------------------------
   *  THIS IS WHAT KEEPS THE CUSTOMER BOOK FROM GOING STALE
   *  ------------------------------------------------------------------
   *  The migration attached a company to every lead that ALREADY EXISTED.
   *  Without this function, every lead entered from tomorrow on would carry
   *  a NULL `account_code`, and the customer book would stand still while
   *  the lead book keeps growing — exactly the kind of silent failure no
   *  screen turns red for. */
  async resolveForLead(tx: Db, lead: LeadCompanyFacts): Promise<string> {
    const found = await this.repo.byIdentity(tx, identityOfLead(lead))
    if (found) return found.code

    const values = {
      /* Lead's `company` becomes the company's `name`. Two names for one
         thing, and the rename happens RIGHT HERE: the lead book calls it
         "the lead's company", the customer book calls it "customer name".
         Making either table rename its column would mean changing a table
         already in production to suit one that just came into being. */
      name: lead.company,
      legalName: lead.legalName ?? null,
      taxCode: lead.taxCode ?? null,
      address: lead.address ?? null,
      province: lead.province ?? null,
      category: lead.category ?? null,
      headcount: lead.headcount ?? null,
      plants: lead.plants ?? null,
      note: null,
    }

    const code = await this.repo.nextCodeOn(tx)
    await this.mirror.put(tx, refOf(code, values, false))
    const written = await this.repo.insert(tx, { ...values, code })
    return written.code
  }
}
