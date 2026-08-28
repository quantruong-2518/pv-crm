import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Copy, Lock, Mail, RotateCcw, Save, X } from '@pv/ui'
import { Badge, Button, Checkbox, Drawer, Icon, Input, Kicker, MetaPill, Select, cn } from '@pv/ui'
import type { Branch, RoleId, UserRow } from '@pv/contracts'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dm, dmy } from '@/lib/date'
import {
  BRANCH_OPTIONS,
  CORE_BRANCH,
  DEFAULT_ROLE,
  NOTHING_TO_SAVE,
  ROLE_LABEL,
  ROLE_OPTIONS,
  diffUser,
  scopeLabel,
  useCreateUser,
  useInviteUser,
  useLockUser,
  useSaveUser,
} from '@/data/users'

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
// Row cells
// ---------------------------------------------------------------------------

/** The name column, with a marker on the row that is the person reading it.
 *
 *  The marker is not decoration: two of the panel's controls are dead on this
 *  row (role and lock), and a manager who finds a greyed-out button without
 *  having noticed whose row they opened reads it as a bug in the screen. Saying
 *  "bạn" in the table means the explanation arrives before the surprise. */
export function UserNameCell({ name, isMe }: { name: string; isMe: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      {isMe && <MetaPill className="shrink-0">bạn</MetaPill>}
    </span>
  )
}

/** The role column — BOTH names, stacked, and that is the whole point.
 *
 *  `role` is a free-text display label somebody typed ("Sale · chip"); `roleId`
 *  is the key the permission matrix is read by. They are allowed to differ, and
 *  when they do it matters: an account labelled "Sale · chip" whose `roleId` is
 *  `head-of-sales` can approve the whole department, and a table printing only
 *  the label would show nothing at all wrong. Printing only the key would be
 *  the opposite mistake — it would drop the industry the department actually
 *  organises itself by.
 *
 *  `SessionActor.role` already warns never to bind a permission to the label.
 *  This cell is where that warning becomes visible to a person. */
export function UserRoleCell({ label, roleId }: { label: string; roleId: RoleId }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate" title={label}>
        {label}
      </span>
      <span className="text-muted-foreground truncate text-[11px]">{ROLE_LABEL[roleId]}</span>
    </span>
  )
}

/** The status column — three states, and every row gets one.
 *
 *  Two of them are the states the sketch calls for, and they are the two that
 *  need somebody to do something: an account nobody can sign into yet, and an
 *  account nobody may sign into any more. The third ("Đang dùng") exists so the
 *  column is never a run of empty cells with a chip floating in it — the same
 *  reason `StatusCell` on the lead book always draws a badge. An empty cell
 *  reads as missing data; a green one reads as "nothing to do here".
 *
 *  Locked wins over password-not-set when both are true: locked is the harder
 *  stop, and inviting somebody whose account is shut is work that achieves
 *  nothing.
 *
 *  `disabledAt` is a timestamp rather than a flag precisely so this chip can
 *  answer "since when", which is the question actually asked about a locked
 *  account. The full date is in `title`; the chip has room for day and month. */
export function UserStatusCell({ user }: { user: UserRow }) {
  if (user.disabledAt !== null) {
    return (
      <Badge
        tone="danger"
        /* Luật 6 — một ngày nằm trong cột bảng là "số bảng": chữ số phải đều
           bề rộng, nếu không cột lệch khi cuộn qua nhiều dòng đang khoá. */
        className="tnum"
        title={`Khoá từ ${dmy(user.disabledAt)}. Mọi phiên đang mở của tài khoản này đã bị cắt.`}
      >
        Đang khoá · {dm(user.disabledAt)}
      </Badge>
    )
  }

  if (!user.passwordSet) {
    return (
      <Badge
        tone="warning"
        title="Tài khoản đã mở nhưng chủ nhân chưa đặt mật khẩu — gửi thư đặt mật khẩu trong panel."
      >
        Chờ đặt mật khẩu
      </Badge>
    )
  }

  return (
    <Badge tone="success" title={`Mở tài khoản ${dmy(user.createdAt)}`}>
      Đang dùng
    </Badge>
  )
}

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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [roleId, setRoleId] = useState<RoleId>(DEFAULT_ROLE)
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
  const invite = useInviteUser()

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
    setRoleId(user?.roleId ?? DEFAULT_ROLE)
    setBranches(user ? withCore(user.branches) : [CORE_BRANCH])
    setOwnOnly(user?.ownOnly ?? false)
    setLockedAt(user?.disabledAt ?? null)
    setErrors({})
    setFailure('')
    setLink('')
  }, [open, user])

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
          roleId,
          branches: [...branches],
          ownOnly,
        },
        { onSuccess: onClose, onError: onRefusal },
      )
      return
    }

    const patch = diffUser(user, { name, role: roleLabel, roleId, branches, ownOnly })
    if (!patch) {
      setFailure(NOTHING_TO_SAVE)
      return
    }

    save.mutate({ id: user.id, patch }, { onSuccess: onClose, onError: onRefusal })
  }

  const toggleLock = () => {
    if (!user || isMe || lock.isPending) return
    setFailure('')
    lock.mutate(
      { id: user.id, disabled: lockedAt === null },
      {
        onSuccess: (row) => {
          setLockedAt(row.disabledAt)
          toastDone(
            row.disabledAt === null ? 'Đã mở khoá tài khoản' : 'Đã khoá tài khoản',
            row.disabledAt === null
              ? `${row.name} đăng nhập lại được ngay.`
              : `${row.name} không đăng nhập được nữa, mọi phiên đang mở đã bị cắt.`,
          )
        },
        onError: (error) => setFailure(userMessage(error)),
      },
    )
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
          toastDone('Đã xếp hàng thư đặt mật khẩu', `Thư đi tới ${user.email} sau vài chục giây.`)
          return
        }
        setFailure('Máy chủ không gửi được thư và cũng không trả về đường dẫn. Thử lại sau.')
      },
      onError: (error) => setFailure(userMessage(error)),
    })
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toastDone('Đã chép đường dẫn đặt mật khẩu')
    } catch {
      /* `navigator.clipboard` is absent on plain http and blocked outright by
         some policies, so this is a normal path, not an exceptional one. The
         link is still on screen and still selectable — say so instead of
         swallowing the failure. */
      setFailure('Trình duyệt không cho chép tự động. Bôi đen ô đường dẫn rồi Ctrl+C.')
    }
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
      title={user ? `Sửa ${user.name}` : 'Thêm người'}
      subtitle={
        user
          ? 'Sửa vai, nhánh và phạm vi. Hòm thư thì không — đổi hòm thư là đổi người nhận link đặt lại mật khẩu.'
          : 'Tài khoản mở ra chưa có mật khẩu. Thư đặt mật khẩu là đường vào duy nhất, và gửi được ngay sau khi lưu.'
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
              {user ? (
                <>
                  <Button
                    size="md"
                    variant="ghost"
                    type="button"
                    onClick={sendInvite}
                    disabled={invite.isPending}
                  >
                    <Icon icon={Mail} size={16} />
                    {invite.isPending ? 'Đang gửi…' : 'Gửi thư đặt mật khẩu'}
                  </Button>
                  <LockButton
                    locked={lockedAt !== null}
                    isMe={isMe}
                    pending={lock.isPending}
                    onClick={toggleLock}
                  />
                </>
              ) : (
                <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Lưu xong mới gửi được thư đặt mật khẩu.
                </span>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              <Button size="md" variant="ghost" type="button" onClick={onClose}>
                <Icon icon={X} size={16} />
                Huỷ
              </Button>
              <Button size="md" type="submit" form={FORM_ID} disabled={busy}>
                <Icon icon={Save} size={16} />
                {busy ? 'Đang ghi…' : 'Lưu'}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <Kicker>Danh tính</Kicker>

          <FormField
            label="Họ tên"
            errors={errors.name}
            hint="Tên này hiện ở cột Lead PIC, ở dòng ghi vết và trong thư gửi đi."
          >
            <Input
              value={name}
              invalid={Boolean(errors.name)}
              aria-label="Họ tên"
              placeholder="Trần Thu Hà"
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
                ? 'Không sửa được. Hòm thư là nơi nhận link đặt lại mật khẩu, nên đổi nó là đổi ai vào được tài khoản này — khoá tài khoản cũ rồi mời địa chỉ mới là đường có để lại vết.'
                : 'Hòm thư công ty. Thư đặt mật khẩu đi tới đây, và mọi hệ khác khoá theo địa chỉ này chứ không theo tên.'
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
          <Kicker>Vai</Kicker>

          <FormField
            label="Nhãn vai"
            errors={errors.role}
            hint="Chữ hiện trên màn — kèm ngành nếu có (“Sale · chip”). Không quyết định quyền."
          >
            <Input
              value={roleLabel}
              invalid={Boolean(errors.role)}
              aria-label="Nhãn vai"
              placeholder="Sale · chip"
              onChange={(event) => {
                setRoleLabel(event.target.value)
                clearError('role')
              }}
            />
          </FormField>

          <FormField
            control="select"
            label="Vai quyền"
            errors={errors.roleId}
            hint={
              isMe
                ? 'Không tự đổi vai của chính mình. Một người tự hạ vai xong là một người vừa khoá mình ra khỏi màn này, và không còn ai trong phòng mở lại được — máy chủ cũng từ chối lệnh này.'
                : 'Quyết định người này mở được màn nào. Giám đốc và Trưởng phòng Kinh doanh mở được cả màn Quản trị này.'
            }
          >
            {isMe ? (
              <Input
                value={ROLE_LABEL[roleId]}
                disabled
                aria-label="Vai quyền"
                className="text-muted-foreground cursor-not-allowed"
              />
            ) : (
              <Select
                label="Vai quyền"
                hideLabel
                value={roleId}
                options={ROLE_OPTIONS}
                /* `neutralValue` set to the current value keeps the control off
                   its azure "đang lọc" look. This is a form field, not a filter
                   — luật 3 counts azure per screen, and one highlighted select
                   per row of the form would spend the budget on nothing. */
                neutralValue={roleId}
                onChange={(value) => {
                  setRoleId(value as RoleId)
                  clearError('roleId')
                }}
                className="w-full"
              />
            )}
          </FormField>
        </section>

        <section className="flex flex-col gap-3">
          <Kicker>Nhánh</Kicker>
          <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">
            Nhánh là license của công ty, không phải quyền của vai: không có nhánh thì màn của nhánh
            đó đóng, dù vai có quyền gì đi nữa.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {BRANCH_OPTIONS.map((branch) => (
              <Checkbox
                key={branch}
                checked={branches.includes(branch)}
                disabled={branch === CORE_BRANCH}
                label={branch}
                hint={
                  branch === CORE_BRANCH
                    ? 'Bắt buộc — không có One thì không có trang chủ'
                    : undefined
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
          <Kicker>Phạm vi</Kicker>

          <Checkbox
            checked={ownOnly}
            label={SCOPE_OWN_LABEL}
            hint="Chỉ thấy lead và cơ hội đứng tên mình. Máy chủ cắt ngay trong SQL, không phải bộ lọc của màn."
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
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// Panel bits
// ---------------------------------------------------------------------------

/** The checkbox says what the table column says, so a manager who ticked it
 *  recognises the value they then read in the row. */
const SCOPE_OWN_LABEL = scopeLabel(true)

/** `One` is never removable, so a tick that would take it away is ignored
 *  rather than obeyed-then-overruled by the server. Everything else toggles. */
const withCore = (list: readonly Branch[]): readonly Branch[] =>
  list.includes(CORE_BRANCH) ? list : [CORE_BRANCH, ...list]

/** Lock / unlock, with the one row it refuses to act on.
 *
 *  The button is wrapped in a `<span>` carrying the `title`, and that wrapper is
 *  load-bearing: `Button` sets `disabled:pointer-events-none`, so a `title` on
 *  the button itself never fires a tooltip — the browser gets no hover event to
 *  fire it from. Explaining why a control is dead, on the control that is dead,
 *  is the entire job here; without the wrapper the explanation is written and
 *  never read. */
function LockButton({
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
  const why = isMe
    ? 'Không tự khoá tài khoản của chính mình — máy chủ cũng từ chối. Nhờ Giám đốc hoặc một Trưởng phòng khác.'
    : locked
      ? 'Mở lại quyền đăng nhập cho tài khoản này.'
      : 'Cắt quyền đăng nhập và kết thúc mọi phiên đang mở của tài khoản này.'

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
        {locked ? 'Mở khoá' : 'Khoá tài khoản'}
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
function InviteLink({ link, onCopy }: { link: string; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-warning text-[11.5px] leading-[1.6]">
        Cửa gửi thư của máy này đang đóng, nên không lá thư nào rời máy được. Chép đường dẫn dưới
        đây và đưa tận tay người nhận — nó đặt được mật khẩu, ai giữ nó là vào được tài khoản.
      </span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={link}
          aria-label="Đường dẫn đặt mật khẩu"
          className="font-mono sm:flex-1"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button size="md" variant="ghost" type="button" onClick={onCopy}>
          <Icon icon={Copy} size={16} />
          Chép
        </Button>
      </div>
    </div>
  )
}

/** Label · control · then EITHER the hint OR what the server disliked about the
 *  box, never both.
 *
 *  Swapping rather than stacking is the trick `lead-create-dialog` documents:
 *  the eye already goes to the line under a box it just filled in, so the
 *  complaint belongs exactly there, and stacking both grows the form by a row
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
  /** `select` skips the wrapping `<label>`: A-15 brings its own labelling, and
   *  nesting a second `<label>` makes a screen reader announce two names for
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
