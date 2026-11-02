import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Mail, Save, X } from '@pv/ui'
import { Button, Checkbox, Drawer, Icon, Input, Kicker, cn } from '@pv/ui'
import type { Branch, RoleId, UserRow } from '@pv/contracts'
import { isAdmin } from '@pv/engines'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { useSession } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { kpiRoleText } from '@/data/kpi-i18n'
import { UserStatusCell } from './users-cells'
import { InviteLink, LockButton, ResetPasswordButton } from './users-bits'
import {
  BRANCH_OPTIONS,
  CORE_BRANCH,
  DEFAULT_ROLE,
  NOTHING_TO_SAVE,
  ROLE_IDS,
  diffUser,
  scopeLabel,
  useCreateUser,
  useInviteUser,
  useResetUserPassword,
  useHoldingsCheck,
  useLockUser,
  useSaveUser,
} from '@/data/users'
import { HandoverDrawer } from './users-lock'

/** The blocks of Quản trị · Người dùng — the row cells, and the panel that does
 *  double duty for "thêm người" and "sửa một người".
 *
 *  Split out of `users.tsx` for the reason `lead-parts.tsx` was split out of
 *  `leads.tsx`: the screen file should read as the shape of the screen — header,
 *  table, panel — and stop being readable the moment a 200-line form is inlined
 *  into the middle of it. Nothing here is reusable beyond this screen, which is
 *  exactly why it is a sibling file and not a `@pv/ui` component. */

/** The save button lives in the drawer's footer, a SIBLING of the form rather
 *  than a descendant, so the two are tied by `form=` instead of by nesting.
 *  Wiring it with `onClick` instead would quietly lose Enter-to-submit. */
const FORM_ID = 'user-form'

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export type UserDrawerProps = {
  open: boolean
  onClose: () => void
  /** The row being edited, or `null` for a new account. One panel for both
   *  because they ask the same six questions; the two places they differ
   *  (mailbox, and the buttons that need an id) each say so on screen. */
  user: UserRow | null
  /** Who is reading. `undefined` only while the session is being torn down. */
  meId?: string
}

export function UserDrawer({ open, onClose, user, meId }: UserDrawerProps) {
  const { t, lang } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [roleIds, setRoleIds] = useState<readonly RoleId[]>([DEFAULT_ROLE])
  const [branches, setBranches] = useState<readonly Branch[]>([CORE_BRANCH])
  const [ownOnly, setOwnOnly] = useState(false)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState('')

  /* The lock lives in local state seeded from the row rather than being read
     off `user` directly. The panel stays open after a lock — a manager often
     locks and then fixes the role in the same visit — so the button has to flip
     its own label from the row the PATCH answered with. Reading `user` would
     show "Khoá tài khoản" on an account that was just locked, until the list
     refetch happened to land. */
  const [lockedAt, setLockedAt] = useState<string | null>(null)

  /* The raw set-password link, and it is only ever non-empty on a machine whose
     outbound mail door is shut. Kept in panel state, not in the query cache: it
     is a one-shot answer to one click, and a cached password link is a password
     link with a lifetime nobody chose. */
  const [link, setLink] = useState('')

  const create = useCreateUser()
  const save = useSaveUser()
  const lock = useLockUser()
  const holdings = useHoldingsCheck()
  const invite = useInviteUser()
  const resetPassword = useResetUserPassword()

  /* Lock, unlock, reset and invite are the director's alone; the server refuses
     the rest, so they are not drawn at all. Scope may never be widened by
     someone who has only their own: the box stays, ticked and dead. */
  const me = useSession((s) => s.actor)
  const admin = me ? isAdmin(me.roleIds) : false
  const scopeFrozen = me?.ownOnly === true && (user?.ownOnly ?? true)

  /* Opening is a fresh start, every time. Keeping the last person's half-typed
     fields would mean the next account quietly inherits their role and
     branches — the same failure the MAS panel resets for, with worse
     consequences: a leftover `director` is a second person who can open
     accounts. */
  useEffect(() => {
    if (!open) return
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
    setRoleLabel(user?.role ?? '')
    setRoleIds(user?.roleIds ?? [DEFAULT_ROLE])
    setBranches(user ? withCore(user.branches) : [CORE_BRANCH])
    setOwnOnly(user?.ownOnly ?? scopeFrozen)
    setLockedAt(user?.disabledAt ?? null)
    setErrors({})
    setFailure('')
    setLink('')
  }, [open, user, scopeFrozen])

  const isMe = user !== null && user.id === meId
  const busy = create.isPending || save.isPending

  /* The mailbox is typed once, when the account is opened, and never again.
     `UserPatch` has no `email` field on purpose — changing a mailbox changes who
     receives the reset link, which is an account takeover wearing a form field.
     The box stays on screen, disabled, with the reason under it: hiding it
     instead would leave a manager hunting for a field that is deliberately
     absent. */
  const mailboxFrozen = user !== null

  /* Typing into a box the server just complained about clears that complaint.
     A red outline that survives the fix reads as "still wrong", and after the
     second one the user stops believing any of them. */
  const clearError = (field: string) =>
    setErrors((current) => {
      if (!current[field]) return current
      const { [field]: _fixed, ...rest } = current
      return rest
    })

  /* One refusal, two places to put it. Per-field complaints go on the boxes;
     the footer sentence is only for a refusal that belongs to no single box
     (`errors` empty is a complaint about the whole write, not the absence of
     one). Showing both would say the same thing twice and push the buttons off
     a short screen. */
  const onRefusal = (error: ApiError) => {
    const fields = error.errors ?? {}
    setErrors(fields)
    setFailure(Object.keys(fields).length > 0 ? '' : userMessage(error))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    /* Two human clicks are two real requests — `mayReplay` only refuses the
       AUTOMATIC replay of a write. Without this the second click is a second
       account. */
    if (busy) return
    setFailure('')

    if (!user) {
      create.mutate(
        {
          name: name.trim(),
          email: email.trim(),
          role: roleLabel.trim(),
          roleIds: [...roleIds],
          branches: [...branches],
          ownOnly,
        },
        { onSuccess: onClose, onError: onRefusal },
      )
      return
    }

    const patch = diffUser(user, { name, role: roleLabel, roleIds, branches, ownOnly })
    if (!patch) {
      setFailure(t(NOTHING_TO_SAVE))
      return
    }

    save.mutate({ id: user.id, patch }, { onSuccess: onClose, onError: onRefusal })
  }

  const lockNow = (id: string) =>
    lock.mutate(
      { id, disabled: lockedAt === null },
      {
        onSuccess: (row) => {
          setLockedAt(row.disabledAt)
          toastDone(
            row.disabledAt === null
              ? t(message('Đã mở khoá tài khoản', 'Account unlocked', '계정 잠금을 해제했습니다'))
              : t(message('Đã khoá tài khoản', 'Account locked', '계정을 잠갔습니다')),
            row.disabledAt === null
              ? t(
                  message(
                    `${row.name} đăng nhập lại được ngay.`,
                    `${row.name} can sign in again right away.`,
                    `${row.name}님은 바로 다시 로그인할 수 있습니다.`,
                  ),
                )
              : t(
                  message(
                    `${row.name} không đăng nhập được nữa.`,
                    `${row.name} can no longer sign in.`,
                    `${row.name}님은 더 이상 로그인할 수 없습니다.`,
                  ),
                ),
          )
        },
        onError: (error) => setFailure(userMessage(error)),
      },
    )

  /* A lock asks first what work this person still holds (ADR 0097 §7). */
  const toggleLock = () => {
    if (!user || isMe || lock.isPending || holdings.checking) return
    setFailure('')
    if (lockedAt !== null) return lockNow(user.id)
    holdings.check(user.id, { onFree: () => lockNow(user.id), onFail: setFailure })
  }

  /* No confirmation dialog in front of it, unlike what a destructive-looking
     button usually earns. The sudo box `@NeedsReauth()` puts up already asks a
     question the user has to stop and answer, and two modals for one click is
     how people learn to click through both. */
  const resetToDefault = () => {
    if (!user || isMe || resetPassword.isPending) return
    setFailure('')
    setLink('')
    resetPassword.mutate(user.id, {
      onSuccess: (row) => {
        toastDone(
          t(
            message(
              'Đã đặt lại mật khẩu mặc định',
              'Password reset to the default',
              '기본 비밀번호로 초기화했습니다',
            ),
          ),
          t(
            message(
              `${row.name} bị đăng xuất và phải đổi mật khẩu khi đăng nhập lại.`,
              `${row.name} was signed out and must change the password on the next sign-in.`,
              `${row.name}님은 로그아웃되며 다음 로그인 시 비밀번호를 변경해야 합니다.`,
            ),
          ),
        )
      },
      onError: (error) => setFailure(userMessage(error)),
    })
  }

  const sendInvite = () => {
    if (!user || invite.isPending) return
    setFailure('')
    setLink('')
    invite.mutate(user.id, {
      onSuccess: (view) => {
        /* Three answers, not two. A link means the mail door is shut and the
           manager is the delivery mechanism. No link but `sent` means the
           letter is in the queue. Neither means the server could do neither,
           and saying "đã gửi" there would leave the person waiting for a letter
           that was never written. */
        if (view.link) {
          setLink(view.link)
          return
        }
        if (view.sent) {
          toastDone(
            t(
              message(
                'Đang gửi thư đặt mật khẩu',
                'Sending the set-password email',
                '비밀번호 설정 메일을 보내는 중',
              ),
            ),
            t(
              message(
                `Thư tới ${user.email} sau vài chục giây.`,
                `The email reaches ${user.email} within a few dozen seconds.`,
                `메일은 수십 초 후 ${user.email}에 도착합니다.`,
              ),
            ),
          )
          return
        }
        setFailure(
          t(
            message(
              'Không gửi được thư. Thử lại sau.',
              'Could not send the email. Try again later.',
              '메일을 보내지 못했습니다. 나중에 다시 시도해 주세요.',
            ),
          ),
        )
      },
      onError: (error) => setFailure(userMessage(error)),
    })
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toastDone(
        t(
          message(
            'Đã chép đường dẫn đặt mật khẩu',
            'Set-password link copied',
            '비밀번호 설정 링크를 복사했습니다',
          ),
        ),
      )
    } catch {
      /* `navigator.clipboard` is absent on plain http and blocked outright by
         some policies, so this is a normal path, not an exceptional one. The
         link is still on screen and still selectable — say so instead of
         swallowing the failure. */
      setFailure(
        t(
          message(
            'Trình duyệt không cho chép tự động. Bôi đen ô đường dẫn rồi Ctrl+C.',
            'The browser blocked automatic copying. Select the link box and press Ctrl+C.',
            '브라우저에서 자동 복사를 허용하지 않습니다. 링크 칸을 선택하고 Ctrl+C를 누르세요.',
          ),
        ),
      )
    }
  }

  /* Never empties: an account with no role holds no permission and cannot see
     a single screen. The last ticked box is drawn disabled, and this guard
     covers the keyboard path that disabled does not. */
  const toggleRole = (role: RoleId, on: boolean) => {
    clearError('roleIds')
    setRoleIds((current) => {
      const next = ROLE_IDS.filter((id) => (id === role ? on : current.includes(id)))
      return next.length > 0 ? next : current
    })
  }

  const toggleBranch = (branch: Branch, on: boolean) => {
    clearError('branches')
    setBranches((current) =>
      on ? [...current, branch] : current.filter((b) => b !== branch || b === CORE_BRANCH),
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      /* 560px. The sketch asked for 420 and T-04 offers md (560) or lg (760);
         inventing a third width would put a number in this file that the theme
         kit has never rendered. md is the near side of that choice and holds a
         six-field form without the two-column cramping `lead-form.ts` records. */
      width="md"
      title={
        user
          ? t(message(`Sửa ${user.name}`, `Edit ${user.name}`, `${user.name} 수정`))
          : t(message('Thêm người', 'Add person', '사용자 추가'))
      }
      subtitle={
        user
          ? t(
              message(
                'Sửa vai, nhánh và phạm vi. Hòm thư không sửa được.',
                'Edit roles, branches and scope. The mailbox cannot be changed.',
                '역할, 영역, 범위를 수정할 수 있습니다. 메일 주소는 변경할 수 없습니다.',
              ),
            )
          : admin
            ? t(
                message(
                  'Sau khi lưu, gửi thư đặt mật khẩu để người này vào được.',
                  'After saving, send the set-password email so this person can sign in.',
                  '저장한 뒤 비밀번호 설정 메일을 보내야 로그인할 수 있습니다.',
                ),
              )
            : undefined
      }
      /* The badge reads `lockedAt`, not `user.disabledAt`: the lock button can
         flip it while the panel stays open, and a header still saying "Đang
         dùng" over an account just locked is the panel contradicting itself. */
      meta={user ? <UserStatusCell user={{ ...user, disabledAt: lockedAt }} /> : undefined}
      footer={
        <div className="flex flex-col gap-3">
          {failure && (
            <span role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
              {failure}
            </span>
          )}

          {/* The link block sits in the FOOTER, not in the scrolling body. It
              appears in answer to a button that is down here, and a body that
              is scrolled to the branch checkboxes would put the answer
              somewhere the person who asked for it cannot see. */}
          {link !== '' && <InviteLink link={link} onCopy={() => void copyLink()} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {user && admin && (
                <>
                  <Button
                    size="md"
                    variant="ghost"
                    type="button"
                    onClick={sendInvite}
                    disabled={invite.isPending}
                  >
                    <Icon icon={Mail} size={16} />
                    {invite.isPending
                      ? t(message('Đang gửi…', 'Sending…', '보내는 중…'))
                      : t(
                          message(
                            'Gửi thư đặt mật khẩu',
                            'Send set-password email',
                            '비밀번호 설정 메일 보내기',
                          ),
                        )}
                  </Button>
                  <ResetPasswordButton
                    isMe={isMe}
                    pending={resetPassword.isPending}
                    onClick={resetToDefault}
                  />
                  <LockButton
                    locked={lockedAt !== null}
                    isMe={isMe}
                    pending={lock.isPending || holdings.checking}
                    onClick={toggleLock}
                  />
                </>
              )}
              {user && !admin && !user.passwordSet && (
                <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {t(
                    message(
                      'Nhờ Giám đốc gửi thư đặt mật khẩu.',
                      'Ask a Director to send the set-password email.',
                      '이사에게 비밀번호 설정 메일 발송을 요청하세요.',
                    ),
                  )}
                </span>
              )}
              {!user && (
                <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {t(
                    admin
                      ? message(
                          'Lưu xong mới gửi được thư đặt mật khẩu.',
                          'The set-password email can be sent once you save.',
                          '저장한 뒤에 비밀번호 설정 메일을 보낼 수 있습니다.',
                        )
                      : message(
                          'Lưu xong, nhờ Giám đốc gửi thư đặt mật khẩu.',
                          'After saving, ask a Director to send the set-password email.',
                          '저장한 뒤 이사에게 비밀번호 설정 메일 발송을 요청하세요.',
                        ),
                  )}
                </span>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              <Button size="md" variant="ghost" type="button" onClick={onClose}>
                <Icon icon={X} size={16} />
                {t(message('Huỷ', 'Cancel', '취소'))}
              </Button>
              <Button size="md" type="submit" form={FORM_ID} disabled={busy}>
                <Icon icon={Save} size={16} />
                {busy
                  ? t(message('Đang ghi…', 'Saving…', '저장 중…'))
                  : t(message('Lưu', 'Save', '저장'))}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <Kicker>{t(message('Danh tính', 'Identity', '신원'))}</Kicker>

          <FormField
            label={t(message('Họ tên', 'Full name', '이름'))}
            errors={errors.name}
            hint={t(
              message(
                'Tên hiện ở cột Lead PIC, nhật ký và thư gửi đi.',
                'The name shows in the Lead owner column, the log and outgoing email.',
                '이름은 리드 담당자 열, 기록, 발송 메일에 표시됩니다.',
              ),
            )}
          >
            <Input
              value={name}
              invalid={Boolean(errors.name)}
              aria-label={t(message('Họ tên', 'Full name', '이름'))}
              placeholder="Trần Thu Hà" // i18n-ignore: sample person name
              onChange={(event) => {
                setName(event.target.value)
                clearError('name')
              }}
            />
          </FormField>

          <FormField
            label="Email"
            errors={errors.email}
            hint={
              mailboxFrozen
                ? admin
                  ? t(
                      message(
                        'Không sửa được. Muốn đổi hòm thư, hãy khoá tài khoản này rồi mời địa chỉ mới.',
                        'Cannot be changed. To change the mailbox, lock this account and invite the new address.',
                        '변경할 수 없습니다. 메일 주소를 바꾸려면 이 계정을 잠그고 새 주소로 초대하세요.',
                      ),
                    )
                  : t(
                      message(
                        'Không sửa được. Muốn đổi hòm thư, nhờ Giám đốc.',
                        'Cannot be changed. To change the mailbox, ask a Director.',
                        '변경할 수 없습니다. 메일 주소를 바꾸려면 이사에게 요청하세요.',
                      ),
                    )
                : t(
                    message(
                      'Hòm thư công ty. Thư đặt mật khẩu gửi tới đây.',
                      'Company mailbox. The set-password email goes here.',
                      '회사 메일 주소입니다. 비밀번호 설정 메일이 이곳으로 발송됩니다.',
                    ),
                  )
            }
          >
            <Input
              type="email"
              value={email}
              disabled={mailboxFrozen}
              invalid={Boolean(errors.email)}
              aria-label="Email"
              placeholder="ha.tran@pebblevina.com"
              /* A token colour, not a dimmed copy of the editable one: luật 13
                 wants ≥ 4.5:1 on every string, and `--muted-foreground` is the
                 approved way to say "read only" without dropping contrast. */
              className={cn(
                'font-mono',
                mailboxFrozen && 'text-muted-foreground cursor-not-allowed',
              )}
              onChange={(event) => {
                setEmail(event.target.value)
                clearError('email')
              }}
            />
          </FormField>
        </section>

        <section className="flex flex-col gap-4">
          <Kicker>{t(message('Vai', 'Roles', '역할'))}</Kicker>

          <FormField
            label={t(message('Nhãn vai', 'Role label', '역할 표시명'))}
            errors={errors.role}
            hint={t(
              message(
                'Chữ hiện trên màn, kèm ngành nếu có (“Sale · chip”).',
                'The text shown on screen, with the industry if any (“Sale · chip”).',
                '화면에 표시되는 이름이며, 업종이 있으면 함께 적습니다 (“Sale · chip”).',
              ),
            )}
          >
            <Input
              value={roleLabel}
              invalid={Boolean(errors.role)}
              aria-label={t(message('Nhãn vai', 'Role label', '역할 표시명'))}
              placeholder="Sale · chip"
              onChange={(event) => {
                setRoleLabel(event.target.value)
                clearError('role')
              }}
            />
          </FormField>

          <FormField
            control="select"
            label={t(ROLE_PERMISSION)}
            errors={errors.roleIds}
            hint={
              isMe
                ? t(
                    message(
                      'Không tự đổi vai của chính mình.',
                      'You cannot change your own role.',
                      '자신의 역할은 직접 변경할 수 없습니다.',
                    ),
                  )
                : t(
                    message(
                      'Chọn ít nhất một vai. Vai quyết định người này mở được màn nào. Giám đốc và Trưởng phòng Kinh doanh mở được cả màn Quản trị.',
                      'Choose at least one role. Roles decide which screens this person can open. Directors and Heads of Sales can also open the Admin screens.',
                      '역할을 하나 이상 선택하세요. 역할에 따라 열 수 있는 화면이 정해집니다. 이사와 영업 부서장은 관리 화면도 열 수 있습니다.',
                    ),
                  )
            }
          >
            {isMe ? (
              <Input
                value={roleIds.map((id) => kpiRoleText(id, lang)).join(' · ')}
                disabled
                aria-label={t(ROLE_PERMISSION)}
                className="text-muted-foreground cursor-not-allowed"
              />
            ) : (
              <div
                role="group"
                aria-label={t(ROLE_PERMISSION)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {ROLE_IDS.map((value) => {
                  const only = roleIds.length === 1 && roleIds.includes(value)
                  return (
                    <Checkbox
                      key={value}
                      checked={roleIds.includes(value)}
                      disabled={only}
                      label={kpiRoleText(value, lang)}
                      hint={
                        only
                          ? t(
                              message(
                                'Cần ít nhất một vai',
                                'At least one role is required',
                                '역할이 하나 이상 필요합니다',
                              ),
                            )
                          : undefined
                      }
                      onChange={(on) => toggleRole(value, on)}
                    />
                  )
                })}
              </div>
            )}
          </FormField>
        </section>

        <section className="flex flex-col gap-3">
          <Kicker>{t(message('Nhánh', 'Branches', '영역'))}</Kicker>
          <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">
            {t(
              message(
                'Chỉ mở được màn của nhánh đã chọn.',
                'Only the screens of the chosen branches can be opened.',
                '선택한 영역의 화면만 열 수 있습니다.',
              ),
            )}
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {BRANCH_OPTIONS.map((branch) => (
              <Checkbox
                key={branch}
                checked={branches.includes(branch)}
                disabled={branch === CORE_BRANCH}
                label={branch}
                hint={
                  branch === CORE_BRANCH ? t(message('Bắt buộc', 'Required', '필수')) : undefined
                }
                onChange={(on) => toggleBranch(branch, on)}
              />
            ))}
          </div>

          {errors.branches && (
            <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
              {errors.branches.join(' · ')}
            </span>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <Kicker>{t(message('Phạm vi', 'Scope', '범위'))}</Kicker>

          <Checkbox
            checked={ownOnly}
            label={scopeLabel(true, lang)}
            disabled={scopeFrozen}
            wrap
            hint={
              scopeFrozen
                ? t(
                    message(
                      `Cần phạm vi ${scopeLabel(false, 'vi')} mới bỏ được ô này.`,
                      `Needs the ${scopeLabel(false, 'en')} scope to untick this box.`,
                      `이 항목을 해제하려면 ${scopeLabel(false, 'ko')} 범위가 필요합니다.`,
                    ),
                  )
                : t(
                    message(
                      'Chỉ thấy lead và cơ hội do người này phụ trách.',
                      'Sees only the leads and opportunities this person owns.',
                      '이 사용자가 담당하는 리드와 기회만 볼 수 있습니다.',
                    ),
                  )
            }
            onChange={(on) => {
              setOwnOnly(on)
              clearError('ownOnly')
            }}
          />

          {errors.ownOnly && (
            <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
              {errors.ownOnly.join(' · ')}
            </span>
          )}
        </section>
      </form>
      {user && admin && (
        <HandoverDrawer
          user={user}
          holdings={holdings.holdings}
          onClose={holdings.close}
          onLocked={(row) => setLockedAt(row.disabledAt)}
        />
      )}
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// Panel bits
// ---------------------------------------------------------------------------

const ROLE_PERMISSION = message('Vai quyền', 'Permission roles', '권한 역할')

/** `One` is never removable, so a tick that would take it away is ignored
 *  rather than obeyed-then-overruled by the server. Everything else toggles. */
const withCore = (list: readonly Branch[]): readonly Branch[] =>
  list.includes(CORE_BRANCH) ? list : [CORE_BRANCH, ...list]

/** Label · control · then EITHER the hint OR what the server disliked about the
 *  box, never both.
 *
 *  Swapping rather than stacking is the trick `components/ops-fields.tsx`
 *  documents: the eye already goes to the line under a box it just filled in, so
 *  the complaint belongs exactly there, and stacking both grows the form by a row
 *  per error — enough, on a six-field panel, to push the save button under the
 *  fold mid-correction. */
function FormField({
  label,
  hint,
  errors,
  control = 'input',
  children,
}: {
  label: string
  hint?: string
  errors?: string[]
  /** `select` skips the wrapping `<label>`: A-15 and the role checkbox group
   *  bring their own labelling, and nesting a second `<label>` makes a screen reader announce two names for
   *  one control. */
  control?: 'input' | 'select'
  children: ReactNode
}) {
  const wrong = Boolean(errors?.length)

  const body = (
    <>
      <span
        className={cn(
          'text-[11px]',
          wrong ? 'text-destructive-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {children}
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {control === 'select' ? body : <label className="flex flex-col gap-2">{body}</label>}

      {wrong ? (
        <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
          {errors?.join(' · ')}
        </span>
      ) : (
        hint && <span className="text-muted-foreground text-[11px] leading-[1.5]">{hint}</span>
      )}
    </div>
  )
}
