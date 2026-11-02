import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, TriangleAlert } from '@pv/ui'
import {
  AppShell,
  ApprovalChain,
  Badge,
  Button,
  EmptyState,
  GlassCard,
  Kicker,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
  Textarea,
  type ChainStep,
} from '@pv/ui'
import type { ApprovalKind, ApprovalRequestView } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { message, useI18n, type Message } from '@/app/i18n'
import { pendingApprovalsQuery, useDecideApproval } from '@/data/approvals'

/** One Core · the approval inbox — pipeline #10, a queue of PEOPLE.
 *
 *  ------------------------------------------------------------------
 *  A QUEUE, NOT A PIPELINE
 *  ------------------------------------------------------------------
 *  `docs/decisions/0015-pipeline-queue-and-ledger-are-different-things.md`
 *  separates three things this codebase kept calling one: a pipeline (ordered
 *  stages, each with a clock), a queue
 *  (work sorted by PERSON, in and out), and a ledger (append-only events). This
 *  screen is the second. It has no columns and no stages — a request is either
 *  waiting on you or it has left, and the only two controls are yes and no.
 *
 *  ------------------------------------------------------------------
 *  WHY NOT `ApprovalCard` (O-04)
 *  ------------------------------------------------------------------
 *  That organism asks for an `amount` and puts the sum in the primary button,
 *  which is exactly right for a discount and a purchase
 *  order and wrong for a change to a vocabulary list: there is no number, and
 *  inventing a zero would put a lie on the button. It comes into its own when
 *  the money-shaped kinds arrive; until then the row is composed from
 *  `ApprovalChain` (M-03) plus what this request actually carries.
 *
 *  ------------------------------------------------------------------
 *  WHAT THE READER DECIDES ON
 *  ------------------------------------------------------------------
 *  `consequence` — one sentence the branch wrote when the request was raised,
 *  saying what happens if this is approved. The payload never crosses the wire;
 *  a platform screen decoding a branch's private shape would make that shape
 *  part of the platform's contract. */
export default function ApprovalInboxScreen() {
  const { t, number } = useI18n()
  const chrome = useAppChrome()
  const { data: rows, isPending, error, refetch } = useQuery(pendingApprovalsQuery())

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="One Core"
          title={t(message('Hộp duyệt', 'Approvals', '승인함'))}
          description={t(
            message(
              'Duyệt xong, thay đổi có hiệu lực ngay.',
              'Changes take effect as soon as you approve.',
              '승인하면 변경 사항이 바로 적용됩니다.',
            ),
          )}
          meta={
            rows && rows.length > 0 ? (
              <MetaPill tone="warning">
                {t(
                  message(
                    `${number(rows.length)} yêu cầu đang chờ`,
                    `${number(rows.length)} pending requests`,
                    `대기 중인 요청 ${number(rows.length)}건`,
                  ),
                )}
              </MetaPill>
            ) : null
          }
        />

        {isPending ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : error || !rows ? (
          <EmptyState
            tone="danger"
            icon={TriangleAlert}
            message={`${t(message('Không tải được yêu cầu.', 'Requests could not be loaded.', '요청을 불러올 수 없습니다.'))} ${
              isApiError(error)
                ? userMessage(error)
                : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))
            }`}
            action={{
              label: t(message('Thử lại', 'Try again', '다시 시도')),
              onClick: () => void refetch(),
            }}
            className="py-12"
          />
        ) : rows.length === 0 ? (
          /* An empty inbox is the normal state, not a failure — so it says what
             it means rather than offering something to create. */
          <EmptyState
            icon={Inbox}
            message={t(
              message(
                'Không có yêu cầu nào chờ bạn duyệt.',
                'No requests are waiting for your approval.',
                '승인 대기 중인 요청이 없습니다.',
              ),
            )}
            /* The one next step an inbox has: look again. It fills from other
               people's screens, so a reader who expected something has nothing
               to create here — only a reason to re-ask. */
            action={{
              label: t(message('Tải lại', 'Refresh', '새로고침')),
              onClick: () => void refetch(),
            }}
            className="py-12"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <RequestCard key={row.id} request={row} />
            ))}
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

/** The kind as a reader says it. Keyed by the contract's enum, so a new kind
 *  fails to compile here instead of printing its wire key. */
const KIND_LABEL: Record<ApprovalKind, Message> = {
  'config-change': message('Thay đổi cấu hình', 'Settings change', '설정 변경'),
  'contract-sign': message('Ký hợp đồng', 'Contract signing', '계약 체결'),
}

/** The chain as M-03 draws it: `ok` behind, `current` on the person waited on,
 *  `next` ahead. The label carries the role beside the name because a reader
 *  three links down needs to know why that person is in the chain at all. */
function chainSteps(request: ApprovalRequestView): ChainStep[] {
  return request.chain.map((link) => ({
    label: `${link.person} · ${link.role}`,
    state: link.state === 'approved' ? 'ok' : link.state === 'waiting' ? 'current' : 'next',
  }))
}

function RequestCard({ request }: { request: ApprovalRequestView }) {
  const { t, date } = useI18n()
  const decide = useDecideApproval(request.id)
  /* The refusal box opens on demand rather than sitting under every row: a
     reason is required to refuse, and a textarea permanently under a card the
     reader means to approve is a box that reads like an obligation. */
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState('')

  const failure = isApiError(decide.error) ? userMessage(decide.error) : null

  const send = (body: Parameters<typeof decide.mutate>[0], done: string) => {
    decide.mutate(body, {
      onSuccess: () => {
        toastDone(done)
        setRefusing(false)
        setReason('')
      },
    })
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">{t(KIND_LABEL[request.kind])}</Kicker>
          <p className="font-display text-[15px] font-semibold">{request.consequence}</p>
          <p className="text-muted-foreground text-[11.5px]">
            {t(
              message(
                `${request.raisedBy} gửi yêu cầu`,
                `${request.raisedBy} requested`,
                `${request.raisedBy}님이 요청함`,
              ),
            )}{' '}
            ·{' '}
            {date(request.raisedAt, {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/* Rule 9 on screen: a proposal from the assistant says so, and says on
            what grounds, before anybody presses anything. */}
        {request.fromAi ? (
          <Badge tone="running">
            {t(message('Do trợ lý AI đề xuất', 'Suggested by AI assistant', 'AI 도우미의 제안'))}
          </Badge>
        ) : null}
      </div>

      {request.fromAi && request.basis ? (
        <p className="text-glass-foreground text-[12px] leading-[1.7]">
          {t(message('Căn cứ:', 'Basis:', '근거:'))} {request.basis}
        </p>
      ) : null}

      {request.links.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {request.links.map((link) => (
            <MetaPill key={link.objectCode}>
              {link.objectCode} · {link.objectLabel}
            </MetaPill>
          ))}
        </div>
      ) : null}

      <ApprovalChain steps={chainSteps(request)} />

      {failure ? (
        <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {failure}
        </p>
      ) : null}

      {refusing ? (
        <div className="flex flex-col gap-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t(message('Lý do từ chối', 'Reason for rejection', '거절 사유'))}
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={reason.trim() === '' || decide.isPending}
              onClick={() =>
                send(
                  { decision: 'rejected', reason: reason.trim() },
                  t(message('Đã từ chối yêu cầu.', 'Request rejected.', '요청을 거절했습니다.')),
                )
              }
            >
              {t(message('Xác nhận từ chối', 'Reject request', '요청 거절'))}
            </Button>
            <Button variant="ghost" onClick={() => setRefusing(false)}>
              {t(message('Hủy', 'Cancel', '취소'))}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={decide.isPending}
            onClick={() =>
              send(
                { decision: 'approved' },
                t(
                  message(
                    'Đã duyệt. Thay đổi đã có hiệu lực.',
                    'Approved. The change is now in effect.',
                    '승인했습니다. 변경 사항이 적용되었습니다.',
                  ),
                ),
              )
            }
          >
            {t(message('Phê duyệt', 'Approve', '승인'))}
          </Button>
          <Button variant="ghost" disabled={decide.isPending} onClick={() => setRefusing(true)}>
            {t(message('Từ chối', 'Reject', '거절'))}
          </Button>
        </div>
      )}
    </GlassCard>
  )
}
