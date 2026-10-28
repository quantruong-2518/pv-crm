import { Injectable } from '@nestjs/common'
import { leadKeys, type Actor } from '@pv/engines'
import {
  LeadAiFillField,
  LeadAiFillResult,
  type LeadAiFillMarks,
  type ObjectCode,
} from '@pv/contracts'
import { AiTransientError, AiUnavailableError } from '@api/platform/ai/ai-errors'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { BusyError, conflict, denied, notFound, rateLimited } from '@api/platform/http/problem'
import { ContactService } from '../contact/contact.service'
import { LeadAiFillRepository } from './lead-ai-fill.repository'
import { byOf, TouchService } from '../touch/touch.service'
import { aiFillBlock, emptyFillable, type AiFillBlock } from './lead-ai-fill.rule'
import { LeadEnricher, type LeadSuggestions } from './lead-enrich'
import { LEAD_NOTE, type LeadValues } from './lead-write.mapper'
import type { LeadRowDb } from './lead.schema'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'

/** `POST /sales/leads/:code/ai-fill` — the enricher's suggestions applied to a
 *  stored lead (spec: AI lead fill, server steps 1–5).
 *
 *  Same two refusals and words as `PATCH :code` (404, 403 `out-of-scope`), asked
 *  again under the lock: the model call takes seconds, the lead may change hands.
 *  A registry-verified tax code another company already holds is a conflict
 *  (owner's decision); an unverified one is dropped, never shown as a conflict.
 *  One transaction writes only the fields still empty — the person fields first,
 *  through the contact writer and its lock order — with provenance, one
 *  `field-filled` touch and one audit line. Logs carry counts, never values. */

type Conflict = LeadAiFillResult['conflicts'][number]

/** Contact person columns: the primary contact's writer owns them. */
const PERSON_FIELDS = ['contactTitle', 'phone'] as const satisfies readonly LeadAiFillField[]

@Injectable()
export class LeadAiFillService {
  constructor(
    private readonly leads: LeadRepository,
    private readonly repo: LeadAiFillRepository,
    private readonly enricher: LeadEnricher,
    private readonly contacts: ContactService,
    private readonly audit: AuditRepository,
    private readonly touch: TouchService,
    private readonly profiles: LeadService,
  ) {}

  async fill(who: Actor, code: ObjectCode): Promise<LeadAiFillResult> {
    const before = await this.leads.byCode(who, code)
    if (!before) throw notFound('lead', code)
    if (!before.holds) throw denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)
    const row = before.row
    const block = aiFillBlock(row)
    if (block) throw conflict(BLOCKED[block])
    const wanted = emptyFillable(row)

    const found = await this.suggest(row, wanted, who)
    const conflicts = await this.clash(found, row.accountCode)

    const written = await this.repo.run((tx) => this.apply(tx, who, code, found))
    const filled = written.map((field) => ({ field, ...found[field]! }))
    const missing = wanted.filter((f) => !found[f] && !conflicts.some((c) => c.field === f))
    return LeadAiFillResult.parse({
      filled,
      conflicts,
      notFound: missing,
      profile: await this.profiles.profile(who, code),
    })
  }

  private async suggest(
    row: LeadRowDb,
    wanted: LeadAiFillField[],
    who: Actor,
  ): Promise<LeadSuggestions> {
    try {
      return await this.enricher.suggest(row, wanted, { actorId: who.id, subjectCode: row.code })
    } catch (error) {
      if (error instanceof AiUnavailableError) throw UNAVAILABLE[error.reason]()
      if (error instanceof AiTransientError) throw new BusyError()
      throw error
    }
  }

  /** A tax code another company holds is never written. Only a verified one
   *  (sure = the registry confirmed it) is worth a duplicate-company line; an
   *  unverified one is dropped. Read before the tx: PGlite has one connection. */
  private async clash(found: LeadSuggestions, own: string | null): Promise<Conflict[]> {
    const tax = found.taxCode
    const value = typeof tax?.value === 'string' ? tax.value : null
    const root = value ? leadKeys({ taxCode: value }, []).taxRoot : null
    const holder = root ? await this.repo.accountByTaxRoot(root, own) : null
    if (!holder || !value || !tax) return []
    delete found.taxCode
    if (tax.unsure) return []
    return [{ field: 'taxCode', value, accountCode: holder.code, accountName: holder.name }]
  }

  /** The fields written, in field order. */
  private async apply(
    tx: Db,
    who: Actor,
    code: string,
    found: LeadSuggestions,
  ): Promise<LeadAiFillField[]> {
    const person = Object.fromEntries(
      PERSON_FIELDS.flatMap((f) => (found[f] ? [[f, found[f].value as string]] : [])),
    )
    const personWritten = await this.contacts.fillPrimaryEmpty(tx, code, person, who)
    const locked = await this.repo.lock(tx, who, code)
    if (!locked) throw notFound('lead', code)
    /* Rolls back the person write above too. */
    if (!locked.holds) throw denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)

    const still = new Set([...emptyFillable(locked.row), ...personWritten])
    const fields = LeadAiFillField.options.filter((f) => found[f] && still.has(f))
    if (fields.length === 0) return []
    const at = new Date().toISOString()
    const values: Record<string, unknown> = {}
    const marks: LeadAiFillMarks = {}
    for (const field of fields) {
      const { value, source, unsure } = found[field]!
      if (!isPerson(field)) values[field] = value
      marks[field] = { source, unsure, at }
    }
    await this.repo.write(tx, code, values as Partial<LeadValues>, marks)
    const note = LEAD_NOTE.aiFilled(fields.length)
    await this.touch.record(tx, [
      { subjectCode: code, subjectKind: 'lead', kind: 'field-filled', ...byOf(who), note },
    ])
    await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
    return fields
  }
}

const isPerson = (field: LeadAiFillField): boolean =>
  (PERSON_FIELDS as readonly LeadAiFillField[]).includes(field)

const BLOCKED: Record<AiFillBlock, string> = {
  'no-company-or-contact': 'Cần có tên công ty và người liên hệ trước khi điền.',
  'nothing-empty': 'Không còn ô trống nào để điền.',
}

/** Same split as the scan door: off is a setting (409), a daily limit passes (429). */
const UNAVAILABLE: Record<AiUnavailableError['reason'], () => Error> = {
  disabled: () => conflict('Chưa bật điền bằng AI. Báo quản trị viên.'),
  'no-key': () => conflict('Chưa bật điền bằng AI. Báo quản trị viên.'),
  'user-limit': () => rateLimited('Bạn đã hết lượt điền bằng AI trong 24 giờ qua. Thử lại sau.'),
  budget: () => rateLimited('Đã hết hạn mức điền bằng AI trong 24 giờ qua. Thử lại sau.'),
}
