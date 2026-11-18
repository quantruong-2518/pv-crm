import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LeadAiFillField,
  type AiFillSource,
  type LeadAiFillMarks,
  type LeadAiJobResult,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { getLang, message, translate, type Lang } from '@/app/i18n'
import { configName } from '@/data/industries'
import { localizeLeadField } from '@/data/lead-copy'
import { PROFILE_FIELDS, readField, readTags, type FormValues } from '@/data/lead-form'
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
  const label = labelOf(key, lang)
  return label.charAt(0).toLowerCase() + label.slice(1)
}

export type AiSource = { text: string; href?: string }

/** What the caption under a filled field names as its source. */
export function sourceOf(source: AiFillSource, lang: Lang = getLang()): AiSource {
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

/** The sources of a fill as the reader counts them: a page by its host, a fixed
 *  token once, so three pages of one site are one source. */
export function distinctSources(
  entries: readonly { source: AiFillSource }[],
  lang: Lang = getLang(),
): AiSource[] {
  const byText = new Map<string, AiSource>()
  for (const { source } of entries) {
    const one = sourceOf(source, lang)
    if (!byText.has(one.text)) byText.set(one.text, one)
  }
  return [...byText.values()]
}

/** Edited in the profile rail, which draws their own unsure badge: the form's
 *  review list leaves them out so "unsure" is said once. */
const RAIL_FIELDS: ReadonlySet<LeadAiFillField> = new Set(['contactTitle', 'phone'])

/** The form's fields still carrying the AI's mark that it flagged for a look. */
export const unsureFields = (marks: LeadAiFillMarks): LeadAiFillField[] =>
  LeadAiFillField.options.filter((key) => !RAIL_FIELDS.has(key) && marks[key]?.unsure)

/** The label of a fillable box, sentence case, as the form prints it. */
export function labelOf(key: LeadAiFillField, lang: Lang = getLang()) {
  const field = FIELD.get(key)
  return field ? localizeLeadField(field, lang).label : key
}

/** What a box holds, in words: ids of category and industries become names,
 *  a select its option label. */
export function valueText(
  key: LeadAiFillField,
  values: FormValues,
  names: Parameters<typeof configName>[0],
  lang: Lang = getLang(),
): string {
  if (key === 'industries') {
    return readTags(values, key)
      .map((id) => configName(names, id))
      .join(', ')
  }
  const raw = readField(values, key)
  if (key === 'category') return raw === '' ? raw : configName(names, raw)
  const field = FIELD.get(key)
  const options = field ? localizeLeadField(field, lang).options : undefined
  return options?.find((option) => option.value === raw)?.label ?? raw
}
