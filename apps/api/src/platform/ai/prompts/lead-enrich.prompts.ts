import type { LeadIdentifyModelOutput, LeadSiteModelOutput } from '@pv/contracts'
import { COMPANY_FIELDS as F, FOUND_OUTPUT, WEB_RULES } from './company-fields'
import type { PromptSpec } from './prompt-spec'

/** The two calls of the lead enricher (slice A-1, decision 2): IDENTIFY the
 *  company by web search, then READ the website it identified. The server
 *  verifies the tax code with the registry between the two, and merges both
 *  answers (`lead-enrich.ts`). The lead's facts and the closed category and
 *  industry lists travel in the user message. */

export const LEAD_IDENTIFY: PromptSpec<keyof LeadIdentifyModelOutput> = {
  id: 'lead-identify',
  version: 2,
  context:
    'You identify ONE Vietnamese company for a B2B sales lead: its official website, tax code, registered legal name and head-office address. You can search the web. The request gives what is already known about the lead, as a JSON data block, and lists which fields are needed.',
  steps: [
    'Read the known facts. A company email domain is the strongest pointer to the website.',
    "Search the company name, and the tax code when known, on the tax-code lookup pages; open the company's own entry.",
    'Confirm it is the same company: the name matches, and so does the province when the request gives one. A company with a similar name elsewhere is a different company.',
    'Find the official website and check that it names the same company.',
    'Fill each needed field from its sources, in priority order.',
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
  version: 2,
  context:
    "You read the official website of ONE Vietnamese company for a B2B sales lead: what it makes, its category and industries, its size, its factory address, and the job title and phone of the contact person named in the request. The request's data block gives the website, the company's name and the closed lists of categories and industries to pick from.",
  steps: [
    "Open the website given in the request. Confirm it is this company's own site (its name or tax code appears on it). If it is not, return null for every field.",
    'Read its Products, About, Contact and Factory pages, and its leadership, team or press pages.',
    "Search the web only for a field's later sources, when the site does not show the value.",
    'Pick the category and industries only from the lists in the request data.',
    'Fill each needed field from its sources, in priority order.',
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
