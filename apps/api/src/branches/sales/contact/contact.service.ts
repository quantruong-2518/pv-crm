import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ContactBookResponse,
  ContactBookRow,
  ContactListResponse,
  ContactRow,
  type ContactBookQuery,
  type ContactCreate,
  type ContactPatch,
  type MaObject,
} from '@pv/contracts'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { conflict, notFound } from '@api/platform/http/problem'
import { ContactRepository } from './contact.repository'
import { fromCreate, fromPatch, refOf, toContract } from './contact.mapper'

/** The contact book — hangs under lead, the same shape as `MeetingService`.
 *
 *  ------------------------------------------------------------------
 *  THIS SERVICE DOES NOT CHECK PERMISSIONS, AND THAT IS BY DESIGN
 *  ------------------------------------------------------------------
 *  The scope axis is already blocked one layer up by `LeadService.guard()`:
 *  the four endpoints that go through the LEAD's `:code` call `guard` before
 *  delegating down here, the same as the four meeting endpoints. The other
 *  three endpoints are addressed by `CT-…`, so `@Need` sees no lead to
 *  enforce against — they have to resolve one more hop, and `LeadService`'s
 *  `guardByContact` is where that happens.
 *
 *  The `mine()` function below is NOT a permission check: it only confirms
 *  the contact really belongs to the lead on the path, and throws 404
 *  rather than 403 — the same reason `MeetingService.mine` does that, so it
 *  never reveals that the code exists under a different lead. */
@Injectable()
export class ContactService {
  constructor(
    private readonly repo: ContactRepository,
    private readonly mirror: ObjectMirror,
  ) {}

  async list(leadCode: MaObject): Promise<ContactListResponse> {
    const rows = await this.repo.byLead(leadCode)
    return ContactListResponse.parse({ rows: rows.map(toContract) })
  }

  /** The whole book, not just one lead — `GET /sales/contacts`.
   *
   *  This is the ONLY endpoint in this module that checks scope itself, and
   *  it has to: the other five endpoints go through
   *  `LeadService.guard`/`guardByContact` because they already have a code
   *  on the path to guard against, while this one has no code at all — it
   *  asks for the whole book. The scope axis therefore lives inside the
   *  query itself (`ContactRepository.book`), cut by lead rather than by
   *  person: a contact is the CUSTOMER's person, belonging to no
   *  salesperson.
   *
   *  `hidden` is NOT counted here, and that is one place this differs from
   *  the lead book: the `paged()` envelope demands that field, but counting
   *  a second time without the scope cut would produce "N people you can't
   *  see" — a number that tells the reader exactly how many customers in
   *  the department they cannot touch. For a directory, that number is
   *  itself a leak. Return 0 and say so here. */
  async book(who: Actor, q: ContactBookQuery): Promise<ContactBookResponse> {
    const page = await this.repo.book(who, q, true)

    return ContactBookResponse.parse({
      rows: page.rows.map((r) => ({
        ...toContract(r.row),
        ...(r.accountCode ? { accountCode: r.accountCode } : {}),
        ...(r.accountName ? { accountName: r.accountName } : {}),
        company: r.company,
      })),
      total: page.total,
      hidden: 0,
    })
  }

  /** One contact with its company context, for the profile screen.
   *
   *  Returns the SAME shape as a book row (`ContactBookRow`) rather than a
   *  third shape: the profile screen prints exactly what the book row
   *  prints, plus a place to edit. A separate profile shape is where two
   *  screens start disagreeing about the same person.
   *
   *  A code that does not exist and a code outside scope produce the SAME
   *  404 — the same reasoning `LeadService.guardByContact` writes down:
   *  distinguishing the two responses would tell the caller that `CT-0412`
   *  really exists under a lead they cannot read. */
  async profile(who: Actor, code: MaObject): Promise<ContactBookRow> {
    const found = await this.repo.oneWithContext(who, code, true)
    if (!found) throw notFound('người liên hệ', code)

    return ContactBookRow.parse({
      ...toContract(found.row),
      ...(found.accountCode ? { accountCode: found.accountCode } : {}),
      ...(found.accountName ? { accountName: found.accountName } : {}),
      company: found.company,
    })
  }

  /** Write a new person into a lead's book.
   *
   *  THE FIRST PERSON IS ALWAYS PRIMARY, no matter what the request body
   *  says. A lead with contacts but nobody flagged "primary" leaves the lead
   *  profile with no name to print at the top, and the five mirror columns
   *  on `sales.lead` with no source to copy from. This is the half of the
   *  rule an index cannot state — an index can only say "at most one", while
   *  "at least one once somebody exists" has to be the service's rule. */
  async add(who: Actor, leadCode: MaObject, body: ContactCreate): Promise<ContactRow> {
    const code = await this.repo.nextCode()

    const written = await this.repo.run(async (tx) => {
      const had = await this.repo.countOf(tx, leadCode)
      const isPrimary = had === 0 ? true : body.isPrimary

      const values = fromCreate(leadCode, body, who, isPrimary)

      /* Step aside BEFORE writing, not after: `contact_primary_uniq` rejects
         two rows with the same flag, so the reverse order produces a 409 for
         a perfectly valid operation. */
      if (isPrimary) await this.repo.demote(tx, leadCode)

      await this.mirror.put(tx, refOf(code, leadCode, values))
      const row = await this.repo.insert(tx, { ...values, code })

      if (isPrimary) await this.repo.mirrorOntoLead(tx, leadCode, row)
      return row
    })

    return ContactRow.parse(toContract(written))
  }

  async edit(leadCode: MaObject, code: MaObject, body: ContactPatch): Promise<ContactRow> {
    const current = await this.mine(leadCode, code)

    const written = await this.repo.run(async (tx) => {
      const row = await this.repo.patch(tx, code, fromPatch(body))
      if (!row) throw notFound('người liên hệ', code)

      await this.mirror.put(tx, refOf(code, leadCode, row))
      /* Editing the name or phone of the PRIMARY contact must flow down into
         the lead's five columns in that same pass. Letting them drift means
         the lead profile prints an old number while the contact book right
         next to it prints the new one. */
      if (current.isPrimary) await this.repo.mirrorOntoLead(tx, leadCode, row)
      return row
    })

    return ContactRow.parse(toContract(written))
  }

  /** Deletes for real, does not deactivate.
   *
   *  Unlike `config_entry` — there, deleting one row strands 21 leads,
   *  while here no table foreign-keys into a contact. The only cost is that
   *  deleting the PRIMARY contact leaves the lead with no one at the top, so
   *  this endpoint refuses exactly that case rather than silently leaving a
   *  book with nobody primary: change the primary contact first, then
   *  delete. */
  async drop(leadCode: MaObject, code: MaObject): Promise<void> {
    const row = await this.mine(leadCode, code)

    if (row.isPrimary) {
      const all = await this.repo.byLead(leadCode)
      if (all.length > 1) {
        throw conflict(
          'Đây là người liên hệ chính. Đặt người khác làm chính trước, rồi mới xoá người này.',
        )
      }
    }

    await this.repo.run(async (tx) => {
      const gone = await this.repo.remove(tx, code)
      if (!gone) throw notFound('người liên hệ', code)
    })
  }

  /** Change the primary contact — TWO rows, one transaction.
   *
   *  A separate endpoint rather than `PATCH { isPrimary: true }` because it
   *  touches two rows and only works in exactly one order; the full
   *  reasoning is in the docblock of `packages/contracts/src/sales/contact.ts`. */
  async setPrimary(leadCode: MaObject, code: MaObject): Promise<ContactRow> {
    const row = await this.mine(leadCode, code)
    if (row.isPrimary) return ContactRow.parse(toContract(row))

    const written = await this.repo.run(async (tx) => {
      await this.repo.demote(tx, leadCode)
      await this.repo.promote(tx, code)

      const fresh = await this.repo.patch(tx, code, {})
      if (!fresh) throw notFound('người liên hệ', code)

      await this.mirror.put(tx, refOf(code, leadCode, fresh))
      await this.repo.mirrorOntoLead(tx, leadCode, fresh)
      return fresh
    })

    return ContactRow.parse(toContract(written))
  }

  /** Whether this contact really belongs to the lead on the path.
   *
   *  404 rather than 403 — see the docblock at the top of the file. */
  private async mine(leadCode: string, code: string) {
    const row = await this.repo.byCode(code)
    if (!row || row.leadCode !== leadCode) throw notFound('người liên hệ', code)
    return row
  }

  /** Which lead currently holds this contact.
   *
   *  Exists so `LeadService` can resolve the scope axis for the three
   *  endpoints addressed by `CT-…`: `@Need` is static metadata, so it cannot
   *  read the request body to know which lead to guard against. Returns
   *  `null` instead of throwing, leaving the caller to decide the error — a
   *  code that does not exist and a code belonging to someone else's lead
   *  have to produce the same response. */
  async leadOf(code: string): Promise<string | null> {
    const row = await this.repo.byCode(code)
    return row?.leadCode ?? null
  }
}
