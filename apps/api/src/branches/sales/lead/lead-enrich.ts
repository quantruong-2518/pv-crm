import { Inject, Injectable, Logger } from '@nestjs/common'
import { companyDomain, foldCompanyName, foldText } from '@pv/engines'
import {
  AI_FILL_TOKENS,
  AiFillSource,
  LeadEnrichModelOutput,
  LeadPatch,
  type LeadAiFillField,
  type LeadAiFillValue,
} from '@pv/contracts'
import { AiOutputError } from '@api/platform/ai/ai-errors'
import { AiGateway, type AiCaller } from '@api/platform/ai/ai-gateway'
import { TAX_REGISTRY, type TaxRecord, type TaxRegistry } from './lead-enrich.tax-registry'

/** The enricher: a plain lead draft in, per-field suggestions out. It reads and
 *  writes no table, so a bulk step (sheet import, scan) can run it on drafts
 *  before they are leads; `LeadAiFillService` applies it to a stored lead.
 *
 *  Sources: the tax registry (tax code, legal name, address — sure only when its
 *  name folds to the draft's company or legal name AND, when the draft has a
 *  province, that province is in the registry address; a namesake elsewhere stays
 *  unsure); the contact's mail domain (website — sure only when the model found
 *  the same host; the registry carries no site); the model with web search (sure
 *  only when it says so, and only with the page it read). Every value passes the
 *  patch door's own field schema, or it is dropped. A tax code is sure only when
 *  the registry verified it. */

export type LeadDraft = {
  company: string
  contactName: string
  contactTitle?: string | null
  email?: string | null
  legalName?: string | null
  taxCode?: string | null
  province?: string | null
  website?: string | null
}

export type LeadSuggestion = {
  value: LeadAiFillValue
  source: AiFillSource
  unsure: boolean
}
export type LeadSuggestions = Partial<Record<LeadAiFillField, LeadSuggestion>>

/** A registry lookup is one HTTP call each; more candidates than this is noise. */
const MAX_TAX_CANDIDATES = 3

/* `phone` mirrors the primary CONTACT on a lead, so a switchboard is not it —
   the scan's rule (`companyValuesOf`); owner's decision for AI fill. */
const SYSTEM_PROMPT = `You complete the company profile of ONE Vietnamese B2B lead. Search the web: the company's own website, the national business registry and reputable business directories.
Return JSON that matches the schema. Each field is { value, sourceUrl, confident } or null when not found.
- sourceUrl is the page that shows the value. A value with no page behind it is null.
- Never invent or guess. Copy names and addresses exactly as written, keeping every Vietnamese diacritic.
- legalName: the registered name. taxCode: the Vietnamese tax code (MST): 10 digits, or 10 digits, a dash and 3 digits. taxCodeCandidates: any other tax codes you met for this company.
- website: the company's own site. province: the province or city of the head office.
- category: exactly one of chip (semiconductors, electronics), mechanical (machinery, metalwork), automotive (vehicles and parts), pharma (pharmaceuticals); null when none fits.
- mainProduct: what the company mainly makes or sells, a short phrase. industries: short industry tags. headcount: number of employees, an integer.
- phone: the phone of the contact person named below, only when the company publishes it for that person (their page or a staff list on the company's site). Never the switchboard or a general company line. contactTitle: that person's job title, under the same rule.
- confident: false when the page may be about another company or the value is unclear.`

@Injectable()
export class LeadEnricher {
  private readonly log = new Logger('LeadEnricher')

  constructor(
    private readonly gateway: AiGateway,
    @Inject(TAX_REGISTRY) private readonly registry: TaxRegistry,
  ) {}

  /** Suggestions for `wanted` only. Throws what the gateway throws, except an
   *  unusable answer, which counts as nothing found. */
  async suggest(
    draft: LeadDraft,
    wanted: readonly LeadAiFillField[],
    who: AiCaller,
  ): Promise<LeadSuggestions> {
    const want = new Set(wanted)
    const domain = mailDomain(draft.email)
    const [answer, known] = await Promise.all([
      this.ask(draft, domain, wanted, who),
      draft.taxCode ? this.verify(draft, [draft.taxCode]) : null,
    ])

    const out: LeadSuggestions = {}
    const put = (field: LeadAiFillField, found: LeadSuggestion | null) => {
      if (found && want.has(field)) out[field] = found
    }
    for (const field of wanted) put(field, answer ? fromModel(field, answer[field]) : null)
    const site = domain ? suggestion('website', domain, 'email-domain', true) : null
    if (site) {
      site.unsure = out.website?.value !== site.value
      put('website', site)
    }

    const codes = answer ? [answer.taxCode?.value, ...answer.taxCodeCandidates] : []
    const hit = known ?? (want.has('taxCode') ? await this.verify(draft, codes) : null)
    if (out.taxCode) out.taxCode.unsure = true
    if (hit) {
      const unsure = !hit.sure
      put('taxCode', suggestion('taxCode', hit.code, 'tax-registry', unsure))
      put('legalName', suggestion('legalName', hit.record.name, 'tax-registry', unsure))
      put('address', suggestion('address', hit.record.address, 'tax-registry', unsure))
    }
    return out
  }

  private async ask(
    draft: LeadDraft,
    domain: string | null,
    wanted: readonly LeadAiFillField[],
    who: AiCaller,
  ): Promise<LeadEnrichModelOutput | null> {
    const known = [
      `Company: ${draft.company}`,
      draft.legalName && `Legal name: ${draft.legalName}`,
      draft.taxCode && `Tax code: ${draft.taxCode}`,
      `Contact person: ${draft.contactName}${draft.contactTitle ? `, ${draft.contactTitle}` : ''}`,
      domain && `Email domain: ${domain}`,
      draft.website && `Website: ${draft.website}`,
      draft.province && `Province: ${draft.province}`,
      `Fields needed: ${wanted.join(', ')}. Return null for every other field.`,
    ]
    const text = known.filter(Boolean).join('\n')
    try {
      const { value } = await this.gateway.run(
        'lead-enrich',
        { system: SYSTEM_PROMPT, parts: [{ text }], webSearch: true },
        LeadEnrichModelOutput,
        who,
      )
      return value
    } catch (error) {
      if (!(error instanceof AiOutputError)) throw error
      this.log.warn(`lead-enrich: no usable answer after ${error.attempts.length} attempt(s)`)
      return null
    }
  }

  /** The best candidate the registry knows under the draft's own name: one
   *  whose address also holds the draft's province first. */
  private async verify(
    draft: LeadDraft,
    raw: readonly (string | undefined)[],
  ): Promise<{ code: string; record: TaxRecord; sure: boolean } | null> {
    const codes = [...new Set(raw.map(taxCodeOf).filter((c): c is string => c !== null))]
    const picked = codes.slice(0, MAX_TAX_CANDIDATES)
    const records = await Promise.all(picked.map((code) => this.registry.lookup(code)))
    const names = new Set([draft.company, draft.legalName].map(fold).filter(Boolean))
    const province = draft.province ? provinceKey(draft.province) : ''
    const scored: number[] = records.map((r) => {
      if (!r || ![r.name, r.internationalName, r.shortName].some((n) => names.has(fold(n))))
        return 0
      return !province || ` ${foldText(r.address ?? '')} `.includes(` ${province} `) ? 2 : 1
    })
    const index = scored.indexOf(Math.max(0, ...scored))
    const record = records[index]
    return record && scored[index]! > 0
      ? { code: picked[index]!, record, sure: scored[index] === 2 }
      : null
  }
}

const fold = (name: string | null | undefined): string => (name && foldCompanyName(name)) || ''

/** A province written with or without its "city"/"province" prefix is one place. */
const provinceKey = (province: string): string =>
  foldText(province).replace(/^(thanh pho|tp|tinh)\s+/, '')

/** A value the patch door would accept for `field`, else null. */
function suggestion(
  field: LeadAiFillField,
  raw: unknown,
  source: AiFillSource,
  unsure: boolean,
): LeadSuggestion | null {
  const parsed = LeadPatch.shape[field].safeParse(raw)
  const data: unknown = parsed.success ? parsed.data : null
  const empty = data === null || data === undefined || (Array.isArray(data) && data.length === 0)
  return empty ? null : { value: data as LeadAiFillValue, source, unsure }
}

/** The host of the contact's mailbox, when it names an employer; a `mail.` or
 *  `email.` prefix names the mail server, not the site. */
function mailDomain(email: string | null | undefined): string | null {
  const host = email
    ?.split('@')[1]
    ?.trim()
    .toLowerCase()
    .replace(/^e?mail\./, '')
  return host ? companyDomain(host) : null
}

/** Normalised and shape-checked by the patch door's own field. */
function taxCodeOf(raw: string | undefined): string | null {
  const parsed = raw ? LeadPatch.shape.taxCode.safeParse(raw) : null
  return parsed?.success && parsed.data ? parsed.data : null
}

/** A model value with a page to show for it. */
function fromModel(
  field: LeadAiFillField,
  found: LeadEnrichModelOutput[LeadAiFillField] | null,
): LeadSuggestion | null {
  const url = found?.sourceUrl?.trim()
  if (!found || !url || (AI_FILL_TOKENS as readonly string[]).includes(url)) return null
  const source = AiFillSource.safeParse(url)
  return source.success ? suggestion(field, found.value, source.data, !found.confident) : null
}
