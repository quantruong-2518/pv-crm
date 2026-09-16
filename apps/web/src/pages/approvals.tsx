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
import type { ApprovalRequestView } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmhm } from '@/lib/date'
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
  const chrome = useAppChrome()
  const { data: rows, isPending, error, refetch } = useQuery(pendingApprovalsQuery())

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="One Core"
          title="Hộp duyệt"
          description="Việc đang chờ bạn gật. Gật xong thì thay đổi được ghi ngay trong cùng một lượt."
          meta={
            rows && rows.length > 0 ? (
              <MetaPill tone="warning">{rows.length} việc đang chờ</MetaPill>
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
            icon={TriangleAlert}
            message={`Không lấy được hộp duyệt. ${
              isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
            }`}
            action={{ label: 'Thử lại', onClick: () => void refetch() }}
            className="py-12"
          />
        ) : rows.length === 0 ? (
          /* An empty inbox is the normal state, not a failure — so it says what
             it means rather than offering something to create. */
          <EmptyState
            icon={Inbox}
            message="Không có việc nào đang chờ bạn gật."
            /* The one next step an inbox has: look again. It fills from other
               people's screens, so a reader who expected something has nothing
               to create here — only a reason to re-ask. */
            action={{ label: 'Tải lại', onClick: () => void refetch() }}
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
          <Kicker tone="muted">{request.kind}</Kicker>
          <p className="font-display text-[15px] font-semibold">{request.consequence}</p>
          <p className="text-muted-foreground text-[11.5px]">
            {request.raisedBy} đề nghị · {dmhm(request.raisedAt)}
          </p>
        </div>

        {/* Rule 9 on screen: a proposal from the assistant says so, and says on
            what grounds, before anybody presses anything. */}
        {request.fromAi ? <Badge tone="running">Trợ lý AI đề xuất</Badge> : null}
      </div>

      {request.fromAi && request.basis ? (
        <p className="text-glass-foreground text-[12px] leading-[1.7]">Căn cứ: {request.basis}</p>
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
            placeholder="Vì sao từ chối? Câu này là thứ người đề nghị đọc."
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={reason.trim() === '' || decide.isPending}
              onClick={() => send({ decision: 'rejected', reason: reason.trim() }, 'Đã từ chối.')}
            >
              Gửi từ chối
            </Button>
            <Button variant="ghost" onClick={() => setRefusing(false)}>
              Thôi
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={decide.isPending}
            onClick={() => send({ decision: 'approved' }, 'Đã duyệt. Thay đổi đã được ghi.')}
          >
            Duyệt
          </Button>
          <Button variant="ghost" disabled={decide.isPending} onClick={() => setRefusing(true)}>
            Từ chối
          </Button>
        </div>
      )}
    </GlassCard>
  )
}
