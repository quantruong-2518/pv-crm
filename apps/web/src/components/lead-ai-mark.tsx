import { AiFieldMark } from '@pv/ui'
import type { AiFillMark } from '@pv/contracts'
import { sourceOf } from '@/data/lead-ai-fill'

/** The AI provenance caption of one lead field, from `LeadProfile.aiFill`.
 *  Shared by the profile form and the rail's contacts block, which shows the
 *  primary contact's title and phone the fill may write. */
export function LeadAiMark({ mark }: { mark: AiFillMark | undefined }) {
  if (!mark) return null
  const source = sourceOf(mark.source)
  return <AiFieldMark source={source.text} sourceHref={source.href} unsure={mark.unsure} />
}
