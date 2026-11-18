import { AiMark, Icon } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import type { AiSource } from '@/data/lead-ai-fill'

/** A source as plain text, or a link that opens the page in a new tab. The
 *  anchor itself is the 48px target on a finger, so no wrapper has to be. */
export function AiSourceText({ source }: { source: AiSource }) {
  if (!source.href) return <>{source.text}</>
  return (
    <a
      href={source.href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-foreground pointer-coarse:inline-flex pointer-coarse:min-h-12 items-center underline underline-offset-2 hover:no-underline"
    >
      {source.text}
    </a>
  )
}

/** The bare 16px mark at the end of a label; pressing it shows the source line.
 *  The halo makes a 48px target on a finger without growing the label row. */
export function AiFieldToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useI18n()
  const label = t(message('Xem nguồn', 'Show source', '출처 보기'))
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={open}
      onClick={onToggle}
      className="focus-visible:outline-ring pointer-coarse:after:-inset-4 relative inline-flex size-4 items-center justify-center rounded-sm p-0 after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Icon icon={AiMark} size={16} />
    </button>
  )
}

/** The one dim line under a field the AI filled, shown while its mark is open. */
export function AiSourceLine({ source }: { source: AiSource }) {
  const { t } = useI18n()
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-[12px] leading-[1.6]">
      {t(message('Nguồn:', 'Source:', '출처:'))} <AiSourceText source={source} />
    </span>
  )
}
