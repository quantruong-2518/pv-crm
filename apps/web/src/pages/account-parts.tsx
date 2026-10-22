import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  Accordion,
  Avatar,
  Badge,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  KeyRound,
  MetaPill,
  Plug,
  SectionTitle,
  Skeleton,
  type BadgeProps,
  type IconGlyph,
} from '@pv/ui'
import {
  APPROVAL_STATE_LABEL,
  MY_APPROVALS_LIMIT,
  type ApprovalRequestView,
  type ApprovalState,
  type GoogleLinkStatus,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { isApiError, userMessage } from '@/app/api'
import { CHANGE_PASSWORD_PATH } from '@/app/auth'
import { toast } from '@/app/toast'
import { dmhm } from '@/lib/date'
import { grantedGroups } from '@/data/account'
import { useConnectGoogle } from '@/data/google'
import { PERMISSION_LABEL } from '@/data/roles'
import { ROLE_LABEL, scopeLabel } from '@/data/users'
import { RECONNECT_GOOGLE, unreadySender } from '@/components/mail-letter/letter-model'

/** The four blocks of "my account". Every word about a role, a permission, a
 *  scope or a Google fault is read from the table the admin screens and the
 *  letter composer already print, so one thing has one name across the app.
 *
 *  The identity summary is `.glass-a`; the sign-in rows, the permission list
 *  and the requests sit on `.glass-b` (law 8). Rows inside a card are divided
 *  by a hairline drawn with box-shadow, never a border (law 4). */

const failed = (error: unknown, fallback: string) =>
  isApiError(error) ? userMessage(error) : fallback

const BODY = 'm-0 text-[12.5px] leading-[1.65]'

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className={`text-destructive-foreground ${BODY}`}>
        {message}
      </p>
      <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  )
}

/** Top edge of a row that follows another one, in the nested-surface tint. */
const HAIRLINE = 'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-ink)_8%,transparent)]'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-[11.5px] leading-[1.5]">{label}</dt>
      <dd className="text-foreground m-0 break-words text-[13px] leading-[1.5]">{children}</dd>
    </div>
  )
}

export function IdentityBlock({ actor }: { actor: Actor }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5" aria-label="Tôi là ai">
      <div className="flex items-center gap-4">
        {/* Same glass face as the header, only larger: one person, one picture. */}
        <Avatar name={actor.name} card={false} className="size-16" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-foreground m-0 break-words text-[20px] font-semibold leading-[1.3]">
            {actor.name}
          </p>
          <p className="text-muted-foreground m-0 break-all text-[13px] leading-[1.5]">
            {actor.email}
          </p>
        </div>
      </div>
      <dl className={`m-0 grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3 ${HAIRLINE}`}>
        <Fact label="Vai trò">{actor.roleIds.map((id) => ROLE_LABEL[id]).join(' · ')}</Fact>
        <Fact label="Nhánh sản phẩm">{actor.branches.join(' · ') || 'PV One'}</Fact>
        <Fact label="Phạm vi dữ liệu">{scopeLabel(actor.ownOnly ?? false)}</Fact>
      </dl>
    </GlassCard>
  )
}

type RowTone = 'accent' | 'warning'

const TILE_TONE: Record<RowTone, string> = {
  accent: 'bg-primary/24 text-accent-foreground',
  warning: 'bg-warning/20 text-on-tint-warning',
}

function SignInRow({
  icon,
  tone = 'accent',
  title,
  badge,
  separated,
  action,
  children,
}: {
  icon: IconGlyph
  tone?: RowTone
  title: string
  badge?: ReactNode
  separated?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${separated ? `pt-4 ${HAIRLINE}` : ''}`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-md ${TILE_TONE[tone]}`}
      >
        <Icon icon={icon} size={20} />
      </span>
      <div className="flex min-w-0 flex-1 basis-[16rem] flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-foreground m-0 text-[14px] font-semibold leading-[1.5]">{title}</h3>
          {badge}
        </div>
        {children}
      </div>
      {action}
    </div>
  )
}

const LINE = 'text-muted-foreground m-0 text-[13px] leading-[1.6]'

type LinkFace = { tone: BadgeProps['tone']; state: string; line: string; action: string }

/** One face per state of the link. The fault sentences and the button words
 *  are the composer's (`unreadySender`), asked only for a link that is not
 *  ready: its last branch describes a fault. */
function linkFace(link: GoogleLinkStatus): LinkFace {
  if (link.connected && link.mail === 'ready') {
    /* The badge already says "connected"; the line only names the account. */
    return {
      tone: 'success',
      state: 'Đã kết nối',
      line: link.email ?? '',
      action: RECONNECT_GOOGLE,
    }
  }
  const { fault, action } = unreadySender(link)
  return link.connected
    ? { tone: 'warning', state: 'Cần kết nối lại', line: fault, action }
    : { tone: 'draft', state: 'Chưa kết nối', line: fault, action }
}

/** Password and Google as two rows of one card. The password row is a link to
 *  the one change-password form, not a second form: that screen is also where
 *  a forced change is held, and two forms would drift. */
export function SignInBlock({ link }: { link: UseQueryResult<GoogleLinkStatus> }) {
  const navigate = useNavigate()
  const connect = useConnectGoogle()
  const face = link.data?.configured ? linkFace(link.data) : null

  return (
    <GlassCard id="google" variant="b" className="flex scroll-mt-44 flex-col gap-4 p-5">
      <SectionTitle size="detail">Đăng nhập và kết nối</SectionTitle>

      <SignInRow
        icon={KeyRound}
        title="Mật khẩu"
        action={
          <Button
            variant="secondary"
            className="pointer-coarse:h-12"
            onClick={() => navigate(CHANGE_PASSWORD_PATH)}
          >
            Đổi mật khẩu
          </Button>
        }
      >
        <p className={LINE}>
          Sau khi đổi, các máy khác đang đăng nhập bằng tài khoản của bạn sẽ bị đăng xuất.
        </p>
      </SignInRow>

      <SignInRow
        separated
        icon={Plug}
        tone={face?.tone === 'warning' ? 'warning' : 'accent'}
        title="Kết nối Google"
        badge={face ? <Badge tone={face.tone}>{face.state}</Badge> : undefined}
        action={
          face ? (
            <Button
              variant={face.tone === 'success' ? 'ghost' : 'default'}
              className="pointer-coarse:h-12"
              disabled={connect.isPending}
              onClick={() =>
                connect.mutate(undefined, {
                  onError: (error) =>
                    toast(failed(error, 'Không mở được trang kết nối Google.'), { tone: 'danger' }),
                })
              }
            >
              {face.action}
            </Button>
          ) : undefined
        }
      >
        {link.isPending ? (
          <Skeleton width="58%" />
        ) : !link.data ? (
          <Retry
            message={failed(link.error, 'Không đọc được trạng thái kết nối Google.')}
            onRetry={() => void link.refetch()}
          />
        ) : !face ? (
          <p className={LINE}>
            Công ty chưa bật kết nối Google trên PV One. Hãy nhờ người quản trị.
          </p>
        ) : (
          <>
            <p className={face.tone === 'success' ? 'text-foreground m-0 text-[13px]' : LINE}>
              {face.line}
            </p>
            <p className={LINE}>
              Dùng để đưa buổi họp lên Google Calendar và gửi thư từ hộp thư của chính bạn.
            </p>
          </>
        )}
      </SignInRow>
    </GlassCard>
  )
}

/** What the role may do, folded by group so a long role stays one screen.
 *  The count in the pill is computed from the same groups the rows list. */
export function PermissionBlock({ actor }: { actor: Actor }) {
  const groups = grantedGroups(actor.permissions)
  const total = groups.reduce((sum, group) => sum + group.permissions.length, 0)

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5">
      <SectionTitle
        size="detail"
        hint="Theo vai trò của bạn. Cần làm thêm việc khác, hãy nhờ người quản trị."
        actions={
          groups.length > 0 ? (
            <MetaPill>
              {total} việc · {groups.length} nhóm
            </MetaPill>
          ) : undefined
        }
      >
        Việc bạn được làm
      </SectionTitle>
      {groups.length === 0 ? (
        <p className={`text-foreground ${BODY}`}>Vai trò của bạn chưa được giao việc nào.</p>
      ) : (
        <div className="grid items-start gap-x-6 gap-y-1 md:grid-cols-2">
          {groups.map((group) => (
            <Accordion
              key={group.resource}
              className="min-w-0"
              title={group.label}
              summary={`${group.permissions.length} việc`}
            >
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {group.permissions.map((permission) => (
                  <li key={permission} className="text-foreground text-[13px] leading-[1.5]">
                    {PERMISSION_LABEL[permission]}
                  </li>
                ))}
              </ul>
            </Accordion>
          ))}
        </div>
      )}
    </GlassCard>
  )
}

const STATE_TONE: Record<ApprovalState, BadgeProps['tone']> = {
  waiting: 'warning',
  approved: 'success',
  rejected: 'danger',
}

/** Who decided, and when. The name is optional on the wire, so the sentence
 *  still stands without it. */
function decidedLine(request: ApprovalRequestView): string | null {
  if (!request.decidedAt) return null
  const verb = request.state === 'rejected' ? 'từ chối' : 'duyệt'
  const who = request.decidedBy ? `${request.decidedBy} ${verb}` : `Đã ${verb}`
  return `${who} lúc ${dmhm(request.decidedAt)}`
}

function RequestRow({ request, separated }: { request: ApprovalRequestView; separated: boolean }) {
  const decided = decidedLine(request)

  return (
    <li className={`flex flex-col gap-1 ${separated ? `pt-4 ${HAIRLINE}` : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-foreground m-0 min-w-0 text-[13px] font-semibold leading-[1.5]">
          {request.consequence}
        </p>
        <Badge tone={STATE_TONE[request.state]}>{APPROVAL_STATE_LABEL[request.state]}</Badge>
      </div>
      <p className="text-muted-foreground tnum m-0 text-[12px] leading-[1.5]">
        Gửi lúc {dmhm(request.raisedAt)}
        {decided ? ` · ${decided}` : ''}
      </p>
      {request.decidedReason ? (
        <p className={`text-foreground ${BODY}`}>Lý do từ chối: {request.decidedReason}</p>
      ) : null}
    </li>
  )
}

/** One card with the rows inside it: a request is a line, not a surface. */
export function RequestsBlock({ requests }: { requests: UseQueryResult<ApprovalRequestView[]> }) {
  const rows = requests.data

  return (
    <GlassCard id="requests" variant="b" className="flex scroll-mt-44 flex-col gap-4 p-5">
      <SectionTitle size="detail" hint="Mới nhất ở trên cùng.">
        Yêu cầu tôi đã gửi
      </SectionTitle>

      {requests.isPending ? (
        <Skeleton className="h-20" />
      ) : !rows ? (
        <Retry
          message={failed(requests.error, 'Không tải được các yêu cầu bạn đã gửi.')}
          onRetry={() => void requests.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Bạn chưa gửi yêu cầu nào."
          action={{ label: 'Tải lại', onClick: () => void requests.refetch() }}
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {rows.map((request, i) => (
              <RequestRow key={request.id} request={request} separated={i > 0} />
            ))}
          </ul>
          {/* The server cuts the list there and sends no total. */}
          {rows.length === MY_APPROVALS_LIMIT ? (
            <p className={`text-muted-foreground ${BODY}`}>
              Chỉ hiện {MY_APPROVALS_LIMIT} yêu cầu mới nhất.
            </p>
          ) : null}
        </>
      )}
    </GlassCard>
  )
}
