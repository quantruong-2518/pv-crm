import { GlassCard, SectionTitle } from '@pv/ui'

/** The activity card of the create door — named, and saying it opens once the
 *  lead exists. The profile splits it up (ADR 0078): meetings in the body,
 *  the activity history folded into the todo card's rung dates, mail and
 *  comms in the run rail.
 *
 *  No dimming layer: an opacity wash on real text is how a screen loses law
 *  13's 4.5:1. One muted sentence says it. */
export function LeadActivityCard() {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Hoạt động">
      <SectionTitle size="detail">Hoạt động</SectionTitle>
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Lịch họp, email và dòng thời gian có sau khi tạo lead.
      </p>
    </GlassCard>
  )
}
