import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AiFillSource, LeadAiFillField, LeadAiJobResult } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { PROFILE_FIELDS } from '@/data/lead-form'
import { patchPath } from '@/data/lead-patch'
import { leadProfileQuery } from '@/data/lead-profile'

/** Module 2 · what the screens need around an AI fill of a lead: which boxes
 *  it can fill, how a filled field names its source, and the attach door its
 *  tax-code conflict offers (`PATCH …/account`). The press itself, its job and
 *  its Undo are `lead-ai-job.ts` (ADR 0131). */

/** Word for word with the `@Need` on the endpoint. */
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit', scoped: true }

export type AiFillConflict = LeadAiJobResult['conflicts'][number]

export function useAttachLeadAccount() {
  const client = useQueryClient()
  return useMutation<void, ApiError, { code: string; accountCode: string }>({
    mutationFn: ({ code, accountCode }) =>
      api.write(`${patchPath(code)}/account`, {
        method: 'PATCH',
        body: { accountCode },
        need: WRITE_NEED,
      }),
    onSuccess: (_, { code }) => {
      void client.invalidateQueries({ queryKey: leadProfileQuery(code).queryKey })
      void client.invalidateQueries({ queryKey: ['sales', 'lead-book'] })
    },
  })
}

const LABEL = new Map<string, string>(PROFILE_FIELDS.map((field) => [field.key, field.label]))

/** A label set inside a sentence of the job summary: first letter lowered. */
export const inlineLabel = (key: LeadAiFillField) => {
  const label = LABEL.get(key) ?? key
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** What the caption under a filled field names as its source. */
export function sourceOf(source: AiFillSource): { text: string; href?: string } {
  if (source === 'tax-registry') return { text: 'tra cứu mã số thuế' }
  if (source === 'email-domain') return { text: 'tên miền email' }
  return { text: new URL(source).host.replace(/^www\./, ''), href: source }
}
