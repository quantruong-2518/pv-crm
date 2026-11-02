import type { RoleId, UserRow } from '@pv/contracts'
import { Badge, MetaPill } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { dm, dmy } from '@/lib/date'
import { kpiRoleText } from '@/data/kpi-i18n'

/** The row cells of the Users admin screen, split from `users-parts.tsx` on
 *  size. The panel that edits a row stays there. */

/** The name column, with a marker on the row that is the person reading it.
 *
 *  The marker is not decoration: two of the panel's controls are dead on this
 *  row (role and lock), and a manager who finds a greyed-out button without
 *  having noticed whose row they opened reads it as a bug in the screen. The
 *  "you" tag in the table explains it before the surprise. */
export function UserNameCell({ name, isMe }: { name: string; isMe: boolean }) {
  const { t } = useI18n()
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      {isMe && <MetaPill className="shrink-0">{t(message('bạn', 'you', '나'))}</MetaPill>}
    </span>
  )
}

/** The role column — BOTH names, stacked, and that is the whole point.
 *
 *  `role` is a free-text display label somebody typed ("Sale · chip"); `roleIds`
 *  are the keys the permission matrix is read by, one line however many there
 *  are. They are allowed to differ, and when they do it matters: an account
 *  labelled "Sale · chip" whose `roleIds` include `head-of-sales` can approve the whole department, and a table printing only
 *  the label would show nothing at all wrong. Printing only the key would be
 *  the opposite mistake — it would drop the industry the department actually
 *  organises itself by.
 *
 *  `SessionActor.role` already warns never to bind a permission to the label.
 *  This cell is where that warning becomes visible to a person. */
export function UserRoleCell({ label, roleIds }: { label: string; roleIds: readonly RoleId[] }) {
  const { lang } = useI18n()
  const names = roleIds.map((id) => kpiRoleText(id, lang)).join(' · ')
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate" title={label}>
        {label}
      </span>
      <span className="text-muted-foreground truncate text-[11px]" title={names}>
        {names}
      </span>
    </span>
  )
}

/** The status column — three states, and every row gets one.
 *
 *  Two of them need somebody to act: an account nobody can sign into yet and
 *  one nobody may sign into any more. The third ("Active") keeps the column
 *  from being a run of empty cells, which read as missing data.
 *
 *  Locked wins over password-not-set: it is the harder stop, and inviting
 *  somebody whose account is shut achieves nothing. `disabledAt` is a timestamp
 *  so the chip can answer "since when"; the full date is in `title`. */
export function UserStatusCell({ user }: { user: UserRow }) {
  const { t } = useI18n()
  if (user.disabledAt !== null) {
    return (
      <Badge
        tone="danger"
        /* Law 6: a date in a table column is a table number, so digits stay tabular. */
        className="tnum"
        title={t(
          message(
            `Khoá từ ${dmy(user.disabledAt)}.`,
            `Locked since ${dmy(user.disabledAt)}.`,
            `${dmy(user.disabledAt)}부터 잠김.`,
          ),
        )}
      >
        {t(message('Đang khoá', 'Locked', '잠김'))} · {dm(user.disabledAt)}
      </Badge>
    )
  }

  /* Before the no-password branch: an account can be both, and the pending
     password change is the newer fact, with a button behind it. */
  if (user.mustChangePasswordAt !== null) {
    return (
      <Badge
        tone="warning"
        className="tnum"
        title={t(
          message(
            `Đặt lại mật khẩu mặc định ${dmy(user.mustChangePasswordAt)}. Người này phải đổi mật khẩu mới dùng được.`,
            `Password reset to the default on ${dmy(user.mustChangePasswordAt)}. This person must change it before using the account.`,
            `${dmy(user.mustChangePasswordAt)}에 기본 비밀번호로 초기화되었습니다. 비밀번호를 변경해야 계정을 사용할 수 있습니다.`,
          ),
        )}
      >
        {t(message('Chờ đổi mật khẩu', 'Password change pending', '비밀번호 변경 대기'))} ·{' '}
        {dm(user.mustChangePasswordAt)}
      </Badge>
    )
  }

  if (!user.passwordSet) {
    return (
      <Badge tone="warning">
        {t(message('Chờ đặt mật khẩu', 'Password not set', '비밀번호 미설정'))}
      </Badge>
    )
  }

  return (
    <Badge
      tone="success"
      title={t(
        message(
          `Mở tài khoản ${dmy(user.createdAt)}`,
          `Account opened ${dmy(user.createdAt)}`,
          `${dmy(user.createdAt)} 계정 생성`,
        ),
      )}
    >
      {t(message('Đang dùng', 'Active', '사용 중'))}
    </Badge>
  )
}
