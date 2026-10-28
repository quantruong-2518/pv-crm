import { Inject, Injectable, Logger } from '@nestjs/common'
import { companyDomain, foldCompanyName, foldText } from '@pv/engines'
import {
  AI_FILL_TOKENS,
  AiFillSource,
  LEAD_NUM,
  LeadEnrichModelOutput,
  LeadPatch,
  type LeadAiFillField,
  type LeadAiFillValue,
} from '@pv/contracts'
import { AiOutputError } from '@api/platform/ai/ai-errors'
import { AiGateway, type AiCaller } from '@api/platform/ai/ai-gateway'
import { patchFieldOf } from './lead-ai-fill.rule'
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
  categoryId?: string | null
}

/** The live CATEGORY and INDUSTRY rows: the closed vocabulary the model picks
 *  from. Passed in, so the enricher still reads no table. */
export type IndustryLists = {
  categories: { id: string; name: string }[]
  industries: { id: string; name: string; categoryId: string }[]
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
- category: exactly one name from the Categories list below, spelled as listed; null when none fits.
- mainProduct: what the company mainly makes or sells, a short phrase. industries: up to ${LEAD_NUM.industriesMax} names from the Industries list of the lead's category below, spelled as listed. headcount: number of employees, an integer.
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
    lists: IndustryLists,
  ): Promise<LeadSuggestions> {
    const want = new Set(wanted)
    const domain = mailDomain(draft.email)
    const [answer, known] = await Promise.all([
      this.ask(draft, domain, wanted, who, lists),
      draft.taxCode ? this.verify(draft, [draft.taxCode]) : null,
    ])

    const out: LeadSuggestions = {}
    const put = (field: LeadAiFillField, found: LeadSuggestion | null) => {
      if (found && want.has(field)) out[field] = found
    }
    const named = answer ? { ...answer, category: categoryIdOf(answer.category, lists) } : null
    for (const field of wanted) {
      if (field !== 'industries') put(field, named ? fromModel(field, named[field]) : null)
    }
    /* After the category is final: industries need one to sit in, the lead's or a kept suggestion. */
    const under = draft.categoryId ?? (out.category?.value as string | undefined)
    if (named && under)
      put('industries', fromModel('industries', industryIdsOf(named.industries, lists, under)))
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
    lists: IndustryLists,
  ): Promise<LeadEnrichModelOutput | null> {
    const known = [
      `Company: ${draft.company}`,
      draft.legalName && `Legal name: ${draft.legalName}`,
      draft.taxCode && `Tax code: ${draft.taxCode}`,
      `Contact person: ${draft.contactName}${draft.contactTitle ? `, ${draft.contactTitle}` : ''}`,
      domain && `Email domain: ${domain}`,
      draft.website && `Website: ${draft.website}`,
      draft.province && `Province: ${draft.province}`,
      ...vocabularyLines(draft.categoryId ?? null, wanted, lists),
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

/** The closed lists in the prompt: every live category when the lead has none
 *  (with each one's industries), else its own category's industries. */
function vocabularyLines(
  categoryId: string | null,
  wanted: readonly LeadAiFillField[],
  lists: IndustryLists,
): string[] {
  const names = (id: string) =>
    lists.industries.filter((i) => i.categoryId === id).map((i) => i.name)
  const own = lists.categories.find((c) => c.id === categoryId)
  const lines = own ? [`Category: ${own.name}`] : []
  if (!own && wanted.includes('category'))
    lines.push(`Categories: ${lists.categories.map((c) => c.name).join('; ')}`)
  if (wanted.includes('industries')) {
    for (const c of own ? [own] : lists.categories)
      lines.push(`Industries of ${c.name}: ${names(c.id).join('; ') || '(none)'}`)
  }
  return lines
}

type Found<T> = { value: T; sourceUrl: string | null; confident: boolean } | null
const key = (name: string) => name.trim().toLowerCase()

/** The model's category NAME -> its live id; a name on no list is dropped. */
function categoryIdOf(found: Found<string>, lists: IndustryLists): Found<string> {
  const hit = found && lists.categories.find((c) => key(c.name) === key(found.value))
  return hit && found ? { ...found, value: hit.id } : null
}

/** The model's industry NAMES -> ids under `categoryId`; others dropped, four kept. */
function industryIdsOf(
  found: Found<string[]>,
  lists: IndustryLists,
  categoryId: string,
): Found<string[]> {
  const ids = (found?.value ?? []).flatMap((name) => {
    const hit = lists.industries.find(
      (i) => i.categoryId === categoryId && key(i.name) === key(name),
    )
    return hit ? [hit.id] : []
  })
  const kept = [...new Set(ids)].slice(0, LEAD_NUM.industriesMax)
  return found && kept.length ? { ...found, value: kept } : null
}

/** A value the patch door would accept for `field`, else null. */
function suggestion(
  field: LeadAiFillField,
  raw: unknown,
  source: AiFillSource,
  unsure: boolean,
): LeadSuggestion | null {
  const parsed = LeadPatch.shape[patchFieldOf(field)].safeParse(raw)
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
