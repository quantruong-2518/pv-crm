import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Contact, Route } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import {
  OPPORTUNITY_CONTACT_ROLE_LABEL,
  type CommActionChannel,
  type OpportunityContact,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { phoneText } from '@/lib/phone'
import { COMMS_CHANNEL_ICON } from '@/data/comms'
import { commTargetQuery } from '@/data/comm-record-detail'
import { notConfirmableReason } from '@/data/comm-records'
import { refusalOf } from '@/data/opportunities'
import { CommActionConfirm } from '@/components/comm-action-confirm'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { DealEventButtons } from './opportunity-events'
import { MenuButton, type MenuChoice } from './opportunity-menu'
import { primaryMoveOf } from './opportunity-model'

/** Module 3 · the profile's floating action bar — every action of the deal in
 *  one place (ADR 0077 §6): reach a contact, open the history, record a fact,
 *  and the ONE primary move to the next column.
 *
 *  Whether each door shows is the server's `acts` (ADR 0076 §4). Call, Zalo
 *  and mail ask which deal contact, primary first, and go through the comm
 *  confirm (ADR 0075); under `sm` the three fold into one contact button so
 *  the bar stays short. A lost deal keeps only the workstream button: nothing
 *  is recorded on it and nobody is contacted from it. 48px buttons (law 13). */

const CHANNELS: { channel: CommActionChannel; label: string }[] = [
  { channel: 'phone', label: 'Gọi' },
  { channel: 'zalo-oa', label: 'Zalo' },
  { channel: 'email', label: 'Gửi mail' },
]

type Asking = { channel: CommActionChannel; contact: OpportunityContact }

export function DealActionBar({
  op,
  onSign,
  onCompose,
  onOpenJourney,
  journeyOpening = false,
}: {
  op: OpportunityProfileResponse
  onSign: () => void
  /** Opens the letter composer addressed to this contact. */
  onCompose: (contactCode: string) => void
  /** Absent = no workstream, or no `workstream.view`. */
  onOpenJourney?: () => void
  /** The journey read is in flight: the button waits instead of looking dead. */
  journeyOpening?: boolean
}) {
  const canAccept = useCan('opportunity.accept')
  const canClose = useCan('opportunity.close')
  const lost = op.state === 'lost'
  const primary = primaryMoveOf(op, { accept: canAccept, close: canClose })
  const [asking, setAsking] = useState<Asking | null>(null)
  const choicesOf = useContactChoices(op, (channel, contact) => setAsking({ channel, contact }))

  const signWhy = primary === 'sign' ? refusalOf(op.acts.sign) : null
  /* An open deal nobody here can move says why once, in the server's words. */
  const idle =
    op.state === 'open' && primary === null && !op.acts.activity.ok && !op.acts.quotation.ok
      ? refusalOf(op.acts.activity)
      : null
  const note = signWhy ?? idle
  if (lost && !onOpenJourney) return null

  /* Above the bottom nav under `lg`; clear of the assistant button above it. */
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 flex justify-center lg:bottom-6 lg:right-24">
      <div
        role="group"
        aria-label="Thao tác cơ hội"
        className="glass-overlay pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-lg p-2"
      >
        {!lost && (
          <>
            <div className="sm:hidden">
              <MenuButton
                up
                label="Liên hệ"
                icon={Contact}
                ariaLabel="Liên hệ — chọn cách và người liên hệ"
                choices={
                  op.contacts.length === 0
                    ? choicesOf('phone')
                    : CHANNELS.flatMap(({ channel, label }) =>
                        choicesOf(channel).map((c) => ({
                          ...c,
                          key: `${channel}-${c.key}`,
                          label: (
                            <>
                              {label} · {c.label}
                            </>
                          ),
                        })),
                      )
                }
              />
            </div>
            <div className="hidden sm:contents">
              {CHANNELS.map(({ channel, label }) => (
                <MenuButton
                  key={channel}
                  up
                  label={label}
                  icon={COMMS_CHANNEL_ICON[channel]}
                  ariaLabel={`${label} — chọn người liên hệ`}
                  choices={choicesOf(channel)}
                />
              ))}
            </div>
          </>
        )}

        {onOpenJourney && (
          <Button
            size="lg"
            variant="ghost"
            disabled={journeyOpening}
            aria-busy={journeyOpening}
            onClick={onOpenJourney}
          >
            <Icon icon={Route} size={16} />
            {journeyOpening ? 'Đang mở workstream…' : 'Xem workstream'}
          </Button>
        )}

        {!lost && <DealEventButtons op={op} quotePrimary={primary === 'quote'} />}

        {/* Mounted on the permission, not the verdict, so the modal outlives
            the accept that shuts the act. */}
        {op.state === 'open' && canAccept && (
          <AcceptDealButton code={op.code} show={primary === 'accept'} size="lg" />
        )}
        {primary === 'assign' && (
          <AssignSaleButton op={op} hasSeller={op.hasSeller} size="lg" variant="default" />
        )}
        {primary === 'sign' && (
          <Button
            size="lg"
            disabled={Boolean(op.pendingSign) || signWhy !== null}
            title={signWhy ?? undefined}
            onClick={onSign}
          >
            <Icon icon={Check} size={16} />
            Chốt thắng
          </Button>
        )}

        {note && (
          <span className="text-muted-foreground basis-full px-2 text-center text-[12px] leading-[1.5]">
            {note}
          </span>
        )}
      </div>

      <CommActionConfirm
        channel={asking?.channel ?? null}
        subject={{ code: op.code, kind: 'opportunity' }}
        contact={asking?.contact ?? { name: '' }}
        mail={asking ? { onCompose: () => onCompose(asking.contact.code) } : undefined}
        onClose={() => setAsking(null)}
      />
    </div>
  )
}

/** One menu row per deal contact, primary first; a row a channel cannot reach
 *  stays listed and says why. */
function useContactChoices(
  op: OpportunityProfileResponse,
  ask: (channel: CommActionChannel, contact: OpportunityContact) => void,
) {
  const canRecord = useCan('comm.view')
  /* Cache only: the confirm dialog fetches it on open, then every row knows. */
  const { data: known } = useQuery({ ...commTargetQuery(op.code), enabled: false })
  const people = [...op.contacts].sort((a, b) => Number(b.primary) - Number(a.primary))

  const blocked = (channel: CommActionChannel, c: OpportunityContact): string | undefined => {
    if (!canRecord) return 'Vai của bạn không tạo được lượt liên hệ.'
    if (known && !known.confirmable) return notConfirmableReason('opportunity')
    if (channel === 'email') return c.email ? undefined : 'Chưa có email.'
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
      : people.map((c) => ({
          key: c.code,
          label: c.primary ? `${c.name} · Chính` : c.name,
          hint: [
            c.role && OPPORTUNITY_CONTACT_ROLE_LABEL[c.role],
            channel === 'email' ? c.email : phoneText(c.phone),
          ]
            .filter(Boolean)
            .join(' · '),
          blocked: blocked(channel, c),
          onSelect: () => ask(channel, c),
        }))
}
