import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AiFillSource, LeadAiFillField, LeadAiJobResult } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { getLang, message, translate, type Lang } from '@/app/i18n'
import { localizeLeadField } from '@/data/lead-copy'
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

const FIELD = new Map(PROFILE_FIELDS.map((field) => [field.key, field]))

/** A label set inside a sentence of the job summary: first letter lowered. */
export const inlineLabel = (key: LeadAiFillField, lang: Lang = getLang()) => {
  const field = FIELD.get(key)
  const label = field ? localizeLeadField(field, lang).label : key
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** What the caption under a filled field names as its source. */
export function sourceOf(
  source: AiFillSource,
  lang: Lang = getLang(),
): { text: string; href?: string } {
  if (source === 'tax-registry') {
    return {
      text: translate(message('tra cứu mã số thuế', 'tax ID lookup', '세금번호 조회'), lang),
    }
  }
  if (source === 'email-domain') {
    return {
      text: translate(message('tên miền email', 'email domain', '이메일 도메인'), lang),
    }
  }
  return { text: new URL(source).host.replace(/^www\./, ''), href: source }
}
