import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, cn } from '@pv/ui'
import type { CommActionChannel } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { COMMS_CHANNEL_ICON } from '@/data/comms'
import { commTargetQuery } from '@/data/comm-record-detail'
import { notConfirmableReason } from '@/data/comm-records'
import {
  CommActionConfirm,
  type CommContact,
  type CommMail,
  type CommSubject,
} from './comm-action-confirm'

export type { CommContact, CommMail, CommSubject } from './comm-action-confirm'

/** The call, chat and mail buttons on one contact person (ADR 0075 §3).
 *
 *  Every press goes through `CommActionConfirm`: the comm is created first,
 *  the call, chat or letter opens only after the server answered 201, so a
 *  contact never happens without its comm. The call button stays on desktop and opens
 *  `tel:` there too (ADR 0075 §6). Below `sm` the three share one row at the
 *  48px tablet floor (law 13); above it they sit inline at 40px. */
const BUTTON_LABEL: Record<CommActionChannel, string> = {
  phone: 'Gọi',
  'zalo-oa': 'Zalo',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  email: 'Gửi mail',
}

export function CommActions({
  subject,
  contact,
  mail,
  channels: only,
  className,
}: {
  subject: CommSubject
  contact: CommContact
  /** Absent = this place has no mail composer, so no mail button either. */
  mail?: CommMail
  /** Narrow to some of the channels (the lead toolbar shows no Zalo). */
  channels?: readonly CommActionChannel[]
  className?: string
}) {
  const canRecord = useCan('comm.view')
  /* Mail to a lead is a lead permission: the comm would move the lead too. */
  const canMail = useCan('lead.send-email') || subject.kind !== 'lead'
  /* Cache only: the dialog fetches it on open, then every button here knows. */
  const { data: known } = useQuery({ ...commTargetQuery(subject.code), enabled: false })
  const [asking, setAsking] = useState<CommActionChannel | null>(null)

  const blocked = (channel: CommActionChannel): string | undefined => {
    if (!canRecord) return 'Vai của bạn không tạo được comm.'
    if (known && !known.confirmable) return notConfirmableReason(subject.kind)
    if (channel === 'email') {
      if (!canMail) return 'Cần quyền gửi email cho lead.'
      return contact.email ? mail?.blocked : 'Chưa có email.'
    }
    return contact.phone ? undefined : 'Chưa có số điện thoại.'
  }

  /* Telegram and WhatsApp are opt-in: the record's floating bar carries them,
     and the narrow grid below has columns for three at most. */
  const channels = (only ?? ['phone', 'zalo-oa', 'email']).filter((c) => c !== 'email' || mail)
  const reasons = [...new Set(channels.flatMap((c) => blocked(c) ?? []))]

  return (
    <>
      <span
        className={cn(
          'grid w-full gap-2 sm:flex sm:w-auto',
          ['grid-cols-1', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3'][channels.length],
          className,
        )}
      >
        {channels.map((channel) => {
          const reason = blocked(channel)
          return (
            <Button
              key={channel}
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12 w-full max-sm:h-12 sm:w-auto"
              disabled={reason !== undefined}
              title={reason}
              aria-label={`${BUTTON_LABEL[channel]} · ${contact.name}`}
              onClick={() => setAsking(channel)}
            >
              <Icon icon={COMMS_CHANNEL_ICON[channel]} size={16} />
              {BUTTON_LABEL[channel]}
            </Button>
          )
        })}
      </span>
      {/* Said on the row, not only in `title`: a touch screen never shows a title. */}
      {reasons.length > 0 && (
        <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {reasons.join(' ')}
        </span>
      )}

      <CommActionConfirm
        channel={asking}
        subject={subject}
        contact={contact}
        mail={mail}
        onClose={() => setAsking(null)}
      />
    </>
  )
}
