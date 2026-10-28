import { z } from 'zod'
import { Moment } from '../primitives'

/** AI fill of a lead's empty company fields — the parts `LeadProfile` reads.
 *
 *  The write endpoint and its result live in `./lead-ai-fill-result`, which
 *  needs `LeadProfile`; this file stays below `lead.ts` so the two do not form
 *  an import cycle.
 *
 *  `source` is the page the value came from, or a fixed token when no page
 *  exists: `tax-registry` (national registry lookup) or `email-domain` (taken
 *  from the contact's own mail address). `unsure` marks a value the person
 *  should look at. Provenance is dropped by PATCH once a person edits the field. */

/** The fields the AI may fill. Never keys of anything the AI must not touch. */
export const LeadAiFillField = z.enum([
  'legalName',
  'taxCode',
  'website',
  'address',
  'province',
  'category',
  'mainProduct',
  'industries',
  'sizeBand',
  'contactTitle',
  'phone',
])
export type LeadAiFillField = z.infer<typeof LeadAiFillField>

export const AI_FILL_TOKENS = ['tax-registry', 'email-domain'] as const

export const AiFillSource = z.union([
  z.enum(AI_FILL_TOKENS),
  z.url({ protocol: /^https?$/, error: 'Nguồn phải là một đường dẫn.' }),
])
export type AiFillSource = z.infer<typeof AiFillSource>

export const AiFillMark = z.object({ source: AiFillSource, unsure: z.boolean(), at: Moment })
export type AiFillMark = z.infer<typeof AiFillMark>

/** Partial: a field appears only while its value is still the AI's. */
export const LeadAiFillMarks = z.partialRecord(LeadAiFillField, AiFillMark)
export type LeadAiFillMarks = z.infer<typeof LeadAiFillMarks>

/** The READ side of the marks, for `LeadProfile`: a row marked before 0156 says
 *  `headcount` (renamed `sizeBand`, an existing `sizeBand` wins) and a key no
 *  longer fillable is dropped, so an old or newer mark never fails a profile.
 *  Writes keep the strict `LeadAiFillMarks`. */
export const LeadAiFillMarksRead = z
  .record(z.string(), AiFillMark)
  .transform(({ headcount, ...marks }): LeadAiFillMarks => {
    const named = headcount && !marks.sizeBand ? { ...marks, sizeBand: headcount } : marks
    const fillable = LeadAiFillField.options as readonly string[]
    return Object.fromEntries(Object.entries(named).filter(([key]) => fillable.includes(key)))
  })

/** What the model must return. Flat per-field objects, no unions: the vendors'
 *  JSON-schema subsets cannot express them. `null` = not found. */
const found = <T extends z.ZodType>(value: T) =>
  z.object({ value, sourceUrl: z.string().nullable(), confident: z.boolean() }).nullable()

/** Call 1 — IDENTIFY the company by web search. `address` is the head office. */
export const LeadIdentifyModelOutput = z.object({
  website: found(z.string()),
  taxCode: found(z.string()),
  /** Other tax codes the search met for this company, to be checked by registry. */
  taxCodeCandidates: z.array(z.string()),
  legalName: found(z.string()),
  address: found(z.string()),
  province: found(z.string()),
})
export type LeadIdentifyModelOutput = z.infer<typeof LeadIdentifyModelOutput>

/** Call 2 — READ the identified company's own site. */
export const LeadSiteModelOutput = z.object({
  /* NAMES from the live CATEGORY / INDUSTRY lists the prompt carries; the server
   * maps them to ids and drops any name not on the list. */
  category: found(z.string()),
  industries: found(z.array(z.string())),
  mainProduct: found(z.string()),
  /* Plain string, not the enum: one off-list band must not void the whole
   * answer; the server checks it against `LeadSizeBand` before writing. */
  sizeBand: found(z.string()),
  factoryAddress: found(z.string()),
  contactTitle: found(z.string()),
  phone: found(z.string()),
})
export type LeadSiteModelOutput = z.infer<typeof LeadSiteModelOutput>
