import { Avatar, Button, GlassCard } from '@pv/ui'
import { readField } from '@/data/lead-form'
import type { LeadDraft } from '@/data/lead-draft'
import { useI18n } from '@/app/i18n'
import { LEAD_COPY } from '@/data/lead-copy'

/** The sticky bottom bar of the create door — WHO is being typed on the left,
 *  the draft's two buttons on the right. The profile's bar is the record
 *  shell's `ActionBar` (ADR 0078).
 *
 *  STICKY rather than fixed: it stays in the content flow so it cannot cover the
 *  sidebar, and below `lg` it leaves room for AppShell's 84px BottomNav. */
export function LeadToolsBar({ draft }: { draft: LeadDraft }) {
  const { t } = useI18n()
  return (
    <div className="z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        className="bg-hc-surface shadow-panel grid gap-3 p-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center"
        aria-label={t(LEAD_COPY.toolbar)}
      >
        <CreateBar draft={draft} />
      </GlassCard>
    </div>
  )
}

/** The create door: the person being typed into the draft on the left, that
 *  same draft's two buttons on the right. */
function CreateBar({ draft }: { draft: LeadDraft }) {
  const { t } = useI18n()
  const name = readField(draft.values, 'contactName')

  return (
    <>
      <ContactFace
        name={name}
        title={readField(draft.values, 'contactTitle')}
        phone={readField(draft.values, 'phone')}
      />

      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={draft.dirty.length === 0 || draft.pending}
          onClick={draft.reset}
        >
          {t(LEAD_COPY.clearDraft)}
        </Button>
        {/* An admission panel is up: its buttons are the only way forward. */}
        <Button
          size="lg"
          disabled={draft.pending || draft.admission !== null}
          onClick={draft.submit}
        >
          {draft.pending ? t(LEAD_COPY.creating) : t(LEAD_COPY.create)}
        </Button>
        <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
      </div>
    </>
  )
}

/** Who we are calling: face, name, title, number. The number is mono because
 *  it is read character by character, out loud, while somebody dials it. */
function ContactFace({
  name,
  title,
  phone,
}: {
  name: string | null | undefined
  title: string | null | undefined
  phone: string | null | undefined
}) {
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name || t(LEAD_COPY.unknownPerson)} size="md" className="shrink-0" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[13px] font-semibold">{name || t(LEAD_COPY.noContact)}</span>
        <span className="text-muted-foreground truncate text-[11.5px] leading-[1.5]">
          {title || t(LEAD_COPY.noTitle)}
          {phone ? ' · ' : ''}
          {phone && <span className="font-mono">{phone}</span>}
        </span>
      </span>
    </div>
  )
}
