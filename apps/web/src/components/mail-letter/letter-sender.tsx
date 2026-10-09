import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, Modal, Plug } from '@pv/ui'
import {
  COMPANY_MAIL_DOMAIN,
  MAIL_PERSONAL_WINDOW_HOURS,
  type GoogleLinkStatus,
  type MailGroupPreflightResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { googleLinkQuery, useConnectGoogle } from '@/data/google'

/** The composer's one statement of which mailbox the letter leaves from.
 *
 *  It names the kind of mailbox, not the address: the address is the preview
 *  envelope's, and a fact sits in one place. The kind is the server's (`sender`
 *  of the preflight), never derived here. The link status only picks the
 *  sentence that says why a letter is still on the shared mailbox, and it is
 *  waited for so the line does not grow a prompt after it appears. No Google
 *  client on the server = no prompt (`GoogleLinkLine`).
 *
 *  Connecting is a full navigation to Google, so a written letter is lost:
 *  `dirty` puts a confirmation in front of it. */

type Prompt = { why: string; action: string }

const OWN_MAILBOX = 'để thư gửi từ hộp thư của chính bạn'
const CONNECT = 'Kết nối tài khoản Google'
const RECONNECT = 'Kết nối lại tài khoản Google'

function promptOf(link: GoogleLinkStatus): Prompt | null {
  if (!link.connected) {
    return {
      why: `Kết nối tài khoản Google công ty (@${COMPANY_MAIL_DOMAIN}) ${OWN_MAILBOX}.`,
      action: CONNECT,
    }
  }
  const linked = `Tài khoản Google đã kết nối${link.email ? ` (${link.email})` : ''}`
  if (link.mail === 'needs_consent') {
    return {
      why: `${linked} chưa cấp quyền gửi thư qua Gmail. Kết nối lại và cấp quyền ${OWN_MAILBOX}.`,
      action: RECONNECT,
    }
  }
  if (link.mail === 'wrong_domain') {
    return {
      why: `${linked} không phải tài khoản @${COMPANY_MAIL_DOMAIN}. Kết nối lại bằng tài khoản công ty ${OWN_MAILBOX}.`,
      action: RECONNECT,
    }
  }
  return null
}

export function LetterSenderLine({
  sender,
  dirty,
}: {
  sender?: MailGroupPreflightResponse['sender']
  /** The letter holds text the person wrote; leaving would lose it. */
  dirty: boolean
}) {
  const link = useQuery(googleLinkQuery())
  const connect = useConnectGoogle()
  const [asking, setAsking] = useState(false)

  const known = sender && !link.isPending
  const own = sender?.transport === 'gmail'
  const prompt = known && !own && link.data?.configured ? promptOf(link.data) : null
  const left = sender?.remainingToday ?? null

  const go = () =>
    connect.mutate(undefined, {
      onError: (error) =>
        toast(
          isApiError(error) ? userMessage(error) : 'Không mở được trang kết nối tài khoản Google.',
          { tone: 'danger' },
        ),
    })

  return (
    /* The row keeps its height while nothing is known, so the card below does not jump. */
    <div className="flex min-h-5 min-w-0 flex-wrap items-center justify-between gap-2">
      {known && (
        <p className="text-muted-foreground m-0 min-w-0 flex-1 basis-64 text-[12px] leading-5">
          {own ? 'Thư gửi từ hộp thư của bạn' : 'Thư gửi từ hộp thư chung'}
          {left !== null && ' · '}
          {left !== null &&
            (left === 0 ? (
              <span className="text-warning tnum">
                {`đã hết hạn mức gửi trong ${MAIL_PERSONAL_WINDOW_HOURS} giờ gần nhất`}
              </span>
            ) : (
              <span className="tnum">
                {`trong ${MAIL_PERSONAL_WINDOW_HOURS} giờ gần nhất còn gửi được tới ${left} địa chỉ (tính cả To và CC)`}
              </span>
            ))}
          {prompt && ` · ${prompt.why}`}
        </p>
      )}
      {prompt && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="pointer-coarse:h-12 shrink-0"
          disabled={connect.isPending}
          onClick={() => (dirty ? setAsking(true) : go())}
        >
          <Icon icon={Plug} size={16} />
          {prompt.action}
        </Button>
      )}
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        className="h-auto sm:h-auto sm:max-w-[480px]"
        title={CONNECT}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={() => setAsking(false)}>
              Ở lại
            </Button>
            <Button size="lg" type="button" disabled={connect.isPending} onClick={go}>
              Rời màn hình
            </Button>
          </div>
        }
      >
        <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
          Kết nối tài khoản Google sẽ rời màn hình này, thư đang soạn sẽ mất.
        </p>
      </Modal>
    </div>
  )
}
