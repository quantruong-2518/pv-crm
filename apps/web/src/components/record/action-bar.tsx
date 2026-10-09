import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrandMark, Button, ChevronDown, Contact, Icon, cn, type IconGlyph } from '@pv/ui'
import type { CommActionChannel } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { phoneText } from '@/lib/phone'
import { COMMS_CHANNEL_ICON } from '@/data/comms'
import { commTargetQuery } from '@/data/comm-record-detail'
import { notConfirmableReason } from '@/data/comm-records'
import {
  CommActionConfirm,
  type CommContact,
  type CommSubject,
} from '@/components/comm-action-confirm'
import { MenuButton, type MenuChoice } from './menu-button'

/** The floating bar of every profile — reach a contact, and a more menu for
 *  the rare doors (ADR 0078 §1). A screen may pass ONE `primary` move, drawn
 *  last; one that does must not repeat it in its todo card.
 *
 *  Every channel asks which contact, primary first, then goes through the
 *  comm confirm, which records first and opens the channel second (ADR 0075).
 *  Under `sm` they fold into one contact button; the bar may still wrap to two rows.
 *  A screen nobody is reached from (campaign, company, contact) passes no
 *  `subject`: the bar is the more menu alone. 48px buttons (law 13). The
 *  shell keeps the room it floats over. */

const CHANNELS: { channel: CommActionChannel; label: string }[] = [
  { channel: 'phone', label: 'Gọi' },
  { channel: 'zalo-oa', label: 'Zalo' },
  { channel: 'telegram', label: 'Telegram' },
  { channel: 'whatsapp', label: 'WhatsApp' },
  { channel: 'email', label: 'Gửi mail' },
]

/** The three chat apps show their real logo and no words: the logo is the
 *  label, and the button keeps the name in `aria-label` and `title`. */
const BRAND: Partial<Record<CommActionChannel, 'zalo' | 'telegram' | 'whatsapp'>> = {
  'zalo-oa': 'zalo',
  telegram: 'telegram',
  whatsapp: 'whatsapp',
}

export type BarContact = CommContact & {
  primary?: boolean
  /** Already worded — the role label the record's own contract declares. */
  role?: string | null
}

type Asking = { channel: CommActionChannel; contact: BarContact }

/** Reaching people needs the record a comm is filed under; without one, none. */
type Reach =
  | {
      /** The record a comm is filed under. */
      subject: CommSubject
      /** `null`/absent = nobody is contacted from this record (a stopped deal). */
      contacts?: BarContact[] | null
      /** Opens the record's letter composer, addressed to this contact. */
      onCompose: (contact: BarContact) => void
      /** Set = every mail row is shut with this reason. */
      mailBlocked?: string
    }
  | { subject?: undefined; contacts?: undefined; onCompose?: undefined; mailBlocked?: undefined }

export function ActionBar({
  label,
  subject,
  contacts,
  onCompose,
  mailBlocked,
  more = [],
  extra,
  primary,
}: {
  /** Names the group for a screen reader. */
  label: string
  /** The more menu — not drawn when empty. */
  more?: MenuChoice[]
  /** A screen's own control, drawn before the more menu — the run overview's key. */
  extra?: ReactNode
  /** The screen's one main move, drawn after everything else. */
  primary?: { label: string; icon?: IconGlyph; onClick: () => void }
} & Reach) {
  const [asking, setAsking] = useState<Asking | null>(null)
  const people = subject ? (contacts ?? null) : null
  const choicesOf = useContactChoices(subject, people ?? [], mailBlocked, (channel, contact) =>
    setAsking({ channel, contact }),
  )
  if (people === null && more.length === 0 && !primary && !extra) return null

  /* Above the bottom nav under `lg`; clear of the assistant button above it.
     `data-action-bar` tells the shell a bar drew, so it keeps the room. */
  return (
    <div
      data-action-bar
      className="pointer-events-none fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 flex justify-center lg:bottom-6 lg:right-24"
    >
      <div
        role="group"
        aria-label={label}
        className="glass-dock pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-lg p-2"
      >
        {people !== null && (
          <>
            <div className="sm:hidden">
              <MenuButton
                up
                size="md"
                className="pointer-coarse:h-12"
                label="Liên hệ"
                icon={Contact}
                ariaLabel="Liên hệ — chọn cách và người liên hệ"
                choices={
                  people.length === 0
                    ? choicesOf('phone')
                    : CHANNELS.flatMap(({ channel, label: verb }) =>
                        choicesOf(channel).map((c) => ({
                          ...c,
                          key: `${channel}-${c.key}`,
                          label: (
                            <span className="flex items-center gap-2">
                              {BRAND[channel] && <BrandMark brand={BRAND[channel]} size={20} />}
                              {verb} · {c.label}
                            </span>
                          ),
                        })),
                      )
                }
              />
            </div>
            <div className="hidden sm:contents">
              {CHANNELS.map(({ channel, label: verb }) => {
                const brand = BRAND[channel]
                return (
                  <MenuButton
                    key={channel}
                    up
                    size="md"
                    className={cn('pointer-coarse:h-12', brand && 'pointer-coarse:w-12 w-10 px-0')}
                    label={brand ? null : verb}
                    title={brand ? verb : undefined}
                    mark={brand && <BrandMark brand={brand} size={20} />}
                    icon={COMMS_CHANNEL_ICON[channel]}
                    ariaLabel={`${verb} — chọn người liên hệ`}
                    choices={choicesOf(channel)}
                  />
                )
              })}
            </div>
          </>
        )}
        {extra}
        {more.length > 0 && (
          <MenuButton
            up
            align="right"
            size="md"
            className="pointer-coarse:h-12"
            label="Khác"
            icon={ChevronDown}
            ariaLabel="Thao tác khác"
            choices={more}
          />
        )}
        {primary && (
          <Button size="md" className="pointer-coarse:h-12" onClick={primary.onClick}>
            {primary.icon && <Icon icon={primary.icon} size={16} />}
            {primary.label}
          </Button>
        )}
      </div>

      {subject && (
        <CommActionConfirm
          channel={asking?.channel ?? null}
          subject={subject}
          contact={asking?.contact ?? { name: '' }}
          mail={asking ? { onCompose: () => onCompose?.(asking.contact) } : undefined}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  )
}

/** One menu row per contact, primary first; a row a channel cannot reach
 *  stays listed and says why. */
function useContactChoices(
  subject: CommSubject | undefined,
  contacts: BarContact[],
  mailBlocked: string | undefined,
  ask: (channel: CommActionChannel, contact: BarContact) => void,
) {
  const canRecord = useCan('comm.view')
  /* Cache only: the confirm dialog fetches it on open, then every row knows. */
  const { data: known } = useQuery({ ...commTargetQuery(subject?.code ?? ''), enabled: false })
  const people = [...contacts].sort((a, b) => Number(b.primary) - Number(a.primary))

  /* The screen's mail reason shuts every mail row, ahead of a missing address. */
  const blocked = (channel: CommActionChannel, c: BarContact): string | undefined => {
    if (!canRecord) return 'Vai của bạn không tạo được lượt liên hệ.'
    if (known && !known.confirmable && subject) return notConfirmableReason(subject.kind)
    if (channel === 'email') return mailBlocked ?? (c.email ? undefined : 'Chưa có email.')
    return c.phone ? undefined : 'Chưa có số điện thoại.'
  }

  return (channel: CommActionChannel): MenuChoice[] =>
    people.length === 0
      ? [
          {
            key: 'none',
            label: 'Chưa có người liên hệ',
            blocked: 'Thêm ở thẻ Người liên hệ.',
            onSelect: () => {},
          },
        ]
      : people.map((c, i) => ({
          key: c.code ?? `contact-${i}`,
          label: c.primary ? `${c.name} · Chính` : c.name,
          hint: [c.role, channel === 'email' ? c.email : phoneText(c.phone)]
            .filter(Boolean)
            .join(' · '),
          blocked: blocked(channel, c),
          onSelect: () => ask(channel, c),
        }))
}
