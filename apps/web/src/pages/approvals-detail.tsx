import {
  AiMark,
  ApprovalChain,
  ArrowLeft,
  Badge,
  Button,
  GlassCard,
  Icon,
  SectionTitle,
  cn,
} from '@pv/ui'
import type { ApprovalRequestView } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { ApprovalDecisionBar } from './approvals-decision'
import {
  STATE_LABEL,
  STATE_TONE,
  chainSteps,
  signedCodeOf,
  titleOf,
  type ApprovalTab,
} from './approvals-model'
import { ApprovalRelated } from './approvals-related'

/** Where a request ended up — only on "sent by me", where there is no decision
 *  to take. The state pill is the list row's; it shows here only on a phone,
 *  where no list stands beside the detail. */
function Outcome({ request }: { request: ApprovalRequestView }) {
  const { t, date } = useI18n()
  const at = request.decidedAt
    ? date(request.decidedAt, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null
  const by = request.decidedBy
  const who =
    at === null
      ? null
      : request.state === 'rejected'
        ? message(
            `${by ? `${by} từ chối` : 'Đã từ chối'} · ${at}`,
            `${by ? `Rejected by ${by}` : 'Rejected'} · ${at}`,
            `${by ? `${by}님이 ` : ''}거절 · ${at}`,
          )
        : message(
            `${by ? `${by} duyệt` : 'Đã duyệt'} · ${at}`,
            `${by ? `Approved by ${by}` : 'Approved'} · ${at}`,
            `${by ? `${by}님이 ` : ''}승인 · ${at}`,
          )

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2',
        !who && !request.decidedReason && 'md:hidden',
      )}
    >
      <Badge tone={STATE_TONE[request.state]} className="md:hidden">
        {t(STATE_LABEL[request.state])}
      </Badge>
      {who ? <p className="text-muted-foreground m-0 text-[12px]">{t(who)}</p> : null}
      {request.decidedReason ? (
        <p className="m-0 text-[14px] leading-[1.5]">
          {t(
            message(
              `Lý do từ chối: ${request.decidedReason}`,
              `Reason for rejection: ${request.decidedReason}`,
              `거절 사유: ${request.decidedReason}`,
            ),
          )}
        </p>
      ) : null}
    </div>
  )
}

/** The detail pane: one surface, no card inside it. On a phone it takes the
 *  place of the list and opens with the back control and the "i/n" counter. */
export function ApprovalDetail({
  request,
  tab,
  index,
  total,
  onBack,
  className,
}: {
  request: ApprovalRequestView
  tab: ApprovalTab
  index: number
  total: number
  onBack: () => void
  className?: string
}) {
  const { t, date } = useI18n()
  const at = date(request.raisedAt, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const code = signedCodeOf(request)
  const mayReadDeal = useCan('opportunity.view')
  const title = titleOf(request)

  return (
    <GlassCard className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pt-3 md:hidden">
        <Button
          variant="ghost"
          className="pointer-coarse:h-12 pointer-coarse:w-12 w-10 px-0"
          aria-label={t(message('Về danh sách', 'Back to the list', '목록으로'))}
          onClick={onBack}
        >
          <Icon icon={ArrowLeft} size={16} />
        </Button>
        <span className="text-muted-foreground tnum text-[12px]">
          {index + 1}/{total}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 p-5 max-md:overflow-visible md:overflow-y-auto md:p-6">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground tnum m-0 text-[12px]">
            {t(message(`Gửi lúc ${at}`, `Sent at ${at}`, `${at}에 전송`))}
          </p>
          <h3 className="font-display m-0 text-[20px] font-semibold leading-[1.3] tracking-[-.2px]">
            {t(title.label)}
            {title.code ? (
              <>
                {' · '}
                <span className="font-mono">{title.code}</span>
              </>
            ) : null}
          </h3>
          <p className="m-0 text-[14px] leading-[1.6]">{request.consequence}</p>
        </div>

        {tab === 'sent' ? <Outcome request={request} /> : null}

        {/* Rule 9 on screen: an AI proposal says so, with its grounds, in one quiet line. */}
        {request.fromAi ? (
          <p className="text-glass-foreground m-0 flex items-center gap-2 text-[12px] leading-[1.7]">
            <Icon icon={AiMark} size={16} className="text-primary shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {t(message('AI đề xuất', 'Suggested by AI', 'AI 제안'))}
              {request.basis
                ? ` · ${t(message('Căn cứ:', 'Basis:', '근거:'))} ${request.basis}`
                : ''}
            </span>
          </p>
        ) : null}

        {code && mayReadDeal ? <ApprovalRelated code={code} /> : null}

        <section className="flex flex-col gap-3">
          <SectionTitle size="sm">
            {t(message('Chuỗi duyệt', 'Approval chain', '승인 단계'))}
          </SectionTitle>
          <ApprovalChain
            steps={chainSteps(
              request,
              t(
                message(
                  `${request.raisedBy} · gửi yêu cầu`,
                  `${request.raisedBy} · requested`,
                  `${request.raisedBy} · 요청`,
                ),
              ),
              t(message('đang chờ', 'waiting', '대기 중')),
            )}
          />
        </section>
      </div>

      {tab === 'waiting' ? <ApprovalDecisionBar request={request} /> : null}
    </GlassCard>
  )
}
