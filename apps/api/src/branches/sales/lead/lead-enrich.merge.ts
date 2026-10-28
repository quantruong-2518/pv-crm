import { companyDomain, foldText } from '@pv/engines'
import {
  AI_FILL_TOKENS,
  AiFillSource,
  LEAD_NUM,
  LeadPatch,
  normaliseProvince,
  VN_PROVINCES,
  type LeadAiFillField,
  type LeadAiFillValue,
} from '@pv/contracts'
import type { IndustryLists, LeadDraft, LeadSuggestion } from './lead-enrich'
import { patchFieldOf } from './lead-ai-fill.rule'

/** The enricher's pure half: the two calls' user messages, and the checks that
 *  turn a model answer into a suggestion the patch door would accept. */

export type Found<T> = { value: T; sourceUrl: string | null; confident: boolean } | null

/** A value the patch door would accept for `field`, else null. */
export function suggestion(
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

/** A model value with a page to show for it. */
export function fromModel(
  field: LeadAiFillField,
  found: Found<unknown> | undefined,
): LeadSuggestion | null {
  const url = found?.sourceUrl?.trim()
  if (!found || !url || (AI_FILL_TOKENS as readonly string[]).includes(url)) return null
  const source = AiFillSource.safeParse(url)
  return source.success ? suggestion(field, found.value, source.data, !found.confident) : null
}

/** A text the patch door accepts for `field` (its shape and length cap), or null:
 *  what call 1 found is checked before call 2 or a suggestion reuses it. */
export function checked(field: 'legalName' | 'website', raw: unknown): string | null {
  const parsed = raw ? LeadPatch.shape[field].safeParse(raw) : null
  return parsed?.success && typeof parsed.data === 'string' ? parsed.data : null
}

/** Hosts that are never a company's own site: social networks, marketplaces,
 *  directories and the tax-code lookup pages. The one list, for the site to read
 *  and for the website suggestion alike. */
const NOT_COMPANY_SITES = [
  'facebook.com',
  'linkedin.com',
  'zalo.me',
  'youtube.com',
  'tiktok.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'shopee.vn',
  'lazada.vn',
  'tiki.vn',
  'alibaba.com',
  'amazon.com',
  'masothue.com',
  'thongtindoanhnghiep.co',
  'dangkykinhdoanh.gov.vn',
  'trangvangvietnam.com',
  'yellowpages.vn',
  'topcv.vn',
  'vietnamworks.com',
]

/** The stored host of a website (the contract's spelling), or null when it is
 *  not one or is on `NOT_COMPANY_SITES`. */
export function companySite(raw: string | null | undefined): string | null {
  const host = checked('website', raw)
  const bare = host?.replace(/^www\./, '')
  const listed = bare && NOT_COMPANY_SITES.some((d) => bare === d || bare.endsWith(`.${d}`))
  return host && !listed ? host : null
}

/** Whether `url` is a page of the site at `host` (a subdomain counts). */
export function onSite(url: string, host: string): boolean {
  const site = host.toLowerCase().replace(/^www\./, '')
  const page = URL.canParse(url) ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : ''
  return page === site || page.endsWith(`.${site}`)
}

const UNITS = new Set<string>(VN_PROVINCES)

/** The post-2025 unit an address names, read from its last segment first, so
 *  a registry address under a pre-2025 province maps to the new unit; null when none. */
export function provinceOf(address: string | null | undefined): string | null {
  const parts = (address ?? '').split(/[,;\n]/).reverse()
  for (const part of parts) {
    const unit = part.trim() ? normaliseProvince(part) : ''
    if (UNITS.has(unit)) return unit
  }
  return null
}

/** Whether a registry address lies in the draft's province, old names included. */
export function inProvince(address: string | null, province: string): boolean {
  const unit = normaliseProvince(province)
  return (
    provinceOf(address) === unit || ` ${foldText(address ?? '')} `.includes(` ${foldText(unit)} `)
  )
}

/** The host of the contact's mailbox, when it names an employer; a `mail.` or
 *  `email.` prefix names the mail server, not the site. */
export function mailDomain(email: string | null | undefined): string | null {
  const host = email
    ?.split('@')[1]
    ?.trim()
    .toLowerCase()
    .replace(/^e?mail\./, '')
  return host ? companyDomain(host) : null
}

/** Normalised and shape-checked by the patch door's own field. */
export function taxCodeOf(raw: string | undefined): string | null {
  const parsed = raw ? LeadPatch.shape.taxCode.safeParse(raw) : null
  return parsed?.success && parsed.data ? parsed.data : null
}

const key = (name: string) => name.trim().toLowerCase()

/** The model's category NAME -> its live id; a name on no list is dropped. */
export function categoryIdOf(found: Found<string>, lists: IndustryLists): Found<string> {
  const hit = found && lists.categories.find((c) => key(c.name) === key(found.value))
  return hit && found ? { ...found, value: hit.id } : null
}

/** The model's industry NAMES -> ids under `categoryId`; others dropped, four kept. */
export function industryIdsOf(
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

const contactOf = (d: LeadDraft) => ({ name: d.contactName, title: d.contactTitle ?? null })

/** Data travels as one fenced JSON block, so no value can pass for an instruction
 *  (`WEB_RULES` says the block is data); `null`s are dropped. */
const dataBlock = (data: Record<string, unknown>): string =>
  ['```json', JSON.stringify(data, (_, v: unknown) => v ?? undefined), '```'].join('\n')

/** Call 1's user message: what the lead already knows, and what to find. */
export function identifyInput(d: LeadDraft, domain: string | null, needed: string[]): string {
  const facts = {
    company: d.company,
    legalName: d.legalName,
    taxCode: d.taxCode,
    contactPerson: contactOf(d),
    emailDomain: domain,
    website: d.website,
    province: d.province,
  }
  return [`Known facts:`, dataBlock(facts), `Fields needed: ${needed.join(', ')}.`].join('\n')
}

/** Call 2's user message: the site, the company, and the closed lists — every
 *  live category with its industries, or the lead's own category's only. */
export function siteInput(
  d: LeadDraft,
  host: string,
  legalName: string | null,
  needed: string[],
  lists: IndustryLists,
): string {
  const industriesOf = (id: string) =>
    lists.industries.filter((i) => i.categoryId === id).map((i) => i.name)
  const own = lists.categories.find((c) => c.id === d.categoryId)
  const vocabulary = own
    ? { categoryChosen: { name: own.name, industries: industriesOf(own.id) } }
    : {
        categories: lists.categories.map((c) => ({ name: c.name, industries: industriesOf(c.id) })),
      }
  const facts = {
    website: `https://${host}`,
    company: d.company,
    legalName,
    contactPerson: contactOf(d),
    ...vocabulary,
  }
  return [`The lead, as data:`, dataBlock(facts), `Fields needed: ${needed.join(', ')}.`].join('\n')
}
