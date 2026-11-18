import type { UseQueryResult } from '@tanstack/react-query'
import {
  AiMark,
  Badge,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  SegmentedControl,
  Skeleton,
  TriangleAlert,
  cn,
} from '@pv/ui'
import { MY_APPROVALS_LIMIT, type ApprovalRequestView } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { STATE_LABEL, STATE_TONE, signedCodeOf, titleOf, type ApprovalTab } from './approvals-model'

function ApprovalListItem({
  request,
  selected,
  showState,
  onPick,
}: {
  request: ApprovalRequestView
  selected: boolean
  showState: boolean
  onPick: () => void
}) {
  const { t, date } = useI18n()
  const title = titleOf(request)

  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={onPick}
        className={cn(
          'motion-std pointer-coarse:min-h-12 flex w-full items-start gap-3 rounded-md px-3 py-3 text-left',
          selected ? 'bg-surface-ink/12' : 'hover:bg-surface-ink/8',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-foreground text-[14px] font-semibold leading-[1.4] [overflow-wrap:anywhere]">
            {t(title.label)}
            {title.code ? (
              <>
                {' · '}
                <span className="font-mono">{title.code}</span>
              </>
            ) : null}
          </span>
          {/* A settings change has no code, so its sentence tells two rows apart. */}
          {signedCodeOf(request) ? null : (
            <span className="text-foreground line-clamp-2 text-[12px] leading-[1.5]">
              {request.consequence}
            </span>
          )}
          <span className="text-muted-foreground tnum text-[12px] leading-[1.5]">
            {request.raisedBy} ·{' '}
            {date(request.raisedAt, {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </span>
        {request.fromAi ? (
          <span className="flex shrink-0 items-center">
            <Icon icon={AiMark} size={16} className="text-primary" />
            <span className="sr-only">
              {t(message('AI đề xuất', 'Suggested by AI', 'AI 제안'))}
            </span>
          </span>
        ) : null}
        {showState ? (
          /* Opaque base: the tint keeps its resting contrast on a selected or hovered
             row, where the stone theme's pill fell under 4.5:1 (law 13). */
          <span className="bg-card flex shrink-0 rounded-sm">
            <Badge tone={STATE_TONE[request.state]}>{t(STATE_LABEL[request.state])}</Badge>
          </span>
        ) : null}
      </button>
    </li>
  )
}

function ListBody({
  query,
  rows,
  tab,
  selectedId,
  onPick,
}: {
  query: UseQueryResult<ApprovalRequestView[]>
  rows: ApprovalRequestView[] | undefined
  tab: ApprovalTab
  selectedId: string | undefined
  onPick: (id: string) => void
}) {
  const { t } = useI18n()

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  }
  if (query.error || !rows) {
    return (
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        message={`${t(message('Không tải được yêu cầu.', 'Requests could not be loaded.', '요청을 불러올 수 없습니다.'))} ${
          isApiError(query.error)
            ? userMessage(query.error)
            : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))
        }`}
        action={{
          label: t(message('Thử lại', 'Try again', '다시 시도')),
          onClick: () => void query.refetch(),
        }}
        className="py-8"
      />
    )
  }
  if (rows.length === 0) {
    /* An empty inbox is the normal state, so it says what it means and offers
       the one step an inbox has: look again. */
    return (
      <EmptyState
        icon={Inbox}
        message={t(
          tab === 'waiting'
            ? message(
                'Không có yêu cầu nào chờ bạn duyệt.',
                'No requests are waiting for your approval.',
                '승인 대기 중인 요청이 없습니다.',
              )
            : message(
                'Bạn chưa gửi yêu cầu nào.',
                'You have not sent any requests.',
                '보낸 요청이 없습니다.',
              ),
        )}
        action={{
          label: t(message('Tải lại', 'Refresh', '새로고침')),
          onClick: () => void query.refetch(),
        }}
        className="py-8"
      />
    )
  }
  return (
    <>
      <ul className="m-0 flex min-h-0 list-none flex-col gap-1 p-2 md:overflow-y-auto">
        {rows.map((request) => (
          <ApprovalListItem
            key={request.id}
            request={request}
            selected={request.id === selectedId}
            showState={tab === 'sent'}
            onPick={() => onPick(request.id)}
          />
        ))}
      </ul>
      {/* The server cuts the sent list there and sends no total. */}
      {tab === 'sent' && rows.length === MY_APPROVALS_LIMIT ? (
        <p className="text-muted-foreground m-0 shrink-0 px-5 pb-3 text-[12px] leading-[1.5]">
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
  )
}

/** The list pane: the two tabs, then the rows on one glass-b surface (law 8). */
export function ApprovalListPanel({
  tab,
  onTab,
  waitingCount,
  query,
  rows,
  selectedId,
  onPick,
  className,
}: {
  tab: ApprovalTab
  onTab: (tab: ApprovalTab) => void
  waitingCount: number | undefined
  query: UseQueryResult<ApprovalRequestView[]>
  rows: ApprovalRequestView[] | undefined
  selectedId: string | undefined
  onPick: (id: string) => void
  className?: string
}) {
  const { t } = useI18n()

  return (
    <GlassCard variant="b" className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      <div className="p-3 md:max-w-[344px]">
        <SegmentedControl
          label={t(message('Danh sách yêu cầu', 'Request lists', '요청 목록'))}
          hideLabel
          tone="quiet"
          value={tab}
          onChange={(value) => onTab(value === 'sent' ? 'sent' : 'waiting')}
          options={[
            {
              value: 'waiting',
              label: t(message('Chờ tôi duyệt', 'Waiting for me', '내 승인 대기')),
              count: waitingCount,
            },
            { value: 'sent', label: t(message('Tôi đã gửi', 'Sent by me', '내가 보냄')) },
          ]}
        />
      </div>
      <ListBody query={query} rows={rows} tab={tab} selectedId={selectedId} onPick={onPick} />
    </GlassCard>
  )
}
