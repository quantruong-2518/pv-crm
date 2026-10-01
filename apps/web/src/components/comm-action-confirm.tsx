import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Info } from '@pv/ui'
import { Button, Icon, Modal } from '@pv/ui'
import { COMM_RECORD_STATE_LABEL, type CommActionChannel, type TouchSubject } from '@pv/contracts'
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
export type CommSubject = { code: string; kind: TouchSubject }

/** `code` absent = the lead's own contact person, who has no `sales.contact` row. */
export type CommContact = {
  code?: string
  name: string
  title?: string | null
  phone?: string | null
  email?: string | null
}

/** The page's own composer, and why it is shut when it is. */
export type CommMail = { onCompose: () => void; blocked?: string }

const COPY: Record<CommActionChannel, { verb: string; cta: string; opens: string }> = {
  phone: { verb: 'Gọi', cta: 'Xác nhận và gọi', opens: 'mở cuộc gọi trên thiết bị này' },
  'zalo-oa': {
    verb: 'Liên hệ Zalo với',
    cta: 'Xác nhận và mở Zalo',
    opens: 'mở Zalo tới người này',
  },
  email: { verb: 'Gửi mail cho', cta: 'Xác nhận và soạn mail', opens: 'mở trình soạn thư' },
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
  const target = useQuery({ ...commTargetQuery(subject.code), enabled: channel !== null })
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

  const shown = channel ?? 'phone'
  const copy = COPY[shown]
  const reach = shown === 'email' ? contact.email : phoneText(contact.phone)

  const confirm = () => {
    if (!channel || create.isPending || refused || !target.data) return
    /* Opened inside the press: a tab opened after the await is a popup the
       browser blocks. It is pointed at Zalo only once the record exists. */
    const tab = channel === 'zalo-oa' ? window.open('', '_blank') : null
    create.mutate(
      {
        channel,
        subjectCode: subject.code,
        ...(contact.code ? { contactCode: contact.code } : {}),
      },
      {
        onSuccess: (written) => {
          onClose()
          launch(channel, contact, tab, mail)
          toast(`Đã ghi lượt liên hệ ${COMMS_CHANNEL_LABEL[channel]}`, {
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
      open={channel !== null}
      onClose={onClose}
      className="h-auto max-h-[90dvh] self-end rounded-t-lg sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[480px] sm:self-center"
      title={`${copy.verb} ${contact.name}?`}
      subtitle={[contact.title, reach].filter(Boolean).join(' · ') || undefined}
      footer={
        <div className="flex flex-col gap-3">
          {problem && (
            <p role="alert" className="text-warning m-0 text-[12.5px] leading-[1.5]">
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
              {create.isPending ? 'Đang ghi lại…' : target.isPending ? 'Đang kiểm tra…' : copy.cta}
            </Button>
          </div>
        </div>
      }
    >
      <p className="bg-surface-ink/5 text-muted-foreground m-0 flex gap-3 rounded-md p-3 text-[13px] leading-[1.6]">
        <Icon icon={Info} size={16} className="mt-1 shrink-0" />
        <span>
          Khi xác nhận, PV One ghi lại lượt liên hệ {COMMS_CHANNEL_LABEL[shown]} này cho{' '}
          {COMM_SUBJECT_NOUN[subject.kind]} <span className="font-mono">{subject.code}</span> ở
          trạng thái “{COMM_RECORD_STATE_LABEL.empty}”, rồi mới {copy.opens}. Sau đó bạn thêm nội
          dung vào lượt liên hệ này.
        </span>
      </p>
    </Modal>
  )
}

/** The action itself, only ever after 201. */
function launch(
  channel: CommActionChannel,
  contact: CommContact,
  tab: Window | null,
  mail: CommMail | undefined,
) {
  if (channel === 'email') {
    mail?.onCompose()
    return
  }
  if (!contact.phone) return
  if (channel === 'phone') {
    window.location.href = `tel:${contact.phone}`
    return
  }
  const url = `https://zalo.me/${zaloNumber(contact.phone)}`
  if (!tab) {
    window.open(url, '_blank', 'noopener')
    return
  }
  tab.opener = null
  tab.location.href = url
}

/** zalo.me takes the national spelling: `+84912…` → `0912…`. */
function zaloNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.startsWith('+84') ? `0${digits.slice('+84'.length)}` : digits.replace('+', '')
}
