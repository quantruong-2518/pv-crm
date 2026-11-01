import { z } from 'zod'
import { ObjectCode } from '../primitives'
import { AiFillSource, LeadAiFillField } from './lead-ai-fill'

/** What one AI fill wrote, kept on the job row (`LeadAiJob.result`).
 *
 *  Only fields that were empty are written, so it lists exactly what changed.
 *  `value` is a union rather than one variant per field: the caller already
 *  knows each field's type from `field`, and 11 variants add nothing.
 *  `category` fills a `CATEGORY` id, `industries` an array of `INDUSTRY` ids.
 *  `conflicts`: a tax code that already belongs to another company is not
 *  written; the screen offers to attach the lead to that company instead. */
export const LeadAiFillValue = z.union([z.string(), z.number(), z.array(z.string())])
export type LeadAiFillValue = z.infer<typeof LeadAiFillValue>

export const LeadAiJobResult = z.object({
  filled: z.array(
    z.object({
      field: LeadAiFillField,
      value: LeadAiFillValue,
      source: AiFillSource,
      unsure: z.boolean(),
    }),
  ),
  conflicts: z.array(
    z.object({
      field: z.literal('taxCode'),
      value: z.string(),
      accountCode: ObjectCode,
      accountName: z.string(),
    }),
  ),
  notFound: z.array(LeadAiFillField),
})
export type LeadAiJobResult = z.infer<typeof LeadAiJobResult>
