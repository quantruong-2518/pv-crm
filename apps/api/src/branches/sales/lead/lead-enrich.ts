import { Inject, Injectable, Logger } from '@nestjs/common'
import { foldCompanyName } from '@pv/engines'
import {
  LeadIdentifyModelOutput,
  LeadSiteModelOutput,
  normaliseProvince,
  VN_PROVINCES,
  type AiFillSource,
  type LeadAiFillField,
  type LeadAiFillValue,
} from '@pv/contracts'
import type { ZodType } from 'zod'
import { AiOutputError } from '@api/platform/ai/ai-errors'
import { AiGateway, type AiCaller } from '@api/platform/ai/ai-gateway'
import { LEAD_IDENTIFY, LEAD_SITE } from '@api/platform/ai/prompts/lead-enrich.prompts'
import { renderPrompt, type RenderedPrompt } from '@api/platform/ai/prompts/prompt-spec'
import * as M from './lead-enrich.merge'
import { TAX_REGISTRY, type TaxRecord, type TaxRegistry } from './lead-enrich.tax-registry'

/** The enricher: a plain lead draft in, per-field suggestions out. It reads and
 *  writes no table, so a bulk step (sheet import, scan) can run it on drafts
 *  before they are leads; `LeadAiFillService` applies it to a stored lead.
 *
 *  Two model calls (slice A-1, decision 2): IDENTIFY the company by web search,
 *  verify its tax code with the registry, then READ the company's site: the
 *  draft's, else the mail domain's, else the one identified with confidence.
 *  The registry's code and name are sure only when its name folds to the
 *  draft's AND its address lies in the draft's province; the mail domain's
 *  website only when the model found the same host; a size band only when a
 *  page of the site read states it; a model value only when the model says so and
 *  names the page. The address is the factory from the site, else the head
 *  office marked unsure (decision 5); the province is read from it. Every
 *  value passes the patch door's own field schema, or it is dropped. */

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

export type LeadSuggestion = { value: LeadAiFillValue; source: AiFillSource; unsure: boolean }
export type LeadSuggestions = Partial<Record<LeadAiFillField, LeadSuggestion>>

type Identified = LeadIdentifyModelOutput
type Hit = { code: string; record: TaxRecord; sure: boolean }

/** A registry lookup is one HTTP call each; more candidates than this is noise. */
const MAX_TAX_CANDIDATES = 3

const IDENTIFY = renderPrompt(LEAD_IDENTIFY)
const SITE = renderPrompt(LEAD_SITE)

/** What each call can supply: the lead's field → that call's output key. */
const IDENTIFY_KEYS: Partial<Record<LeadAiFillField, keyof Identified>> = {
  website: 'website',
  taxCode: 'taxCode',
  legalName: 'legalName',
  address: 'address',
  province: 'province',
}
const SITE_KEYS: Partial<Record<LeadAiFillField, keyof LeadSiteModelOutput>> = {
  category: 'category',
  industries: 'industries',
  mainProduct: 'mainProduct',
  sizeBand: 'sizeBand',
  address: 'factoryAddress',
  contactTitle: 'contactTitle',
  phone: 'phone',
}
/** Fields the registry answers from a tax code. */
const REGISTRY_FIELDS: readonly LeadAiFillField[] = ['taxCode', 'legalName', 'address']

const keysFor = <K extends string>(
  map: Partial<Record<LeadAiFillField, K>>,
  fields: readonly LeadAiFillField[],
): K[] => [...new Set(fields.flatMap((f) => map[f] ?? []))]

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
    const domain = M.mailDomain(draft.email)
    const siteNeeded = keysFor(SITE_KEYS, wanted)
    const registryWanted = REGISTRY_FIELDS.some((f) => wanted.includes(f))
    /* The site call needs a site and the registry a code: identify finds what the draft lacks. */
    const identifyNeeded = keysFor(IDENTIFY_KEYS, [
      ...wanted,
      ...(siteNeeded.length > 0 && !draft.website ? (['website'] as const) : []),
      ...(registryWanted && !draft.taxCode ? (['taxCode'] as const) : []),
    ])
    const [identified, known] = await Promise.all([
      identifyNeeded.length > 0
        ? this.ask(IDENTIFY, LeadIdentifyModelOutput, who, false, () =>
            M.identifyInput(draft, domain, identifyNeeded),
          )
        : null,
      draft.taxCode ? this.verify(draft, [draft.taxCode]) : null,
    ])

    /* A site the model found is read only when it was sure of it. */
    const found = identified?.website?.confident ? identified.website.value : null
    const host = M.companySite(draft.website) ?? M.companySite(domain) ?? M.companySite(found)
    if (siteNeeded.length > 0 && !host) {
      this.log.log(
        `lead-enrich: no website found, site reading skipped (${siteNeeded.length} field(s))`,
      )
    }
    const codes = identified ? [identified.taxCode?.value, ...identified.taxCodeCandidates] : []
    const legal = M.checked('legalName', draft.legalName ?? identified?.legalName?.value)
    /* One fill = two calls on the per-user count; the second skips the check, so a
       fill its first call admitted is never refused halfway. */
    const second = { ...who, admitted: who.admitted || identifyNeeded.length > 0 }
    const [read, hit] = await Promise.all([
      siteNeeded.length > 0 && host
        ? this.ask(SITE, LeadSiteModelOutput, second, true, () =>
            M.siteInput(draft, host, legal, siteNeeded, lists),
          )
        : null,
      draft.taxCode ? known : registryWanted ? this.verify(draft, codes) : null,
    ])
    return merge({ draft, wanted, lists, domain, host, identified, read, hit })
  }

  /** Research calls: web search, medium effort, the prompt's version on the ledger. */
  private async ask<T>(
    prompt: RenderedPrompt,
    schema: ZodType<T>,
    who: AiCaller,
    readPages: boolean,
    text: () => string,
  ): Promise<T | null> {
    const request = {
      ...prompt,
      parts: [{ text: text() }],
      webSearch: true,
      readPages,
      effort: 'medium' as const,
    }
    try {
      return (await this.gateway.run('lead-enrich', request, schema, who)).value
    } catch (error) {
      if (!(error instanceof AiOutputError)) throw error
      this.log.warn(`${prompt.prompt}: no usable answer after ${error.attempts.length} attempt(s)`)
      return null
    }
  }

  /** The best candidate the registry knows under the draft's own name: one
   *  whose address also lies in the draft's province first. */
  private async verify(
    draft: LeadDraft,
    raw: readonly (string | undefined)[],
  ): Promise<Hit | null> {
    const codes = [...new Set(raw.map(M.taxCodeOf).filter((c): c is string => c !== null))]
    const picked = codes.slice(0, MAX_TAX_CANDIDATES)
    const records = await Promise.all(picked.map((code) => this.registry.lookup(code)))
    const names = new Set([draft.company, draft.legalName].map(fold).filter(Boolean))
    const scored: number[] = records.map((r) => {
      if (!r || ![r.name, r.internationalName, r.shortName].some((n) => names.has(fold(n))))
        return 0
      return !draft.province || M.inProvince(r.address, draft.province) ? 2 : 1
    })
    const index = scored.indexOf(Math.max(0, ...scored))
    const record = records[index]
    return record && scored[index]! > 0
      ? { code: picked[index]!, record, sure: scored[index] === 2 }
      : null
  }
}

const fold = (name: string | null | undefined): string => (name && foldCompanyName(name)) || ''

type Answers = {
  draft: LeadDraft
  wanted: readonly LeadAiFillField[]
  lists: IndustryLists
  domain: string | null
  host: string | null
  identified: Identified | null
  read: LeadSiteModelOutput | null
  hit: Hit | null
}

/** Both answers and the registry into one suggestion per wanted field. A later
 *  `put` wins: the registry overrides the model where both speak. */
function merge(a: Answers): LeadSuggestions {
  const { identified: id, read, hit, lists } = a
  const out: LeadSuggestions = {}
  const put = (field: LeadAiFillField, found: LeadSuggestion | null) => {
    if (found && a.wanted.includes(field)) out[field] = found
  }
  put('legalName', M.fromModel('legalName', id?.legalName))
  const website = M.fromModel('website', id?.website)
  put('website', website && M.companySite(website.value as string) ? website : null)
  const taxCode = M.fromModel('taxCode', id?.taxCode)
  put('taxCode', taxCode && { ...taxCode, unsure: true })

  put('category', M.fromModel('category', read && M.categoryIdOf(read.category, lists)))
  put('mainProduct', M.fromModel('mainProduct', read?.mainProduct))
  put('contactTitle', M.fromModel('contactTitle', read?.contactTitle))
  put('phone', M.fromModel('phone', read?.phone))
  const band = M.fromModel('sizeBand', read?.sizeBand)
  const ownSite = !!band && !!a.host && M.onSite(band.source, a.host)
  put('sizeBand', band && { ...band, unsure: band.unsure || !ownSite })
  /* After the category is final: industries need one to sit in. */
  const under = a.draft.categoryId ?? (out.category?.value as string | undefined)
  if (read && under) {
    put('industries', M.fromModel('industries', M.industryIdsOf(read.industries, lists, under)))
  }

  if (M.companySite(a.domain)) {
    const site = M.suggestion('website', a.domain, 'email-domain', true)
    if (site) put('website', { ...site, unsure: out.website?.value !== site.value })
  }
  if (hit) {
    put('taxCode', M.suggestion('taxCode', hit.code, 'tax-registry', !hit.sure))
    put('legalName', M.suggestion('legalName', hit.record.name, 'tax-registry', !hit.sure))
  }
  const headOffice = hit?.record.address
    ? M.suggestion('address', hit.record.address, 'tax-registry', true)
    : M.fromModel('address', id?.address)
  const address =
    M.fromModel('address', read?.factoryAddress) ?? (headOffice && { ...headOffice, unsure: true })
  put('address', address)
  put('province', provinceSuggestion(address, id))
  return out
}

/** The unit the chosen address names; else the model's province, when it maps to one. */
function provinceSuggestion(
  address: LeadSuggestion | null,
  id: Identified | null,
): LeadSuggestion | null {
  const unit = address && M.provinceOf(address.value as string)
  if (address && unit) return M.suggestion('province', unit, address.source, address.unsure)
  const found = M.fromModel('province', id?.province)
  const named = found && normaliseProvince(found.value as string)
  return found && named && (VN_PROVINCES as readonly string[]).includes(named)
    ? { ...found, value: named }
    : null
}
