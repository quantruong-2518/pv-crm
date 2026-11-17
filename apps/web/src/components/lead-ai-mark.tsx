import { AiFieldMark } from '@pv/ui'
import type { AiFillMark } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { sourceOf } from '@/data/lead-ai-fill'

/** The AI provenance caption of one lead field, from `LeadProfile.aiFill`.
 *  Shared by the profile form and the rail's contacts block, which shows the
 *  primary contact's title and phone the fill may write. */
export function LeadAiMark({ mark }: { mark: AiFillMark | undefined }) {
  const { lang, t } = useI18n()
  if (!mark) return null
  const source = sourceOf(mark.source, lang)
  return (
    <AiFieldMark
      label={t(message('AI điền', 'AI filled', 'AI 입력'))}
      unsureLabel={t(message('Chưa chắc', 'Unsure', '불확실'))}
      source={source.text}
      sourceHref={source.href}
      unsure={mark.unsure}
    />
  )
}
