import { useState } from 'react'
import { CalendarClock, Mail } from '@pv/ui'
import { Button, GlassCard, Icon, SectionTitle, Separator } from '@pv/ui'
import type { TouchEvent, TouchFocus } from '@/data/touches'
import { LeadHistoryPanel } from './lead-history-card'
import { MeetingsPanel } from './meetings-card'

/** The activity card — one card where three stood: meetings, mail, history.
 *
 *  Three cards in the same column each opened with its own head, its own glass
 *  and its own idea of what a timeline is, and the reader had to decide which
 *  of the three would answer "what has been going on with this customer".
 *  They are one question, so they are one card: what is coming, then what has
 *  happened.
 *
 *  ONE glass surface (law 12). The meeting block and the history tabs drop
 *  their own `GlassCard` when they come in here — a card inside a card is the
 *  fifth background layer.
 *
 *  Two head buttons, and both are things you do TO THE LEAD rather than to a
 *  timeline: book a meeting, write a letter. Everything a single tab owns
 *  stays down on the tab row. */
/** The locked door hands in NOTHING: a card with no lead behind it has no code
 *  to read, no letters to compose and no timeline to key on. A union rather
 *  than nine optional props, so the live door still cannot forget one. */
export type LeadActivityCardProps =
  | { locked: true }
  | {
      locked?: false
      code: string
      canEdit: boolean
      touches: readonly TouchEvent[] | undefined
      focus: TouchFocus | null
      seedAddress: string | null | undefined
      /** The page owns the mail modal; this is its button. */
      onCompose: () => void
      /** Non-empty = the Email button is disabled and this is its title. */
      composeBlocked?: string
      /** Bumped by the toolbar's meeting button to open the add-meeting door
       *  from outside this card. Same shape as `TouchFocus`, same reason. */
      openSchedule?: number
    }

export function LeadActivityCard(props: LeadActivityCardProps) {
  const [asked, setAsked] = useState(0)

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Hoạt động">
      <SectionTitle
        size="detail"
        actions={
          props.locked ? undefined : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="md"
                variant="secondary"
                className="pointer-coarse:h-12"
                disabled={!props.canEdit}
                title={props.canEdit ? undefined : 'Cần quyền sửa lead để đặt lịch.'}
                onClick={() => setAsked((n) => n + 1)}
              >
                <Icon icon={CalendarClock} size={16} />
                Đặt lịch
              </Button>
              <Button
                size="md"
                variant="secondary"
                className="pointer-coarse:h-12"
                disabled={Boolean(props.composeBlocked)}
                title={props.composeBlocked}
                onClick={props.onCompose}
              >
                <Icon icon={Mail} size={16} />
                Email
              </Button>
            </div>
          )
        }
      >
        Hoạt động
      </SectionTitle>

      {props.locked ? (
        /* No dimming layer over a live card: an opacity wash on real text is
           how a screen loses law 13's 4.5:1. One muted sentence says it. */
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Lịch họp, email và dòng thời gian có sau khi tạo lead.
        </p>
      ) : (
        <>
          <MeetingsPanel
            code={props.code}
            canEdit={props.canEdit}
            openSchedule={(props.openSchedule ?? 0) + asked}
          />
          <Separator />
          <LeadHistoryPanel
            code={props.code}
            touches={props.touches}
            focus={props.focus}
            seedAddress={props.seedAddress}
          />
        </>
      )}
    </GlassCard>
  )
}
