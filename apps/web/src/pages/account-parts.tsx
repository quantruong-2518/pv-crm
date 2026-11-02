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
  MY_APPROVALS_LIMIT,
  type ApprovalRequestView,
  type ApprovalState,
  type GoogleLinkStatus,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { isApiError, userMessage } from '@/app/api'
import { CHANGE_PASSWORD_PATH } from '@/app/auth'
import { message, translate, useI18n } from '@/app/i18n'
import { toast } from '@/app/toast'
import { dmhm } from '@/lib/date'
import { grantedGroups } from '@/data/account'
import { useConnectGoogle } from '@/data/google'
import { PERMISSION_LABEL, RESOURCE_LABEL } from '@/data/roles'
import { kpiRoleText } from '@/data/kpi-i18n'
import { scopeLabel } from '@/data/users'
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

function Retry({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className={`text-destructive-foreground ${BODY}`}>
        {text}
      </p>
      <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onRetry}>
        {t(message('Thử lại', 'Retry', '다시 시도'))}
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
  const { t } = useI18n()
  return (
    <GlassCard
      className="flex flex-col gap-4 p-5"
      aria-label={t(message('Tôi là ai', 'Who I am', '내 정보'))}
    >
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
        <Fact label={t(message('Vai trò', 'Role', '역할'))}>
          {actor.roleIds.map((id) => kpiRoleText(id)).join(' · ')}
        </Fact>
        <Fact label={t(message('Nhánh sản phẩm', 'Product line', '제품 라인'))}>
          {actor.branches.join(' · ') || 'PV One'}
        </Fact>
        <Fact label={t(message('Phạm vi dữ liệu', 'Data scope', '데이터 범위'))}>
          {scopeLabel(actor.ownOnly ?? false)}
        </Fact>
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

const STATE_CONNECTED = message('Đã kết nối', 'Connected', '연결됨')
const STATE_RECONNECT = message('Cần kết nối lại', 'Needs reconnecting', '다시 연결 필요')
const STATE_NOT_CONNECTED = message('Chưa kết nối', 'Not connected', '연결 안 됨')

/** One face per state of the link. The fault sentences and the button words
 *  are the composer's (`unreadySender`), asked only for a link that is not
 *  ready: its last branch describes a fault. */
function linkFace(link: GoogleLinkStatus): LinkFace {
  if (link.connected && link.mail === 'ready') {
    /* The badge already says "connected"; the line only names the account. */
    return {
      tone: 'success',
      state: translate(STATE_CONNECTED),
      line: link.email ?? '',
      action: translate(RECONNECT_GOOGLE),
    }
  }
  const { fault, action } = unreadySender(link)
  return link.connected
    ? { tone: 'warning', state: translate(STATE_RECONNECT), line: fault, action }
    : { tone: 'draft', state: translate(STATE_NOT_CONNECTED), line: fault, action }
}

/** Password and Google as two rows of one card. The password row is a link to
 *  the one change-password form, not a second form: that screen is also where
 *  a forced change is held, and two forms would drift. */
export function SignInBlock({ link }: { link: UseQueryResult<GoogleLinkStatus> }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const connect = useConnectGoogle()
  const face = link.data?.configured ? linkFace(link.data) : null

  return (
    <GlassCard id="google" variant="b" className="flex scroll-mt-44 flex-col gap-4 p-5">
      <SectionTitle size="detail">
        {t(message('Đăng nhập và kết nối', 'Sign-in and connections', '로그인 및 연결'))}
      </SectionTitle>

      <SignInRow
        icon={KeyRound}
        title={t(message('Mật khẩu', 'Password', '비밀번호'))}
        action={
          <Button
            variant="secondary"
            className="pointer-coarse:h-12"
            onClick={() => navigate(CHANGE_PASSWORD_PATH)}
          >
            {t(message('Đổi mật khẩu', 'Change password', '비밀번호 변경'))}
          </Button>
        }
      >
        <p className={LINE}>
          {t(
            message(
              'Sau khi đổi, các máy khác đang đăng nhập bằng tài khoản của bạn sẽ bị đăng xuất.',
              'After you change it, other devices signed in to your account will be signed out.',
              '변경하면 내 계정으로 로그인한 다른 기기는 로그아웃됩니다.',
            ),
          )}
        </p>
      </SignInRow>

      <SignInRow
        separated
        icon={Plug}
        tone={face?.tone === 'warning' ? 'warning' : 'accent'}
        title={t(message('Kết nối Google', 'Google connection', 'Google 연결'))}
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
                    toast(
                      failed(
                        error,
                        t(
                          message(
                            'Không mở được trang kết nối Google.',
                            'Could not open the Google connection page.',
                            'Google 연결 페이지를 열 수 없습니다.',
                          ),
                        ),
                      ),
                      { tone: 'danger' },
                    ),
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
            text={failed(
              link.error,
              t(
                message(
                  'Không đọc được trạng thái kết nối Google.',
                  'Could not read the Google connection status.',
                  'Google 연결 상태를 읽을 수 없습니다.',
                ),
              ),
            )}
            onRetry={() => void link.refetch()}
          />
        ) : !face ? (
          <p className={LINE}>
            {t(
              message(
                'Công ty chưa bật kết nối Google trên PV One. Hãy nhờ người quản trị.',
                'Your company has not turned on the Google connection in PV One. Ask an administrator.',
                '회사에서 PV One의 Google 연결을 켜지 않았습니다. 관리자에게 요청하세요.',
              ),
            )}
          </p>
        ) : (
          <>
            <p className={face.tone === 'success' ? 'text-foreground m-0 text-[13px]' : LINE}>
              {face.line}
            </p>
            <p className={LINE}>
              {t(
                message(
                  'Dùng để đưa buổi họp lên Google Calendar và gửi thư từ hộp thư của chính bạn.',
                  'Used to put meetings on Google Calendar and send mail from your own mailbox.',
                  '회의를 Google Calendar에 올리고 내 메일함에서 메일을 보내는 데 사용합니다.',
                ),
              )}
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
  const { t } = useI18n()
  const groups = grantedGroups(actor.permissions)
  const total = groups.reduce((sum, group) => sum + group.permissions.length, 0)

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5">
      <SectionTitle
        size="detail"
        hint={t(
          message(
            'Theo vai trò của bạn. Cần làm thêm việc khác, hãy nhờ người quản trị.',
            'Based on your role. If you need to do something else, ask an administrator.',
            '내 역할 기준입니다. 다른 작업이 필요하면 관리자에게 요청하세요.',
          ),
        )}
        actions={
          groups.length > 0 ? (
            <MetaPill>
              {t(
                message(
                  `${total} việc · ${groups.length} nhóm`,
                  `${total} actions · ${groups.length} groups`,
                  `작업 ${total}개 · 그룹 ${groups.length}개`,
                ),
              )}
            </MetaPill>
          ) : undefined
        }
      >
        {t(message('Việc bạn được làm', 'What you can do', '내가 할 수 있는 작업'))}
      </SectionTitle>
      {groups.length === 0 ? (
        <p className={`text-foreground ${BODY}`}>
          {t(
            message(
              'Vai trò của bạn chưa được giao việc nào.',
              'Your role has no actions assigned yet.',
              '내 역할에 부여된 작업이 없습니다.',
            ),
          )}
        </p>
      ) : (
        <div className="grid items-start gap-x-6 gap-y-1 md:grid-cols-2">
          {groups.map((group) => (
            <Accordion
              key={group.resource}
              className="min-w-0"
              title={RESOURCE_LABEL[group.resource]}
              summary={t(
                message(
                  `${group.permissions.length} việc`,
                  `${group.permissions.length} actions`,
                  `작업 ${group.permissions.length}개`,
                ),
              )}
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
  const at = dmhm(request.decidedAt)
  const by = request.decidedBy
  const rejected = request.state === 'rejected'
  return translate(
    rejected
      ? message(
          `${by ? `${by} từ chối` : 'Đã từ chối'} lúc ${at}`,
          `${by ? `Rejected by ${by}` : 'Rejected'} at ${at}`,
          `${by ? `${by}님이 ` : ''}${at}에 거절`,
        )
      : message(
          `${by ? `${by} duyệt` : 'Đã duyệt'} lúc ${at}`,
          `${by ? `Approved by ${by}` : 'Approved'} at ${at}`,
          `${by ? `${by}님이 ` : ''}${at}에 승인`,
        ),
  )
}

const REQUEST_STATE: Record<ApprovalState, ReturnType<typeof message>> = {
  waiting: message('Chờ duyệt', 'Awaiting approval', '승인 대기'),
  approved: message('Đã duyệt', 'Approved', '승인됨'),
  rejected: message('Từ chối', 'Rejected', '거절됨'),
}

function RequestRow({ request, separated }: { request: ApprovalRequestView; separated: boolean }) {
  const { t } = useI18n()
  const decided = decidedLine(request)

  return (
    <li className={`flex flex-col gap-1 ${separated ? `pt-4 ${HAIRLINE}` : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-foreground m-0 min-w-0 text-[13px] font-semibold leading-[1.5]">
          {request.consequence}
        </p>
        <Badge tone={STATE_TONE[request.state]}>{t(REQUEST_STATE[request.state])}</Badge>
      </div>
      <p className="text-muted-foreground tnum m-0 text-[12px] leading-[1.5]">
        {t(
          message(
            `Gửi lúc ${dmhm(request.raisedAt)}`,
            `Sent at ${dmhm(request.raisedAt)}`,
            `${dmhm(request.raisedAt)}에 전송`,
          ),
        )}
        {decided ? ` · ${decided}` : ''}
      </p>
      {request.decidedReason ? (
        <p className={`text-foreground ${BODY}`}>
          {t(
            message(
              `Lý do từ chối: ${request.decidedReason}`,
              `Reason for rejection: ${request.decidedReason}`,
              `거절 사유: ${request.decidedReason}`,
            ),
          )}
        </p>
      ) : null}
    </li>
  )
}

/** One card with the rows inside it: a request is a line, not a surface. */
export function RequestsBlock({ requests }: { requests: UseQueryResult<ApprovalRequestView[]> }) {
  const { t } = useI18n()
  const rows = requests.data

  return (
    <GlassCard id="requests" variant="b" className="flex scroll-mt-44 flex-col gap-4 p-5">
      <SectionTitle
        size="detail"
        hint={t(
          message('Mới nhất ở trên cùng.', 'Newest first.', '최신 항목이 맨 위에 표시됩니다.'),
        )}
      >
        {t(message('Yêu cầu tôi đã gửi', 'Requests I sent', '내가 보낸 요청'))}
      </SectionTitle>

      {requests.isPending ? (
        <Skeleton className="h-20" />
      ) : !rows ? (
        <Retry
          text={failed(
            requests.error,
            t(
              message(
                'Không tải được các yêu cầu bạn đã gửi.',
                'Could not load the requests you sent.',
                '보낸 요청을 불러오지 못했습니다.',
              ),
            ),
          )}
          onRetry={() => void requests.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={t(
            message(
              'Bạn chưa gửi yêu cầu nào.',
              'You have not sent any requests.',
              '보낸 요청이 없습니다.',
            ),
          )}
          action={{
            label: t(message('Tải lại', 'Reload', '새로고침')),
            onClick: () => void requests.refetch(),
          }}
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
              {t(
                message(
                  `Chỉ hiện ${MY_APPROVALS_LIMIT} yêu cầu mới nhất.`,
                  `Showing only the ${MY_APPROVALS_LIMIT} most recent requests.`,
                  `최근 요청 ${MY_APPROVALS_LIMIT}개만 표시합니다.`,
                ),
              )}
            </p>
          ) : null}
        </>
      )}
    </GlassCard>
  )
}
