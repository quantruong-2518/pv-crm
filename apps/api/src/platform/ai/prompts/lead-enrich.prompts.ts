import type { LeadIdentifyModelOutput, LeadSiteModelOutput } from '@pv/contracts'
import { COMPANY_FIELDS as F, FOUND_OUTPUT, WEB_RULES } from './company-fields'
import type { PromptSpec } from './prompt-spec'

/** The two calls of the lead enricher (slice A-1, decision 2): IDENTIFY the
 *  company by web search, and READ its website. The server verifies the tax
 *  code with the registry and merges both answers (`lead-enrich.ts`). The lead's
 *  facts and the closed category and industry lists travel in the user message.
 *  Each call gets a search budget and a stop rule: an unbounded model wanders
 *  past the route timeout, and a field no early source shows is rarely found later. */

/** Searches IDENTIFY may run: one lookup-page query, one for the website, one retry. */
const IDENTIFY_SEARCHES = 3
/** Searches or page reads SITE may spend beyond the home page; with the home page
 *  it must fit the Anthropic client's per-tool `max_uses`. */
const SITE_LOOKUPS = 4

const ONLY_NEEDED = 'Skip every field not listed under "Fields needed": do not search for it.'

export const LEAD_IDENTIFY: PromptSpec<keyof LeadIdentifyModelOutput> = {
  id: 'lead-identify',
  version: 3,
  context:
    'You identify ONE Vietnamese company for a B2B sales lead: its website, tax code, registered legal name and head-office address. You have web search only: you see result titles, snippets and URLs and cannot open a page. The request gives the known facts as a JSON data block and lists the fields needed.',
  steps: [
    ONLY_NEEDED,
    'Search the tax code when known, else `"<company>" mã số thuế`. Results from masothue.com and thongtindoanhnghiep.co show the MST, registered name and address in their snippet.',
    'Use a result only when it is the same company: the name matches, and the province too when given. A similar name elsewhere is another company.',
    'Website: with an emailDomain, do not search for it; return it only when a result you have ties that host to this company. Else search `"<company>" website` and take a host whose result names the company.',
    "Each value comes from a result's title or snippet; its sourceUrl is that result's URL.",
    `Try each field's sources in their listed order; a field is done once one shows it. At most ${IDENTIFY_SEARCHES} searches in total; a field still unfound is null.`,
    'Answer in the output format.',
  ],
  fields: {
    website: F.website,
    taxCode: F.taxCode,
    taxCodeCandidates: F.taxCodeCandidates,
    legalName: F.legalName,
    address: F.headOffice,
    province: F.province,
  },
  output: FOUND_OUTPUT,
  rules: WEB_RULES,
}

export const LEAD_SITE: PromptSpec<keyof LeadSiteModelOutput> = {
  id: 'lead-site',
  version: 3,
  context:
    "You read the website of ONE Vietnamese company for a B2B sales lead: what it makes, its category and industries, its size, its factory address, and the title and phone of the contact person named in the request. You can search the web and read pages. The request's data block gives the website, the company's name (legalName may be null) and the closed category and industry lists.",
  steps: [
    ONLY_NEEDED,
    "Read the home page at the request's website. If the page clearly names a different company, return null for every field; otherwise treat it as this company's own site: it was already matched to this company.",
    "For a field the home page does not show, search `site:<host>` plus a targeted word (sản phẩm, giới thiệu, liên hệ, nhà máy, quy mô công nhân, or the contact's full name) and read the best result. Never guess page URLs.",
    "Search off the site only for a field's later sources.",
    'Pick the category and industries only from the lists in the request data.',
    `Try each field's sources in their listed order; a field is done once one shows it. At most ${SITE_LOOKUPS} searches or page reads beyond the home page; a field still unfound is null.`,
    'Answer in the output format.',
  ],
  fields: {
    category: F.category,
    industries: F.industries,
    mainProduct: F.mainProduct,
    sizeBand: F.sizeBand,
    factoryAddress: F.factoryAddress,
    contactTitle: F.contactTitle,
    phone: F.phone,
  },
  output: FOUND_OUTPUT,
  rules: WEB_RULES,
}
