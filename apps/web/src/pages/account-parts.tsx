import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  Badge,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  KeyRound,
  Plug,
  SectionTitle,
  Skeleton,
  type BadgeProps,
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
 *  Cards are `.glass-a`; the two long lists — what the role may do, and the
 *  requests — sit on `.glass-b` (law 8). */

const failed = (error: unknown, fallback: string) =>
  isApiError(error) ? userMessage(error) : fallback

const BODY = 'm-0 text-[12.5px] leading-[1.65]'

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className={`text-foreground ${BODY}`}>
        {message}
      </p>
      <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-[11.5px] leading-[1.5]">{label}</dt>
      <dd className="text-foreground m-0 break-words text-[12.5px] leading-[1.5]">{children}</dd>
    </div>
  )
}

export function IdentityBlock({ actor }: { actor: Actor }) {
  const groups = grantedGroups(actor.permissions)

  return (
    <section className="flex flex-col gap-4" aria-label="Tôi là ai">
      <GlassCard className="flex flex-col gap-4 p-5">
        <SectionTitle size="detail">Tôi là ai</SectionTitle>
        <dl className="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Họ tên">{actor.name}</Fact>
          <Fact label="Email">{actor.email}</Fact>
          <Fact label="Vai trò">{actor.roleIds.map((id) => ROLE_LABEL[id]).join(' · ')}</Fact>
          <Fact label="Nhánh sản phẩm">{actor.branches.join(' · ') || 'PV One'}</Fact>
          <Fact label="Phạm vi dữ liệu">{scopeLabel(actor.ownOnly ?? false)}</Fact>
        </dl>
      </GlassCard>

      <GlassCard variant="b" className="flex flex-col gap-4 p-5">
        <SectionTitle hint="Theo vai trò của bạn. Cần làm thêm việc khác, hãy nhờ người quản trị.">
          Việc bạn được làm
        </SectionTitle>
        {groups.length === 0 ? (
          <p className={`text-foreground ${BODY}`}>Vai trò của bạn chưa được giao việc nào.</p>
        ) : (
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div key={group.resource} className="flex min-w-0 flex-col gap-2">
                <h3 className="text-muted-foreground m-0 text-[11.5px] font-semibold leading-[1.5]">
                  {group.label}
                </h3>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {group.permissions.map((permission) => (
                    <li key={permission} className="text-foreground text-[12.5px] leading-[1.5]">
                      {PERMISSION_LABEL[permission]}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </section>
  )
}

/** A link to the one change-password form, not a second form: that screen is
 *  also where a forced change is held, and two forms would drift. */
export function PasswordBlock() {
  const navigate = useNavigate()

  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <SectionTitle
        size="detail"
        hint="Sau khi đổi, các máy khác đang đăng nhập bằng tài khoản của bạn sẽ bị đăng xuất."
      >
        Mật khẩu
      </SectionTitle>
      <Button
        variant="secondary"
        className="pointer-coarse:h-12 self-start"
        onClick={() => navigate(CHANGE_PASSWORD_PATH)}
      >
        <Icon icon={KeyRound} size={16} />
        Đổi mật khẩu
      </Button>
    </GlassCard>
  )
}

type LinkFace = { tone: BadgeProps['tone']; state: string; line: string; action: string }

/** One face per state of the link. The fault sentences and the button words
 *  are the composer's (`unreadySender`), asked only for a link that is not
 *  ready: its last branch describes a fault. */
function linkFace(link: GoogleLinkStatus): LinkFace {
  if (link.connected && link.mail === 'ready') {
    return {
      tone: 'success',
      state: 'Đã kết nối',
      line: `Tài khoản Google đã kết nối: ${link.email ?? ''}`,
      action: RECONNECT_GOOGLE,
    }
  }
  const { fault, action } = unreadySender(link)
  return link.connected
    ? { tone: 'warning', state: 'Cần kết nối lại', line: fault, action }
    : { tone: 'draft', state: 'Chưa kết nối', line: fault, action }
}

export function GoogleBlock({ link }: { link: UseQueryResult<GoogleLinkStatus> }) {
  const connect = useConnectGoogle()
  const face = link.data?.configured ? linkFace(link.data) : null

  return (
    <GlassCard id="google" className="flex scroll-mt-44 flex-col gap-4 p-5">
      <SectionTitle
        size="detail"
        hint="Dùng để đưa buổi họp lên Google Calendar và gửi thư từ hộp thư của chính bạn."
        actions={face ? <Badge tone={face.tone}>{face.state}</Badge> : undefined}
      >
        Kết nối Google
      </SectionTitle>

      {link.isPending ? (
        <Skeleton width="58%" />
      ) : !link.data ? (
        <Retry
          message={failed(link.error, 'Không đọc được trạng thái kết nối Google.')}
          onRetry={() => void link.refetch()}
        />
      ) : !face ? (
        <p className={`text-foreground ${BODY}`}>
          Công ty chưa bật kết nối Google trên PV One. Hãy nhờ người quản trị.
        </p>
      ) : (
        <>
          <p className={`text-foreground ${BODY}`}>{face.line}</p>
          <Button
            variant={face.tone === 'success' ? 'ghost' : 'default'}
            className="pointer-coarse:h-12 self-start"
            disabled={connect.isPending}
            onClick={() =>
              connect.mutate(undefined, {
                onError: (error) =>
                  toast(failed(error, 'Không mở được trang kết nối Google.'), { tone: 'danger' }),
              })
            }
          >
            <Icon icon={Plug} size={16} />
            {face.action}
          </Button>
        </>
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

function RequestCard({ request }: { request: ApprovalRequestView }) {
  const decided = decidedLine(request)

  return (
    <li>
      <GlassCard variant="b" className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-foreground m-0 min-w-0 text-[12.5px] font-semibold leading-[1.5]">
            {request.consequence}
          </p>
          <Badge tone={STATE_TONE[request.state]}>{APPROVAL_STATE_LABEL[request.state]}</Badge>
        </div>
        <p className="text-muted-foreground tnum m-0 text-[11.5px] leading-[1.5]">
          Gửi lúc {dmhm(request.raisedAt)}
          {decided ? ` · ${decided}` : ''}
        </p>
        {request.decidedReason ? (
          <p className={`text-foreground ${BODY}`}>Lý do từ chối: {request.decidedReason}</p>
        ) : null}
      </GlassCard>
    </li>
  )
}

export function RequestsBlock({ requests }: { requests: UseQueryResult<ApprovalRequestView[]> }) {
  const rows = requests.data

  return (
    <section id="requests" className="flex scroll-mt-44 flex-col gap-4">
      <SectionTitle
        size="detail"
        hint="Các yêu cầu bạn gửi đi để chờ phê duyệt, mới nhất ở trên cùng."
      >
        Yêu cầu tôi đã gửi
      </SectionTitle>

      {requests.isPending ? (
        <Skeleton className="h-20" />
      ) : !rows ? (
        <GlassCard variant="b" className="p-4">
          <Retry
            message={failed(requests.error, 'Không tải được các yêu cầu bạn đã gửi.')}
            onRetry={() => void requests.refetch()}
          />
        </GlassCard>
      ) : rows.length === 0 ? (
        <EmptyState
          className="glass-b rounded-lg p-6"
          icon={Inbox}
          message="Bạn chưa gửi yêu cầu nào. Khi bạn gửi một yêu cầu cần phê duyệt, kết quả sẽ hiện ở đây."
          action={{ label: 'Tải lại', onClick: () => void requests.refetch() }}
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </ul>
          {/* The server cuts the list there and sends no total. */}
          {rows.length === MY_APPROVALS_LIMIT ? (
            <p className={`text-muted-foreground ${BODY}`}>
              Danh sách chỉ hiện {MY_APPROVALS_LIMIT} yêu cầu mới nhất. Các yêu cầu cũ hơn không
              hiện ở đây.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
