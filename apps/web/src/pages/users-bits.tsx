import { Copy, Lock, RefreshCw, RotateCcw } from '@pv/ui'
import { Button, Icon, Input } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'

/** The footer buttons of the user panel, split from `users-parts.tsx` on size. */

/** Lock / unlock, with the one row it refuses to act on.
 *
 *  The button is wrapped in a `<span>` carrying the `title`, and that wrapper is
 *  load-bearing: `Button` sets `disabled:pointer-events-none`, so a `title` on
 *  the button itself never fires a tooltip — the browser gets no hover event to
 *  fire it from. Explaining why a control is dead, on the control that is dead,
 *  is the entire job here; without the wrapper the explanation is written and
 *  never read. */
export function LockButton({
  locked,
  isMe,
  pending,
  onClick,
}: {
  locked: boolean
  isMe: boolean
  pending: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  const why = isMe
    ? t(
        message(
          'Không tự khoá tài khoản của chính mình. Nhờ một Giám đốc khác.',
          'You cannot lock your own account. Ask another Director.',
          '자신의 계정은 직접 잠글 수 없습니다. 다른 이사에게 요청하세요.',
        ),
      )
    : locked
      ? t(
          message(
            'Mở lại quyền đăng nhập cho tài khoản này.',
            'Restore sign-in for this account.',
            '이 계정의 로그인 권한을 다시 허용합니다.',
          ),
        )
      : t(
          message(
            'Chặn đăng nhập và đăng xuất tài khoản này ngay.',
            'Block sign-in and sign this account out right away.',
            '로그인을 차단하고 이 계정을 즉시 로그아웃합니다.',
          ),
        )

  return (
    <span title={why}>
      <Button
        size="md"
        variant={locked ? 'ghost' : 'destructive'}
        type="button"
        disabled={isMe || pending}
        onClick={onClick}
      >
        <Icon icon={locked ? RotateCcw : Lock} size={16} />
        {locked
          ? t(message('Mở khoá', 'Unlock', '잠금 해제'))
          : t(message('Khoá tài khoản', 'Lock account', '계정 잠금'))}
      </Button>
    </span>
  )
}

/** Put this person back on the default password.
 *
 *  THE SECOND DOOR, beside the invite-mail button, and the tooltip has to say
 *  which one to reach for: they look interchangeable and are not. The mail
 *  link is the normal path and nobody but the owner ever sees the secret; this
 *  one works when the mailbox does not, and pays for that with a password two
 *  people know. What makes it acceptable is on the other side of the wire: the
 *  account can reach nothing but the change-password screen until its owner
 *  replaces the string.
 *
 *  Disabled on yourself, like the lock button and for a cousin of its reason:
 *  the server answers 409, and pressing it would strand you on the
 *  change-password screen mid-administration for nothing the self-service door
 *  does not already do better. */
export function ResetPasswordButton({
  isMe,
  pending,
  onClick,
}: {
  isMe: boolean
  pending: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  const why = isMe
    ? t(
        message(
          'Không tự đặt lại mật khẩu của chính mình. Dùng màn đổi mật khẩu.',
          'You cannot reset your own password. Use the change-password screen.',
          '자신의 비밀번호는 직접 초기화할 수 없습니다. 비밀번호 변경 화면을 이용하세요.',
        ),
      )
    : t(
        message(
          'Đặt lại về mật khẩu mặc định và đăng xuất người này. Người này phải đổi mật khẩu ở lần đăng nhập tới. Dùng khi hòm thư không nhận được thư.',
          'Reset to the default password and sign this person out. They must change it at the next sign-in. Use when the mailbox cannot receive email.',
          '기본 비밀번호로 초기화하고 이 사용자를 로그아웃합니다. 다음 로그인 때 비밀번호를 변경해야 합니다. 메일함이 메일을 받지 못할 때 사용하세요.',
        ),
      )

  return (
    <span title={why}>
      <Button size="md" variant="ghost" type="button" disabled={isMe || pending} onClick={onClick}>
        {/* No key glyph in the icon registry, and `RotateCcw` is the unlock button's. */}
        <Icon icon={RefreshCw} size={16} />
        {pending
          ? t(message('Đang đặt lại…', 'Resetting…', '초기화 중…'))
          : t(message('Đặt lại mật khẩu', 'Reset password', '비밀번호 초기화'))}
      </Button>
    </span>
  )
}

/** The raw set-password link, and the sentence that has to travel with it.
 *
 *  This only ever appears when the outbound mail door is shut, so the sentence
 *  says exactly that — otherwise a manager reads a link on screen as the normal
 *  way this works and starts pasting them into group chats. It sets a password:
 *  whoever holds it becomes that person. */
export function InviteLink({ link, onCopy }: { link: string; onCopy: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <span className="text-destructive-foreground text-[11.5px] leading-[1.6]">
        {t(
          message(
            'Chưa gửi thư được. Chép đường dẫn dưới đây và đưa tận tay người nhận. Ai có đường dẫn này là đặt được mật khẩu của tài khoản.',
            'The email could not be sent. Copy the link below and hand it to the person directly. Anyone with this link can set the account password.',
            '메일을 보내지 못했습니다. 아래 링크를 복사해 당사자에게 직접 전달하세요. 이 링크가 있으면 누구나 계정 비밀번호를 설정할 수 있습니다.',
          ),
        )}
      </span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={link}
          aria-label={t(
            message('Đường dẫn đặt mật khẩu', 'Set-password link', '비밀번호 설정 링크'),
          )}
          className="font-mono sm:flex-1"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button size="md" variant="ghost" type="button" onClick={onCopy}>
          <Icon icon={Copy} size={16} />
          {t(message('Chép', 'Copy', '복사'))}
        </Button>
      </div>
    </div>
  )
}
