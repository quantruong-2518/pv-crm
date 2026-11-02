import { GlassCard, SectionTitle } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { LEAD_COPY } from '@/data/lead-copy'

/** The activity card of the create door — named, and saying it opens once the
 *  lead exists. The profile splits it up (ADR 0078): meetings in the body,
 *  the activity history folded into the todo card's rung dates, mail and
 *  comms in the run rail.
 *
 *  No dimming layer: an opacity wash on real text is how a screen loses law
 *  13's 4.5:1. One muted sentence says it. */
export function LeadActivityCard() {
  const { t } = useI18n()
  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-4 sm:p-5"
      aria-label={t(LEAD_COPY.activity)}
    >
      <SectionTitle size="detail">{t(LEAD_COPY.activity)}</SectionTitle>
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(LEAD_COPY.activityAfterCreate)}
      </p>
    </GlassCard>
  )
}
