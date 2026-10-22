import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Info } from '@pv/ui'
import { Button, Icon, Modal } from '@pv/ui'
import {
  COMM_RECORD_STATE_LABEL,
  normalisePhone,
  type CommActionChannel,
  type MailSubjectKind,
} from '@pv/contracts'
import { toast } from '@/app/toast'
import { phoneText } from '@/lib/phone'
import { COMMS_CHANNEL_ICON, COMMS_CHANNEL_LABEL } from '@/data/comms'
import { commTargetQuery } from '@/data/comm-record-detail'
import {
  COMM_SUBJECT_NOUN,
  commCreateFailure,
  commRecordPath,
  notConfirmableReason,
  useCreateCommRecord,
} from '@/data/comm-records'
import { isApiError } from '@/app/api'

/** The one question before a contact action, and the order it enforces:
 *  record first (POST → 201), action second. A centred dialog on desktop and a
 *  bottom sheet below `sm` (canvas boards `Action` · `ActionMobile`) — one
 *  `Modal`, reshaped by class, rather than a second dialog system. */

/** The object the record belongs to, fixed at creation (ADR 0075 §1). */
export type CommSubject = { code: string; kind: MailSubjectKind }

/** `code` absent = the lead's own contact person, who has no `sales.contact` row. */
export type CommContact = {
  code?: string
  name: string
  title?: string | null
  phone?: string | null
  email?: string | null
}

/** The page's own composer, and why it is shut when it is. */
export type CommMail = { onCompose: (contact: CommContact) => void; blocked?: string }

const COPY: Record<
  Exclude<CommActionChannel, 'email'>,
  { verb: string; cta: string; opens: string }
> = {
  phone: { verb: 'Gọi', cta: 'Xác nhận và gọi', opens: 'mở cuộc gọi trên thiết bị này' },
  'zalo-oa': {
    verb: 'Liên hệ Zalo với',
    cta: 'Xác nhận và mở Zalo',
    opens: 'mở Zalo tới người này',
  },
  telegram: {
    verb: 'Liên hệ Telegram với',
    cta: 'Xác nhận và mở Telegram',
    opens: 'mở Telegram tới người này',
  },
  whatsapp: {
    verb: 'Liên hệ WhatsApp với',
    cta: 'Xác nhận và mở WhatsApp',
    opens: 'mở WhatsApp tới người này',
  },
}

export function CommActionConfirm({
  channel,
  subject,
  contact,
  mail,
  onClose,
}: {
  channel: CommActionChannel | null
  subject: CommSubject
  contact: CommContact
  mail?: CommMail
  onClose: () => void
}) {
  const create = useCreateCommRecord()
  const navigate = useNavigate()
  /* Fetched when the dialog opens, never per row: a comm this caller could not
     confirm is refused here, before anything is written. */
  const target = useQuery({
    ...commTargetQuery(subject.code),
    enabled: channel !== null && channel !== 'email',
  })
  const refused = target.data?.confirmable === false
  /* A disabled confirm always says why: a failed create, a failed check, or a refusal. */
  const problem = create.error
    ? commCreateFailure(create.error)
    : target.error
      ? isApiError(target.error)
        ? commCreateFailure(target.error)
        : 'Không kiểm tra được lượt liên hệ này. Thử lại.'
      : refused
        ? notConfirmableReason(subject.kind)
        : null
  const { reset } = create

  /* A refusal belongs to the press that earned it, not to the next opening. */
  useEffect(() => {
    if (channel) reset()
  }, [channel, reset])

  /* A mail writes no comm: the letter's own send or schedule files it. The
     press opens the composer at once, with nothing to confirm. */
  useEffect(() => {
    if (channel !== 'email') return
    mail?.onCompose(contact)
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per press
  }, [channel])

  const shown = channel && channel !== 'email' ? channel : 'phone'
  const copy = COPY[shown]
  const reach = phoneText(contact.phone)

  const confirm = () => {
    if (!channel || channel === 'email' || create.isPending || refused || !target.data) return
    /* Opened inside the press: a tab opened after the await is a popup the
       browser blocks. It is pointed at the chat only once the record exists. */
    const tab = channel === 'phone' ? null : window.open('', '_blank')
    create.mutate(
      {
        channel,
        subjectCode: subject.code,
        ...(contact.code ? { contactCode: contact.code } : {}),
      },
      {
        onSuccess: (written) => {
          onClose()
          const copied = launch(channel, contact, tab)
          const label = `Đã ghi lượt liên hệ ${COMMS_CHANNEL_LABEL[channel]}`
          toast(copied ? `${label} · đã chép số ${copied}` : label, {
            tone: 'success',
            action: {
              label: 'Thêm nội dung',
              onClick: () => navigate(commRecordPath(written.debriefId)),
            },
          })
        },
        onError: () => tab?.close(),
      },
    )
  }

  return (
    <Modal
      open={channel !== null && channel !== 'email'}
      onClose={onClose}
      className="h-auto max-h-[90dvh] self-end rounded-t-lg sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[480px] sm:self-center"
      title={`${copy.verb} ${contact.name}?`}
      subtitle={[contact.title, reach].filter(Boolean).join(' · ') || undefined}
      footer={
        <div className="flex flex-col gap-3">
          {problem && (
            <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.5]">
              {problem}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              size="lg"
              type="button"
              disabled={create.isPending || refused || !target.data}
              onClick={confirm}
            >
              <Icon icon={COMMS_CHANNEL_ICON[shown]} size={16} />
              {create.isPending ? 'Đang ghi…' : target.isPending ? 'Đang kiểm tra…' : copy.cta}
            </Button>
          </div>
        </div>
      }
    >
      <p className="bg-surface-ink/5 text-muted-foreground m-0 flex gap-3 rounded-md p-3 text-[13px] leading-[1.6]">
        <Icon icon={Info} size={16} className="mt-1 shrink-0" />
        <span>
          Xác nhận sẽ ghi lượt liên hệ {COMMS_CHANNEL_LABEL[shown]} cho{' '}
          {COMM_SUBJECT_NOUN[subject.kind]} <span className="font-mono">{subject.code}</span> ở
          trạng thái “{COMM_RECORD_STATE_LABEL.empty}”, rồi {copy.opens}.
        </span>
      </p>
    </Modal>
  )
}

/** The action itself, only ever after 201. Returns the number it copied, if any. */
function launch(
  channel: Exclude<CommActionChannel, 'email'>,
  contact: CommContact,
  tab: Window | null,
): string | null {
  /* Older rows hold the number as typed ('0395 928 069'); every link below
     needs the E.164 one, the same fold the server applies before recording. */
  const phone = contact.phone ? normalisePhone(contact.phone) : ''
  if (!phone) return null
  if (channel === 'phone') {
    window.location.href = `tel:${phone}`
    return null
  }
  const url =
    channel === 'zalo-oa'
      ? `https://zalo.me/${zaloNumber(phone)}`
      : channel === 'telegram'
        ? `https://t.me/${phone}`
        : `https://wa.me/${phone.slice(1)}`
  if (tab) {
    tab.opener = null
    tab.location.href = url
  } else {
    window.open(url, '_blank', 'noopener')
  }
  /* t.me opens a chat only when the person lets strangers find them by number;
     the copied number lets the sale paste it into Telegram's search instead. */
  if (channel !== 'telegram') return null
  void navigator.clipboard?.writeText(phone).catch(() => undefined)
  return phoneText(phone)
}

/** zalo.me takes the national spelling for a Vietnamese number (`+84912…` →
 *  `0912…`); t.me takes `+` and digits, wa.me the digits alone. */
function zaloNumber(phone: string): string {
  return phone.startsWith('+84') ? `0${phone.slice('+84'.length)}` : phone.slice(1)
}
