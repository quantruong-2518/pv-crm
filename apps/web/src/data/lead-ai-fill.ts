import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadAiFillField, LeadAiFillResult, type AiFillSource, type LeadPatch } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { leadContactsQuery } from '@/data/contacts'
import { PROFILE_FIELDS, readField, type FieldKey, type FormValues } from '@/data/lead-form'
import { buildLeadPatch, patchPath } from '@/data/lead-patch'
import { leadProfileQuery, profileForm } from '@/data/lead-profile'

/** Module 2 · AI fill of a lead's empty fields — `POST /sales/leads/:code/ai-fill`
 *  — and the attach door its tax-code conflict offers (`PATCH …/account`).
 *
 *  The press is the consent (owner's decision): no review step, the server
 *  writes only fields that were empty and answers with the new profile, which
 *  replaces the cached one at once. The way back is an ordinary `LeadPatch`
 *  clearing exactly the filled fields; the server drops their provenance. */

/** Word for word with the `@Need` on the endpoint. */
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit', scoped: true }

/** The book prints several filled columns; the timeline gets a row per write.
 *  Copied prefixes, same debt `lead-patch.ts` records. */
const TOUCHED_KEYS = [
  ['sales', 'lead-book'],
  ['sales', 'lead-touches'],
] as const

export type AiFillConflict = LeadAiFillResult['conflicts'][number]

export function useLeadAiFill() {
  const client = useQueryClient()
  return useMutation<LeadAiFillResult, ApiError, string>({
    mutationFn: (code) =>
      api.write(`${patchPath(code)}/ai-fill`, { need: WRITE_NEED, schema: LeadAiFillResult }),
    onSuccess: (result, code) => {
      client.setQueryData(leadProfileQuery(code).queryKey, result.profile)
      for (const key of TOUCHED_KEYS) void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: leadContactsQuery(code).queryKey })
    },
  })
}

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

/** Fillable fields the given values hold empty, in the form's own order. */
export const emptyFillable = (values: FormValues): LeadAiFillField[] =>
  LeadAiFillField.options.filter((key) => readField(values, key) === '')

const LABEL = new Map<string, string>(PROFILE_FIELDS.map((field) => [field.key, field.label]))

/** A label set inside a sentence of the result toast: first letter lowered. */
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

const emptyOf = (key: LeadAiFillField): unknown => {
  const kind = PROFILE_FIELDS.find((field) => field.key === key)?.kind
  if (kind === 'num') return null
  return kind === 'tags' ? [] : ''
}

/** Undo of a fill, limited to `keys`: the body clearing them and the boxes as
 *  they will read after it. Diffed against what the fill wrote, not the cache. */
export function undoOf(
  result: LeadAiFillResult,
  keys: FieldKey[],
): { body: LeadPatch; emptied: Partial<FormValues> } | null {
  const wrote = profileForm(result.profile)
  const emptied = Object.fromEntries(
    keys.map((key) => [key, emptyOf(key as LeadAiFillField)]),
  ) as Partial<FormValues>
  const built = buildLeadPatch(wrote, { ...wrote, ...emptied })
  return built.ok ? { body: built.body, emptied } : null
}

/** The filled fields' values as the boxes hold them. */
export const filledValues = (result: LeadAiFillResult): Partial<FormValues> => {
  const values = profileForm(result.profile)
  return Object.fromEntries(
    result.filled.map(({ field }) => [field, values[field]]),
  ) as Partial<FormValues>
}
